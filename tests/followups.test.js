import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {Agent} from '../server/agent.js';
import {replaceCatalog,demoProducts} from '../server/catalog.js';
import {followupActions} from '../server/followups.js';

const minute=60000;
function fixture(t,{file=':memory:',send}={}){
 const store=new Store(file);replaceCatalog(store,demoProducts,'test');
 let clock=Date.now(),connected=true;const sent=[];
 const agent=new Agent(store,async(chat,body,actions)=>{sent.push({chat,body,actions});return send?send(chat,body,actions):randomUUID();},{now:()=>clock,canSend:()=>connected});
 t.after(()=>store.close());
 const receive=(body,extra={})=>agent.receive({body,phone:'5511999999999@c.us',channel:'whatsapp',provider:'qr',...extra});
 return{store,agent,receive,sent,advance:ms=>{clock+=ms;},setConnected:value=>{connected=value;}};
}
test('five minutes of silence sends the three choices once even across 100 subsequent ticks',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const first=await receive('A42');
 advance(5*minute-1);assert.equal(await agent.followups.check(),0);assert.equal(sent.length,1);
 advance(1);assert.equal(await agent.followups.check(),1);assert.equal(sent.length,2);
 assert.deepEqual(sent[1].actions,followupActions);assert.equal(store.chat(first.chatId).followup_menu,1);
 for(let i=0;i<100;i++){advance(minute);await agent.followups.check();}
 advance(7*24*60*minute);await agent.followups.check();
 assert.equal(sent.length,2);assert.equal(store.chat(first.chatId).followup_state,'sent');
});
test('one customer responding does not cancel another customer reminder',async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42');await receive('A42',{phone:'5522@c.us'});
 await receive('obrigado');advance(5*minute);await agent.followups.check();
 const reminders=sent.filter(message=>message.actions?.[0]?.id==='close_order');assert.equal(reminders.length,1);assert.equal(reminders[0].chat.phone,'5522@c.us');
});
for(const body of ['Obrigado','Oi','ATENDENTE','quero fechar','pode separar','quero a segunda','encerrar conversa','adicionar mais itens']){
 test(`customer response cancels idle reminder: ${body}`,async t=>{
  const{store,agent,receive,sent,advance}=fixture(t);const first=await receive('A42');advance(4*minute);await receive(body);const count=sent.length;
  advance(2*minute);await agent.followups.check();assert.equal(sent.length,count);assert.equal(store.chat(first.chatId).followup_due_at,null);
 });
}
test('a fresh quote restarts the waiting period before the first reminder',async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42');advance(4*minute);await receive('MAIS');advance(minute);
 assert.equal(await agent.followups.check(),0);assert.equal(sent.length,2);
 advance(4*minute);assert.equal(await agent.followups.check(),1);assert.equal(sent.length,3);
});
test('new quotes cannot cause more than one reminder attempt per chat within 24 hours',async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42');advance(5*minute);await agent.followups.check();
 await receive('A42');advance(5*minute);await agent.followups.check();assert.equal(sent.length,3);
 advance(24*60*minute);await receive('A42');advance(5*minute);await agent.followups.check();assert.equal(sent.length,5);
});
for(const body of ['não quero comprar, só cotar A42','pode separar A42, mas quanto custa?']){
 test(`quote with explicit research or reservation does not trigger a closing prompt: ${body}`,async t=>{
  const{agent,receive,sent,advance}=fixture(t);await receive(body);assert.match(sent.at(-1).body,/R\$/);advance(5*minute);await agent.followups.check();assert.equal(sent.length,1);
 });
}
test('manual takeover cancels reminders, including after the timed pause expires',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const r=await receive('A42');store.pause(r.chatId,5);store.run('UPDATE chats SET pause_until=? WHERE id=?',Date.now()-1,r.chatId);store.resumeExpired();
 advance(5*minute);await agent.followups.check();assert.equal(sent.length,1);
});
for(const patch of [{agentEnabled:false},{followupMinutes:0},{followupMinutes:10}]){
 test(`changing automation cancels prior reminders: ${JSON.stringify(patch)}`,async t=>{
  const{store,agent,receive,sent,advance}=fixture(t);await receive('A42');store.setSettings(patch);advance(5*minute);await agent.followups.check();
  store.setSettings({agentEnabled:true,followupMinutes:5});await agent.followups.check();assert.equal(sent.length,1);
 });
}
test('disconnected transport cancels rather than retries the reminder on reconnection',async t=>{
 const{store,agent,receive,sent,advance,setConnected}=fixture(t);const r=await receive('A42');setConnected(false);advance(5*minute);await agent.followups.check();
 setConnected(true);await agent.followups.check();assert.equal(sent.length,1);assert.equal(store.chat(r.chatId).followup_state,'cancelled');
});
test('missed deadlines are discarded without a delayed send',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const r=await receive('A42');advance(8*minute);await agent.followups.check();
 assert.equal(sent.length,1);assert.equal(store.chat(r.chatId).followup_due_at,null);
});
test('a failed reminder is never retried automatically',async t=>{
 let calls=0;const{store,agent,receive,sent,advance}=fixture(t,{send:async()=>{if(++calls===2)throw new Error('Transport failure');return randomUUID();}});
 const r=await receive('A42');advance(5*minute);await agent.followups.check();assert.equal(store.chat(r.chatId).followup_state,'failed');
 for(let i=0;i<20;i++)await agent.followups.check();assert.equal(sent.length,2);
 await receive('A42');advance(5*minute);await agent.followups.check();assert.equal(sent.length,3);
});
test('100 concurrent checks and another agent sharing the store claim a single reminder',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);await receive('A42');advance(5*minute);
 const other=new Agent(store,agent.send,{now:agent.followups.now});
 await Promise.all([...Array.from({length:100},()=>agent.followups.check()),other.followups.check()]);assert.equal(sent.length,2);
});
test('incoming customer message cancels a reminder already waiting in the processing queue',async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42');advance(5*minute);
 await Promise.all([agent.followups.check(),receive('obrigado')]);
 assert.equal(sent.filter(message=>message.actions?.[0]?.id==='close_order').length,0);
});
test('duplicate delivery does not reschedule or create another reminder',async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42',{providerId:'quote-inbound'});advance(5*minute);await agent.followups.check();
 await receive('A42',{providerId:'quote-inbound'});advance(minute);await agent.followups.check();assert.equal(sent.length,2);
});
for(const [choice,type] of [['1','purchase'],['2','add_items'],['3','end_conversation']]){
 test(`idle menu choice ${choice} routes to ${type} without treating it as a quote option`,async t=>{
  const{store,agent,receive,sent,advance}=fixture(t);const r=await receive('A42');advance(5*minute);await agent.followups.check();
  const response=await receive(choice);assert.equal(response.intent,type);const chat=store.chat(r.chatId);
  if(type==='purchase'){assert.equal(chat.needs_human,1);assert.equal(chat.handoff_reason,'purchase');assert.doesNotMatch(sent.at(-1).body,/opção 1/);}
  if(type==='add_items'){assert.equal(chat.query,null);assert.equal(chat.mode,'auto');assert.match(sent.at(-1).body,/próximo item/);assert.equal(store.messages(r.chatId).length,5);}
  if(type==='end_conversation'){assert(chat.closed_at);await receive('ENCERRAR CONVERSA');assert.equal(sent.length,3);}
  advance(30*minute);const count=sent.length;await agent.followups.check();assert.equal(sent.length,count);
 });
}
test('the next actual customer quote reopens a closed conversation',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');await receive('ENCERRAR CONVERSA');await receive('A42');
 assert.equal(store.chat(r.chatId).closed_at,null);assert.match(sent.at(-1).body,/5 opções/);
});
test('after leaving the idle menu a bare number again refers to the quotation',async t=>{
 const{store,agent,receive,advance}=fixture(t);const r=await receive('A42');advance(5*minute);await agent.followups.check();
 await receive('Quanto custa A42?');const result=await receive('2');assert.equal(result.intent,'clarify');assert.equal(store.chat(r.chatId).pending_selection,1);
});
test('greetings, missing dimensions, unavailable products and unsuccessful quotes do not schedule a reminder',async t=>{
 for(const body of ['Oi','PJ350','A99999']){
  const{agent,receive,sent,advance}=fixture(t);await receive(body);advance(5*minute);await agent.followups.check();assert.equal(sent.length,1);
 }
 const{agent,receive,sent,advance}=fixture(t,{send:async()=>{throw new Error('Offline');}});await receive('A42');advance(5*minute);await agent.followups.check();assert.equal(sent.length,1);
});
test('groups, own messages, status and channels never start followup conversations',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);
 for(const extra of [{phone:'123@g.us'},{phone:'status@broadcast'},{phone:'123@newsletter'},{fromMe:true},{isStatus:true},{isGroup:true}])await receive('A42',extra);
 advance(5*minute);await agent.followups.check();assert.equal(store.chats().length,0);assert.equal(sent.length,0);
});
test('owner messages and close of the application prevent future reminders',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const r=await receive('A42');store.addMessage({chatId:r.chatId,direction:'owner',body:'Já estou verificando',status:'sent'});
 advance(5*minute);await agent.followups.check();assert.equal(sent.length,1);
 await receive('A42');agent.followups.close();advance(5*minute);await agent.followups.check();assert.equal(sent.length,2);
});
test('restart discards scheduled reminders and preserves the cooldown of an uncertain send',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-reminder-'));const file=join(dir,'db.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let store=new Store(file);replaceCatalog(store,demoProducts,'test');let clock=Date.now();const sent=[];
 const send=async()=>{sent.push(1);return randomUUID();};let agent=new Agent(store,send,{now:()=>clock});
 const input={phone:'5511@c.us',channel:'whatsapp',provider:'qr',body:'A42'};const r=await agent.receive(input);
 store.close();store=new Store(file);agent=new Agent(store,send,{now:()=>clock});clock+=5*minute;
 await agent.followups.check();assert.equal(sent.length,1);
 await agent.receive(input);store.run("UPDATE chats SET followup_state='sending',followup_due_at=NULL,followup_last_attempt=? WHERE id=?",clock,r.chatId);
 store.close();store=new Store(file);agent=new Agent(store,send,{now:()=>clock});
 try{await agent.receive(input);clock+=5*minute;await agent.followups.check();assert.equal(sent.length,3);}finally{store.close();}
});
