import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {Agent} from '../server/agent.js';
import {replaceCatalog,demoProducts} from '../server/catalog.js';
import {inactivityMessage} from '../server/followups.js';
const minute=60000;
function fixture(t,{send}={}){
 const store=new Store(':memory:');replaceCatalog(store,demoProducts,'test');let clock=Date.now(),connected=true;const sent=[];
 const agent=new Agent(store,async(chat,body,actions)=>{sent.push({chat,body,actions});return send?send(chat,body,actions):randomUUID();},{now:()=>clock,canSend:()=>connected});t.after(()=>{agent.followups.close();store.close();});
 return{store,agent,sent,receive:(body,extra={})=>agent.receive({body,phone:'5511999999999@c.us',channel:'whatsapp',provider:'qr',providerId:randomUUID(),...extra}),advance:ms=>{clock+=ms;},setConnected:value=>{connected=value;}};
}
test('five minutes closes with exactly one plain notice, then stays silent over 100 ticks',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const first=await receive('A42');advance(5*minute-1);await agent.followups.check();assert.equal(sent.length,1);advance(1);assert.equal(await agent.followups.check(),1);assert.equal(sent[1].body,inactivityMessage);assert.deepEqual(sent[1].actions,[]);assert(store.chat(first.chatId).closed_at);assert.equal(store.chat(first.chatId).followup_menu,0);
 for(let i=0;i<100;i++){advance(minute);await agent.followups.check();}assert.equal(sent.length,2);
});
test('each customer has an independent deadline from their own last inbound',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const one=await receive('A42');await receive('A42',{phone:'5522@c.us'});advance(4*minute);await receive('obgd');advance(minute);await agent.followups.check();assert.equal(sent.filter(m=>m.body===inactivityMessage).length,1);assert.equal(sent.at(-1).chat.phone,'5522@c.us');assert.equal(store.chat(one.chatId).closed_at,null);advance(4*minute);await agent.followups.check();assert(store.chat(one.chatId).closed_at);
});
for(const body of ['Obrigado','Oi','adicionar mais itens','MAIS','A42'])test(`fresh inbound restarts five minutes: ${body}`,async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const first=await receive('A42');advance(4*minute);await receive(body);const count=sent.length;advance(2*minute);await agent.followups.check();assert.equal(sent.length,count);assert(store.chat(first.chatId).followup_due_at);advance(3*minute);await agent.followups.check();assert.equal(sent.length,count+1);assert.equal(sent.at(-1).body,inactivityMessage);
});
for(const body of ['ATENDENTE','quero fechar','pode separar','quero a segunda','encerrar conversa'])test(`handoff or explicit closure prevents automatic inactivity closure: ${body}`,async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42');advance(4*minute);await receive(body);const count=sent.length;advance(5*minute);await agent.followups.check();assert.equal(sent.filter(m=>m.body===inactivityMessage).length,0);assert(sent.length<=count+1); // Purchase may ask shipping, never close a human handoff.
});
for(const body of ['Oi','PJ350','A99999','não quero comprar, só cotar A42','pode separar A42, mas quanto custa?'])test(`automatic service also closes greeting, missing measure and research: ${body}`,async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const result=await receive(body);advance(5*minute);await agent.followups.check();assert.equal(sent.at(-1).body,inactivityMessage);assert(store.chat(result.chatId).closed_at);
});
test('a new meaningful customer request opens a new service that can close within the same day',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);const r=await receive('A42');advance(5*minute);await agent.followups.check();const count=sent.length;for(const body of ['ok','obgd','sim','não','1','2','3'])await receive(body);assert.equal(sent.length,count);await receive('A42');assert.equal(store.chat(r.chatId).closed_at,null);advance(5*minute);await agent.followups.check();assert.equal(sent.filter(m=>m.body===inactivityMessage).length,2);
});
for(const change of ['manual','disabled','disconnect','late','owner','shutdown'])test(`inactivity cancels without retry: ${change}`,async t=>{
 const{store,agent,receive,sent,advance,setConnected}=fixture(t);const r=await receive('A42');
 if(change==='manual'){store.pause(r.chatId,5);store.run('UPDATE chats SET pause_until=? WHERE id=?',Date.now()-1,r.chatId);store.resumeExpired();}
 if(change==='disabled')store.setSettings({agentEnabled:false});if(change==='disconnect')setConnected(false);if(change==='owner')store.addMessage({chatId:r.chatId,direction:'owner',body:'Verificando',status:'sent'});if(change==='shutdown')agent.followups.close();advance((change==='late'?8:5)*minute);await agent.followups.check();setConnected(true);store.setSettings({agentEnabled:true});await agent.followups.check();assert.equal(sent.length,1);assert.equal(store.chat(r.chatId).followup_due_at,null);
});
test('failed closure still closes locally and never retries without a new customer request',async t=>{
 let calls=0;const{store,agent,receive,sent,advance}=fixture(t,{send:async()=>{if(++calls===2)throw new Error('uncertain send');return randomUUID();}});const r=await receive('A42');advance(5*minute);await agent.followups.check();assert.equal(store.chat(r.chatId).followup_state,'failed');assert(store.chat(r.chatId).closed_at);for(let i=0;i<100;i++)await agent.followups.check();assert.equal(sent.length,2);
});
test('100 concurrent checks and another scheduler close once',async t=>{
 const{store,agent,receive,sent,advance}=fixture(t);await receive('A42');advance(5*minute);const other=new Agent(store,agent.send,{now:agent.now});await Promise.all([...Array.from({length:100},()=>agent.followups.check()),other.followups.check()]);assert.equal(sent.length,2);
});
test('incoming message cancels closure already waiting in the processing queue',async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42');advance(5*minute);await Promise.all([agent.followups.check(),receive('obrigado')]);assert.equal(sent.filter(m=>m.body===inactivityMessage).length,0);
});
test('duplicate inbound does not restart or reopen the service',async t=>{
 const{agent,receive,sent,advance}=fixture(t);await receive('A42',{providerId:'once'});advance(5*minute);await agent.followups.check();await receive('A42',{providerId:'once'});advance(5*minute);await agent.followups.check();assert.equal(sent.length,2);
});
test('first reply failing cannot schedule another automatic send',async t=>{const{store,agent,receive,sent,advance}=fixture(t,{send:async()=>{throw new Error('Offline');}});const r=await receive('A42');advance(5*minute);await agent.followups.check();assert.equal(sent.length,1);assert.equal(store.chat(r.chatId).followup_due_at,null);});
test('restart discards old deadlines and does not turn history into permission to contact',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-idle-')),file=join(dir,'db.sqlite');let store=new Store(file),agent,clock=Date.now();const sent=[];t.after(()=>{agent.followups.close();store.close();rmSync(dir,{recursive:true,force:true});});replaceCatalog(store,demoProducts,'test');const send=async()=>{sent.push(1);return randomUUID();};agent=new Agent(store,send,{now:()=>clock});const input={phone:'5511@c.us',channel:'whatsapp',provider:'qr',body:'A42'};const r=await agent.receive(input);agent.followups.close();store.close();store=new Store(file);agent=new Agent(store,send,{now:()=>clock});clock+=5*minute;await agent.followups.check();assert.equal(sent.length,1);assert.equal(store.chat(r.chatId).followup_due_at,null);await agent.receive(input);clock+=5*minute;await agent.followups.check();assert.equal(sent.length,3);assert(store.chat(r.chatId).closed_at);
});
test('legacy followup setting cannot change the requested fixed five-minute deadline',async t=>{const{store,agent,receive,sent,advance}=fixture(t);store.setSettings({followupMinutes:0});await receive('oi');assert.equal(store.settings().followupMinutes,5);advance(5*minute);await agent.followups.check();assert.equal(sent.at(-1).body,inactivityMessage);});
test('a delayed first reply is not immediately followed by a closure notice',async t=>{
 let advanceTransport,calls=0;const{agent,receive,sent,advance}=fixture(t,{send:async()=>{if(++calls===1)advanceTransport(5*minute);return randomUUID();}});advanceTransport=advance;await receive('A42');await agent.followups.check();assert.equal(sent.length,1);advance(5*minute-1);await agent.followups.check();assert.equal(sent.length,1);advance(1);await agent.followups.check();assert.equal(sent.length,2);assert.equal(sent.at(-1).body,inactivityMessage);
});
