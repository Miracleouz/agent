import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from '../server/db.js';
import {createApp,hashPassword} from '../server/app.js';
import {replaceCatalog,demoProducts} from '../server/catalog.js';
const hash=hashPassword('routing-fixture-12345');
const profiles=[['Admin Um','admin'],['Admin Dois','admin'],['Comercial A','comercial'],['Comercial B','comercial'],['Comercial C','comercial']];
const messages=['oi vim pelo site','A42','quero fechar','ATENDENTE','AT10 33000'];
const flows=['abrir, responder e liberar','disputa simultânea','reabertura e nova mensagem','liberação e novo atendimento','rascunho de versão antiga','transferência por Admin','prazo e reativação preservam responsável','permissões e identidade'];
const post=(client,url,body={})=>client.post(url).set('X-Cota-Request','1').send(body);
async function fixture(t,body){
 const store=new Store(':memory:'),sent=[];replaceCatalog(store,demoProducts,'test');
 const whatsapp={snapshot:()=>({status:'ready'}),send:async(chat,body)=>{sent.push({phone:chat.phone,body});return randomUUID();}};
 const app=createApp({store,whatsapp});t.after(()=>{app.locals.close();store.close();});
 const users=profiles.map(([name,role],index)=>{const id='user-'+index,token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,`user${index}@example.test`,hash,role,Date.now());store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+60000,id);const client=request.agent(app);client.jar.setCookie(`cota_session=${token}; Path=/`);return{id,name,role,client};});
 const receive=body=>app.locals.agent.receive({phone:'5511999999999@c.us',provider:'qr',channel:'whatsapp',body,providerId:randomUUID(),name:'Cliente de teste'});
 const result=await receive(body);return{app,store,sent,users,receive,id:result.chatId,url:`/api/chats/${result.chatId}`};
}
async function assertVisibility(users,id,owner){
 for(const user of users){const data=(await user.client.get('/api/bootstrap').expect(200)).body;assert.equal(data.chats.some(chat=>chat.id===id),user.role==='admin'||!owner||user.id===owner,`visibilidade de ${user.name}`);}
}
for(const [actorIndex,profile] of profiles.entries())for(const [messageIndex,body] of messages.entries())for(let flow=0;flow<flows.length;flow++){
 const index=(actorIndex*messages.length+messageIndex)*flows.length+flow+1;
 test(`atendimento ${index}: ${profile[0]} · ${body} · ${flows[flow]}`,async t=>{
  const f=await fixture(t,body),{store,sent,users,id,url}=f,actor=users[actorIndex],other=users.find(user=>user.role==='comercial'&&user.id!==actor.id),admin=users[0];
  const count=sent.length;
  if(flow===1){
   const results=await Promise.all([post(actor.client,url+'/open'),post(other.client,url+'/open')]);
   assert.equal(results.filter(result=>result.status===200&&!result.body.observing).length,1);
   assert(results.every(result=>[200,409].includes(result.status)));const owner=store.chat(id).assigned_user_id;
   assert([actor.id,other.id].includes(owner));assert.equal(store.chat(id).mode,'manual');await assertVisibility(users,id,owner);assert.equal(sent.length,count);return;
  }
  const opened=(await post(actor.client,url+'/open').expect(200)).body;
  assert.equal(opened.observing,false);assert.equal(opened.chat.assigned_user_id,actor.id);assert.equal(opened.chat.unread,0);assert.equal(opened.chat.mode,'manual');assert.equal(opened.chat.pause_until,null);assert.equal(opened.chat.followup_due_at,null);assert.equal(sent.length,count);
  const version=opened.chat.routing_version;
  if(flow===0){
   await post(actor.client,url+'/send',{body:'Vou conferir os itens.',version}).expect(201);assert.equal(sent.length,count+1);assert.equal(sent.at(-1).body,`*${actor.name}*: Vou conferir os itens.`);await assertVisibility(users,id,actor.id);
   await post(actor.client,url+'/release',{version}).expect(200);assert.equal(store.chat(id).assigned_user_id,null);assert.equal(store.chat(id).mode,'manual');assert(store.chat(id).unread>0);await assertVisibility(users,id,null);
   await post(other.client,url+'/open').expect(200);assert.equal(store.chat(id).assigned_user_id,other.id);await assertVisibility(users,id,other.id);assert.equal(sent.length,count+1);
  }else if(flow===2){
   await post(actor.client,url+'/open').expect(200);assert.equal(store.chat(id).routing_version,version);await f.receive('Tenho mais uma dúvida');assert.equal(store.chat(id).assigned_user_id,actor.id);assert.equal(store.chat(id).unread,1);
   const observer=users.find(user=>user.role==='admin'&&user.id!==actor.id);const observation=await post(observer.client,url+'/open').expect(200);assert.equal(observation.body.observing,true);assert.equal(store.chat(id).unread,1);await post(observer.client,url+'/read').expect(200);assert.equal(store.chat(id).unread,1);
   await post(actor.client,url+'/open').expect(200);assert.equal(store.chat(id).unread,0);await assertVisibility(users,id,actor.id);assert.equal(sent.length,count);
  }else if(flow===3){
   await post(actor.client,url+'/release',{version}).expect(200);const released=store.chat(id);await f.receive('Ainda estou aguardando');await f.app.locals.agent.followups.check();assert.equal(store.chat(id).assigned_user_id,null);assert(store.chat(id).unread>=1);assert.equal(store.chat(id).routing_version,released.routing_version);assert.equal(sent.length,count);await assertVisibility(users,id,null);
   await post(other.client,url+'/open').expect(200);assert.equal(store.chat(id).assigned_user_id,other.id);assert.equal(store.chat(id).needs_human,released.needs_human);await post(other.client,url+'/send',{body:'Já vamos atender.',version:store.chat(id).routing_version}).expect(201);assert.equal(sent.length,count+1);
  }else if(flow===4){
   await post(actor.client,url+'/release',{version}).expect(200);await post(actor.client,url+'/open').expect(200);assert(store.chat(id).routing_version>version);
   await post(actor.client,url+'/send',{body:'Não pode sair de uma tela antiga.',version}).expect(409);await post(actor.client,url+'/release',{version}).expect(409);assert.equal(store.chat(id).assigned_user_id,actor.id);assert.equal(sent.length,count);
  }else if(flow===5){
   await post(admin.client,url+'/assign',{userId:other.id}).expect(200);assert.equal(store.chat(id).assigned_user_id,other.id);await assertVisibility(users,id,other.id);
   await post(actor.client,url+'/send',{body:'Mensagem antiga',version}).expect(409);await post(other.client,url+'/send',{body:'Sou o novo responsável.',version:store.chat(id).routing_version}).expect(201);assert.equal(sent.length,count+1);assert.match(sent.at(-1).body,new RegExp(other.name));
  }else if(flow===6){
   await post(actor.client,url+'/pause',{minutes:1}).expect(200);store.run('UPDATE chats SET pause_until=? WHERE id=?',Date.now()-1,id);store.resumeExpired();assert.equal(store.chat(id).assigned_user_id,actor.id);assert.equal(store.chat(id).mode,'auto');await assertVisibility(users,id,actor.id);
   await post(actor.client,url+'/pause',{minutes:null}).expect(200);await post(actor.client,url+'/resume').expect(200);assert.equal(store.chat(id).assigned_user_id,actor.id);await assertVisibility(users,id,actor.id);assert.equal(sent.length,count);
  }else if(flow===7){
   await post(other.client,url+'/release',{version}).expect(403);await post(other.client,url+'/open').expect(409);await other.client.get(url+'/messages').expect(403);
   await post(request(f.app),url+'/release',{version}).expect(401);await actor.client.post(url+'/release').send({version}).expect(403);await post(actor.client,url+'/open',{userId:other.id}).expect(400);
   assert.equal(store.chat(id).assigned_user_id,actor.id);assert.equal(store.chat(id).routing_version,version);assert.equal(sent.length,count);await assertVisibility(users,id,actor.id);
  }
 });
}
