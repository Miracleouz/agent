const DAY=86400000;
// Only authenticated live inbound and confirmed outbound participate. Imported
// history, simulator traffic and uncertain sends cannot create response samples.
const eligible=`((m.direction='in' AND m.inbound_verified=1) OR (m.direction IN ('owner','bot') AND m.status IN ('sent','external') AND m.sent_at IS NOT NULL))`;
const eventAt=`CASE WHEN m.direction='in' THEN m.created WHEN m.status='external' THEN MAX(m.created,m.sent_at) ELSE m.sent_at END`;

export function monitoring(store,{connected,days=30,now=Date.now()}={}){
 const since=now-days*DAY,windowStart=now-30*DAY;
 const empty={connected:!!connected,generatedAt:now,days,since,users:[],chats:[],totals:{assigned:0,unassigned:0,waiting:0,samples:0,averageMs:null}};
 if(!connected)return empty;
 store.resumeExpired();
 const users=store.all('SELECT id,name,role,active FROM users ORDER BY name').map(user=>({...user,assigned:0,waiting:0,samples:0,totalMs:0,averageMs:null}));
 const byUser=new Map(users.map(user=>[user.id,user]));
 const chats=store.all("SELECT id,phone,name,assigned_user_id,mode,closed_at,needs_human,human_requested,purchase_requested,unread,updated FROM chats WHERE channel='whatsapp' AND provider='qr'").filter(chat=>/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(chat.phone));
 const byChat=new Map(chats.map(chat=>[chat.id,{...chat,pending:null,lastInboundAt:null,lastReplyAt:null,liveInWindow:false,initialized:false}]));
 const events=store.all(`SELECT m.chat_id,m.direction,m.author_id,${eventAt} AS at FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.channel='whatsapp' AND c.provider='qr' AND ${eligible} AND ${eventAt}>=? AND ${eventAt}<=? ORDER BY at,m.rowid`,windowStart,now);
 // The previous event prevents a customer turn started before the window from
 // being counted as a new turn just because another message arrived this month.
 const previous=store.db.prepare(`SELECT m.direction,${eventAt} AS at FROM messages m WHERE m.chat_id=? AND ${eligible} AND ${eventAt}<? ORDER BY at DESC,m.rowid DESC LIMIT 1`);
 let samples=0,totalMs=0;
 for(const event of events){
  const chat=byChat.get(event.chat_id);if(!chat)continue;
  if(!chat.initialized){const baseline=previous.get(chat.id,windowStart);if(baseline?.direction==='in')chat.pending={at:baseline.at,outside:true};chat.initialized=true;}
  if(event.direction==='in'){
   chat.liveInWindow=true;chat.lastInboundAt=event.at;
   if(!chat.pending||chat.pending.botAnswered)chat.pending={at:event.at,outside:false};
  }else{
   chat.lastReplyAt=event.at;
   if(event.direction==='owner'&&event.author_id&&chat.pending&&!chat.pending.outside&&chat.pending.at>=since){
    const user=byUser.get(event.author_id),elapsed=event.at-chat.pending.at;
    if(user&&elapsed>=0){user.samples++;user.totalMs+=elapsed;samples++;totalMs+=elapsed;}
   }
   // A bot acknowledgement must not erase the pending human response. A new
   // customer message after the bot starts a new turn. Phone replies close the
   // turn but cannot be attributed to a panel user.
   if(event.direction==='bot'){if(chat.pending)chat.pending.botAnswered=true;}else chat.pending=null;
  }
 }
 for(const chat of byChat.values())if(chat.assigned_user_id&&!chat.initialized){const baseline=previous.get(chat.id,windowStart);if(baseline?.direction==='in')chat.pending={at:baseline.at,outside:true};}
 const board=[...byChat.values()].filter(chat=>chat.assigned_user_id||(chat.liveInWindow&&!chat.closed_at)).map(chat=>{
  const user=byUser.get(chat.assigned_user_id),waiting=!!chat.pending&&!chat.closed_at&&(!chat.pending.botAnswered||chat.mode==='manual'||!!chat.needs_human);
  if(user){user.assigned++;if(waiting)user.waiting++;}
  return{id:chat.id,name:chat.name,assignedUserId:chat.assigned_user_id,assignedName:user?.name||null,mode:chat.mode,closed:!!chat.closed_at,needsHuman:!!chat.needs_human,humanRequested:!!chat.human_requested,purchaseRequested:!!chat.purchase_requested,unread:chat.unread,waiting,waitingSince:waiting&&!chat.pending.outside?chat.pending.at:null,waitingOlderThan30Days:waiting&&chat.pending.outside,lastInboundAt:chat.lastInboundAt,lastReplyAt:chat.lastReplyAt,updated:chat.updated};
 });
 board.sort((a,b)=>Number(b.waiting)-Number(a.waiting)||(a.waitingSince??a.updated)-(b.waitingSince??b.updated));
 for(const user of users){user.averageMs=user.samples?Math.round(user.totalMs/user.samples):null;delete user.totalMs;}
 return{...empty,users:users.filter(user=>user.active||user.samples||user.assigned),chats:board,totals:{assigned:board.filter(chat=>chat.assignedUserId).length,unassigned:board.filter(chat=>!chat.assignedUserId).length,waiting:board.filter(chat=>chat.waiting).length,samples,averageMs:samples?Math.round(totalMs/samples):null}};
}
