import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {createApp,hashPassword} from '../server/app.js';
import {replaceCatalog} from '../server/catalog.js';
import {industrialStock} from './fixtures/industrial-stock.js';

const pn='5511999999999@c.us',lid='9911999999999@lid',group='123456@g.us';
const hash=hashPassword('read-fixture-password-123');
const profiles=[['ROBSON','admin'],['JULIA','admin'],['ALEXANDRE','comercial'],['BIANCA','comercial'],['NICOLE','comercial']];
const variations=['oi vim pelo site','cotar corr B 72','correia a 89','correia 3VX 500','quero 4 PK 650','pj 350 5 frisos','at10 33000','AT10 33 MTS','at10 33 metros','AT10 33 MT'];
const post=(actor,url,body={})=>actor.http.post(url).set('X-Cota-Request','1').send(body);
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64');
class Client extends EventEmitter{
 constructor(){super();this.sent=[];this.seen=[];this.phoneUnread=0;this.seenResult=true;this.info={wid:{_serialized:'5511000000000@c.us'}};}
 async initialize(){} async destroy(){} async logout(){}
 async sendSeen(phone){this.seen.push(phone);const result=await (typeof this.seenResult==='function'?this.seenResult():this.seenResult);if(result===true)this.phoneUnread=0;return result;}
 async sendMessage(phone,body,options){assert.equal(options.sendSeen,false);const id=randomUUID();this.sent.push({phone,body,options,id});if(this.earlyAck)this.emit('message_ack',{to:phone,fromMe:true,id:{_serialized:id}},this.earlyAck);return{id:{_serialized:id}};}
}
async function fixture(t){
 const store=new Store(':memory:');replaceCatalog(store,industrialStock,'read-test');store.setSettings({agentEnabled:false});
 const client=new Client(),logs=[],wa=new WhatsApp(store,'/tmp/cota-read-fixture',{clientFactory:()=>client,logger:{error:line=>logs.push(line)}}),app=createApp({store,whatsapp:wa}),agent=app.locals.agent;
 await wa.connect();client.emit('ready');await wa.sync();
 const users=profiles.map(([name,role],i)=>{const id='read-user-'+i,token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,name.toLowerCase()+'@example.test',hash,role,Date.now());store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+86400000,id);const http=request.agent(app);http.jar.setCookie(`cota_session=${token}; Path=/`);return{id,name,role,http};});
 const drain=async()=>{while(agent.queues.size)await Promise.all([...agent.queues.values()]);};
 const emit=(body,from=pn,extra={})=>{client.phoneUnread++;client.emit('message',{from,body,type:'chat',timestamp:wa.readyAt+1,id:{_serialized:randomUUID(),fromMe:false},_data:{isNewMsg:true,notifyName:'Cliente'},...extra});};
 t.after(async()=>{app.locals.close();await wa.close();await drain();store.close();});
 return{store,wa,app,agent,client,users,logs,emit,drain};
}
const flows=['abrir e ler sem enviar','resposta do ROBINHO e confirmação do cliente','resposta manual ou foto assinada','leitura no celular e alias','falha e nova confirmação sem reenvio','mensagem nova durante confirmação'];
for(const[ui,profile]of profiles.entries())for(const[vi,body]of variations.entries())for(const[fi,flow]of flows.entries()){
 const index=(ui*variations.length+vi)*flows.length+fi+1;
 test(`leitura ${index}/300: ${profile[0]} · ${body} · ${flow}`,async t=>{
  const f=await fixture(t),{store,wa,agent,client,users,emit,drain}=f,actor=users[ui];
  // Loading a panel, syncing lists and firing internal events must never initiate contact.
  await actor.http.get('/api/bootstrap').expect(200);client.emit('unread_count',{id:{_serialized:pn},unreadCount:0});await drain();await agent.followups.check();assert.equal(client.sent.length,0);assert.equal(client.seen.length,0);assert.equal(store.chats().length,0);
  emit(body);await drain();let chat=store.chats()[0];const url='/api/chats/'+chat.id;
  assert.equal(chat.unread,1);assert.equal(client.phoneUnread,1);assert.equal(client.sent.length,0);
  if(fi===0){
   await actor.http.get(url+'/messages').expect(200);assert.equal(client.seen.length,0);
   await post(actor,url+'/open').expect(200);await post(actor,url+'/read').expect(200);
   assert.equal(client.seen.length,1);assert.equal(client.phoneUnread,0);assert.equal(store.chat(chat.id).unread,0);assert.equal(store.chat(chat.id).read_sync_state,'sent');assert.equal(store.chat(chat.id).assigned_user_id,actor.id);assert.equal(client.sent.length,0);
  }else if(fi===1){
   store.setSettings({agentEnabled:true});client.earlyAck=3;emit(body);await drain();
   assert.equal(client.sent.length,1);assert.equal(client.seen.length,1);assert.equal(client.phoneUnread,0);assert.equal(store.chat(chat.id).unread,0);const outgoing=store.messages(chat.id).at(-1);assert.equal(outgoing.direction,'bot');assert.equal(outgoing.status,'sent');assert.equal(outgoing.provider_ack,3);
   client.emit('message_ack',{to:pn,fromMe:true,id:{_serialized:outgoing.provider_id}},1);await drain();assert.equal(store.message(outgoing.id).provider_ack,3);assert.equal(client.sent.length,1);
  }else if(fi===2){
   await post(actor,url+'/open').expect(200);await wa.markRead(chat);emit('mais uma dúvida '+body);await drain();const before=client.seen.length;chat=store.chat(chat.id);
   let sent;
   if(vi%2){sent=(await actor.http.post(url+'/photo').set('X-Cota-Request','1').field('caption','Foto da correia').field('version',String(chat.routing_version)).field('requestId',randomUUID()).attach('photo',photo,{filename:'foto.png',contentType:'image/png'}).expect(201)).body;assert.match(client.sent[0].options.caption,new RegExp(actor.name));}
   else{sent=(await post(actor,url+'/send',{body:'Segue a cotação',version:chat.routing_version}).expect(201)).body;assert.equal(client.sent[0].body,`*${actor.name}*: Segue a cotação`);}
   assert.equal(sent.status,'sent');assert.equal(sent.author_name,actor.name);assert.equal(client.seen.length,before+1);assert.equal(client.phoneUnread,0);assert.equal(store.chat(chat.id).unread,0);assert.equal(client.sent.length,1);
  }else if(fi===3){
   store.run('INSERT INTO whatsapp_chat_aliases VALUES(?,?)',lid,chat.id);store.pause(chat.id,null,actor.id);
   client.emit('unread_count',{id:{_serialized:lid},unreadCount:0});await drain();assert.equal(store.chat(chat.id).unread,0);assert.equal(store.chat(chat.id).assigned_user_id,actor.id);assert.equal(store.chat(chat.id).read_sync_state,'sent');
   client.emit('unread_count',{id:{_serialized:pn},unreadCount:999});await drain();assert.equal(store.chat(chat.id).unread,0);assert.equal(client.seen.length,0);assert.equal(client.sent.length,0);
   emit('realmente nova');await drain();assert.equal(store.chat(chat.id).unread,1);
  }else if(fi===4){
   client.seenResult=vi%2?false:()=>{throw new Error('read transport failed');};store.pause(chat.id,null,actor.id);
   const sent=(await post(actor,url+'/send',{body:'Cotação recebida',version:store.chat(chat.id).routing_version}).expect(201)).body;assert.equal(sent.status,'sent');assert.equal(client.sent.length,1);assert.equal(store.chat(chat.id).read_sync_state,'failed');assert.equal(client.phoneUnread,1);
   client.seenResult=true;const retry=(await post(actor,url+'/read',{force:true}).expect(200)).body;assert.equal(retry.sync.state,'sent');assert.equal(client.phoneUnread,0);assert.equal(client.sent.length,1);assert.equal(client.seen.length,2);assert.equal(store.messages(chat.id).filter(m=>m.direction==='owner').length,1);
  }else{
   store.pause(chat.id,null,actor.id);let release,entered;const started=new Promise(resolve=>{entered=resolve;});client.seenResult=()=>{entered();return new Promise(resolve=>{release=resolve;});};
   const reading=wa.markRead(store.chat(chat.id));await started;emit('nova depois de começar a leitura');await drain();assert.equal(store.chat(chat.id).unread,2);release(true);await reading;
   assert.equal(store.chat(chat.id).unread,1);assert.equal(store.messages(chat.id).at(-1).body,'nova depois de começar a leitura');assert.equal(client.sent.length,0);client.seenResult=true;await post(actor,url+'/read').expect(200);assert.equal(store.chat(chat.id).unread,0);assert.equal(client.seen.length,2);
  }
  await agent.followups.check();assert(client.sent.every(message=>message.phone===pn));assert.equal(store.chats().length,1);assert.equal(store.get("SELECT count(*) n FROM messages WHERE direction='in' AND inbound_verified=0").n,0);
 });
}

test('read permissions follow ownership; Admin reads without taking over; contacts do not claim or send',async t=>{
 const{store,client,users,emit,drain}=await fixture(t);emit('oi');await drain();const chat=store.chats()[0],owner=users[2],other=users[3],admin=users[0];store.pause(chat.id,null,owner.id);const url='/api/chats/'+chat.id;
 await post(other,url+'/read',{force:true}).expect(403);assert.equal(client.seen.length,0);await post(admin,url+'/read').expect(200);assert.equal(store.chat(chat.id).unread,0);assert.equal(store.chat(chat.id).assigned_user_id,owner.id);
 const contact=(await post(admin,'/api/contacts',{name:'Cliente',phone:'+5511999999999'}).expect(201)).body;emit('nova');await drain();await post(other,`/api/contacts/${contact.id}/read`).expect(403);await post(admin,`/api/contacts/${contact.id}/read`).expect(200);assert.equal(store.chat(chat.id).assigned_user_id,owner.id);assert.equal(store.chat(chat.id).unread,0);assert.equal(client.sent.length,0);
});
test('explicit group reading synchronizes the phone without enabling responses to groups',async t=>{
 const{store,wa,client,users,emit,drain}=await fixture(t);emit('cotar B72',group);await drain();const chat=store.groupList()[0];assert.equal(chat.unread,1);assert.equal(client.seen.length,0);await post(users[2],`/api/groups/${group}/read`).expect(200);assert.equal(client.seen[0],group);assert.equal(store.groupList()[0].unread,0);assert.equal(store.groupList()[0].read_sync_state,'sent');await assert.rejects(wa.send({phone:group},'não enviar',[]));assert.equal(client.sent.length,0);
});
test('timeout and disconnect cancel read confirmation without replaying messages',async t=>{
 const{store,wa,client,emit,drain}=await fixture(t);emit('oi');await drain();const chat=store.chats()[0];wa.readSync.timeout=10;client.seenResult=()=>new Promise(()=>{});assert.equal((await wa.markRead(chat)).state,'failed');assert.equal(store.chat(chat.id).unread,1);
 wa.readSync.timeout=1000;let finish;client.seenResult=()=>new Promise(resolve=>{finish=resolve;});const pending=wa.markRead(chat,{force:true});await new Promise(resolve=>setImmediate(resolve));client.emit('disconnected');finish(true);assert.equal((await pending).state,'cancelled');assert.equal(store.chat(chat.id).unread,1);assert.equal(client.sent.length,0);assert.equal((await wa.markRead(chat)).state,'failed');
});
test('stale client events and forged acknowledgements never read or modify other conversations',async t=>{
 const{store,wa,client,users,emit,drain}=await fixture(t);emit('oi');await drain();const chat=store.chats()[0];store.pause(chat.id,null,users[0].id);const sent=(await post(users[0],`/api/chats/${chat.id}/send`,{body:'Olá',version:store.chat(chat.id).routing_version}).expect(201)).body;
 for(const[to,fromMe,ack]of[[pn,false,3],['5511888888888@c.us',true,3],[pn,true,5],[pn,true,-1],[pn,true,1.5]])client.emit('message_ack',{to,fromMe,id:{_serialized:sent.provider_id}},ack);
 client.emit('message_ack',{to:pn,fromMe:true,id:{_serialized:{malformed:true}}},3);await drain();assert.equal(store.message(sent.id).provider_ack,null);emit('nova');await drain();await wa.disconnect();client.emit('unread_count',{id:{_serialized:pn},unreadCount:0});client.emit('message_ack',{to:pn,fromMe:true,id:{_serialized:sent.provider_id}},3);await drain();assert.equal(store.chat(chat.id).unread,1);assert.equal(store.message(sent.id).provider_ack,null);assert.equal(client.sent.length,1);
});
test('roster read snapshot clears old unread but preserves messages received during list lookup',async t=>{
 const{store,wa,client,emit,drain}=await fixture(t);emit('antiga pendente');await drain();const chat=store.chats()[0];let release,entered;const started=new Promise(resolve=>{entered=resolve;});client.getChats=()=>{entered();return new Promise(resolve=>{release=resolve;});};const sync=wa.sync();await started;emit('nova durante sincronização');await drain();release([{id:{_serialized:pn},name:'Cliente',unreadCount:0}]);await sync;assert.equal(store.chat(chat.id).unread,1);assert.equal(client.sent.length,0);assert.equal(client.seen.length,0);
});
test('unknown contacts, simulators and malformed requests never mark arbitrary WhatsApp addresses',async t=>{
 const{store,wa,app,users,client}=await fixture(t);await post({http:request(app)},'/api/chats/unknown/read').expect(401);await post(users[0],'/api/chats/unknown/read').expect(404);const contact=(await post(users[0],'/api/contacts',{name:'Sem histórico',phone:'+5511988888888'}).expect(201)).body;assert.equal((await post(users[0],`/api/contacts/${contact.id}/read`).expect(200)).body.sync,null);await post(users[0],`/api/contacts/${contact.id}/read`,{phone:pn}).expect(400);
 for(const chat of [{id:'demo',phone:pn,channel:'simulator',provider:'demo'},{id:'bad',phone:'status@broadcast',channel:'whatsapp',provider:'qr'}])assert.equal((await wa.markRead(chat)).state,'skipped');assert.equal(client.seen.length,0);assert.equal(client.sent.length,0);assert.equal(store.chats().length,0);
});
