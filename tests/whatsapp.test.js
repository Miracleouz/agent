import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WhatsApp} from '../server/whatsapp.js';
import {Agent} from '../server/agent.js';
import {Store} from '../server/db.js';
import {demoProducts,replaceCatalog} from '../server/catalog.js';
import {followupActions} from '../server/followups.js';

class FakeClient extends EventEmitter {
 constructor(){super();this.sent=[];this.info={wid:{user:'5511000000000',_serialized:'5511000000000@c.us'},lid:{_serialized:'100000000000@lid'}};}
 async initialize(){}
 async destroy(){}
 async logout(){}
 async sendMessage(phone,body){this.sent.push({phone,body});return{id:{_serialized:`out-${randomUUID()}`}};}
}
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'cota-wa-test-'));
 const store=new Store(join(dir,'db.sqlite'));
 replaceCatalog(store,demoProducts,'test');
 const clients=[],pending=[];
 const whatsapp=new WhatsApp(store,dir,{clientFactory:()=>{const client=new FakeClient();clients.push(client);return client;}});
 const agent=new Agent(store,(...args)=>whatsapp.send(...args));
 whatsapp.receiver=input=>{const result=agent.receive(input);pending.push(result);return result;};
 t.after(async()=>{await whatsapp.close();store.close();rmSync(dir,{recursive:true,force:true});});
 await whatsapp.connect();
 return{store,whatsapp,agent,clients,client:clients[0],drain:()=>Promise.all(pending.splice(0))};
}
const message=(extra={})=>({from:'5511999999999@c.us',type:'chat',body:'A42',timestamp:Math.floor(Date.now()/1000)+1,id:{_serialized:randomUUID(),fromMe:false},_data:{notifyName:'Cliente',isNewMsg:true},...extra});

test('internal WhatsApp events never create chats, alert attendants or send messages',async t=>{
 const{store,client,drain}=await fixture(t);client.emit('ready');
 for(const type of ['e2e_notification','notification','notification_template','protocol','call_log','ciphertext','revoked','reaction','gp2','group_notification','broadcast_notification','debug','unknown','future_system_type']){
  client.emit('message',message({type,body:'ATENDENTE',hasMedia:true}));
 }
 client.emit('message',message({body:'  '}));
 await drain();assert.equal(store.chats().length,0);assert.equal(client.sent.length,0);
});

test('history, messages before readiness and invalid identities are ignored',async t=>{
 const{store,client,drain}=await fixture(t);
 client.emit('message',message({body:'ATENDENTE'}));client.emit('ready');
 for(const extra of [
  {timestamp:Math.floor(Date.now()/1000)-600},{timestamp:undefined},{timestamp:NaN},{_data:{isNewMsg:false}},
  {id:undefined},{id:{_serialized:'own',fromMe:true}},{fromMe:true},{isStatus:true},
  ...['123@g.us','status@broadcast','123@broadcast','123@newsletter','invalid','5511000000000@c.us','100000000000@lid'].map(from=>({from})),
 ])client.emit('message',message({body:'ATENDENTE',...extra}));
 await drain();assert.equal(store.chats().length,0);assert.equal(client.sent.length,0);
});

test('disconnected and replaced clients cannot trigger replies',async t=>{
 const{store,whatsapp,client,clients,drain}=await fixture(t);client.emit('ready');
 client.emit('disconnected');client.emit('message',message({body:'ATENDENTE'}));
 await whatsapp.connect();const current=clients.at(-1);current.emit('ready');
 client.emit('ready');client.emit('message',message({body:'ATENDENTE'}));
 await drain();assert.equal(store.chats().length,0);assert.equal(current.sent.length,0);
 current.emit('message',message());await drain();assert.equal(current.sent.length,1);assert.match(current.sent[0].body,/5 opções/);
 await whatsapp.close();current.emit('message',message({from:'5522@c.us',body:'ATENDENTE'}));
 await drain();assert.equal(current.sent.length,1);assert.equal(store.chats().length,1);
});

test('new private quotes, pagination and attendant requests work with duplicate protection',async t=>{
 const{store,client,drain}=await fixture(t);client.emit('ready');
 const quote=message({from:'123456789@lid'});
 client.emit('message',quote);client.emit('message',quote);await drain();
 assert.equal(client.sent.length,1);assert.match(client.sent[0].body,/5 opções/);
 client.emit('message',message({from:quote.from,type:'list_response',body:'',selectedRowId:'MAIS'}));await drain();
 assert.equal(client.sent.length,2);assert.match(client.sent[1].body,/R\$/);
 client.emit('message',message({from:quote.from,type:'buttons_response',body:'',selectedButtonId:'ATENDENTE'}));await drain();
 assert.equal(client.sent.length,3);assert.match(client.sent[2].body,/Avisei um atendente/);
 const chat=store.chats()[0];assert.equal(chat.needs_human,1);assert.equal(chat.mode,'manual');
 client.emit('message',message({from:quote.from,body:'ATENDENTE'}));await drain();assert.equal(client.sent.length,3);
});

test('actual customer attachments still flag the chat for human assistance',async t=>{
 const{store,client,drain}=await fixture(t);client.emit('ready');
 for(const [index,type] of ['ptt','audio','image','video','document','sticker'].entries()){
  const media=message({from:`55110${index}@c.us`,type,body:''});
  client.emit('message',media);client.emit('message',media);
 }
 await drain();assert.equal(client.sent.length,6);assert.equal(store.chats().length,6);
 assert(store.chats().every(chat=>chat.needs_human===1&&chat.mode==='manual'));
});
test('disconnect and reconnect discard a pending reminder before its deadline',async t=>{
 const{store,whatsapp,agent,client,clients,drain}=await fixture(t);client.emit('ready');client.emit('message',message());await drain();
 const chat=store.chats()[0];assert.equal(chat.followup_state,'scheduled');
 client.emit('disconnected');assert.equal(store.chat(chat.id).followup_due_at,null);
 await whatsapp.connect();clients.at(-1).emit('ready');await agent.followups.check();
 assert.equal(client.sent.length,1);assert.equal(clients.at(-1).sent.length,0);
});
test('QR transport sends exactly three idle choices in one message with numeric replies',async t=>{
 const{whatsapp,client}=await fixture(t);client.emit('ready');
 await whatsapp.send({phone:'5511@c.us'},'Como você prefere continuar?',followupActions);
 assert.equal(client.sent.length,1);const body=client.sent[0].body;
 for(const action of followupActions)assert.equal(body.split(action.label).length-1,1);
 assert.match(body,/1 — Quer fechar o pedido\?/);assert.match(body,/2 — Adicionar mais itens/);assert.match(body,/3 — Encerrar conversa/);
 assert.doesNotMatch(body,/ATENDENTE/);assert.equal(whatsapp.snapshot().nativeButtons,false);
});
