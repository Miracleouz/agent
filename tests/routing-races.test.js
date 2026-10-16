import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../server/db.js';
import {createApp} from '../server/app.js';
const post=(client,url,body={})=>client.post(url).set('X-Cota-Request','1').send(body);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t){const store=new Store(':memory:'),sent=[],transport={send:async(chat,body)=>{sent.push(body);return randomUUID();},snapshot:()=>({status:'ready'})},app=createApp({store,whatsapp:transport}),admin=request.agent(app);t.after(()=>{app.locals.close();store.close();});await post(admin,'/api/auth/setup',{name:'Admin teste',email:'admin@example.test',password:'race-fixture-12345'}).expect(201);const result=await post(admin,'/api/simulator/message',{body:'oi'}).expect(201),id=result.body.chatId;await post(admin,`/api/chats/${id}/open`).expect(200);return{store,app,admin,id,url:`/api/chats/${id}`,sent,transport};}
test('manual sends already waiting in the queue cannot survive release and reclaim by the same person',async t=>{
 const{store,app,admin,id,url,sent}=await fixture(t),chat=store.chat(id),key=`${chat.provider}:${chat.channel}:${chat.phone}`;let unlock;const gate=app.locals.agent.enqueue(key,()=>new Promise(resolve=>unlock=resolve));await tick();const previous=app.locals.agent.queues.get(key);const pending=post(admin,url+'/send',{body:'Não enviar'}).then(result=>result);
 for(let index=0;index<100&&app.locals.agent.queues.get(key)===previous;index++)await tick();assert.notEqual(app.locals.agent.queues.get(key),previous);store.releaseChat(id);store.openChat(id,{id:'owner',role:'admin'});unlock();await gate;assert.equal((await pending).status,409);assert.equal(sent.length,0);assert(!store.messages(id).some(message=>message.body==='Não enviar'));
});
test('session revocation while opening is queued prevents ownership changes',async t=>{
 const{store,app,admin,id,url}=await fixture(t);await post(admin,url+'/release',{version:store.chat(id).routing_version}).expect(200);const chat=store.chat(id),key=`${chat.provider}:${chat.channel}:${chat.phone}`;let unlock;const gate=app.locals.agent.enqueue(key,()=>new Promise(resolve=>unlock=resolve));await tick();const previous=app.locals.agent.queues.get(key),pending=post(admin,url+'/open').then(result=>result);for(let index=0;index<100&&app.locals.agent.queues.get(key)===previous;index++)await tick();assert.notEqual(app.locals.agent.queues.get(key),previous);store.run('DELETE FROM sessions');unlock();await gate;assert.equal((await pending).status,401);assert.equal(store.chat(id).assigned_user_id,null);
});
test('ownership, release queue and history persist when the database is reopened',t=>{
 const directory=mkdtempSync(join(tmpdir(),'cota-routing-persist-')),file=join(directory,'db.sqlite');let store=new Store(file);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});store.run("INSERT INTO users VALUES('sales','Pessoa','sales@example.test','hash','comercial',1,1)");store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES('chat','5511@c.us','Cliente','whatsapp','qr',1,1)");store.addMessage({chatId:'chat',direction:'in',body:'Mensagem persistente'});const first=store.openChat('chat',{id:'sales',role:'comercial'});store.close();store=new Store(file);assert.equal(store.chat('chat').assigned_user_id,'sales');assert.equal(store.chat('chat').routing_version,first.chat.routing_version);store.releaseChat('chat');store.close();store=new Store(file);assert.equal(store.chat('chat').assigned_user_id,null);assert.equal(store.chat('chat').mode,'manual');assert.equal(store.chat('chat').unread,0);assert.equal(store.messages('chat')[0].body,'Mensagem persistente');
});
