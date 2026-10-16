import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import request from 'supertest';
import {Store} from '../server/db.js';
import {createApp,hashPassword} from '../server/app.js';
const hash=hashPassword('visibility-tests-12345'),profiles=[['Robson','admin'],['Julia','admin'],['Alexandre','comercial'],['Bianca','comercial'],['Nicole','comercial']];
function fixture(t,{file=':memory:'}={}){
 const store=new Store(file);let status='ready',sends=0;const whatsapp={snapshot:()=>({status,number:status==='ready'?'5511888888888':null}),send:async()=>{sends++;return randomUUID();}},app=createApp({store,whatsapp}),users=profiles.map(([name,role],i)=>{const id='visible-user-'+i,token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,name.toLowerCase()+'@example.test',hash,role,Date.now());store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+86400000,id);const http=request.agent(app);http.jar.setCookie(`cota_session=${token}; Path=/`);return{id,name,role,http,token};});
 store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound,unread,mode,assigned_user_id) VALUES('private','5511999999999@c.us','Cliente Particular','whatsapp','qr',?,0,1,'manual',?)",Date.now(),users[3].id);
 store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES('free','5511222222222@c.us','Cliente Livre','whatsapp','qr',?,0),('demo','demo-visible','Simulação','simulator','simulator',?,0)",Date.now(),Date.now());
 const message=store.addMessage({chatId:'private',providerId:'own-proof',direction:'owner',body:'Histórico guardado',status:'sent',author:users[3]});store.run("UPDATE messages SET media_type='image/png',media_data=?,sent_at=?,edit_version=1,edited_name='Bianca' WHERE id=?",Buffer.from('photo-bytes'),Date.now(),message.id);
 store.addMessage({chatId:'free',direction:'in',body:'Histórico livre',status:'imported'});store.addGroupMessage({id:'123@g.us',name:'Grupo Salvo',providerId:'group-proof',author:'Pessoa',body:'Mensagem do grupo',created:Date.now()});store.run("INSERT INTO contacts VALUES('person','Cliente Particular','5511999999999','Empresa','visible-user-0',?,?)",Date.now(),Date.now());
 const close=()=>{app.locals.close();store.close();};t.after(()=>{if(!closed)close();});let closed=false;
 return{store,app,users,message,status:value=>{status=value;store.changed();},sends:()=>sends,close:()=>{closed=true;close();}};
}
for(const [index,profile]of profiles.entries())for(const status of ['ready','disconnected','starting','qr','authenticated','error'])test(`${profile[0]}: visibility is scoped to QR connection ${status}`,async t=>{
 const f=fixture(t),user=f.users[index];f.status(status);const result=(await user.http.get('/api/bootstrap').expect(200)).body,contacts=(await user.http.get('/api/contacts').expect(200)).body;
 if(status==='ready'){assert.equal(result.groups.length,1);assert.equal(result.chats.some(c=>c.id==='free'),true);assert.equal(result.chats.some(c=>c.id==='private'),user.role==='admin'||index===3);assert.equal(contacts.items.length,1);await user.http.get('/api/chats/free/messages').expect(200);await user.http.get('/api/groups/123@g.us/messages').expect(200);await user.http.get('/api/contacts/person/history').expect(user.role==='admin'||index===3?200:403);}
 else{
  assert.deepEqual(result.chats.map(c=>c.id),['demo']);assert.deepEqual(result.groups,[]);assert.equal(result.stats.conversations,0);assert.equal(result.stats.replies,0);assert.equal(result.stats.waiting,0);assert.deepEqual(contacts.items,[]);assert.equal(contacts.total,0);
  for(const path of ['/api/chats/private/messages','/api/chats/free/messages','/api/chats/private/avatar','/api/groups/123@g.us/messages','/api/groups/123@g.us/avatar','/api/contacts/person/history','/api/contacts/person/avatar',`/api/chats/private/messages/${f.message.id}/photo`,`/api/chats/private/messages/${f.message.id}/edits`])await user.http.get(path).expect(409);
  await user.http.post('/api/chats/private/send').set('X-Cota-Request','1').send({body:'não enviar'}).expect(409);await user.http.post('/api/chats/free/open').set('X-Cota-Request','1').send({}).expect(409);await user.http.get('/api/chats/demo/messages').expect(200);
 }
 assert.equal(f.store.messages('private')[0].id,f.message.id);assert.equal(f.store.messages('private')[0].author_name,'Bianca');assert.equal(f.store.chat('private').assigned_user_id,f.users[3].id);assert.equal(f.store.chat('private').unread,1);assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,1);assert.equal(f.store.groupList().length,1);assert.equal(f.sends(),0);
});
test('reconnect shows the same persisted chat, photo and authors after reopening the application',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-visible-persist-')),file=join(dir,'cota.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));const f=fixture(t,{file}),user=f.users[0],id=f.message.id;f.status('disconnected');assert.equal((await user.http.get('/api/bootstrap')).body.chats.length,1);f.close();
 const store=new Store(file);let status='disconnected';const app=createApp({store,whatsapp:{snapshot:()=>({status})}});t.after(()=>{app.locals.close();store.close();});const http=request.agent(app);http.jar.setCookie(`cota_session=${user.token}; Path=/`);assert.deepEqual((await http.get('/api/contacts').expect(200)).body.items,[]);await http.get('/api/chats/private/messages').expect(409);status='ready';assert.equal((await http.get('/api/bootstrap').expect(200)).body.chats.length,3);const messages=(await http.get('/api/chats/private/messages').expect(200)).body;assert.equal(messages[0].id,id);assert.equal(messages[0].author_name,'Bianca');assert.equal(messages[0].edited_name,'Bianca');assert.equal((await http.get('/api/contacts').expect(200)).body.items.length,1);assert.equal(store.chat('private').assigned_user_id,'visible-user-3');assert.equal(Buffer.from(store.get('SELECT media_data FROM messages WHERE id=?',id).media_data).toString(),'photo-bytes');
});
test('hidden cached contacts cannot be edited or deleted through an old page',async t=>{const f=fixture(t),http=f.users[0].http;f.status('disconnected');await http.patch('/api/contacts/person').set('X-Cota-Request','1').send({name:'Mudar'}).expect(409);await http.delete('/api/contacts/person').set('X-Cota-Request','1').expect(409);assert.equal(f.store.get("SELECT name FROM contacts WHERE id='person'").name,'Cliente Particular');assert.equal(f.sends(),0);});
