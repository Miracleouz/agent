import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createContext,runInContext} from 'node:vm';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import wa from 'whatsapp-web.js';
import {WhatsAppClient,authModulesReady,transientInjectionError} from '../server/whatsapp-client.js';
import {WhatsApp} from '../server/whatsapp.js';
import {Store} from '../server/db.js';
import {seedAuthBrowser} from './fixtures/auth-browser.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,{timeout=2000}={}){
 const context=createContext({window:{},Uint8Array});runInContext('('+seedAuthBrowser.toString()+')()',context);const state=context.window.authFixture,main={url:()=> 'https://web.whatsapp.com/'};
 class Page extends EventEmitter{
  async setBypassServiceWorker(){}
  async setCacheEnabled(){}
  mainFrame(){return main;}
  async evaluate(fn,...args){state.evaluations++;if(this.error){const error=this.error;this.error=null;throw error;}context.args=args;return await runInContext(typeof fn==='string'?fn:'('+fn.toString()+')(...args)',context);}
  async exposeFunction(name,fn){state.registrations++;context.window[name]=fn;}
  async waitForFunction(fn,{timeout,signal}){const deadline=Date.now()+timeout;while(!signal.aborted){if(await this.evaluate(fn))return{dispose:async()=>{}};if(Date.now()>=deadline)throw Object.assign(new Error('timeout'),{name:'TimeoutError'});await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('aborted');}
 }
 const client=new WhatsAppClient({authTimeoutMs:timeout,webVersionCache:{type:'none'}}),page=new Page(),qrs=[],errors=[];client.pupPage=page;client.on('qr',qr=>qrs.push(qr));client.on('cota_connection_error',error=>errors.push(error));t.after(()=>client.destroy());return{client,page,state,context,main,qrs,errors};
}
test('installed SDK reproduces the supplied null Socket error before QR',async t=>{const f=fixture(t);await assert.rejects(wa.Client.prototype.inject.call(f.client),/Cannot read properties of null \(reading 'Socket'\)/);assert.equal(f.qrs.length,0);});
test('actual SDK injection waits for Socket then emits exactly one QR without changing auth flow',async t=>{const f=fixture(t),pending=f.client.inject();await tick();assert.equal(f.qrs.length,0);f.state.ready=true;await pending;assert.equal(f.qrs.length,1);assert.match(f.qrs[0],/^test-reference,/);assert.equal(f.state.refs.length,1);assert.equal(f.state.listeners.get('change:state').length,1);await f.client.inject();assert.equal(f.qrs.length,1);assert.equal(f.state.refs.length,1);});
test('concurrent injection calls share a single SDK injection and a single set of listeners',async t=>{const f=fixture(t);f.state.ready=true;await Promise.all(Array.from({length:25},()=>f.client.inject()));assert.equal(f.qrs.length,1);assert.equal(f.state.refs.length,1);assert.equal(f.state.listeners.get('change:state').length,1);});
test('unavailable modules fail with a bounded explicit diagnosis, without generating fake QR',async t=>{const f=fixture(t,{timeout:20});await assert.rejects(f.client.inject(),/COTA_AUTH_MODULES_UNAVAILABLE/);assert.equal(f.qrs.length,0);assert.equal(f.errors.length,0);});
test('disconnect cancels module warmup before SDK authentication can emit anything',async t=>{const f=fixture(t),pending=f.client.inject();await tick();await f.client.destroy();f.state.ready=true;await pending;assert.equal(f.qrs.length,0);assert.equal(f.errors.length,0);});
test('a transient detached execution context is retried within the same injection',async t=>{const f=fixture(t);f.state.ready=true;let checks=0;const wait=f.page.waitForFunction.bind(f.page);f.page.waitForFunction=async(...args)=>{if(++checks===1)throw new Error("Attempted to use detached Frame 'test'");return wait(...args);};await f.client.inject();assert.equal(checks,2);assert.equal(f.qrs.length,1);});
test('context failures have a finite retry budget',async t=>{const f=fixture(t);let checks=0;f.page.waitForFunction=async()=>{checks++;throw new Error('Execution context was destroyed');};await assert.rejects(f.client.inject(),/Execution context was destroyed/);assert.equal(checks,3);assert.equal(f.qrs.length,0);});
test('a child frame cannot trigger SDK reinjection',async t=>{const f=fixture(t);let calls=0;f.page.on('framenavigated',async()=>{calls++;throw new Error('detached Frame');});f.page.emit('framenavigated',{url:()=> 'https://web.whatsapp.com/child'});await tick();assert.equal(calls,0);assert.equal(f.errors.length,0);});
test('rejected navigation injection is captured as a client error without an unhandled rejection',async t=>{const f=fixture(t);f.page.on('framenavigated',async()=>{throw new Error('detached Frame from navigation');});f.page.emit('framenavigated',f.main);await tick();await Promise.all([...f.client.navigationTasks]);assert.equal(f.errors.length,1);assert.match(f.errors[0].message,/detached Frame/);});
test('other page listeners keep normal EventEmitter semantics',async t=>{const f=fixture(t);let value;f.page.on('other',arg=>{value=arg;});f.page.emit('other',123);assert.equal(value,123);});
test('events from a replaced page and after destroy do not alter the client',async t=>{const f=fixture(t);let calls=0;f.page.on('framenavigated',()=>{calls++;});const old=f.page;f.client.pupPage=null;old.emit('framenavigated',f.main);await tick();assert.equal(calls,0);f.client.pupPage=f.page;await f.client.destroy();old.emit('framenavigated',f.main);await tick();assert.equal(calls,0);assert.equal(f.errors.length,0);});
test('a new document performs authentication again instead of using the previous document marker',async t=>{const f=fixture(t);f.state.ready=true;await f.client.inject();delete f.context.window.__cotaAuthInjectionV1;delete f.context.window.onQRChangedEvent;f.state.socket={...f.state.socket,state:'UNPAIRED'};await f.client.inject();assert.equal(f.qrs.length,2);});
for(const error of ["Cannot read properties of null (reading 'Socket')","Attempted to use detached Frame '22D4'",'Execution context was destroyed','Cannot find context with specified id'])test(`warmup error is recoverable: ${error}`,()=>assert.equal(transientInjectionError(new Error(error)),true));
for(const error of ['profile is in use','ERR_CERT_AUTHORITY_INVALID','EACCES','arbitrary SDK failure'])test(`unrelated errors are not silently retried: ${error}`,()=>assert.equal(transientInjectionError(new Error(error)),false));
test('the auth-ready predicate tolerates unloaded modules but never marks a fabricated socket ready',async t=>{const f=fixture(t);assert.equal(await f.page.evaluate(authModulesReady),false);f.state.ready=true;assert.equal(await f.page.evaluate(authModulesReady),true);f.state.socket={state:'OPEN'};assert.equal(await f.page.evaluate(authModulesReady),false);});
async function transportFixture(t){
 const dir=mkdtempSync(join(tmpdir(),'cota-auth-guard-')),store=new Store(':memory:'),logs=[],sent=[];let options;
 class Client extends EventEmitter{async initialize(){}async destroy(){this.destroyed=true;}async logout(){throw new Error('must not logout');}async sendMessage(...args){sent.push(args);return{id:{_serialized:'test-outgoing'}};}}
 const clients=[],whatsapp=new WhatsApp(store,dir,{clientFactory:config=>{options=config;const client=new Client();clients.push(client);return client;},logger:{error:line=>logs.push(line)}});t.after(async()=>{await whatsapp.close();store.close();rmSync(dir,{recursive:true,force:true});});await whatsapp.connect();await tick();return{dir,store,logs,sent,whatsapp,clients,options};
}
test('transport uses current WhatsApp HTML while retaining LocalAuth instead of deleting session cache files',async t=>{const f=await transportFixture(t);assert.equal(f.options.webVersionCache.type,'none');assert.equal(f.options.authStrategy.constructor.name,'LocalAuth');});
test('page reload hides the current connection and stale inbound cannot authorize a response',async t=>{const f=await transportFixture(t),client=f.clients[0];let received=0;f.whatsapp.receiver=()=>{received++;};client.emit('ready');assert.equal(f.whatsapp.status,'ready');client.emit('cota_reloading');assert.equal(f.whatsapp.status,'starting');assert.equal(f.whatsapp.number,null);assert.equal(f.whatsapp.readyAt,null);client.emit('message',{from:'5511999999999@c.us',type:'chat',body:'oi',timestamp:Math.floor(Date.now()/1000),id:{_serialized:'old',fromMe:false},_data:{isNewMsg:true}});assert.equal(received,0);assert.equal(f.sent.length,0);});
test('navigation failure records a bounded safe error and closes browser without logout or touching session files',async t=>{const f=await transportFixture(t),file=join(f.dir,'session-marker');writeFileSync(file,'keep-auth');f.clients[0].emit('ready');f.clients[0].emit('cota_connection_error',new Error("Attempted to use detached Frame 'private-frame-id'"));await tick();assert.equal(f.whatsapp.status,'error');assert.match(f.whatsapp.error,/page_reloaded/);assert(!f.whatsapp.error.includes('private-frame-id'));assert.equal(f.clients[0].destroyed,true);assert.equal(readFileSync(file,'utf8'),'keep-auth');assert.equal(f.sent.length,0);assert.equal(f.store.chats().length,0);});
test('a failed obsolete client cannot change a new connection',async t=>{const f=await transportFixture(t),old=f.clients[0];await f.whatsapp.disconnect();await f.whatsapp.connect();f.clients[1].emit('ready');old.emit('cota_connection_error',new Error('detached Frame'));old.emit('cota_reloading');assert.equal(f.whatsapp.status,'ready');assert.equal(f.logs.length,0);assert.equal(f.sent.length,0);});
test('navigation errors do not crash a Node process under strict unhandled rejection behavior',async()=>{
 const moduleUrl=new URL('../server/whatsapp-client.js',import.meta.url).href,script=`import{EventEmitter}from'node:events';import{WhatsAppClient}from${JSON.stringify(moduleUrl)};const c=new WhatsAppClient({});const p=new EventEmitter();const frame={url:()=> 'https://web.whatsapp.com/'};p.mainFrame=()=>frame;c.pupPage=p;c.on('cota_connection_error',()=>console.log('caught navigation error'));p.on('framenavigated',async()=>{throw new Error('detached Frame');});p.emit('framenavigated',frame);setTimeout(async()=>{await c.destroy();console.log('process survived');},20);`;
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--unhandled-rejections=strict','--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',x=>text+=x);child.stderr.on('data',x=>text+=x);child.on('error',reject);child.on('close',code=>resolve({code,text}));});assert.equal(result.code,0,result.text);assert.match(result.text,/caught navigation error/);assert.match(result.text,/process survived/);
});
async function until(check,timeout=4000){const deadline=Date.now()+timeout;while(!check()){if(Date.now()>deadline)throw new Error('Timed out waiting for actual SDK event');await new Promise(resolve=>setTimeout(resolve,10));}}
test('real Chromium and original SDK initialize reproduce null Socket before modules load',async()=>{
 const{authFixtureOptions}=await import('./fixtures/auth-sdk-client.js'),client=new wa.Client(authFixtureOptions(1500));try{await assert.rejects(client.initialize(),/Cannot read properties of null \(reading 'Socket'\)/);}finally{await client.destroy();}
});
test('real Chromium and installed SDK generate QR after warmup, ignore iframes and recover a main-page reload',async()=>{
 const{authFixtureOptions}=await import('./fixtures/auth-sdk-client.js'),client=new WhatsAppClient(authFixtureOptions(100)),qrs=[],errors=[];client.on('qr',qr=>qrs.push(qr));client.on('cota_connection_error',error=>errors.push(error));try{
  await client.initialize();assert.equal(qrs.length,1);await client.pupPage.evaluate(()=>{const frame=document.createElement('iframe');frame.srcdoc='<p>Child frame</p>';document.body.appendChild(frame);});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(qrs.length,1);
  await client.pupPage.reload({waitUntil:'load'});await until(()=>qrs.length===2);assert.equal(errors.length,0);await client.inject();assert.equal(qrs.length,2);
 }finally{await client.destroy();}
});
test('the installed SDK navigation callback rejection stays handled in real Chromium',async()=>{
 const{authFixtureOptions}=await import('./fixtures/auth-sdk-client.js'),client=new WhatsAppClient(authFixtureOptions(50)),errors=[];client.on('cota_connection_error',error=>errors.push(error));try{await client.initialize();client.inject=async()=>{throw new Error("Attempted to use detached Frame 'test-real-navigation'");};await client.pupPage.reload({waitUntil:'load'});await until(()=>errors.length===1);assert.match(errors[0].message,/detached Frame/);assert.equal(client.pupBrowser.isConnected(),true);}finally{await client.destroy();}
});
test('a changed document cannot be marked injected using the preceding document attempt',async t=>{const f=fixture(t);f.state.ready=true;f.client.once('qr',()=>{delete f.context.window.__cotaAuthAttemptV1;});await f.client.inject();assert.equal(f.qrs.length,2);assert.equal(f.context.window.__cotaAuthInjectionV1,f.state.socket);assert.equal(f.context.window.__cotaAuthAttemptV1,undefined);});
test('SDK OPENING state cannot leave authentication waiting indefinitely',async t=>{const f=fixture(t,{timeout:30});f.state.ready=true;f.state.socket.state='OPENING';await assert.rejects(f.client.inject(),/COTA_AUTH_MODULES_UNAVAILABLE/);assert.equal(f.client.stopping,true);assert.equal(f.qrs.length,0);});
test('disabled HTML cache does not attach the SDK response-body listener that rejects during browser close',async t=>{const f=fixture(t);await f.client.initWebVersionCache();assert.equal(f.page.listenerCount('response'),0);});
