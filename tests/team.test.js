import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../server/db.js';
import {createApp,hashPassword} from '../server/app.js';
import {demoProducts,replaceCatalog} from '../server/catalog.js';

const post=(client,url,body={})=>client.post(url).set('X-Cota-Request','1').send(body);
const patch=(client,url,body)=>client.patch(url).set('X-Cota-Request','1').send(body);
async function fixture(t){
 const store=new Store(':memory:');replaceCatalog(store,demoProducts,'test');const sent=[];
 const whatsapp={snapshot:()=>({status:'ready',qr:'owner-only-qr',number:'5511000000'}),send:async(chat,body)=>{sent.push({chat,body});return randomUUID();},connect:async()=>({status:'ready'}),disconnect:async()=>{}};
 const app=createApp({store,whatsapp}),owner=request.agent(app);t.after(()=>{app.locals.close();store.close();});
 await post(owner,'/api/auth/setup',{name:'Marina Dona',email:'dona@example.test',password:'owner-pass-12345'}).expect(201);
 async function add(name,email){const created=await post(owner,'/api/users',{name,email,password:'agent-pass-12345'}).expect(201);const client=request.agent(app);await post(client,'/api/auth/login',{email,password:'agent-pass-12345'}).expect(200);return{id:created.body.id,client,name,email};}
 const first=await add('Carla Lima','carla@example.test'),second=await add('Bruno Silva','bruno@example.test');
 async function chat(body='A42',phone='5511999999999@c.us'){return app.locals.agent.receive({body,phone,channel:'whatsapp',provider:'qr',providerId:randomUUID()});}
 return{store,app,owner,first,second,sent,chat};
}
test('each account has a private credential and shared chats, while administrative data stays with the owner',async t=>{
 const{owner,first,second,store,chat}=await fixture(t);const r=await chat();
 for(const user of [first,second]){
  const status=await user.client.get('/api/auth/status').expect(200);assert.equal(status.body.user.name,user.name);assert.equal(status.body.user.role,'comercial');assert(!JSON.stringify(status.body).includes('password'));
  const data=await user.client.get('/api/bootstrap').expect(200);assert(data.body.chats.some(c=>c.id===r.chatId));assert.equal(data.body.connection.qr,undefined);assert.equal(data.body.settings.sheetUrl,undefined);assert.deepEqual(data.body.events,[]);
 }
 const list=await owner.get('/api/users').expect(200);assert.equal(list.body.length,3);assert(!JSON.stringify(list.body).includes('password'));
 for(const row of store.all('SELECT password FROM users'))assert(!row.password.includes('pass-12345'));
});
test('attendants cannot administer users, inventory, prices, settings or the shared QR connection',async t=>{
 const{first,owner}=await fixture(t);
 await first.client.get('/api/users').expect(403);
 for(const [url,body] of [['/api/users',{name:'Fake',email:'fake@example.test',password:'123456789012',role:'owner'}],['/api/whatsapp/connect',{}],['/api/whatsapp/disconnect',{}],['/api/stock/sync',{url:'https://example.test'}],['/api/stock/import',{}],['/api/stock/preview',{}]])await post(first.client,url,body).expect(403);
 await patch(first.client,'/api/settings',{agentEnabled:false}).expect(403);await patch(first.client,`/api/users/${first.id}`,{active:false}).expect(403);
 await post(owner,'/api/users',{name:'Fake',email:'fake@example.test',password:'123456789012',role:'owner'}).expect(400);
 await patch(owner,'/api/users/owner',{active:false}).expect(409);
});
test('the first attendant claims the chat and concurrent replies from another attendant are blocked',async t=>{
 const{first,second,store,chat,sent}=await fixture(t);const r=await chat();
 const results=await Promise.all([post(first.client,`/api/chats/${r.chatId}/pause`,{minutes:null}),post(second.client,`/api/chats/${r.chatId}/pause`,{minutes:null})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const assigned=store.chat(r.chatId).assigned_user_id;const current=assigned===first.id?first:second,other=assigned===first.id?second:first;
 const count=sent.length;const result=await post(current.client,`/api/chats/${r.chatId}/send`,{body:'Olá, vou te atender.'}).expect(201);
 assert.equal(result.body.author_id,current.id);assert.equal(result.body.author_name,current.name);assert.equal(result.body.author_role,'comercial');assert.equal(result.body.body,'Olá, vou te atender.');assert.equal(result.body.delivery_body,`*${current.name}*: Olá, vou te atender.`);
 assert.equal(sent.at(-1).body,`*${current.name}*: Olá, vou te atender.`);
 await post(other.client,`/api/chats/${r.chatId}/send`,{body:'Não deve sair'}).expect(409);await post(other.client,`/api/chats/${r.chatId}/resume`).expect(409);assert.equal(sent.length,count+1);
});
test('owner can explicitly transfer a chat while the previous attendant loses permission to reply',async t=>{
 const{owner,first,store,chat}=await fixture(t);const r=await chat();await post(first.client,`/api/chats/${r.chatId}/pause`,{minutes:null}).expect(200);
 await post(owner,`/api/chats/${r.chatId}/pause`,{minutes:null}).expect(409);await post(owner,`/api/chats/${r.chatId}/pause`,{minutes:null,takeover:true}).expect(200);
 assert.equal(store.chat(r.chatId).assigned_user_id,'owner');await post(first.client,`/api/chats/${r.chatId}/send`,{body:'Não deve sair'}).expect(409);
});
test('typing presence uses the logged in name and accepts no forged identity or text',async t=>{
 const{owner,first,second,chat}=await fixture(t);const r=await chat();await post(first.client,`/api/chats/${r.chatId}/pause`,{minutes:null}).expect(200);
 await post(first.client,`/api/chats/${r.chatId}/typing`,{typing:true,name:'Dona'}).expect(400);
 await post(first.client,`/api/chats/${r.chatId}/typing`,{typing:true}).expect(200);
 const response=await owner.get('/api/bootstrap').expect(200);assert.deepEqual(response.body.typing,[{chatId:r.chatId,userId:first.id,name:first.name}]);assert.deepEqual((await second.client.get('/api/bootstrap')).body.typing,[]);
 await post(second.client,`/api/chats/${r.chatId}/typing`,{typing:true}).expect(409);
 await post(first.client,`/api/chats/${r.chatId}/typing`,{typing:false}).expect(200);assert.deepEqual((await second.client.get('/api/bootstrap')).body.typing,[]);
});
test('disabled users lose their sessions and assignments without reactivating the bot',async t=>{
 const{owner,first,second,store,chat,sent}=await fixture(t);const r=await chat();await post(first.client,`/api/chats/${r.chatId}/pause`,{minutes:null}).expect(200);
 await post(first.client,`/api/chats/${r.chatId}/typing`,{typing:true}).expect(200);await patch(owner,`/api/users/${first.id}`,{active:false}).expect(200);
 await first.client.get('/api/bootstrap').expect(401);await post(first.client,`/api/chats/${r.chatId}/send`,{body:'Não envia'}).expect(401);
 assert.equal(store.chat(r.chatId).assigned_user_id,null);assert.equal(store.chat(r.chatId).mode,'manual');assert.deepEqual((await second.client.get('/api/bootstrap')).body.typing,[]);assert.equal(sent.length,1);
});
test('password change revokes only that users sessions, not the rest of the team',async t=>{
 const{app,first,second,owner}=await fixture(t);const otherSession=request.agent(app);await post(otherSession,'/api/auth/login',{email:first.email,password:'agent-pass-12345'}).expect(200);
 await post(first.client,'/api/auth/password',{current:'agent-pass-12345',password:'changed-agent-12345'}).expect(200);
 await otherSession.get('/api/bootstrap').expect(401);await first.client.get('/api/bootstrap').expect(200);await second.client.get('/api/bootstrap').expect(200);await owner.get('/api/bootstrap').expect(200);
});
test('resetting an agents password and case-insensitive duplicate email are handled safely',async t=>{
 const{owner,first,app}=await fixture(t);await post(owner,'/api/users',{name:'Outro',email:'CARLA@example.test',password:'valid-pass-12345'}).expect(409);
 await patch(owner,`/api/users/${first.id}`,{password:'reset-agent-12345'}).expect(200);await first.client.get('/api/bootstrap').expect(401);
 await post(request.agent(app),'/api/auth/login',{email:first.email,password:'agent-pass-12345'}).expect(401);
 await post(request.agent(app),'/api/auth/login',{email:'CARLA@example.test',password:'reset-agent-12345'}).expect(200);
});
test('purchase, human request and manually confirmed order keep distinct visible alerts and send no unsolicited confirmation',async t=>{
 const{first,store,chat,sent}=await fixture(t);const r=await chat('pode separar');assert.equal(store.chat(r.chatId).purchase_requested,1);assert.equal(store.chat(r.chatId).order_state,'interest');
 await chat('quero falar com o atendente');assert.equal(store.chat(r.chatId).human_requested,1);assert.equal(store.chat(r.chatId).purchase_requested,1);
 await post(first.client,`/api/chats/${r.chatId}/pause`,{minutes:null}).expect(200);const count=sent.length,stock=store.all('SELECT sku,quantity FROM products ORDER BY sku');
 await post(first.client,`/api/chats/${r.chatId}/order/confirm`).expect(200);const confirmed=store.chat(r.chatId);assert.equal(confirmed.handoff_reason,'order_closed');assert.equal(confirmed.order_state,'confirmed');assert.equal(confirmed.order_confirmed_name,first.name);assert.equal(confirmed.needs_human,1);
 await post(first.client,`/api/chats/${r.chatId}/order/confirm`).expect(200);assert.equal(sent.length,count);assert.deepEqual(store.all('SELECT sku,quantity FROM products ORDER BY sku'),stock);
 await chat('vou comprar');assert.equal(store.chat(r.chatId).order_state,'confirmed');assert.equal(store.chat(r.chatId).handoff_reason,'order_closed');assert.equal(sent.length,count);
 await post(first.client,`/api/chats/${r.chatId}/resume`).expect(200);assert.equal(store.chat(r.chatId).human_requested,0);assert.equal(store.chat(r.chatId).purchase_requested,0);assert.equal(store.chat(r.chatId).order_state,'confirmed');
 await chat('quero fechar');assert.equal(store.chat(r.chatId).order_state,'interest');assert.equal(store.chat(r.chatId).handoff_reason,'purchase');
});
test('author history survives display name changes and human signature preference is applied server side',async t=>{
 const{owner,first,store,chat,sent}=await fixture(t);const r=await chat();await post(first.client,`/api/chats/${r.chatId}/pause`,{minutes:null}).expect(200);
 await post(first.client,`/api/chats/${r.chatId}/send`,{body:'Resposta assinada'}).expect(201);await patch(owner,`/api/users/${first.id}`,{name:'Carla Novo Nome'}).expect(200);
 assert.equal(store.messages(r.chatId).find(message=>message.body==='Resposta assinada').author_name,'Carla Lima');
 await patch(owner,'/api/settings',{signHumanMessages:false}).expect(200);await post(first.client,`/api/chats/${r.chatId}/send`,{body:'Sem assinatura'}).expect(201);assert.equal(sent.at(-1).body,'Sem assinatura');assert.equal(store.messages(r.chatId).at(-1).author_name,'Carla Novo Nome');
});
test('legacy owner credentials and sessions migrate without exposing hashes or losing chats',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-team-migrate-')),file=join(dir,'db.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));const raw=new DatabaseSync(file),hash=hashPassword('legacy-owner-12345'),token='legacy-cookie';
 raw.exec('CREATE TABLE owner(id INTEGER PRIMARY KEY,name TEXT,email TEXT,password TEXT);CREATE TABLE sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);');
 raw.exec("CREATE TABLE chats(id TEXT PRIMARY KEY,phone TEXT NOT NULL,name TEXT NOT NULL,channel TEXT NOT NULL,provider TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'auto',pause_until INTEGER,needs_human INTEGER NOT NULL DEFAULT 0,unread INTEGER NOT NULL DEFAULT 0,query TEXT,shown TEXT NOT NULL DEFAULT '[]',updated INTEGER NOT NULL,last_inbound INTEGER NOT NULL, handoff_reason TEXT, UNIQUE(phone,channel,provider));INSERT INTO chats(id,phone,name,channel,provider,mode,needs_human,updated,last_inbound,handoff_reason) VALUES('old-purchase','5511001','Cliente antigo','whatsapp','qr','manual',1,100,100,'purchase'),('old-human','5511002','Outro cliente','whatsapp','qr','manual',1,100,100,'human');");
 raw.prepare('INSERT INTO owner VALUES(1,?,?,?)').run('Dono antigo','old@example.test',hash);raw.prepare('INSERT INTO sessions VALUES(?,?)').run(createHash('sha256').update(token).digest('hex'),Date.now()+60000);raw.close();
 const store=new Store(file);const app=createApp({store,whatsapp:{snapshot:()=>({status:'ready'})}});t.after(()=>{app.locals.close();store.close();});
 const migrated=await request(app).get('/api/auth/status').set('Cookie',`cota_session=${token}`).expect(200);assert.equal(migrated.body.user.role,'admin');assert.equal(migrated.body.user.name,'Dono antigo');assert(!JSON.stringify(migrated.body).includes(hash));
 assert.equal(store.chat('old-purchase').order_state,'interest');assert.equal(store.chat('old-purchase').purchase_requested,1);assert.equal(store.chat('old-human').human_requested,1);assert.equal(store.chat('old-human').mode,'manual');
 await request(app).post('/api/chats/old-purchase/order/confirm').set('Cookie',`cota_session=${token}`).set('X-Cota-Request','1').send({}).expect(200);assert.equal(store.chat('old-purchase').order_state,'confirmed');
 await post(request.agent(app),'/api/auth/login',{email:'old@example.test',password:'legacy-owner-12345'}).expect(200);
});
