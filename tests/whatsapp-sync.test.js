import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import request from 'supertest';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {createApp,hashPassword} from '../server/app.js';
const hash=hashPassword('sync-tests-fixture-123'),pn='5511999999999@c.us',lid='9911999999999@lid',group='12345-678@g.us',own='5511888888888@c.us';
const profiles=[['Admin A','admin'],['Admin B','admin'],['Comercial A','comercial'],['Comercial B','comercial'],['Comercial C','comercial']],names=['Cliente industrial','José da Silva','Álvaro & Filhos','Empresa 123','Correias São João','Peças "Brasil"','Loja PJ 350','AT10 · Compras','Cliente com hífen - Sul','Contato do site'];
const post=(http,url,body={})=>http.post(url).set('X-Cota-Request','1').send(body),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,{name='Cliente de estoque',start=true,failContacts=false}={}){
 const store=new Store(':memory:'),logs=[],history=[{id:{_serialized:'previous-in-'+randomUUID()},type:'chat',from:pn,to:own,body:'quero fechar A42',timestamp:Math.floor(Date.now()/1000)-600},{id:{_serialized:'previous-out-'+randomUUID(),fromMe:true},fromMe:true,type:'chat',from:own,to:pn,body:'Valor anterior enviado pelo celular',timestamp:Math.floor(Date.now()/1000)-590}],remote={id:{_serialized:pn},name,timestamp:history[1].timestamp,unreadCount:3,isGroup:false,lastMessage:history[1]};
 class Client extends EventEmitter{
  constructor(){super();this.sent=[];this.info={wid:{_serialized:own,user:own.split('@')[0]}};this.chats=[remote,{id:{_serialized:group},isGroup:true,name:'Grupo '+name,fetchMessages:async()=>{throw new Error('Groups must not fetch history');}}];this.contacts=[{id:{_serialized:pn},name,isMyContact:true,isWAContact:true}];this.failContacts=failContacts;this.historyCalls=0;}
  async initialize(){}async destroy(){}async logout(){}
  async getChats(){return this.chats;}async getContacts(){if(this.failContacts)throw new Error('Contacts query failed');return this.contacts;}
  async getContactLidAndPhone(ids){return ids.some(id=>id===pn||id===lid)?[{pn,lid}]:[];}
  async getChatById(){return remote;}
  async sendMessage(phone,body){this.sent.push({phone,body});return{id:{_serialized:'sent-'+randomUUID()}};}
 }
 const client=new Client();remote.fetchMessages=async options=>{assert(options.limit>=200);client.historyCalls++;return history;};
 const wa=new WhatsApp(store,'/tmp/cota-sync-fake',{clientFactory:()=>client,logger:{error:message=>logs.push(message)}}),app=createApp({store,whatsapp:wa}),agent=app.locals.agent,pending=[];let forwarded=0;wa.receiver=input=>{forwarded++;const task=agent.receive(input);pending.push(task);return task;};
 const users=profiles.map(([name,role],i)=>{const id='sync-user-'+i,token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,'sync'+i+'@example.test',hash,role,Date.now());store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+86400000,id);const http=request.agent(app);http.jar.setCookie(`cota_session=${token}; Path=/`);return{id,name,role,http};});
 t.after(async()=>{app.locals.close();await wa.close();store.close();});async function begin(){await wa.connect();client.emit('ready');await wa.sync();}if(start)await begin();return{store,client,wa,app,agent,users,history,remote,logs,begin,forwarded:()=>forwarded,drain:()=>Promise.all(pending.splice(0))};
}
const flows=['listas e histórico sem envio','responsável e dados preservados','histórico não consome mensagem nova','acesso multiusuário','falha parcial e nova tentativa','cancelamento e reconexão'];
for(const [ui,profile] of profiles.entries())for(const [ni,name] of names.entries())for(const [fi,flow] of flows.entries())test(`sincronização ${ui*60+ni*6+fi+1}/300: ${profile[0]} · ${name} · ${flow}`,async t=>{
 const f=await fixture(t,{name,start:fi!==5,failContacts:fi===4}),{store,client,wa,agent,users}=f,actor=users[ui],admin=users[0];
 if(fi===5){
  let complete;client.getChats=()=>new Promise(resolve=>{complete=resolve;});await wa.connect();client.emit('ready');const old=wa.sync();await tick();await wa.disconnect();complete(client.chats);await old;assert.equal(store.chats().length,0);assert.equal(store.groupList().length,0);client.getChats=async()=>client.chats;await f.begin();assert.equal(store.chats().length,1);assert.equal(store.groupList().length,1);
 }else{
  const chat=store.chats()[0];assert(chat);assert.equal(chat.name,name);assert.equal(store.groupList()[0].name,'Grupo '+name);assert.equal(store.messages(chat.id).length,2);assert.equal(chat.last_inbound,0);assert.equal(chat.service_origin_id,null);
  if(fi===0){
   assert.equal(store.get('SELECT count(*) n FROM contacts').n,1);await wa.loadHistory(chat);assert.equal(store.messages(chat.id).length,2);assert(store.messages(chat.id).every(message=>message.inbound_verified===0&&message.status==='imported'));assert.equal(store.messages(chat.id)[0].body,'quero fechar A42');assert.equal(store.groupMessages(group).length,0);await wa.loadHistory(chat);assert.equal(client.historyCalls,1);
  }else if(fi===1){
   store.openChat(chat.id,actor);store.run("UPDATE chats SET needs_human=1,order_state='interest',purchase_requested=1,unread=9,name='Nome ajustado no Cota' WHERE id=?",chat.id);store.run("UPDATE contacts SET name='Agenda ajustada',company='Empresa local' WHERE phone=?",pn.split('@')[0]);store.run("UPDATE messages SET body='Texto já corrigido' WHERE chat_id=?",chat.id);const before=store.chat(chat.id);await wa.sync();assert.deepEqual(store.chat(chat.id),before);assert.equal(store.messages(chat.id)[0].body,'Texto já corrigido');assert.equal(store.get('SELECT company FROM contacts').company,'Empresa local');assert.equal(store.get('SELECT name FROM contacts').name,'Agenda ajustada');
  }else if(fi===2){
   await wa.loadHistory(chat);client.emit('message',{...f.history[0],_data:{isNewMsg:false}});await f.drain();assert.equal(client.sent.length,0);const live={id:{_serialized:'live-'+randomUUID()},from:lid,to:own,type:'chat',body:'oi vim pelo site',timestamp:wa.readyAt+1,_data:{isNewMsg:true}};f.remote.lastMessage=live;await wa.sync();assert.equal(store.get('SELECT id FROM messages WHERE provider_id=?',live.id._serialized),undefined);client.emit('message',live);await f.drain();assert.equal(client.sent.length,1);assert.match(client.sent[0].body,/Olá, sou o agente ROBINHO/);assert.equal(store.chats().length,1);assert.equal(store.get('SELECT inbound_verified FROM messages WHERE provider_id=?',live.id._serialized).inbound_verified,1);assert(store.chat(chat.id).service_origin_id);return;
  }else if(fi===3){
   const opened=(await post(actor.http,`/api/chats/${chat.id}/open`).expect(200)).body.chat;await actor.http.get(`/api/chats/${chat.id}/messages`).expect(200);await wa.loadHistory(opened);assert.equal(store.messages(chat.id).length,2);const other=users.find(user=>user.role==='comercial'&&user.id!==actor.id);await other.http.get(`/api/chats/${chat.id}/messages`).expect(403);await admin.http.get(`/api/chats/${chat.id}/messages`).expect(200);await actor.http.get(`/api/groups/${group}/messages`).expect(200);const messages=store.messages(chat.id);await actor.http.patch(`/api/chats/${chat.id}/messages/${messages[1].id}`).set('X-Cota-Request','1').send({body:'Não editar história',version:opened.routing_version,editVersion:0}).expect(403);
  }else{
   assert.equal(wa.snapshot().sync.status,'partial');assert.equal(store.get('SELECT count(*) n FROM contacts').n,0);assert(f.logs.length>0);client.failContacts=false;await wa.sync();assert.equal(wa.snapshot().sync.status,'ready');assert.equal(store.get('SELECT count(*) n FROM contacts').n,1);assert.equal(store.chats().length,1);assert.equal(store.messages(chat.id).length,2);
  }
 }
 for(let i=0;i<10;i++)await agent.followups.check();assert.equal(client.sent.length,0);assert.equal(f.forwarded(),0);assert(store.chats().every(chat=>chat.last_inbound===0&&chat.service_origin_id===null&&chat.followup_due_at===null));
});
test('sync filters own number, groups, status, channels, unsaved contacts and unknown phone numbers',async t=>{
 const f=await fixture(t,{start:false});f.client.chats.push(...[own,'5511888888888@s.whatsapp.net','status@broadcast','123@newsletter','bad'].map(id=>({id:{_serialized:id},name:'Ignorar'})));f.client.contacts.push({id:{_serialized:own},name:'Loja',isMyContact:true},{id:{_serialized:'123@lid'},name:'Não é telefone',isMyContact:true},{id:{_serialized:'5511777777777@c.us'},name:'Não salvo',isMyContact:false},{id:{_serialized:'123@g.us'},name:'Grupo',isMyContact:true});await f.begin();assert.equal(f.store.chats().length,1);assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,1);assert.equal(f.client.sent.length,0);
});
test('history snapshot cannot overwrite verified inbound, local edits, authors or media',async t=>{
 const f=await fixture(t),chat=f.store.chats()[0];f.store.run("UPDATE messages SET body='Edição local',media_type='image/png',media_data=?,author_id='human',author_name='Nome original',edit_version=2 WHERE chat_id=?",Buffer.from('fixture'),chat.id);await f.wa.sync();await f.wa.loadHistory(chat);const prior=f.store.get('SELECT * FROM messages WHERE provider_id=?',f.history[1].id._serialized);assert.equal(prior.body,'Edição local');assert.equal(prior.author_name,'Nome original');assert.equal(prior.edit_version,2);assert.equal(Buffer.from(prior.media_data).toString(),'fixture');assert.equal(f.client.sent.length,0);
});
test('history fetch is bounded, preserves order and imports no media bytes or internal events',async t=>{
 const f=await fixture(t),chat=f.store.chats()[0];f.history.splice(0,f.history.length,...Array.from({length:70},(_,i)=>({id:{_serialized:'old-'+i},from:pn,to:own,type:i===69?'notification':'chat',body:'Histórico '+i,timestamp:Math.floor(Date.now()/1000)-1000+i})));f.wa.syncer.histories.clear();await f.wa.loadHistory(chat);assert.equal(f.store.messages(chat.id).filter(message=>message.direction==='in').length,70);assert.equal(f.store.get("SELECT count(*) n FROM messages WHERE media_data IS NOT NULL").n,0);assert.equal(f.client.sent.length,0);
});
test('manual synchronization endpoint requires Admin, a ready connection and a valid empty body',async t=>{
 const f=await fixture(t),admin=f.users[0],sales=f.users[2];await post(sales.http,'/api/whatsapp/sync').expect(403);await post(admin.http,'/api/whatsapp/sync',{send:true}).expect(400);await post(admin.http,'/api/whatsapp/sync').expect(202);await f.wa.sync();await f.wa.disconnect();await post(admin.http,'/api/whatsapp/sync').expect(409);assert.equal(f.client.sent.length,0);
});
test('simultaneous manual sync requests share one provider query without doubling messages',async t=>{
 const f=await fixture(t);let calls=0,complete;f.client.getChats=()=>{calls++;return new Promise(resolve=>{complete=resolve;});};const tasks=Array.from({length:10},()=>f.wa.sync());await tick();assert.equal(calls,1);complete(f.client.chats);await Promise.all(tasks);assert.equal(f.store.chats().length,1);assert.equal(f.store.messages(f.store.chats()[0].id).length,2);assert.equal(f.client.sent.length,0);
});
test('conflicting pre-existing PN and LID histories are not merged or reassigned by sync',async t=>{
 const f=await fixture(t,{start:false});for(const [i,phone] of [pn,lid].entries())f.store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound,mode,assigned_user_id) VALUES(?,?,?,'whatsapp','qr',?,0,'manual',?)",'existing-'+i,phone,'Nome '+i,Date.now(),f.users[i+2].id);await f.begin();assert.equal(f.store.chats().length,2);assert.equal(f.wa.snapshot().sync.status,'partial');assert.equal(f.store.chat('existing-0').assigned_user_id,f.users[2].id);assert.equal(f.store.chat('existing-1').assigned_user_id,f.users[3].id);assert.equal(f.store.get('SELECT count(*) n FROM messages').n,0);assert.equal(f.client.sent.length,0);
});
test('chat query failure still imports available contacts and reports a recoverable partial state',async t=>{
 const f=await fixture(t,{start:false});f.client.getChats=async()=>{throw new Error('chat query failed');};await f.begin();assert.equal(f.wa.snapshot().sync.status,'partial');assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,1);assert.equal(f.store.chats().length,0);assert.equal(f.client.sent.length,0);
});
test('a timed-out roster is reported and its late result cannot write data after completion',async t=>{
 const f=await fixture(t,{start:false});f.wa.syncer.timeout=10;let complete;f.client.getChats=()=>new Promise(resolve=>{complete=resolve;});await f.begin();assert.equal(f.wa.snapshot().sync.status,'partial');assert.equal(f.store.chats().length,0);complete(f.client.chats);await tick();assert.equal(f.store.chats().length,0);assert.equal(f.client.sent.length,0);
});
test('read-only snapshots cannot schedule automatic closure even after manually reactivating the bot',async t=>{
 const f=await fixture(t),chat=f.store.chats()[0];await f.wa.loadHistory(chat);f.store.openChat(chat.id,f.users[2]);f.store.resume(chat.id);const future=Date.now()+86400000;f.agent.now=()=>future;f.agent.followups.now=()=>future;f.agent.followups.schedule(chat.id);await f.agent.followups.check();assert.equal(f.client.sent.length,0);assert.equal(f.store.chat(chat.id).service_origin_id,null);assert.equal(f.store.chat(chat.id).followup_due_at,null);
});
test('disconnect cancels an ongoing history query before the store can be updated',async t=>{
 const f=await fixture(t),chat=f.store.chats()[0];let complete;f.remote.fetchMessages=()=>new Promise(resolve=>{complete=resolve;});f.wa.syncer.histories.clear();const task=f.wa.loadHistory(chat);await tick();await f.wa.disconnect();complete(f.history);await task;assert.equal(f.store.messages(chat.id).length,2);assert.equal(f.client.sent.length,0);
});
