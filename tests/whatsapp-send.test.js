import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import {randomUUID,createHash} from 'node:crypto';
import request from 'supertest';
import wa from 'whatsapp-web.js';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {Agent} from '../server/agent.js';
import {createApp,hashPassword} from '../server/app.js';
import {prepareSendReceipt,consumeSendReceipt} from '../server/whatsapp-send.js';
import {seedSendBrowser} from './fixtures/whatsapp-send-browser.js';
import {testPhoto} from './fixtures/photo.js';
const require=createRequire(import.meta.url),{LoadUtils}=require('whatsapp-web.js/src/util/Injected/Utils.js'),pn='5511999999999@c.us',lid='991122334455@lid';
function fixture(t,mode='ok'){
 const context=createContext({window:{}});runInContext('('+seedSendBrowser.toString()+')()',context);runInContext('('+LoadUtils.toString()+')()',context);const state=context.window.sendFixture;state.mode=mode;state.installMedia();
 const client=new wa.Client();client.pupPage={evaluate:async(fn,...args)=>{context.args=args;return structuredClone(await runInContext('('+fn.toString()+')(...args)',context));}};client.destroy=async()=>{};
 const store=new Store(':memory:'),logs=[],whatsapp=new WhatsApp(store,'/tmp/cota-send-receipt-fixture',{logger:{error:line=>logs.push(line)}});whatsapp.client=client;whatsapp.status='ready';let reads=0;whatsapp.markRead=async()=>{reads++;if(state.readFailure)throw new Error('read persistence failed');return{state:'sent'};};
 store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES('send-chat',?,'Cliente','whatsapp','qr',?,0)",pn,Date.now());const chat=store.chat('send-chat');
 const cleanup=[];t.after(async()=>{for(const close of cleanup)await close();await whatsapp.close();store.close();});return{context,state,client,store,whatsapp,chat,logs,cleanup,reads:()=>reads};
}
for(const mode of ['undefined','serializer','lookup_throw'])test(`installed SDK really sends but loses its return: ${mode}`,async t=>{
 const f=fixture(t,mode);if(mode==='undefined')assert.equal(await f.client.sendMessage(pn,'teste',{sendSeen:false}),undefined);else await assert.rejects(f.client.sendMessage(pn,'teste',{sendSeen:false}));assert.equal(f.state.sent.length,1);
});
for(const mode of ['ok','undefined','serializer','lookup_throw'])for(const type of ['text','photo'])for(const phone of [pn,lid])test(`one exact send receipt: ${mode} / ${type} / ${phone.endsWith('@lid')?'LID':'PN'}`,async t=>{
 const f=fixture(t,mode),chat={...f.chat,phone},id=type==='text'?await f.whatsapp.send(chat,'teste',[]):await f.whatsapp.sendPhoto(chat,{type:'image/png',data:testPhoto,name:'foto.png'},'*Pessoa*: Foto');
 assert.equal(f.state.sent.length,1);assert.equal(id,f.state.sent[0].id._serialized);assert.equal(f.state.sent[0].to,phone);assert.equal(f.state.sent[0].__cotaSendToken,undefined);assert.equal(f.reads(),1);assert.equal(f.context.window.__cotaSendReceiptV1.attempts.size,0);
 if(type==='photo'){assert.equal(f.state.sent[0].caption,'*Pessoa*: Foto');assert.equal(f.state.sent[0].testData,testPhoto.toString('base64'));}else assert.equal(f.state.sent[0].body,'teste');
});
test('confirmed text and photo stay sent if post-send reading throws',async t=>{
 const f=fixture(t,'undefined');f.state.readFailure=true;
 assert.ok(await f.whatsapp.send(f.chat,'texto',[]));assert.ok(await f.whatsapp.sendPhoto(f.chat,{type:'image/png',data:testPhoto,name:'foto.png'},'Legenda'));assert.equal(f.state.sent.length,2);assert.equal(f.logs.filter(x=>x.includes('failed_after_send')).length,2);
});
test('identical concurrent text has different IDs and cannot cross-confirm targets',async t=>{
 const f=fixture(t,'serializer');const phones=[pn,lid,'5511222222222@c.us',pn,lid];const ids=await Promise.all(phones.map(phone=>f.whatsapp.send({...f.chat,phone},'texto idêntico',[])));assert.equal(new Set(ids).size,5);for(const[i,id]of ids.entries())assert.equal(f.state.sent.find(m=>m.id._serialized===id).to,phones[i]);assert.equal(f.context.window.__cotaSendReceiptV1.attempts.size,0);assert.equal(f.state.sent.length,5);
});
test('PN request resolved by the SDK to LID preserves the exact destination and receipt',async t=>{
 const f=fixture(t,'undefined');f.state.aliases={[pn]:lid};const id=await f.whatsapp.send(f.chat,'resolvido',[]);assert.ok(id.startsWith('true_'+lid+'_'));assert.equal(f.state.sent[0].to,lid);assert.equal(f.state.sent.length,1);
});
test('unaccepted send is uncertain, never marked sent, retried or followed up',async t=>{
 const f=fixture(t,'reject'),agent=new Agent(f.store,(...args)=>f.whatsapp.send(...args));f.cleanup.push(()=>agent.followups.close());const message=await agent.reply(f.chat,'teste',[],'owner');assert.equal(message.status,'uncertain');assert.equal(message.provider_id,null);assert.match(message.error,/Confira no WhatsApp antes de reenviar/);for(let i=0;i<10;i++)await agent.followups.check();assert.equal(f.state.sent.length,0);assert.equal(f.reads(),0);assert.equal(f.context.window.__cotaSendReceiptV1.attempts.size,0);
});
test('receipt bridge unavailable prevents sending instead of attempting untracked delivery',async t=>{
 const f=fixture(t);f.context.window.require('WAWebSendMsgChatAction').addAndSendMsgToChat=null;await assert.rejects(f.whatsapp.send(f.chat,'teste',[]),/Nenhuma mensagem foi enviada/);assert.equal(f.state.sent.length,0);
});
test('foreign or reused receipt tokens cannot produce a send',async t=>{
 const f=fixture(t),token=randomUUID();await f.client.pupPage.evaluate(prepareSendReceipt,{token,chatId:pn});await assert.rejects(f.client.sendMessage(lid,'wrong',{sendSeen:false,extra:{__cotaSendToken:token}}));assert.equal(f.state.sent.length,0);
 const result=await f.client.sendMessage(pn,'right',{sendSeen:false,extra:{__cotaSendToken:token}});assert.ok(result.id._serialized);await assert.rejects(f.client.sendMessage(pn,'duplicate',{sendSeen:false,extra:{__cotaSendToken:token}}));const receipt=await f.client.pupPage.evaluate(consumeSendReceipt,{token});assert.equal(receipt.state,'accepted');assert.equal(await f.client.pupPage.evaluate(consumeSendReceipt,{token}),null);assert.equal(f.state.sent.length,1);
});
test('a reconnect between receipt preparation and send prevents any delivery',async t=>{
 const f=fixture(t),evaluate=f.client.pupPage.evaluate;f.client.pupPage.evaluate=async(fn,...args)=>{const value=await evaluate(fn,...args);if(fn===prepareSendReceipt)f.whatsapp.status='disconnected';return value;};await assert.rejects(f.whatsapp.send(f.chat,'teste',[]),/antes do envio/);assert.equal(f.state.sent.length,0);assert.equal(f.context.window.__cotaSendReceiptV1.attempts.size,0);
});
test('untagged sends by WhatsApp itself are preserved without creating Cota receipts',async t=>{
 const f=fixture(t),token=randomUUID();await f.client.pupPage.evaluate(prepareSendReceipt,{token,chatId:pn});const result=await f.client.sendMessage(lid,'feito no celular',{sendSeen:false});assert.ok(result.id._serialized);const receipt=await f.client.pupPage.evaluate(consumeSendReceipt,{token});assert.equal(receipt.state,'prepared');assert.equal(f.state.sent.length,1);assert.equal(f.store.messages(f.chat.id).length,0);
});
for(const mode of ['partial_reject','changed_queue'])test(`an uncertain queue result cannot become a successful receipt: ${mode}`,async t=>{
 const f=fixture(t,mode);await assert.rejects(f.whatsapp.send(f.chat,'teste',[]),error=>error.uncertain===true);assert.equal(f.state.sent.length,1);assert.equal(f.reads(),0);assert.equal(f.context.window.__cotaSendReceiptV1.attempts.size,0);
});
test('receipt keeps menu text intact and history import cannot duplicate the confirmed provider ID',async t=>{
 const f=fixture(t,'undefined'),agent=new Agent(f.store,(...args)=>f.whatsapp.send(...args));f.cleanup.push(()=>agent.followups.close());const actions=[{id:'more',label:'Ver mais'},{id:'human',label:'Falar com atendente'}],message=await agent.reply(f.chat,'Cotação',actions,'owner');assert.equal(message.status,'sent');assert.match(f.state.sent[0].body,/Digite \*MAIS\*/);assert.match(f.state.sent[0].body,/Digite \*ATENDENTE\*/);f.whatsapp.syncer.importMessage(f.chat,{id:{_serialized:message.provider_id,fromMe:true},fromMe:true,to:pn,type:'chat',body:f.state.sent[0].body,timestamp:Math.floor(Date.now()/1000)});assert.equal(f.store.messages(f.chat.id).length,1);assert.equal(f.state.sent.length,1);
});
test('recovering a bot send still requires the customer to initiate and replay cannot resend',async t=>{
 const f=fixture(t,'undefined'),agent=new Agent(f.store,(...args)=>f.whatsapp.send(...args));f.cleanup.push(()=>agent.followups.close());assert.equal((await agent.reply(f.chat,'sem origem')).status,'blocked');assert.equal(f.state.sent.length,0);
 const inbound={phone:pn,name:'Cliente',body:'oi vim pelo site',providerId:'fresh-inbound',channel:'whatsapp',provider:'qr'};await agent.receive(inbound);assert.equal(f.state.sent.length,1);assert.match(f.state.sent[0].body,/Olá, sou o agente ROBINHO/);assert.equal(f.store.messages(f.chat.id).find(m=>m.direction==='bot').status,'sent');await agent.receive(inbound);await agent.receive({...inbound,providerId:'own',fromMe:true});await agent.receive({...inbound,phone:'123@g.us',providerId:'group',isGroup:true});assert.equal(f.state.sent.length,1);
});
const hash=hashPassword('send-confirmation-test-123');
async function apiFixture(t,mode){
 const f=fixture(t,mode),app=createApp({store:f.store,whatsapp:f.whatsapp}),token=randomUUID(),id='send-user';f.store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,'Bianca','bianca@example.test',hash,'comercial',Date.now());f.store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+86400000,id);const http=request.agent(app);http.jar.setCookie(`cota_session=${token}; Path=/`);f.store.openChat(f.chat.id,{id,name:'Bianca',role:'comercial'});f.cleanup.push(()=>app.locals.close());return{...f,app,http,chat:f.store.chat(f.chat.id)};
}
for(const mode of ['undefined','serializer','lookup_throw'])test(`manual API returns 201 and persists signature / ID after ${mode}`,async t=>{
 const f=await apiFixture(t,mode),result=await f.http.post(`/api/chats/${f.chat.id}/send`).set('X-Cota-Request','1').send({body:'teste',version:f.chat.routing_version}).expect(201);assert.equal(result.body.status,'sent');assert.equal(result.body.provider_id,f.state.sent[0].id._serialized);assert.equal(f.state.sent[0].body,'*Bianca*: teste');assert.equal(result.body.author_name,'Bianca');assert.equal(f.store.message(result.body.id).error,null);assert.equal(f.state.sent.length,1);assert.equal(f.store.messages(f.chat.id).length,1);
});
test('unconfirmed photo request returns 202 and its idempotency key never repeats delivery',async t=>{
 const f=await apiFixture(t,'reject'),key=randomUUID(),send=()=>f.http.post(`/api/chats/${f.chat.id}/photo`).set('X-Cota-Request','1').field('caption','teste').field('version',String(f.chat.routing_version)).field('requestId',key).attach('photo',testPhoto,{filename:'foto.png',contentType:'image/png'});let attempts=0;const original=f.context.window.require('WAWebSendMsgChatAction').addAndSendMsgToChat;f.context.window.require('WAWebSendMsgChatAction').addAndSendMsgToChat=function(...args){attempts++;return original.apply(this,args);};const first=(await send().expect(202)).body;const second=(await send().expect(202)).body;assert.equal(first.status,'uncertain');assert.equal(second.id,first.id);assert.equal(attempts,1);assert.equal(f.state.sent.length,0);assert.equal(f.store.messages(f.chat.id).length,1);
});
