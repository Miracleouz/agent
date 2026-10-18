import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {liveRuntime} from './fixtures/live-runtime.js';

const pn='5511999999999@c.us';
async function unread(f,{id='old-unread',body='cotar B72',age=86400,type='chat'}={}){
 await f.page.evaluate(({id,body,age,type,pn})=>{const row=window.liveFixture.make({id,body,age,type,fresh:false});window.sendFixture.records.set(id,row);const chat=window.sendFixture.chats.get(pn);chat.unreadCount=1;}, {id,body,age,type,pn});
 const chat=f.store.chats()[0];await f.wa.loadHistory(chat,{force:true});return f.store.chat(chat.id);
}
test('reactivating a closed conversation must not answer a previously unread historical quote',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const chat=await unread(f);f.store.closeChat(chat.id);f.store.resume(chat.id);
 await f.wa.sync();await f.drain();assert.equal((await f.sent()).length,0,'reactivation replayed a historical quote');
 assert.equal(f.store.chat(chat.id).service_origin_id,null);assert.equal(f.store.chat(chat.id).followup_due_at,null);
 await f.add({id:'new-customer-after-reactivation',body:'cotar A89'});assert.equal((await f.sent()).length,1);assert.match((await f.sent())[0].body,/A\s*89/);
});

const requests=['cotar B72','cotação corr B 72','vocês têm correia B30?','qual valor A 89','quero 4 PK 650','PK650 com 4 frisos','3vx 500 orçamento','AT10 33000','preciso de 2 mts AT10','pode separar','vou comprar','ATENDENTE'];
for(const action of ['close','resume','close-resume','release','expire'])for(const body of requests)for(const inventory of ['loaded','empty'])test(`${action}/${inventory}: old unread “${body}” never becomes a new request`,async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const chat=await unread(f,{body});if(inventory==='empty')f.store.run('DELETE FROM products');
 if(action==='close')f.store.closeChat(chat.id);
 if(action==='close-resume'){f.store.closeChat(chat.id);f.store.resume(chat.id);}
 if(action==='resume'){f.store.pause(chat.id,null);f.store.resume(chat.id);}
 if(action==='release'){f.store.pause(chat.id,null);f.store.releaseChat(chat.id);}
 if(action==='expire'){f.store.pause(chat.id,1);f.store.run('UPDATE chats SET pause_until=? WHERE id=?',Date.now()-1,chat.id);f.store.resumeExpired();}
 assert(f.store.chat(chat.id).auto_reply_after>0);
 for(let i=0;i<3;i++){await f.wa.sync();await f.app.locals.agent.followups.check();}
 await f.drain();assert.equal((await f.sent()).length,0);assert.equal(f.store.chat(chat.id).followup_due_at,null);
 assert.equal(f.store.chat(chat.id).human_requested,0);assert.equal(f.store.chat(chat.id).purchase_requested,0);
 assert.equal(f.store.get("SELECT inbound_verified FROM messages WHERE provider_id='old-unread'").inbound_verified,0);
 assert.equal(f.store.get("SELECT body FROM messages WHERE provider_id='old-unread'").body,body);
 await f.add({id:'next-customer-quotation',body:'cotar A89'});assert.equal((await f.sent()).length,1);assert.match((await f.sent())[0].body,inventory==='empty'?/estoque está sendo atualizado/:/A\s*89/);
 await f.add({id:'next-customer-quotation',body:'cotar A89'});await f.wa.sync();assert.equal((await f.sent()).length,1);
});

test('first connection still answers a genuinely pending unread quotation in an untouched service',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());await unread(f);await f.wa.sync();assert.equal((await f.sent()).length,1);assert.match((await f.sent())[0].body,/B\s*72/);await f.wa.sync();assert.equal((await f.sent()).length,1);
});
test('a new live quote is not lost when a history snapshot stores it in the same second as resume',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const chat=f.store.chats()[0];f.store.resume(chat.id);await unread(f,{id:'new-snapshot-before-live',body:'cotar A89',age:0});assert.equal((await f.sent()).length,0);
 // WhatsApp timestamps have only second precision. The fresh SDK event is the proof.
 await f.add({id:'new-snapshot-before-live',body:'cotar A89'});assert.equal((await f.sent()).length,1);await f.add({id:'new-snapshot-before-live',body:'cotar A89'});assert.equal((await f.sent()).length,1);
});
test('a same-second row already known before resume remains blocked even if a live event replays it',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const chat=await unread(f,{id:'known-before-resume',age:0});f.store.resume(chat.id);await f.add({id:'known-before-resume',body:'cotar B72'});assert.equal((await f.sent()).length,0);assert.equal(f.store.chat(chat.id).service_origin_id,null);
 await f.add({id:'genuinely-new-live',body:'cotar A89'});assert.equal((await f.sent()).length,1);
});
test('a quotation received while offline after reactivation can be answered, without mixing the ended quote',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());let chat=await unread(f,{body:'B72'});f.store.closeChat(chat.id);f.store.resume(chat.id);
 // Two requests on opposite sides of the persisted lifecycle boundary.
 f.store.run('UPDATE chats SET auto_reply_after=? WHERE id=?',Date.now()-60000,chat.id);await unread(f,{id:'after-boundary',body:'cotar A89',age:10});
 await f.page.evaluate(()=>{window.sendFixture.chats.get(window.liveFixture.pn).unreadCount=2;});await f.wa.sync();assert.equal((await f.sent()).length,1);assert.match((await f.sent())[0].body,/A\s*89/);assert.doesNotMatch((await f.sent())[0].body,/B\s*72/);
});
for(const imported of [true,false])test(`delayed live event from before resume is visible but cannot respond (imported=${imported})`,async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const chat=f.store.chats()[0];if(imported)await unread(f,{age:2});f.store.closeChat(chat.id);f.store.resume(chat.id);
 // Model a receipt before resume that was delayed in the browser binding queue.
 f.wa.readyAt-=10;const event={id:{_serialized:'old-unread'},from:pn,to:'5511888888888@c.us',type:'chat',body:'cotar B72',timestamp:Math.floor(Date.now()/1000)-2,_data:{isNewMsg:true}};
 // Native listener's cutoff was captured at ready; call the agent with the same verified payload.
 await f.app.locals.agent.receive({phone:pn,providerId:event.id._serialized,body:event.body,liveVerified:true,receivedTimestamp:event.timestamp});
 assert.equal((await f.sent()).length,0);assert.equal(f.store.chat(chat.id).service_origin_id,null);assert.equal(f.store.chat(chat.id).followup_due_at,null);assert(f.store.get("SELECT id FROM messages WHERE provider_id='old-unread'"));
});
test('pending audio is invalidated by reactivation and cannot announce or quote on completion',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const agent=f.app.locals.agent,chat=f.store.chats()[0];await agent.receive({phone:pn,providerId:'pending-voice',body:'[Áudio]',liveVerified:true,deferAudio:true});
 const row=f.store.get("SELECT * FROM messages WHERE provider_id='pending-voice'");f.store.resume(chat.id);f.store.run("UPDATE messages SET transcript='cotar B72' WHERE id=?",row.id);await agent.finishAudio(row.id);assert.equal((await f.sent()).length,0);assert.equal(f.store.chat(chat.id).followup_due_at,null);
});
for(const type of ['audio','ptt'])test(`reactivation does not download, transcribe or answer an old unread ${type}`,async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const chat=await unread(f,{type});f.store.closeChat(chat.id);f.store.resume(chat.id);let downloads=0,transcriptions=0;
 f.wa.loadMessageMedia=async()=>{downloads++;};f.wa.transcription.request=async()=>{transcriptions++;};await f.wa.sync();await f.drain();assert.equal(downloads,0);assert.equal(transcriptions,0);assert.equal((await f.sent()).length,0);
});
test('a synchronization suspended before closure cannot send when it resumes after reactivation',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const chat=await unread(f);let entered,release;const blocked=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});const receiver=f.wa.receiver;
 f.wa.receiver=async input=>{entered();await gate;return receiver(input);};const syncing=f.wa.sync();await blocked;f.store.closeChat(chat.id);f.store.resume(chat.id);release();await syncing;await f.drain();assert.equal((await f.sent()).length,0);assert.equal(f.store.chat(chat.id).service_origin_id,null);
});
test('inactivity closure and subsequent resume never replay an earlier unread quote',async t=>{
 const f=await liveRuntime();t.after(()=>f.close());const agent=f.app.locals.agent;agent.now=()=>Date.now()-300001;await f.add({id:'initial-quote',body:'cotar A89'});await agent.followups.check();const chat=f.store.chats()[0];assert(chat.closed_at);assert(chat.auto_reply_after>0);const count=(await f.sent()).length;assert.equal(count,2);
 await unread(f);f.store.resume(chat.id);for(let i=0;i<3;i++){await f.wa.sync();await agent.followups.check();}assert.equal((await f.sent()).length,count);
 agent.now=Date.now;await f.add({id:'next-after-idle',body:'cotar B72'});assert.equal((await f.sent()).length,count+1);
});
test('reply boundary persists across restart and migration protects previously controlled services only',t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-quiet-')),file=join(dir,'test.sqlite');let store=new Store(file);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 for(const id of ['resumed','released','closed','untouched'])store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES(?,?,?,'whatsapp','qr',?,0)",id,id+'@c.us',id,Date.now());
 store.closeChat('resumed');store.resume('resumed');store.releaseChat('released');store.closeChat('closed');const cutoff=store.chat('resumed').auto_reply_after;store.addMessage({chatId:'resumed',direction:'in',body:'cotação antiga'});store.close();store=new Store(file);assert.equal(store.chat('resumed').auto_reply_after,cutoff);assert.equal(store.messages('resumed').length,1);
 // Simulate opening an unmodified 1.19.0 schema in the corrected release.
 store.db.exec('ALTER TABLE chats DROP COLUMN auto_reply_after;ALTER TABLE chats DROP COLUMN auto_reply_sequence');store.close();store=new Store(file);for(const id of ['resumed','released','closed'])assert(store.chat(id).auto_reply_after>0);assert.equal(store.chat('untouched').auto_reply_after,0);assert.equal(store.messages('resumed').length,1);assert.equal(store.chat('resumed').service_origin_id,null);
});
