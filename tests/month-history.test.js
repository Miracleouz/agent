import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import request from 'supertest';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {createApp,hashPassword} from '../server/app.js';
import {historyWindow} from '../server/whatsapp-sync.js';
const hash=hashPassword('month-history-test-123'),pn='5511999999999@c.us',own='5511888888888@c.us',day=86400;
const profiles=[['Admin A','admin'],['Admin B','admin'],['Comercial A','comercial'],['Comercial B','comercial'],['Comercial C','comercial']],ages=[3600,day,7*day,15*day,29*day,29*day+23*3600,30*day-60,30*day+60,31*day,60*day];
const post=(user,url,body={})=>user.http.post(url).set('X-Cota-Request','1').send(body);
async function fixture(t,{age=29*day,count=500,start=true,file=':memory:'}={}){
 const store=new Store(file),logs=[],limits=[],sent=[];let wa,rows;const remote={id:{_serialized:pn},name:'Histórico de um mês',unreadCount:99,timestamp:Math.floor(Date.now()/1000)-3600,fetchMessages:async({limit})=>{limits.push(limit);if(!rows){const now=(wa.syncer.cutoff+historyWindow)/1000;rows=[{id:{_serialized:'older'},from:pn,type:'chat',body:'ATENDENTE: antigo',timestamp:now-31*day},{id:{_serialized:'boundary'},from:pn,type:'chat',body:'quero fechar: limite',timestamp:now-age},...Array.from({length:count},(_,i)=>({id:{_serialized:'month-'+i},from:pn,type:'chat',body:['pode separar B72','oi vim pelo site','quero comprar A89','cotação 4 PK 650'][i%4],timestamp:Math.floor(now)-3600-(count-i)*60}))].sort((a,b)=>a.timestamp-b.timestamp);}return rows.slice(-limit);}};
 class Client extends EventEmitter{constructor(){super();this.info={wid:{_serialized:own}};}async initialize(){}async destroy(){}async logout(){}async getChats(){return[remote];}async getContacts(){return[{id:{_serialized:pn},name:remote.name,isMyContact:true}];}async sendMessage(phone,body){sent.push({phone,body});return{id:{_serialized:randomUUID()}};}}
 const client=new Client();wa=new WhatsApp(store,'/tmp/cota-month-fake',{clientFactory:()=>client,logger:{error:value=>logs.push(value)}});const app=createApp({store,whatsapp:wa}),users=profiles.map(([name,role],i)=>{const id='month-user-'+i,token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,'month'+i+'@example.test',hash,role,Date.now());store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+day*1000,id);const http=request.agent(app);http.jar.setCookie(`cota_session=${token}; Path=/`);return{id,name,role,http};});
 let closed=false;async function close(){if(closed)return;closed=true;app.locals.close();await wa.close();store.close();}t.after(close);async function begin(){await wa.connect();client.emit('ready');await wa.sync();}if(start)await begin();return{store,wa,app,client,users,sent,limits,logs,remote,close,begin};
}
const flows=['importação automática por data','não lidas apenas com entrada nova','contato consulta sem assumir','permissões por responsável','liberar sem criar não lida','reconectar sem duplicar'];
for(const [ui,profile]of profiles.entries())for(const[ai,age]of ages.entries())for(const[fi,flow]of flows.entries())test(`histórico mensal ${ui*60+ai*6+fi+1}/300: ${profile[0]} · ${age}s · ${flow}`,async t=>{
 const f=await fixture(t,{age}),{store,wa,users,app}=f,actor=users[ui],chat=store.chats()[0],url='/api/chats/'+chat.id,contact=store.get('SELECT id FROM contacts'),expected=age<30*day?501:500;
 assert.equal(store.messages(chat.id).length,expected);assert.deepEqual(f.limits,[200,400,800]);assert.equal(chat.unread,0);assert.equal(chat.service_origin_id,null);assert.equal(chat.needs_human,0);assert.equal(chat.history_status,'complete');assert.equal(store.get("SELECT count(*) n FROM messages WHERE inbound_verified=1").n,0);assert.equal(f.sent.length,0);
 if(fi===0){assert.equal(wa.snapshot().sync.historiesDone,1);assert.equal(wa.snapshot().sync.historiesTotal,1);assert.equal(wa.snapshot().sync.historyDays,30);await wa.loadHistory(chat);assert.equal(f.limits.length,3);}
 if(fi===1){
  const input={phone:pn,name:'Cliente',channel:'whatsapp',provider:'qr',providerId:'live-'+randomUUID(),body:'oi vim pelo site'};await app.locals.agent.receive(input);assert.equal(store.chat(chat.id).unread,1);assert.equal(f.sent.length,1);assert.match(f.sent[0].body,/Olá, sou o agente ROBINHO/);await post(actor,url+'/open').expect(200);assert.equal(store.chat(chat.id).unread,0);return;
 }
 if(fi===2){const result=(await actor.http.get('/api/contacts/'+contact.id+'/history').expect(200)).body;assert.equal(result.messages.length,expected);assert.equal(store.chat(chat.id).assigned_user_id,null);assert.equal(store.chat(chat.id).mode,'auto');assert.equal(store.chat(chat.id).unread,0);}
 if(fi===3){store.openChat(chat.id,actor);const other=users.find(user=>user.role==='comercial'&&user.id!==actor.id);await other.http.get('/api/contacts/'+contact.id+'/history').expect(403);const result=(await users[0].http.get('/api/contacts/'+contact.id+'/history').expect(200)).body;assert.equal(result.messages.length,expected);assert.equal(store.chat(chat.id).assigned_user_id,actor.id);}
 if(fi===4){const opened=(await post(actor,url+'/open').expect(200)).body.chat;await post(actor,url+'/release',{version:opened.routing_version}).expect(200);assert.equal(store.chat(chat.id).unread,0);assert.equal(store.chat(chat.id).assigned_user_id,null);assert.equal(store.messages(chat.id).length,expected);}
 if(fi===5){await wa.disconnect();await f.begin();assert.equal(store.messages(chat.id).length,expected);assert.equal(store.chats().length,1);assert.equal(store.chat(chat.id).unread,0);}
 assert.equal(f.sent.length,0);assert.equal(store.chat(chat.id).last_inbound,0);for(let i=0;i<5;i++)await app.locals.agent.followups.check();assert.equal(f.sent.length,0);
});
test('month window includes the exact boundary and excludes the millisecond before it',async t=>{
 const f=await fixture(t,{start:false,count:0});await f.begin();const chat=f.store.chats()[0],cutoff=Math.floor(f.wa.syncer.cutoff/1000)*1000;f.wa.syncer.cutoff=cutoff;for(const[offset,id]of[[-1,'before'],[0,'exact'],[1,'after']])f.wa.syncer.importMessage(chat,{id:{_serialized:id},from:pn,type:'chat',body:id,timestamp:(cutoff+offset)/1000});assert.equal(f.store.get("SELECT id FROM messages WHERE provider_id='before'"),undefined);assert(f.store.get("SELECT id FROM messages WHERE provider_id='exact'"));assert(f.store.get("SELECT id FROM messages WHERE provider_id='after'"));assert.equal(f.sent.length,0);
});
test('available history shorter than a month is identified without inventing missing messages',async t=>{
 const f=await fixture(t,{start:false,count:2});f.remote.fetchMessages=async()=>[{id:{_serialized:'only-available'},from:pn,type:'chat',body:'Única disponível',timestamp:Math.floor(Date.now()/1000)-3600}];await f.begin();assert.equal(f.store.chats()[0].history_status,'available');assert.equal(f.store.messages(f.store.chats()[0].id).length,1);assert.equal(f.store.chats()[0].unread,0);assert.equal(f.sent.length,0);
});
test('page failure keeps already imported messages and marks the month incomplete until explicit retry',async t=>{
 const f=await fixture(t,{start:false});const original=f.remote.fetchMessages;f.remote.fetchMessages=async options=>{if(options.limit>200)throw new Error('network page failure');return original(options);};await f.begin();const chat=f.store.chats()[0];assert.equal(chat.history_status,'partial');assert.equal(f.store.messages(chat.id).length,200);assert.equal(f.wa.snapshot().sync.status,'partial');f.remote.fetchMessages=original;await f.wa.sync();assert.equal(f.store.messages(chat.id).length,501);assert.equal(f.store.chat(chat.id).history_status,'complete');assert.equal(f.sent.length,0);
});
test('historical unread counters are reset once while subsequent real unreads survive a server restart',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-month-persist-')),file=join(dir,'db.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));const f=await fixture(t,{file,count:2}),id=f.store.chats()[0].id;f.store.run("DELETE FROM app_migrations WHERE name='live_unread_only'");f.store.run('UPDATE chats SET unread=99 WHERE id=?',id);await f.close();let reopened=new Store(file);assert.equal(reopened.chat(id).unread,0);assert.equal(reopened.messages(id).length,3);reopened.run('UPDATE chats SET unread=1 WHERE id=?',id);reopened.close();reopened=new Store(file);assert.equal(reopened.chat(id).unread,1);assert.equal(reopened.chat(id).history_status,'complete');reopened.close();
});
test('unauthenticated and unknown-contact history reads are rejected and do not create a conversation',async t=>{
 const f=await fixture(t);await request(f.app).get('/api/contacts/unknown/history').expect(401);await f.users[0].http.get('/api/contacts/unknown/history').expect(404);const contact=(await post(f.users[0],'/api/contacts',{name:'Sem conversa',phone:'+5511988888888'}).expect(201)).body;const result=(await f.users[0].http.get(`/api/contacts/${contact.id}/history`).expect(200)).body;assert.equal(result.chat,null);assert.deepEqual(result.messages,[]);assert.equal(f.store.chats().length,1);assert.equal(f.sent.length,0);
});
