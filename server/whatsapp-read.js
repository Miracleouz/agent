import {safeConnectionDetail} from './connection-errors.js';
const privateId=id=>/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(id||'');
const groupId=id=>/^\d+(?:-\d+)?@g\.us$/.test(id||'');
export class WhatsAppReadSync{
 constructor(wa,{timeout=8000}={}){this.wa=wa;this.store=wa.store;this.timeout=timeout;this.reset();}
 reset(){for(const id of this.pending?.keys()||[])this.store.run("UPDATE whatsapp_read_sync SET state='failed',error='Confirmação interrompida. Use Sincronizar leitura para tentar novamente.' WHERE id=? AND state='pending'",id);this.controller?.abort();this.controller=new AbortController();this.pending=new Map();this.last=new Map();}
 valid(chat){return chat?.channel==='whatsapp'&&chat.provider==='qr'&&privateId(chat.phone)||chat?.channel==='group'&&groupId(chat.id)&&chat.phone===chat.id;}
 anchor(chat){return this.store.get(chat.channel==='group'?'SELECT COALESCE(MAX(rowid),0) seq FROM whatsapp_group_messages WHERE group_id=?':"SELECT COALESCE(MAX(rowid),0) seq FROM messages WHERE chat_id=? AND direction='in'",chat.id).seq;}
 clearThrough(chat,anchor){const remaining=this.store.get(chat.channel==='group'?'SELECT count(*) n FROM whatsapp_group_messages WHERE group_id=? AND rowid>?':"SELECT count(*) n FROM messages WHERE chat_id=? AND direction='in' AND inbound_verified=1 AND rowid>?",chat.id,anchor).n;this.store.run(chat.channel==='group'?'UPDATE whatsapp_groups SET unread=MIN(unread,?) WHERE id=?':'UPDATE chats SET unread=MIN(unread,?) WHERE id=?',remaining,chat.id);}
 snapshotRead(chat,anchor){if(!this.valid(chat))return;this.clearThrough(chat,anchor);this.store.run("INSERT INTO whatsapp_read_sync VALUES(?,?,?,'sent',?,NULL) ON CONFLICT(id) DO UPDATE SET anchor=excluded.anchor,state='sent',updated=excluded.updated,error=NULL",chat.id,chat.channel,anchor,Date.now());}
 save(chat,anchor,state,error=null){this.store.run('INSERT INTO whatsapp_read_sync VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET anchor=excluded.anchor,state=excluded.state,updated=excluded.updated,error=excluded.error',chat.id,chat.channel,anchor,state,Date.now(),error);this.store.changed();return{state,error};}
 mark(chat,{force=false}={}){
  if(!this.valid(chat))return Promise.resolve({state:'skipped'});
  const anchor=this.anchor(chat),previous=this.pending.get(chat.id),cached=this.last.get(chat.id);
  if(previous){if(previous.anchor>=anchor)return previous.task;return previous.task.then(()=>this.mark(chat,{force}));}
  if(!force&&cached?.anchor===anchor&&Date.now()-cached.at<5000)return Promise.resolve(cached.result);
  const client=this.wa.client,generation=this.wa.generation,signal=this.controller.signal,active=()=>client===this.wa.client&&generation===this.wa.generation&&this.wa.status==='ready'&&!signal.aborted;
  const task=(async()=>{
   if(this.wa.status!=='ready'||!client){const result=this.save(chat,anchor,'failed','WhatsApp desconectado. Reconecte e use Sincronizar leitura.');return result;}
   if(typeof client.sendSeen!=='function')return this.save(chat,anchor,'failed','Não foi possível confirmar a leitura no WhatsApp. Use Sincronizar leitura para tentar novamente.');
   this.save(chat,anchor,'pending');
   try{
    const confirmed=await new Promise((resolve,reject)=>{let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(value);},abort=()=>finish(new Error('Confirmação de leitura cancelada.')),timer=setTimeout(()=>finish(new Error('Timeout ao confirmar leitura.')),this.timeout);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();Promise.resolve().then(()=>client.sendSeen(chat.phone)).then(value=>finish(null,value),finish);});
    if(!active())return{state:'cancelled'};if(confirmed!==true)throw new Error('O WhatsApp não confirmou a leitura.');
    this.clearThrough(chat,anchor);return this.save(chat,anchor,'sent');
   }catch(error){if(!active())return{state:'cancelled'};this.wa.logger.error(`[WhatsApp read] ${safeConnectionDetail(error)}`);return this.save(chat,anchor,'failed','Não foi possível confirmar a leitura no WhatsApp. Use Sincronizar leitura para tentar novamente.');}
  })();this.pending.set(chat.id,{anchor,task});const cleanup=()=>{if(this.pending.get(chat.id)?.task===task)this.pending.delete(chat.id);};task.then(result=>{cleanup();if(active())this.last.set(chat.id,{anchor,at:Date.now(),result});},cleanup);return task;
 }
 find(id){if(groupId(id)){const group=this.store.groupList().find(group=>group.id===id);return group||null;}if(!privateId(id))return null;return this.store.get("SELECT c.* FROM chats c LEFT JOIN whatsapp_chat_aliases a ON a.chat_id=c.id WHERE c.channel='whatsapp' AND c.provider='qr' AND (c.phone=? OR a.alias=?) LIMIT 1",id,id);}
 register(client,generation){
  const active=()=>this.wa.client===client&&this.wa.generation===generation&&this.wa.status==='ready';
  client.on('unread_count',remote=>{if(!active())return;const id=(remote.id?._serialized||remote.id?.$1),chat=this.find(id);if(!chat)return;this.last.delete(chat.id);if(remote.unreadCount!==0)return;
   if(chat.channel==='whatsapp')this.store.run("UPDATE messages SET audio_agent_state='skipped' WHERE chat_id=? AND audio_agent_state='pending'",chat.id);
   const update=()=>{if(!active())return;const anchor=this.anchor(chat);this.clearThrough(chat,anchor);this.save(chat,anchor,'sent');};if(this.wa.enqueueSideEffect)this.wa.enqueueSideEffect(chat,update).catch(()=>{});else update();
  });
  client.on('message_ack',(message,ack)=>{if(!active()||!message?.fromMe&&!message?.id?.fromMe||!Number.isInteger(ack)||ack<0||ack>4)return;const chat=this.find(message.to),providerId=(message.id?._serialized||message.id?.$1);if(!chat||typeof providerId!=='string'||!providerId||chat.channel!=='whatsapp')return;
   const update=()=>{if(!active())return;const result=this.store.run("UPDATE messages SET provider_ack=MAX(COALESCE(provider_ack,0),?) WHERE provider_id=? AND chat_id=? AND direction IN ('owner','bot')",ack,providerId,chat.id);if(result.changes)this.store.changed();};if(this.wa.enqueueSideEffect)this.wa.enqueueSideEffect(chat,update).catch(()=>{});else update();
  });
 }
}
