import {DeliveryFollowups} from './delivery-followups.js';
export const followupActions=[
 {id:'close_order',label:'Quer fechar o pedido?',command:'FECHAR PEDIDO'},
 {id:'add_items',label:'Adicionar mais itens',command:'ADICIONAR MAIS ITENS'},
 {id:'end_conversation',label:'Encerrar conversa',command:'ENCERRAR CONVERSA'},
];
const cooldown=24*60*60*1000,maxDelay=2*60*1000;
const privatePhone=phone=>/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(phone);

export class Followups {
 constructor(agent,options={}){const {now=Date.now,canSend=()=>true}=options;this.agent=agent;this.store=agent.store;this.now=now;this.canSend=canSend;this.running=false;this.closed=false;this.delivery=new DeliveryFollowups(agent,options);}
 schedule(chatId,quoteId){
  const chat=this.store.chat(chatId),settings=this.store.settings(),now=this.now();
  const inbound=this.store.get("SELECT id FROM messages WHERE chat_id=? AND direction='in' AND rowid<(SELECT rowid FROM messages WHERE id=?) LIMIT 1",chatId,quoteId);
  if(this.closed||!chat||!inbound||!settings.agentEnabled||settings.followupMinutes<=0||chat.mode!=='auto'||chat.needs_human||chat.closed_at||chat.followup_last_attempt!==null&&now-chat.followup_last_attempt<cooldown)return;
  this.store.run("UPDATE chats SET followup_due_at=?,followup_quote_id=?,followup_state='scheduled',followup_menu=0 WHERE id=?",now+settings.followupMinutes*60000,quoteId,chatId);this.store.changed();
 }
 async check(){
  if(this.closed||this.running)return 0;
  this.running=true;
  try{
   const settings=this.store.settings();
   if(!settings.agentEnabled){this.store.cancelFollowups();return 0;}
   let sent=await this.delivery.check();
   if(settings.followupMinutes<=0){this.store.cancelFollowups(null,{quoteOnly:true});return sent;}
   const due=this.store.all("SELECT id,phone,provider,channel FROM chats WHERE followup_state='scheduled' AND followup_due_at<=? ORDER BY followup_due_at LIMIT 25",this.now());
   for(const chat of due){
    const result=await this.agent.enqueue(`${chat.provider}:${chat.channel}:${chat.phone}`,()=>this.deliver(chat.id));
    if(result)sent++;
   }
   return sent;
  }finally{this.running=false;}
 }
 async deliver(id){
  const chat=this.store.chat(id),settings=this.store.settings(),now=this.now();
  if(!chat||chat.followup_state!=='scheduled'||chat.followup_due_at>now)return false;
  const latest=this.store.get('SELECT * FROM messages WHERE chat_id=? ORDER BY created DESC,rowid DESC LIMIT 1',id);
  const inbound=latest&&this.store.get("SELECT id FROM messages WHERE chat_id=? AND direction='in' AND rowid<(SELECT rowid FROM messages WHERE id=?) LIMIT 1",id,latest.id);
  if(this.closed||!settings.agentEnabled||settings.followupMinutes<=0||chat.mode!=='auto'||chat.needs_human||chat.closed_at
   ||!chat.followup_due_at||now-chat.followup_due_at>maxDelay
   ||chat.followup_last_attempt!==null&&now-chat.followup_last_attempt<cooldown
   ||chat.channel!=='simulator'&&!privatePhone(chat.phone)||!this.canSend(chat)
   ||!inbound||!latest||latest.id!==chat.followup_quote_id||latest.direction!=='bot'||latest.status!=='sent'){
   this.store.cancelFollowups(id,{quoteOnly:true});return false;
  }
  // Claim durably before sending. Crashes, concurrent ticks and uncertain sends never retry.
  const claim=this.store.run("UPDATE chats SET followup_state='sending',followup_due_at=NULL,followup_last_attempt=?,followup_menu=1 WHERE id=? AND followup_state='scheduled' AND followup_quote_id=?",now,id,chat.followup_quote_id);
  if(!claim.changes)return false;
  const result=await this.agent.reply(chat,'Como você prefere continuar?',followupActions);
  this.store.run('UPDATE chats SET followup_state=?,followup_menu=? WHERE id=?',result.status==='sent'?'sent':'failed',result.status==='sent'?1:0,id);this.store.changed();
  return result.status==='sent';
 }
 close(){this.closed=true;this.store.cancelFollowups();}
}
