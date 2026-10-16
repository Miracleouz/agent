import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import request from 'supertest';
import wa from 'whatsapp-web.js';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {WhatsAppSync} from '../server/whatsapp-sync.js';
import {createApp,hashPassword} from '../server/app.js';
import {avatarUrl,downloadAvatar,avatarMaxBytes,WhatsAppAvatars} from '../server/whatsapp-avatars.js';
import {seedBrokenRoster} from './fixtures/broken-whatsapp-roster.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64'),pn='5511999999999@c.us',group='12345@g.us',hash=hashPassword('media-sync-tests-12345');
const post=(user,url,body={})=>user.http.post(url).set('X-Cota-Request','1').send(body);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('installed SDK group-photo r recovers without serializing group metadata',async t=>{
 const require=createRequire(import.meta.url),{LoadUtils}=require('whatsapp-web.js/src/util/Injected/Utils.js'),context=createContext({window:{}});runInContext('('+seedBrokenRoster.toString()+')()',context);runInContext('('+LoadUtils.toString()+')()',context);runInContext("window.originalRequire=window.require;window.require=name=>name==='WAWebContactProfilePicThumbBridge'?{requestProfilePicFromServer:async()=>({eurl:'https://pps.whatsapp.net/photo'})}:window.originalRequire(name)",context);
 const client=new wa.Client();client.pupPage={evaluate:async(fn,...args)=>{context.args=args;return structuredClone(await runInContext('('+fn.toString()+')(...args)',context));}};await assert.rejects(client.getProfilePicUrl('12345-678@g.us'),/r/);const store=new Store(':memory:'),avatars=new WhatsAppAvatars({store,client,generation:1,status:'ready'},{download:async()=>({data:png,type:'image/png'})});t.after(()=>{avatars.reset();store.close();});await avatars.refresh(['12345-678@g.us']);assert.equal(store.get('SELECT status FROM whatsapp_avatars').status,'ready');
});
test('cached profile bytes survive reopening the database without a new download',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-avatar-persist-')),file=join(dir,'db.sqlite');let store;
 try{store=new Store(file);store.run("INSERT INTO whatsapp_avatars VALUES(?,'ready',?,'image/png','persisted',?)",pn,png,Date.now());store.close();store=new Store(file);assert.deepEqual(Buffer.from(store.get('SELECT data FROM whatsapp_avatars WHERE remote_id=?',pn).data),png);}finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
async function fixture(t){
 const store=new Store(':memory:'),sent=[],logs=[];let downloads=0;
 class Client extends EventEmitter{
  constructor(){super();this.info={wid:{_serialized:'5511888888888@c.us'}};this.calls=0;this.photoCalls=0;this.requested=0;this.transfer=false;this.rows=[{id:{_serialized:'old'},from:pn,type:'chat',body:'quero fechar B72',timestamp:Math.floor(Date.now()/1000)-20*86400}];this.remote={id:{_serialized:pn},name:'Cliente Foto',timestamp:Math.floor(Date.now()/1000)-600,fetchMessages:async()=>this.rows};}
  async initialize(){}async destroy(){}async logout(){}async getChats(){this.calls++;return[this.remote,{id:{_serialized:group},isGroup:true,name:'Grupo Foto'}];}async getContacts(){return[{id:{_serialized:pn},name:'Cliente Foto',isMyContact:true}];}async getProfilePicUrl(){this.photoCalls++;return this.noPhoto?undefined:'https://pps.whatsapp.net/photo';}async syncHistory(){this.requested++;return this.transfer;}async sendMessage(...args){sent.push(args);return{id:{_serialized:randomUUID()}};}
 }
 const client=new Client(),whatsapp=new WhatsApp(store,'/tmp/cota-media-sync-fixture',{clientFactory:()=>client,logger:{error:line=>logs.push(line)}});whatsapp.avatars.download=async()=>{downloads++;return{data:png,type:'image/png'};};const app=createApp({store,whatsapp});
 const users=['admin','comercial','comercial'].map((role,i)=>{const id='media-user-'+i,token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,'Pessoa '+i,`media${i}@example.test`,hash,role,Date.now());store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+86400000,id);const http=request.agent(app);http.jar.setCookie(`cota_session=${token}; Path=/`);return{id,http};});
 await whatsapp.connect();client.emit('ready');await whatsapp.sync();await whatsapp.avatars.refresh([pn,group]);t.after(async()=>{app.locals.close();await whatsapp.close();store.close();});return{store,client,whatsapp,app,users,sent,logs,downloads:()=>downloads};
}
test('contact and group photos are cached and served only through authenticated routes',async t=>{
 const f=await fixture(t),chat=f.store.chats()[0],contact=f.store.get('SELECT id FROM contacts');assert(chat.avatar_version);assert(f.store.groupList()[0].avatar_version);const list=(await f.users[0].http.get('/api/contacts').expect(200)).body;assert(list.items[0].avatar_version);
 for(const route of [`/api/chats/${chat.id}/avatar`,`/api/groups/${group}/avatar`,`/api/contacts/${contact.id}/avatar`]){await request(f.app).get(route).expect(401);const photo=await f.users[0].http.get(route).expect(200);assert.equal(photo.headers['content-type'],'image/png');assert.deepEqual(photo.body,png);assert(photo.headers['cache-control'].includes('private'));}
 f.store.pause(chat.id,null,f.users[1].id);await f.users[2].http.get(`/api/chats/${chat.id}/avatar`).expect(403);await f.users[0].http.get(`/api/chats/${chat.id}/avatar`).expect(200);assert.equal(f.sent.length,0);
});
test('photo queries are deduplicated and cached across manual and automatic sync',async t=>{
 const f=await fixture(t),before=f.downloads();await Promise.all(Array.from({length:10},()=>f.whatsapp.avatars.refresh([pn,group,pn])));await f.whatsapp.sync();await f.whatsapp.avatars.refresh([pn,group]);assert.equal(f.downloads(),before);assert.equal(f.sent.length,0);
});
test('photo removal respects WhatsApp privacy and clears the old image',async t=>{
 const f=await fixture(t);f.client.noPhoto=true;f.whatsapp.avatars.ttl=0;await f.whatsapp.avatars.refresh([pn]);assert.equal(f.store.chats()[0].avatar_version,null);await f.users[0].http.get(`/api/chats/${f.store.chats()[0].id}/avatar`).expect(404);assert.equal(f.sent.length,0);
});
test('disconnect cancels queued profile queries without late database writes',async t=>{
 const f=await fixture(t);f.whatsapp.avatars.ttl=0;let release,entered;const started=new Promise(resolve=>{entered=resolve;});f.client.getProfilePicUrl=()=>{entered();return new Promise(resolve=>{release=resolve;});};const pending=f.whatsapp.avatars.refresh([pn,...Array.from({length:8},(_,i)=>'551199000000'+i+'@c.us')]);await started;await f.whatsapp.disconnect();release(undefined);await pending;assert(f.store.chats()[0].avatar_version);assert.equal(f.sent.length,0);
});
for(const url of ['http://pps.whatsapp.net/a','https://localhost/a','https://127.0.0.1/a','https://pps.whatsapp.net.evil.test/a','https://u:p@pps.whatsapp.net/a','https://pps.whatsapp.net:8443/a','data:image/png;base64,a'])test(`profile downloader rejects untrusted URL: ${url}`,()=>assert.throws(()=>avatarUrl(url)));
test('profile downloads validate image bytes, size and redirects before caching',async()=>{
 assert.equal((await downloadAvatar('https://pps.whatsapp.net/photo',{fetcher:async(_url,opts)=>{assert.equal(opts.redirect,'error');return new Response(png);}})).type,'image/png');
 await assert.rejects(downloadAvatar('https://pps.whatsapp.net/a',{fetcher:async()=>new Response('not an image')}));await assert.rejects(downloadAvatar('https://pps.whatsapp.net/a',{fetcher:async()=>new Response(Buffer.alloc(avatarMaxBytes+1))}));await assert.rejects(downloadAvatar('https://pps.whatsapp.net/a',{fetcher:async()=>new Response(null,{status:302,headers:{location:'http://localhost'}})}));
});
test('history requests ask the linked phone, show waiting, and import the later response without replying',async t=>{
 const f=await fixture(t),chat=f.store.chats()[0];f.client.rows=[];f.client.transfer=true;f.whatsapp.syncer.phoneRequests.clear();await f.whatsapp.loadHistory(chat,{force:true});assert.equal(f.store.chat(chat.id).history_status,'waiting');assert.equal(f.client.requested,2);assert(f.store.chat(chat.id).history_error.includes('automática'));
 f.client.rows=[{id:{_serialized:'older'},from:pn,type:'chat',body:'ATENDENTE antigo',timestamp:Math.floor(Date.now()/1000)-31*86400},{id:{_serialized:'month'},from:pn,type:'chat',body:'pode separar antigo',timestamp:Math.floor(Date.now()/1000)-25*86400}];await f.whatsapp.loadHistory(chat,{force:true});assert.equal(f.store.chat(chat.id).history_status,'complete');assert(f.store.messages(chat.id).some(message=>message.provider_id==='month'));assert(!f.store.messages(chat.id).some(message=>message.provider_id==='older'));assert.equal(f.store.chat(chat.id).service_origin_id,null);assert.equal(f.sent.length,0);
});
test('manual history retry enforces chat permissions and never claims or sends',async t=>{
 const f=await fixture(t),chat=f.store.chats()[0];f.store.pause(chat.id,null,f.users[1].id);await post(f.users[2],`/api/chats/${chat.id}/history`).expect(403);await post(f.users[0],`/api/chats/${chat.id}/history`,{send:true}).expect(400);await post(f.users[0],`/api/chats/${chat.id}/history`).expect(202);assert.equal(f.store.chat(chat.id).assigned_user_id,f.users[1].id);assert.equal(f.sent.length,0);
});
test('contact history can load a missing cached conversation without assuming it or authorizing bot messages',async t=>{
 const f=await fixture(t),phone='5511988888888',id=phone+'@c.us';f.client.getNumberId=async()=>({_serialized:id});f.client.getContactLidAndPhone=async()=>[];f.client.getChatById=async()=>({id:{_serialized:id},fetchMessages:async()=>[{id:{_serialized:'contact-history'},from:id,type:'chat',body:'quero comprar antigo',timestamp:Math.floor(Date.now()/1000)-25*86400}]});
 const contact=(await post(f.users[1],'/api/contacts',{name:'Contato fora da lista',phone:'+'+phone}).expect(201)).body;await f.users[1].http.get(`/api/contacts/${contact.id}/history`).expect(200);await f.whatsapp.syncer.contactRequests.get(phone).task;const result=(await f.users[1].http.get(`/api/contacts/${contact.id}/history`).expect(200)).body;assert.equal(result.messages[0].body,'quero comprar antigo');assert.equal(result.chat.assigned_user_id,null);assert.equal(result.chat.service_origin_id,null);assert.equal(result.chat.unread,0);await f.app.locals.agent.followups.check();assert.equal(f.sent.length,0);
});
test('cached PN and LID mapping recovers a conversation when the SDK identity query fails',async t=>{
 const require=createRequire(import.meta.url),{LoadUtils}=require('whatsapp-web.js/src/util/Injected/Utils.js'),context=createContext({window:{}});runInContext('('+seedBrokenRoster.toString()+')()',context);runInContext('('+LoadUtils.toString()+')()',context);runInContext("window.rosterFixture.contacts[0].id={_serialized:'887766554433@lid'};window.rosterFixture.contacts[0].phoneNumber={_serialized:'5511999999999@c.us'};window.rosterFixture.chats[0].msgs.getModelsArray()[0].from='887766554433@lid';window.WWebJS.getMessageModel=()=>{throw new Error('r')}",context);
 const client=new wa.Client();client.pupPage={evaluate:async(fn,...args)=>{context.args=args;return structuredClone(await runInContext('('+fn.toString()+')(...args)',context));}};client.getContactLidAndPhone=async()=>{throw new Error('r');};client.info={wid:{_serialized:'5511888888888@c.us'}};const store=new Store(':memory:'),sync=new WhatsAppSync({store,client,generation:1,status:'ready',readyAt:Math.floor(Date.now()/1000),logger:{error(){}}});t.after(()=>{sync.reset();store.close();});await sync.run();const chat=store.chats().find(chat=>chat.phone===pn);assert(chat);assert.equal(store.messages(chat.id).length,1);assert.equal(store.get('SELECT chat_id FROM whatsapp_chat_aliases WHERE alias=?','887766554433@lid').chat_id,chat.id);assert.equal(chat.service_origin_id,null);
});
test('automatic synchronization retries without overlap and stops at disconnect',async t=>{
 const f=await fixture(t);f.whatsapp.syncer.autoInterval=15;f.whatsapp.syncer.retryInterval=10;let active=0,max=0,entered;const started=new Promise(resolve=>{entered=resolve;});f.client.getChats=async()=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,20));active--;f.client.calls++;if(f.client.calls>=3)entered();return[f.client.remote];};await f.whatsapp.sync();assert(f.whatsapp.snapshot().sync.automatic);assert(f.whatsapp.snapshot().sync.nextSyncAt);await started;await f.whatsapp.sync();assert.equal(max,1);await f.whatsapp.disconnect();const calls=f.client.calls;await new Promise(resolve=>setTimeout(resolve,40));assert.equal(f.client.calls,calls);assert.equal(f.sent.length,0);
});
test('installed SDK message serializer r falls back to raw history and preserves private message identity',async t=>{
 const require=createRequire(import.meta.url),{LoadUtils}=require('whatsapp-web.js/src/util/Injected/Utils.js'),context=createContext({window:{}});runInContext('('+seedBrokenRoster.toString()+')()',context);runInContext('('+LoadUtils.toString()+')()',context);runInContext("window.WWebJS.getMessageModel=()=>{throw new Error('r')}",context);
 const client=new wa.Client();client.pupPage={evaluate:async(fn,...args)=>{context.args=args;return structuredClone(await runInContext('('+fn.toString()+')(...args)',context));}};client.getContactLidAndPhone=async()=>[];client.info={wid:{_serialized:'5511888888888@c.us'}};let sends=0;client.sendMessage=async()=>{sends++;};const store=new Store(':memory:'),sync=new WhatsAppSync({store,client,generation:1,status:'ready',readyAt:Math.floor(Date.now()/1000),logger:{error(){}}});t.after(()=>{sync.reset();store.close();});await sync.run();assert.equal(store.chats().length,2);assert(store.chats().every(chat=>store.messages(chat.id).length===1));assert(store.chats().every(chat=>chat.unread===0&&chat.service_origin_id===null));assert.equal(sends,0);
});
