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
const secret='roles-fixture-12345';
const post=(client,url,body={})=>client.post(url).set('X-Cota-Request','1').send(body);
const patch=(client,url,body)=>client.patch(url).set('X-Cota-Request','1').send(body);
async function fixture(t){
 const store=new Store(':memory:'),sent=[];
 const whatsapp={snapshot:()=>({status:'ready',qr:'test-qr'}),send:async(chat,body)=>{sent.push({chat,body});return randomUUID();},connect:async()=>({status:'ready'}),disconnect:async()=>{}};
 const app=createApp({store,whatsapp}),admin=request.agent(app);t.after(()=>{app.locals.close();store.close();});
 await post(admin,'/api/auth/setup',{name:'Admin Original',email:'admin@example.test',password:secret}).expect(201);
 const login=async email=>{const client=request.agent(app);await post(client,'/api/auth/login',{email,password:secret}).expect(200);return client;};
 const create=async(name,role='comercial')=>{const email=name.toLowerCase()+'@example.test',result=await post(admin,'/api/users',{name,email,password:secret,role}).expect(201);return{...result.body,client:await login(email)};};
 const chat=async(body='oi',phone=randomUUID())=>app.locals.agent.receive({body,phone:phone+'@c.us',channel:'whatsapp',provider:'qr',providerId:randomUUID()});
 return{store,app,admin,create,login,chat,sent};
}
test('Admin and Comercial are the only assignable roles, with multiple administrators allowed',async t=>{
 const{admin,create}=await fixture(t);const first=await create('Gestora','admin'),second=await create('Gestor','admin'),sales=await create('Vendas');
 for(const user of [first,second]){const data=await user.client.get('/api/bootstrap').expect(200);assert.equal(data.body.currentUser.role,'admin');assert.equal(data.body.connection.qr,'test-qr');await user.client.get('/api/users').expect(200);}
 assert.equal(sales.role,'comercial');await post(sales.client,'/api/users',{name:'Intruso',email:'intruso@example.test',password:secret,role:'admin'}).expect(403);
 await patch(sales.client,`/api/users/${sales.id}`,{role:'admin'}).expect(403);
 for(const role of ['owner','agent','superadmin','ADMIN'])await post(admin,'/api/users',{name:'Inválido',email:'invalid@example.test',password:secret,role}).expect(400);
});
test('Comercial sees its own chats and the queue; Admin sees all histories and statistics',async t=>{
 const{admin,create,chat,store}=await fixture(t),one=await create('PessoaUm'),two=await create('PessoaDois'),manager=await create('Gerencia','admin');
 const own=await chat('quero fechar'),other=await chat('pode separar'),queue=await chat('oi');
 await post(one.client,`/api/chats/${own.chatId}/pause`,{minutes:null}).expect(200);await post(two.client,`/api/chats/${other.chatId}/pause`,{minutes:null}).expect(200);
 await post(two.client,`/api/chats/${other.chatId}/typing`,{typing:true}).expect(200);
 const data=await one.client.get('/api/bootstrap').expect(200);assert.deepEqual(new Set(data.body.chats.map(chat=>chat.id)),new Set([own.chatId,queue.chatId]));assert.equal(data.body.stats.conversations,2);assert.equal(data.body.stats.waiting,1);assert.deepEqual(data.body.typing,[]);assert.deepEqual(data.body.team,[]);
 await one.client.get(`/api/chats/${other.chatId}/messages`).expect(403);const unread=store.chat(other.chatId).unread;await post(one.client,`/api/chats/${other.chatId}/read`).expect(403);assert.equal(store.chat(other.chatId).unread,unread);
 for(const user of [admin,manager.client]){const all=await user.get('/api/bootstrap').expect(200);assert.equal(all.body.chats.length,3);assert.equal(all.body.stats.conversations,3);assert.equal(all.body.stats.waiting,2);assert.equal(all.body.typing.length,1);await user.get(`/api/chats/${other.chatId}/messages`).expect(200);}
});
test('Admin transfers chats without customer messages and immediately changes Comercial visibility',async t=>{
 const{admin,create,chat,store,sent}=await fixture(t),one=await create('Anterior'),two=await create('Destino');const result=await chat('quero fechar');
 await post(one.client,`/api/chats/${result.chatId}/pause`,{minutes:null}).expect(200);const count=sent.length;
 await post(one.client,`/api/chats/${result.chatId}/assign`,{userId:two.id}).expect(403);
 await post(admin,`/api/chats/${result.chatId}/assign`,{userId:'missing'}).expect(400);
 await post(admin,`/api/chats/${result.chatId}/assign`,{userId:two.id}).expect(200);
 const assigned=store.chat(result.chatId);assert.equal(assigned.assigned_user_id,two.id);assert.equal(assigned.mode,'manual');assert.equal(assigned.followup_due_at,null);assert.equal(assigned.pause_until,null);assert.equal(sent.length,count);
 await one.client.get(`/api/chats/${result.chatId}/messages`).expect(403);assert.equal((await one.client.get('/api/bootstrap')).body.chats.length,0);await two.client.get(`/api/chats/${result.chatId}/messages`).expect(200);
 await post(one.client,`/api/chats/${result.chatId}/send`,{body:'Bloqueada'}).expect(409);
 await post(two.client,`/api/chats/${result.chatId}/send`,{body:'Agora posso atender'}).expect(201);assert.match(sent.at(-1).body,/^\*Destino\*:/);
});
test('role changes revoke the affected sessions and apply the new permissions on login',async t=>{
 const{admin,create,login}=await fixture(t),sales=await create('Promovida');
 await patch(admin,`/api/users/${sales.id}`,{role:'admin'}).expect(200);await sales.client.get('/api/bootstrap').expect(401);
 const promoted=await login(sales.email);await promoted.get('/api/users').expect(200);
 await patch(admin,`/api/users/${sales.id}`,{role:'comercial'}).expect(200);await promoted.get('/api/bootstrap').expect(401);
 const demoted=await login(sales.email);await demoted.get('/api/users').expect(403);await admin.get('/api/users').expect(200);
});
test('the last active Admin cannot be disabled or demoted, including the original account',async t=>{
 const{admin,create,store}=await fixture(t);
 await patch(admin,'/api/users/owner',{role:'comercial'}).expect(409);await patch(admin,'/api/users/owner',{active:false}).expect(409);
 const second=await create('Segundo','admin');await patch(admin,`/api/users/${second.id}`,{active:false}).expect(200);
 await patch(admin,'/api/users/owner',{role:'comercial'}).expect(409);await patch(admin,`/api/users/${second.id}`,{active:true}).expect(200);
 await patch(admin,'/api/users/owner',{role:'comercial'}).expect(200);await admin.get('/api/bootstrap').expect(401);assert.equal(store.get("SELECT count(*) n FROM users WHERE role='admin' AND active=1").n,1);
 await patch(second.client,`/api/users/${second.id}`,{active:false}).expect(401);
});
test('batch registration creates five independent accounts with two Admins and three Comerciais',async t=>{
 const{admin,login,store,sent}=await fixture(t);const users=['PessoaA','PessoaB','PessoaC','PessoaD','PessoaE'].map((name,index)=>({name,email:name.toLowerCase()+'@example.test',role:index<2?'admin':'comercial'}));
 const result=await post(admin,'/api/users/batch',{users,password:secret}).expect(201);assert.equal(result.body.users.length,5);assert(!JSON.stringify(result.body).includes('password'));assert.equal(sent.length,0);
 const hashes=store.all("SELECT password FROM users WHERE id<>'owner'").map(user=>user.password);assert.equal(new Set(hashes).size,5);assert(hashes.every(hash=>!hash.includes(secret)));
 for(const user of users){const client=await login(user.email),status=await client.get('/api/auth/status').expect(200);assert.equal(status.body.user.role,user.role);assert.equal(status.body.user.name,user.name);}
});
test('batch registration rolls back duplicates and rejects invalid profiles, roles and Comercial access',async t=>{
 const{admin,create,store}=await fixture(t),sales=await create('Existente');const fresh={name:'Nova',email:'nova@example.test',role:'comercial'},existing={name:'Repetida',email:sales.email.toUpperCase(),role:'admin'};
 await post(admin,'/api/users/batch',{users:[fresh,existing],password:secret}).expect(409);assert.equal(store.get('SELECT id FROM users WHERE email=?',fresh.email),undefined);
 await post(admin,'/api/users/batch',{users:[fresh,{...fresh,email:fresh.email.toUpperCase()}],password:secret}).expect(409);assert.equal(store.get('SELECT id FROM users WHERE email=?',fresh.email),undefined);
 await post(admin,'/api/users/batch',{users:[fresh,{name:'Inválido',email:'invalid@example.test',role:'owner'}],password:secret}).expect(400);
 await post(admin,'/api/users/batch',{users:Array(51).fill(fresh),password:secret}).expect(400);
 await post(sales.client,'/api/users/batch',{users:[fresh],password:secret}).expect(403);assert.equal(store.get('SELECT count(*) n FROM users').n,2);
});
test('1.4.0 role migration preserves sessions, password hashes and user IDs with foreign keys intact',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-role-migrate-')),file=join(dir,'db.sqlite'),raw=new DatabaseSync(file),hash=hashPassword(secret),token='role-migration-cookie';let store,app;
 t.after(()=>{app?.locals.close();store?.close();rmSync(dir,{recursive:true,force:true});});
 raw.exec("PRAGMA foreign_keys=ON;CREATE TABLE owner(id INTEGER PRIMARY KEY,name TEXT,email TEXT,password TEXT);CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','agent')),active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);CREATE UNIQUE INDEX users_one_owner ON users(role) WHERE role='owner';CREATE TABLE sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL,user_id TEXT REFERENCES users(id));");
 raw.prepare('INSERT INTO owner VALUES(1,?,?,?)').run('Original','old@example.test',hash);raw.prepare("INSERT INTO users VALUES('owner',?,?,?,'owner',1,100)").run('Original','old@example.test',hash);raw.prepare("INSERT INTO users VALUES('sales-old',?,?,?,'agent',1,100)").run('Antiga','sales@example.test',hash);raw.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),Date.now()+60000,'sales-old');raw.close();
 store=new Store(file);assert.equal(store.get("SELECT role FROM users WHERE id='owner'").role,'admin');assert.equal(store.get("SELECT role FROM users WHERE id='sales-old'").role,'comercial');assert.equal(store.get("SELECT password FROM users WHERE id='sales-old'").password,hash);assert.deepEqual(store.all('PRAGMA foreign_key_check'),[]);assert.equal(store.all('PRAGMA foreign_keys')[0].foreign_keys,1);
 app=createApp({store,whatsapp:{snapshot:()=>({status:'disconnected'})}});const status=await request(app).get('/api/auth/status').set('Cookie',`cota_session=${token}`).expect(200);assert.equal(status.body.user.id,'sales-old');assert.equal(status.body.user.role,'comercial');
 store.run("INSERT INTO users VALUES('other-admin','Outra','other@example.test',?,'admin',1,100)",hash);store.run("UPDATE users SET role='comercial' WHERE id='owner'");app.locals.close();app=null;store.close();store=new Store(file);assert.equal(store.get("SELECT role FROM users WHERE id='owner'").role,'comercial');assert.deepEqual(store.all('PRAGMA foreign_key_check'),[]);
});
