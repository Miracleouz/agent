import {DeliveryFollowups} from './delivery-followups.js';
export const inactivityDelay=300000;
export const inactivityMessage='Como não recebemos uma resposta em 5 minutos, este atendimento foi encerrado. Quando precisar, é só enviar uma nova mensagem.';
const maxDelay=120000;
const privatePhone=phone=>/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(phone);

export class Followups {
 constructor(agent,options={}){const {now=Date.now,canSend=()=>true}=options;this.agent=agent;this.store=agent.store;this.now=now;this.canSend=canSend;this.running=false;this.closed=false;this.delivery=new DeliveryFollowups(agent,options);}
 eligible(chat){return chat&&chat.mode==='auto'&&!chat.needs_human&&!chat.human_requested&&!chat.closed_at&&(chat.channel==='simulator'||privatePhone(chat.phone));}
 proof(chat){
  if(!chat?.service_origin_id)return null;
  const origin=this.store.get("SELECT rowid sequence FROM messages WHERE id=? AND chat_id=? AND direction='in' AND inbound_verified=1",chat.service_origin_id,chat.id);
  const incoming=this.store.get("SELECT id,rowid sequence FROM messages WHERE chat_id=? AND direction='in' AND inbound_verified=1 ORDER BY rowid DESC LIMIT 1",chat.id);
  const bot=this.store.get("SELECT status,sent_at,rowid sequence FROM messages WHERE chat_id=? AND direction='bot' ORDER BY rowid DESC LIMIT 1",chat.id);
  const latest=this.store.get('SELECT id,direction FROM messages WHERE chat_id=? ORDER BY rowid DESC LIMIT 1',chat.id);
  return origin&&incoming&&bot?.status==='sent'&&bot.sent_at!==null&&bot.sequence>origin.sequence&&incoming.sequence>=origin.sequence&&latest?.direction!=='owner'?{incoming,latest,bot}:null;
 }
 schedule(chatId){
  const chat=this.store.chat(chatId),proof=this.proof(chat);
  if(this.closed||!this.eligible(chat)||!this.store.settings().agentEnabled||!proof)return;
  // Only processing a fresh customer inbound calls this; never scan old chats to start timers.
  this.store.run("UPDATE chats SET followup_due_at=?,followup_quote_id=?,followup_inbound_id=?,followup_state='scheduled',followup_menu=0 WHERE id=?",Math.max(chat.last_inbound,proof.bot.sent_at)+inactivityDelay,proof.latest.id,proof.incoming.id,chatId);this.store.changed();
 }
 async check(){
  if(this.closed||this.running)return 0;this.running=true;
  try{
   if(!this.store.settings().agentEnabled){this.store.cancelFollowups();return 0;}
   let sent=await this.delivery.check();
   const due=this.store.all("SELECT id,phone,provider,channel FROM chats WHERE followup_state='scheduled' AND followup_due_at<=? ORDER BY followup_due_at LIMIT 25",this.now());
   for(const chat of due)if(await this.agent.enqueue(`${chat.provider}:${chat.channel}:${chat.phone}`,()=>this.deliver(chat.id)))sent++;
   return sent;
  }finally{this.running=false;}
 }
 async deliver(id){
  const chat=this.store.chat(id),now=this.now();if(!chat||chat.followup_state!=='scheduled'||chat.followup_due_at>now)return false;
  const proof=this.proof(chat);
  if(this.closed||!this.store.settings().agentEnabled||!this.eligible(chat)||!proof||!chat.followup_due_at||now-chat.followup_due_at>maxDelay||!this.canSend(chat)||proof.latest.id!==chat.followup_quote_id||proof.incoming.id!==chat.followup_inbound_id||now-Math.max(chat.last_inbound,proof.bot.sent_at)<inactivityDelay){this.store.cancelFollowups(id,{quoteOnly:true});return false;}
  // Close and claim before transport. A crash or uncertain send cannot repeat the notice.
  const claim=this.store.run("UPDATE chats SET followup_state='sending',followup_due_at=NULL,followup_last_attempt=?,followup_menu=0,closed_at=?,help_state='closed',query=NULL,shown='[]',quoted_options='[]',batch_queries='[]',pending_item_index=NULL,pending_measure=NULL,pending_selection=NULL,pickup_pending_details=0,delivery_due_at=NULL,delivery_allowed=0,delivery_menu=0 WHERE id=? AND followup_state='scheduled' AND followup_inbound_id=? AND closed_at IS NULL",now,now,id,proof.incoming.id);
  if(!claim.changes)return false;
  const result=await this.agent.reply(chat,inactivityMessage,[],'bot',{allowClosed:true});
  this.store.run('UPDATE chats SET followup_state=? WHERE id=?',result.status==='sent'?'sent':'failed',id);this.store.changed();return result.status==='sent';
 }
 close(){this.closed=true;this.store.cancelFollowups();}
}
