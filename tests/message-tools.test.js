import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {EventEmitter} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {createApp,hashPassword} from '../server/app.js';
import {WhatsApp} from '../server/whatsapp.js';
import {Agent} from '../server/agent.js';
import {photoInfo,maxPhotoBytes} from '../server/images.js';
import {testPhoto} from './fixtures/photo.js';
const hash=hashPassword('message-tools-fixture-123'),minute=60000,day=86400000,pn='5511999999999@c.us',lid='9911999999999@lid';
const profiles=[['Admin Um','admin'],['Admin Dois','admin'],['Comercial A','comercial'],['Comercial B','comercial'],['Comercial C','comercial']];
const captions=['','Olá, veja esta correia','Cotação B72','PJ 350 · 5 frisos','4 PK 650','AT10 33000 x 25 mm','Preço: R$ 123,45','Foto da peça\nConfira a referência','Acentos: correção e opção','Texto com "aspas" & símbolos'];
const post=(client,path,body={})=>client.post(path).set('X-Cota-Request','1').send(body);
const patch=(client,path,body)=>client.patch(path).set('X-Cota-Request','1').send(body);
class Client extends EventEmitter{
 constructor(){super();this.sent=[];this.edits=[];this.records=new Map();this.info={wid:{_serialized:'5511000000000@c.us'}};this.rejectEdit=false;this.uncertainEdit=false;this.failPhoto=false;}
 async initialize(){} async destroy(){} async logout(){}
 async getNumberId(number){return{_serialized:number+'@c.us'};}
 async getContactLidAndPhone(){return[{pn,lid}];}
 async sendMessage(phone,content,options){this.sent.push({phone,content,options});if(this.failPhoto&&typeof content!=='string')throw new Error('uncertain photo');if(this.missingPhotoId&&typeof content!=='string')return{};const id=randomUUID();this.records.set(id,{fromMe:true,to:phone,id:{_serialized:id},edit:async body=>{this.edits.push({id,body});if(this.uncertainEdit)throw new Error('uncertain edit');if(this.rejectEdit)return null;return{id:{_serialized:id}};}});return{id:{_serialized:id}};}
 async getMessageById(id){return this.records.get(id);}
}
async function fixture(t,{file=':memory:'}={}){
 const store=new Store(file),client=new Client(),wa=new WhatsApp(store,'/tmp/cota-message-tools-fake',{clientFactory:()=>client}),app=createApp({store,whatsapp:wa}),agent=app.locals.agent;let clock=Date.now();agent.now=()=>clock;agent.followups.now=()=>clock;agent.followups.delivery.now=()=>clock;
 const users=profiles.map(([name,role],i)=>{const id='media-user-'+i,token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,`media${i}@example.test`,hash,role,Date.now());store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+day,id);const http=request.agent(app);http.jar.setCookie(`cota_session=${token}; Path=/`);return{id,name,role,http};});
 await wa.connect();client.emit('ready');let closed=false;const close=async()=>{if(closed)return;closed=true;app.locals.close();await wa.close();store.close();};t.after(close);
 async function open(user){const contact=(await post(user.http,'/api/contacts',{name:'Cliente de foto',phone:'+5511999999999'}).expect(201)).body;return(await post(user.http,`/api/contacts/${contact.id}/open`).expect(200)).body.chat;}
 const photo=(user,chat,caption='',requestId=randomUUID(),buffer=testPhoto)=>user.http.post(`/api/chats/${chat.id}/photo`).set('X-Cota-Request','1').field('caption',caption).field('version',String(chat.routing_version)).field('requestId',requestId).attach('photo',buffer,{filename:'teste.png',contentType:'image/png'});
 const edit=(user,chat,message,body,extra={})=>patch(user.http,`/api/chats/${chat.id}/messages/${message.id}`,{body,version:chat.routing_version,editVersion:message.edit_version||0,...extra});
 return{store,client,wa,app,agent,users,open,photo,edit,close,advance:ms=>{clock+=ms;}};
}
const flows=['foto e histórico','editar legenda','editar texto e auditar','transferência e permissões','envio duplicado e tela antiga','prazo ou recusa sem reenvio'];
test('missing photo confirmation stays failed and cannot resend on a repeated click or timer',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),key=randomUUID();f.client.missingPhotoId=true;
 const result=await f.photo(actor,chat,'Sem confirmação',key).expect(502);assert.equal(result.body.message.status,'failed');assert.equal(result.body.message.provider_id,null);
 await f.photo(actor,chat,'Sem confirmação',key).expect(502);f.advance(day);await f.agent.followups.check();assert.equal(f.client.sent.length,1);assert.equal(f.store.messages(chat.id).length,1);
});
for(const [ui,profile] of profiles.entries())for(const [ci,caption] of captions.entries())for(const [fi,flow] of flows.entries()){
 const index=(ui*captions.length+ci)*flows.length+fi+1;
 test(`histórico e mensagens ${index}/300: ${profile[0]} · ${caption||'sem legenda'} · ${flow}`,async t=>{
  const f=await fixture(t),{store,client,agent,users,open,photo,edit,advance}=f,actor=users[ui],other=users.find(user=>user.role==='comercial'&&user.id!==actor.id),admin=users[0],chat=await open(actor),path=`/api/chats/${chat.id}`;
  assert.equal(client.sent.length,0);assert.equal(chat.service_origin_id,null);assert.equal(chat.last_inbound,0);
  if(fi===0){
   const image=(await photo(actor,chat,caption).expect(201)).body;assert.equal(image.media_type,'image/png');assert.equal(image.author_name,actor.name);assert.equal(image.direction,'owner');assert.equal('media_data' in image,false);assert.equal(client.sent.length,1);assert.equal(client.sent[0].options.caption,`*${actor.name}*: ${caption||'Foto'}`);assert.equal(client.sent[0].content.data,testPhoto.toString('base64'));
   const downloaded=await actor.http.get(`${path}/messages/${image.id}/photo`).expect(200);assert.deepEqual(downloaded.body,testPhoto);assert.match(downloaded.headers['cache-control'],/no-store/);const history=(await actor.http.get(path+'/messages').expect(200)).body;assert.equal(history.length,1);assert.equal(history[0].id,image.id);assert.equal('media_data' in history[0],false);advance(30*day);await agent.followups.check();assert.equal(client.sent.length,1);
  }else if(fi===1){
   const image=(await photo(actor,chat,caption).expect(201)).body,body=('Legenda corrigida: '+caption).trim();const updated=(await edit(actor,chat,image,body).expect(200)).body;assert.equal(updated.body,body);assert.equal(updated.author_name,actor.name);assert.equal(updated.edited_name,actor.name);assert.equal(updated.edit_version,1);assert.equal(client.edits.length,1);assert.equal(client.edits[0].body,`*${actor.name}*: ${body}`);assert.equal(client.sent.length,1);assert.deepEqual((await actor.http.get(`${path}/messages/${image.id}/photo`).expect(200)).body,testPhoto);const revisions=(await actor.http.get(`${path}/messages/${image.id}/edits`).expect(200)).body;assert.equal(revisions[0].old_body,caption);assert.equal(revisions[0].new_body,body);assert.equal(revisions[0].status,'sent');
  }else if(fi===2){
   const before=caption||'Mensagem manual';const original=(await post(actor.http,path+'/send',{body:before,version:chat.routing_version}).expect(201)).body;store.setSettings({signHumanMessages:false});const updated=(await edit(actor,chat,original,'Corrigida: '+before).expect(200)).body;assert.equal(updated.author_name,actor.name);assert.equal(client.sent.length,1);assert.equal(client.edits[0].body,`*${actor.name}*: Corrigida: ${before}`);await edit(actor,chat,original,'Não sobrescrever').expect(409);assert.equal(client.edits.length,1);assert.equal(store.messages(chat.id).length,1);assert.equal(store.messages(chat.id)[0].id,original.id);const history=(await actor.http.get(`${path}/messages/${original.id}/edits`).expect(200)).body;assert.equal(history.length,1);assert.equal(history[0].old_body,before);
  }else if(fi===3){
   const image=(await photo(actor,chat,caption).expect(201)).body;await post(actor.http,path+'/send',{body:'Mensagem antes da transferência',version:chat.routing_version}).expect(201);const moved=(await post(admin.http,path+'/assign',{userId:other.id}).expect(200)).body;assert.equal(store.messages(chat.id).length,2);await other.http.get(path+'/messages').expect(200);await other.http.get(`${path}/messages/${image.id}/photo`).expect(200);await edit(actor,chat,image,'Rascunho do responsável anterior').expect(409);await edit(other,moved,image,'Não é minha mensagem').expect(403);if(actor.role==='comercial')await actor.http.get(`${path}/messages/${image.id}/photo`).expect(403);
   const assigned=(await post(admin.http,path+'/assign',{userId:admin.id}).expect(200)).body;const updated=(await edit(admin,assigned,image,'Conferido pelo Admin').expect(200)).body;assert.equal(updated.author_name,actor.name);assert.equal(updated.edited_name,admin.name);assert.equal(client.edits.at(-1).body,`*${actor.name}*: Conferido pelo Admin`);assert.equal(client.sent.length,2);assert.equal(store.messages(chat.id).length,2);
  }else if(fi===4){
   const requestId=randomUUID(),results=await Promise.all(Array.from({length:6},()=>photo(actor,chat,caption,requestId)));assert(results.every(result=>result.status===201));assert.equal(new Set(results.map(result=>result.body.id)).size,1);assert.equal(client.sent.length,1);assert.equal(store.messages(chat.id).length,1);await post(actor.http,path+'/release',{version:chat.routing_version}).expect(200);await post(actor.http,path+'/open').expect(200);await photo(actor,chat,caption,requestId).expect(409);await edit(actor,chat,results[0].body,'Tela antiga').expect(409);assert.equal(client.sent.length,1);assert.equal(client.edits.length,0);
  }else{
   const image=(await photo(actor,chat,caption).expect(201)).body;
   if(ci%3===0){advance(15*minute);await edit(actor,chat,image,'Prazo encerrado').expect(409);assert.equal(client.edits.length,0);}else{client.rejectEdit=ci%3===1;client.uncertainEdit=ci%3===2;await edit(actor,chat,image,'Edição não confirmada').expect(client.rejectEdit?409:502);const latest=store.message(image.id);assert.equal(latest.body,caption);assert.equal(latest.edit_state,client.rejectEdit?'failed':'uncertain');assert.equal(latest.edit_version,1);await edit(actor,chat,image,'Repetição antiga').expect(409);assert.equal(client.edits.length,1);assert.equal(store.get('SELECT status FROM message_edits WHERE message_id=?',image.id).status,latest.edit_state);}
   const before=client.edits.length;for(let i=0;i<100;i++){advance(minute);await agent.followups.check();}assert.equal(client.edits.length,before);assert.equal(client.sent.length,1);
  }
  assert.equal(store.chat(chat.id).service_origin_id,null);assert.equal(store.get("SELECT count(*) n FROM messages WHERE chat_id=? AND direction='in'",chat.id).n,0);assert(client.sent.every(message=>message.phone===pn));
 });
}
test('photos, original authors and edit ledger survive full server recreation and transfer with fresh login',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-history-')),file=join(dir,'db.sqlite'),f=await fixture(t,{file}),actor=f.users[2],next=f.users[3],admin=f.users[0],chat=await f.open(actor);t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const image=(await f.photo(actor,chat,'Legenda original').expect(201)).body;await f.edit(actor,chat,image,'Legenda corrigida').expect(200);const text=(await post(actor.http,`/api/chats/${chat.id}/send`,{body:'Texto persistente',version:chat.routing_version}).expect(201)).body;await post(admin.http,`/api/chats/${chat.id}/assign`,{userId:next.id}).expect(200);await f.close();
 const store=new Store(file),client=new Client(),wa=new WhatsApp(store,'/tmp/cota-history-new-fake',{clientFactory:()=>client}),app=createApp({store,whatsapp:wa});await wa.connect();client.emit('ready');
 try{
  const fresh=request.agent(app);await post(fresh,'/api/auth/login',{email:'media3@example.test',password:'message-tools-fixture-123'}).expect(200);const history=(await fresh.get(`/api/chats/${chat.id}/messages`).expect(200)).body;assert.deepEqual(history.map(m=>m.id),[image.id,text.id]);assert.equal(history[0].body,'Legenda corrigida');assert.equal(history[0].author_name,actor.name);assert.equal(history[0].edited_name,actor.name);assert.equal(store.chat(chat.id).assigned_user_id,next.id);assert.deepEqual((await fresh.get(`/api/chats/${chat.id}/messages/${image.id}/photo`).expect(200)).body,testPhoto);const edits=(await fresh.get(`/api/chats/${chat.id}/messages/${image.id}/edits`).expect(200)).body;assert.equal(edits[0].old_body,'Legenda original');assert.equal(edits[0].new_body,'Legenda corrigida');assert.equal(history.some(m=>'media_data' in m),false);
  const old=request.agent(app);await post(old,'/api/auth/login',{email:'media2@example.test',password:'message-tools-fixture-123'}).expect(200);await old.get(`/api/chats/${chat.id}/messages`).expect(403);await old.get(`/api/chats/${chat.id}/messages/${image.id}/photo`).expect(403);await app.locals.agent.followups.check();assert.equal(client.sent.length,0);assert.equal(client.edits.length,0);
 }finally{app.locals.close();await wa.close();store.close();}
});
test('interrupted edit becomes uncertain on reopening, retaining old text and never repeating transport',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-edit-crash-')),file=join(dir,'db.sqlite'),f=await fixture(t,{file}),actor=f.users[2],chat=await f.open(actor);t.after(()=>rmSync(dir,{recursive:true,force:true}));const message=(await post(actor.http,`/api/chats/${chat.id}/send`,{body:'Texto antes da tentativa',version:chat.routing_version}).expect(201)).body;
 f.store.run("UPDATE messages SET edit_version=1,edit_state='pending' WHERE id=?",message.id);f.store.run("INSERT INTO message_edits VALUES(?,?,?,?,?,?,?,?,?,NULL,'pending',NULL)",randomUUID(),message.id,message.body,'Texto ainda não confirmado',message.delivery_body,'Tentativa',actor.id,actor.name,Date.now());await f.close();const store=new Store(file),calls=[],agent=new Agent(store,async()=>{calls.push(1);return randomUUID();});try{assert.equal(store.message(message.id).body,'Texto antes da tentativa');assert.equal(store.message(message.id).edit_state,'uncertain');assert.equal(store.get('SELECT status FROM message_edits WHERE message_id=?',message.id).status,'uncertain');await agent.followups.check();assert.equal(calls.length,0);}finally{agent.followups.close();store.close();}
});
test('received image downloads into the same persistent manual history without a second agent response',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor);let downloads=0;const processing=[],receive=f.wa.receiver;f.wa.receiver=input=>{const result=receive(input);processing.push(result);return result;};const inbound={from:lid,type:'image',body:'Correia do cliente',timestamp:Math.floor(Date.now()/1000)+1,id:{_serialized:randomUUID(),fromMe:false},_data:{isNewMsg:true},downloadMedia:async()=>{downloads++;return{data:testPhoto.toString('base64'),mimetype:'image/png'};}};f.client.emit('message',inbound);await Promise.all(processing);await f.wa.drainMedia();assert.equal(downloads,1);assert.equal(f.client.sent.length,0);assert.equal(f.store.chats().length,1);const photo=f.store.messages(chat.id)[0];assert.equal(photo.direction,'in');assert.equal(photo.media_type,'image/png');assert.equal(photo.body,'Correia do cliente');assert.deepEqual((await actor.http.get(`/api/chats/${chat.id}/messages/${photo.id}/photo`).expect(200)).body,testPhoto);f.client.emit('message',inbound);await Promise.all(processing);await f.wa.drainMedia();assert.equal(downloads,1);assert.equal(f.store.messages(chat.id).length,1);
});
for(const extra of [{from:'123@g.us'},{fromMe:true},{isStatus:true},{type:'notification'},{timestamp:1},{_data:{isNewMsg:false}}])test(`ignored incoming image is never downloaded or answered: ${JSON.stringify(extra)}`,async t=>{
 const f=await fixture(t);let downloads=0;f.client.emit('message',{from:pn,type:'image',body:'',timestamp:Math.floor(Date.now()/1000)+1,id:{_serialized:randomUUID(),fromMe:false},_data:{isNewMsg:true},downloadMedia:async()=>{downloads++;return{data:testPhoto.toString('base64')};},...extra});await f.wa.drainMedia();assert.equal(downloads,0);assert.equal(f.client.sent.length,0);
});
for(const data of [Buffer.alloc(0),Buffer.from('<svg onload="alert(1)"></svg>'),Buffer.from('<html>not an image</html>'),testPhoto.subarray(0,33),Buffer.alloc(maxPhotoBytes+1)])test(`invalid photo is rejected before storing or sending (${data.length} bytes)`,async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor);await f.photo(actor,chat,'Invalid',randomUUID(),data).expect(400);assert.equal(f.client.sent.length,0);assert.equal(f.store.messages(chat.id).length,0);
});
test('anonymous readers and unrelated chats cannot retrieve image bytes or edit history',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),image=(await f.photo(actor,chat).expect(201)).body;await request(f.app).get(`/api/chats/${chat.id}/messages/${image.id}/photo`).expect(401);await request(f.app).get(`/api/chats/${chat.id}/messages/${image.id}/edits`).expect(401);f.store.run("INSERT INTO chats(id,phone,name,channel,provider,mode,assigned_user_id,updated,last_inbound) VALUES('another','5522@c.us','Outra','whatsapp','qr','manual',?,?,0)",actor.id,Date.now());await actor.http.get(`/api/chats/another/messages/${image.id}/photo`).expect(404);await actor.http.get(`/api/chats/another/messages/${image.id}/edits`).expect(404);
});
test('failed photo request is durable and a repeated click cannot retry it',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),requestId=randomUUID();f.client.failPhoto=true;const first=await f.photo(actor,chat,'Resultado incerto',requestId).expect(502);await f.photo(actor,chat,'Resultado incerto',requestId).expect(502);assert.equal(f.client.sent.length,1);assert.equal(f.store.messages(chat.id).length,1);assert.equal(f.store.message(first.body.message.id).status,'failed');for(let i=0;i<100;i++){f.advance(minute);await f.agent.followups.check();}assert.equal(f.client.sent.length,1);
});
test('request ID cannot be reused for another caption or file',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),requestId=randomUUID();await f.photo(actor,chat,'Original',requestId).expect(201);await f.photo(actor,chat,'Diferente',requestId).expect(409);assert.equal(f.client.sent.length,1);
});
for(const kind of ['other-target','not-from-me','missing','wrong-id'])test(`provider edit identity is checked before any remote edit: ${kind}`,async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),image=(await f.photo(actor,chat,'Original').expect(201)).body,record=f.client.records.get(image.provider_id);if(kind==='other-target')record.to='5522999999999@c.us';if(kind==='not-from-me')record.fromMe=false;if(kind==='missing')f.client.records.delete(image.provider_id);if(kind==='wrong-id')record.id._serialized='different';await f.edit(actor,chat,image,'Não pode editar').expect(409);assert.equal(f.client.edits.length,0);assert.equal(f.store.message(image.id).body,'Original');assert.equal(f.client.sent.length,1);
});
test('an edit just before fifteen minutes works but does not extend the original editing window',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),image=(await f.photo(actor,chat,'Original').expect(201)).body;f.advance(15*minute-1);const edited=(await f.edit(actor,chat,image,'Último segundo').expect(200)).body;f.advance(1);await f.edit(actor,chat,edited,'Prazo vencido').expect(409);assert.equal(f.client.edits.length,1);
});
test('empty image caption can be removed, empty text cannot, and unchanged text does not call the provider',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),image=(await f.photo(actor,chat,'Remover legenda').expect(201)).body;const empty=(await f.edit(actor,chat,image,'').expect(200)).body;assert.equal(empty.body,'');assert.equal(f.client.edits[0].body,`*${actor.name}*: Foto`);const text=(await post(actor.http,`/api/chats/${chat.id}/send`,{body:'Texto',version:chat.routing_version}).expect(201)).body;await f.edit(actor,chat,text,'').expect(400);await f.edit(actor,chat,text,'Texto').expect(200);assert.equal(f.client.edits.length,1);
});
test('unassigned, automatic, bot and incoming messages cannot be edited as manual operator text',async t=>{
 const f=await fixture(t),actor=f.users[2],chat=await f.open(actor),image=(await f.photo(actor,chat,'Foto').expect(201)).body;await post(actor.http,`/api/chats/${chat.id}/release`,{version:chat.routing_version}).expect(200);await f.edit(actor,f.store.chat(chat.id),image,'Não assumido').expect(409);await post(actor.http,`/api/chats/${chat.id}/open`).expect(200);const owned=f.store.chat(chat.id);for(const direction of ['in','bot']){const message=f.store.addMessage({chatId:chat.id,direction,body:'Não é minha mensagem',status:'sent',author:actor});await f.edit(actor,owned,message,'Bloquear').expect(403);}await post(actor.http,`/api/chats/${chat.id}/resume`).expect(200);await f.photo(actor,f.store.chat(chat.id),'Automático').expect(409);assert.equal(f.client.sent.length,1);assert.equal(f.client.edits.length,0);
});
test('deleting simulator fixtures also removes its edit ledger without affecting real history',async t=>{
 const f=await fixture(t),admin=f.users[0],created=(await post(admin.http,'/api/simulator/message',{body:'oi'}).expect(201)).body;await post(admin.http,`/api/chats/${created.chatId}/open`).expect(200);const chat=f.store.chat(created.chatId),message=(await post(admin.http,`/api/chats/${chat.id}/send`,{body:'Teste',version:chat.routing_version}).expect(201)).body;await f.edit(admin,chat,message,'Teste editado').expect(200);await admin.http.delete('/api/simulator').set('X-Cota-Request','1').expect(200);assert.equal(f.store.get('SELECT count(*) n FROM message_edits').n,0);assert.equal(f.client.sent.length,0);
});
