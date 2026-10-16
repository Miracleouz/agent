import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {Agent} from '../server/agent.js';
import {createApp} from '../server/app.js';
class FakeClient extends EventEmitter{
 constructor(){super();this.sent=[];this.groups=[];this.info={wid:{user:'5511000',_serialized:'5511000@c.us'}};}
 async initialize(){} async destroy(){} async logout(){}
 async getChats(){return this.groups;}
 async sendMessage(phone,body){this.sent.push({phone,body});return{id:{_serialized:randomUUID()}};}
}
async function fixture(t){const store=new Store(':memory:'),client=new FakeClient(),whatsapp=new WhatsApp(store,'/tmp/cota-group-fake',{clientFactory:()=>client}),agent=new Agent(store,(...args)=>whatsapp.send(...args));let forwarded=0;whatsapp.receiver=input=>{forwarded++;return agent.receive(input);};await whatsapp.connect();t.after(async()=>{await whatsapp.close();store.close();});return{store,client,whatsapp,forwarded:()=>forwarded};}
const message=(extra={})=>({from:'12345-678@g.us',author:'5511777@c.us',type:'chat',body:'quero comprar A42',timestamp:Math.floor(Date.now()/1000)+1,id:{_serialized:randomUUID()},_data:{notifyName:'Participante teste',isNewMsg:true},...extra});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('roster loads groups and private metadata without fetching group history or contacting participants',async t=>{
 const{client,store}=await fixture(t);client.groups=[{id:{_serialized:'12345-678@g.us'},name:'Equipe industrial',isGroup:true},{id:{_serialized:'5511@c.us'},name:'Cliente privado',isGroup:false}];client.emit('ready');await tick();assert.equal(store.groupList().length,1);assert.equal(store.groupList()[0].name,'Equipe industrial');assert.equal(store.groupMessages('12345-678@g.us').length,0);assert.equal(store.chats().length,1);assert.equal(store.chats()[0].service_origin_id,null);assert.equal(store.chats()[0].last_inbound,0);assert.equal(client.sent.length,0);
});
test('fresh group text is viewable and deduplicated without reaching the agent',async t=>{
 const{client,store,forwarded}=await fixture(t);client.emit('ready');const input=message();client.emit('message',input);client.emit('message',input);assert.equal(store.groupMessages(input.from).length,1);assert.equal(store.groupList()[0].unread,1);assert.equal(store.groupMessages(input.from)[0].author_name,'Participante teste');assert.equal(forwarded(),0);assert.equal(store.chats().length,0);assert.equal(client.sent.length,0);
});
test('group history, own messages and internal events cannot create group activity or responses',async t=>{
 const{client,store}=await fixture(t);client.emit('message',message());client.emit('ready');
 for(const extra of [{timestamp:0},{timestamp:undefined},{id:undefined},{fromMe:true},{id:{_serialized:'own',fromMe:true}},{_data:{isNewMsg:false}},{isStatus:true},{type:'e2e_notification'},{type:'gp2'},{type:'reaction'},{type:'call_log'},{body:' '}])client.emit('message',message(extra));
 assert.equal(store.groupList().length,0);assert.equal(client.sent.length,0);
});
test('group attachments use a consultation placeholder without download or handoff',async t=>{
 const{client,store,forwarded}=await fixture(t);client.emit('ready');client.emit('message',message({type:'ptt',body:''}));assert.match(store.groupMessages('12345-678@g.us')[0].body,/anexo recebido no grupo/);assert.equal(forwarded(),0);assert.equal(store.stats().waiting,0);assert.equal(client.sent.length,0);
});
test('group queries have a stable last-500 limit and cannot enter private chat counters',t=>{
 const store=new Store(':memory:');t.after(()=>store.close());for(let index=0;index<505;index++)store.addGroupMessage({id:'888@g.us',providerId:'g-'+index,author:'Participante',body:String(index),created:100});const history=store.groupMessages('888@g.us');assert.equal(history.length,500);assert.equal(history[0].body,'5');assert.equal(history.at(-1).body,'504');assert.equal(store.stats().conversations,0);assert.equal(store.stats().replies,0);
});
test('group input validates identities and keeps the roster name when new messages arrive',t=>{
 const store=new Store(':memory:');t.after(()=>store.close());for(const id of ['status@broadcast','123@newsletter','5511@c.us','invalid'])store.addGroupMessage({id,providerId:randomUUID(),author:'Teste',body:'oi',created:100});assert.equal(store.groupList().length,0);store.upsertGroup('999@g.us','Grupo de estoque');store.addGroupMessage({id:'999@g.us',providerId:'valid',author:'Teste',body:'oi',created:100});assert.equal(store.groupList()[0].name,'Grupo de estoque');
});
test('stale roster loads and group events from a disconnected client are discarded',async t=>{
 const{client,whatsapp,store}=await fixture(t);let complete;client.getChats=()=>new Promise(resolve=>complete=resolve);client.emit('ready');await whatsapp.disconnect();complete([{id:{_serialized:'999@g.us'},name:'Obsoleto',isGroup:true}]);client.emit('message',message());await tick();assert.equal(store.groupList().length,0);assert.equal(client.sent.length,0);
});
test('authenticated roles can consult groups while all group sending and assignment paths stay blocked',async t=>{
 const store=new Store(':memory:'),whatsapp={snapshot:()=>({status:'disconnected'})},app=createApp({store,whatsapp});t.after(()=>{app.locals.close();store.close();});const admin=request.agent(app),sales=request.agent(app),post=(client,url,body={})=>client.post(url).set('X-Cota-Request','1').send(body);
 await post(admin,'/api/auth/setup',{name:'Admin teste',email:'admin@example.test',password:'group-api-12345'}).expect(201);await post(admin,'/api/users',{name:'Comercial teste',email:'sales@example.test',password:'group-api-12345',role:'comercial'}).expect(201);await post(sales,'/api/auth/login',{email:'sales@example.test',password:'group-api-12345'}).expect(200);
 store.addGroupMessage({id:'123@g.us',name:'Consulta',providerId:'api',author:'Teste',body:'Olá grupo',created:100});for(const client of [admin,sales]){assert.equal((await client.get('/api/bootstrap').expect(200)).body.groups.length,1);await client.get('/api/groups/123@g.us/messages').expect(200);await post(client,'/api/groups/123@g.us/read').expect(200);await post(client,'/api/groups/123@g.us/send',{body:'Nunca enviar'}).expect(404);await post(client,'/api/chats/123@g.us/open').expect(404);}
 await request(app).get('/api/groups/123@g.us/messages').expect(401);assert.equal(store.groupList()[0].unread,0);assert.equal(store.chats().length,0);
});
test('the QR transport still blocks direct sends to any group address',async t=>{const{client,whatsapp}=await fixture(t);client.emit('ready');await assert.rejects(()=>whatsapp.send({phone:'123@g.us'},'Não enviar'),/grupos/);assert.equal(client.sent.length,0);});
