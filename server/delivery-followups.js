import {deliveryActions} from './conversation.js';
const cooldown=86400000,delay=180000,maxDelay=120000;
const privatePhone=phone=>/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(phone);
export class DeliveryFollowups{
 constructor(agent,{now=Date.now,canSend=()=>true}={}){this.agent=agent;this.store=agent.store;this.now=now;this.canSend=canSend;}
 eligible(chat){return chat?.delivery_allowed===1&&chat.purchase_requested===1&&chat.order_state==='interest'&&chat.handoff_reason==='purchase'&&chat.mode==='manual'&&!chat.assigned_user_id&&!chat.delivery_method&&!chat.closed_at&&!chat.human_requested;}
 schedule(id){
  const chat=this.store.chat(id),now=this.now();if(this.agent.followups.closed||!this.eligible(chat)||!this.store.settings().agentEnabled||chat.delivery_last_attempt!==null&&now-chat.delivery_last_attempt<cooldown)return;
  const origin=this.store.get("SELECT id FROM messages WHERE id=? AND chat_id=? AND direction='in'",chat.delivery_origin_id,id),latest=this.store.get('SELECT id FROM messages WHERE chat_id=? ORDER BY created DESC,rowid DESC LIMIT 1',id);
  if(!origin||!latest)return;
  this.store.run("UPDATE chats SET delivery_due_at=?,delivery_anchor_id=?,delivery_state='scheduled' WHERE id=?",now+delay,latest.id,id);this.store.changed();
 }
 cancel(id){this.store.run("UPDATE chats SET delivery_due_at=NULL,delivery_allowed=0,delivery_menu=0,delivery_state=CASE WHEN delivery_state IN ('scheduled','sending') THEN 'cancelled' ELSE delivery_state END WHERE id=?",id);}
 async check(){
  const due=this.store.all("SELECT id,phone,provider,channel FROM chats WHERE delivery_state='scheduled' AND delivery_due_at<=? ORDER BY delivery_due_at LIMIT 25",this.now());let count=0;
  for(const chat of due)if(await this.agent.enqueue(`${chat.provider}:${chat.channel}:${chat.phone}`,()=>this.deliver(chat.id)))count++;
  return count;
 }
 async deliver(id){
  const chat=this.store.chat(id),now=this.now();if(!chat||chat.delivery_state!=='scheduled'||chat.delivery_due_at>now)return false;
  const latest=this.store.get('SELECT id FROM messages WHERE chat_id=? ORDER BY created DESC,rowid DESC LIMIT 1',id),origin=this.store.get("SELECT id FROM messages WHERE id=? AND chat_id=? AND direction='in'",chat.delivery_origin_id,id);
  if(!this.eligible(chat)||!this.store.settings().agentEnabled||!chat.delivery_due_at||now-chat.delivery_due_at>maxDelay||chat.delivery_last_attempt!==null&&now-chat.delivery_last_attempt<cooldown||chat.channel!=='simulator'&&!privatePhone(chat.phone)||!this.canSend(chat)||!origin||latest?.id!==chat.delivery_anchor_id){this.cancel(id);return false;}
  const claim=this.store.run("UPDATE chats SET delivery_state='sending',delivery_due_at=NULL,delivery_last_attempt=?,delivery_menu=1 WHERE id=? AND delivery_state='scheduled' AND delivery_anchor_id=?",now,id,latest.id);if(!claim.changes)return false;
  const result=await this.agent.reply(chat,'Como você prefere receber o pedido?',deliveryActions);
  this.store.run('UPDATE chats SET delivery_state=?,delivery_menu=? WHERE id=?',result.status==='sent'?'sent':'failed',result.status==='sent'?1:0,id);this.store.changed();return result.status==='sent';
 }
}
