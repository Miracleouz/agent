import wa from 'whatsapp-web.js';
import {randomUUID} from 'node:crypto';

export function authModulesReady(){
 try{
  if(!window.Debug?.VERSION||typeof window.require!=='function')return false;
  const socket=window.require('WAWebSocketModel')?.Socket;
  return Boolean(socket&&typeof socket.state==='string'&&typeof socket.on==='function'&&window.require('WAWebCmd')?.Cmd&&window.require('WAWebConnModel')?.Conn);
 }catch{return false;}
}
function injected(){try{return Boolean(window.__cotaAuthInjectionV1&&window.__cotaAuthInjectionV1===window.require('WAWebSocketModel')?.Socket);}catch{return false;}}
function beginInjection(token){window.__cotaAuthAttemptV1={token,socket:window.require('WAWebSocketModel').Socket};}
function markInjected(token){const socket=window.require('WAWebSocketModel')?.Socket;if(window.__cotaAuthAttemptV1?.token!==token||window.__cotaAuthAttemptV1.socket!==socket)return false;window.__cotaAuthInjectionV1=socket;delete window.__cotaAuthAttemptV1;return true;}
export const transientInjectionError=error=>/COTA_AUTH_DOCUMENT_CHANGED|detached Frame|Execution context was destroyed|Cannot find context with specified id|Cannot read properties of (?:null|undefined) \(reading '(?:Socket|Cmd|Conn|OfflineMessageHandler|waSignalStore|waNoiseInfo)'\)/i.test(String(error?.message||error));
function within(operation,signal,timeout){
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(value);},abort=()=>finish(new Error('COTA_AUTH_CANCELLED'));
  const timer=setTimeout(()=>finish(Object.assign(new Error('Authentication timeout'),{name:'TimeoutError'})),Math.max(1,timeout));signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)return abort();Promise.resolve().then(operation).then(value=>finish(null,value),error=>finish(error));
 });
}

// Keep the installed SDK's authentication/QR logic. Scope the workaround to
// its page-navigation listener and injection; never catch process-wide errors.
export class WhatsAppClient extends wa.Client{
 constructor(options){
  super(options);this.stopping=false;this.controller=new AbortController();this.navigationTasks=new Set();this.guardedPages=new WeakSet();
  let page=this.pupPage;
  Object.defineProperty(this,'pupPage',{configurable:true,get:()=>page,set:value=>{page=value;if(value)this.guardNavigation(value);}});
 }
 guardNavigation(page){
  if(this.guardedPages.has(page))return;this.guardedPages.add(page);
  const on=page.on.bind(page);
  page.on=(event,listener)=>{
   if(event!=='framenavigated')return on(event,listener);
   return on(event,frame=>{
    if(this.stopping||this.pupPage!==page||frame!==page.mainFrame())return;
    const task=Promise.resolve().then(()=>listener(frame)).catch(error=>{if(!this.stopping&&this.pupPage===page)this.emit('cota_connection_error',error);});
    this.navigationTasks.add(task);task.finally(()=>this.navigationTasks.delete(task));
   });
  };
 }
 async initWebVersionCache(){
  // The SDK still attaches an async HTML-capture listener for cache='none'.
  // Its response.text() can reject while closing a failed page. No capture is
  // needed when cached HTML is disabled, so do not install that listener.
  if(this.options.webVersionCache.type==='none')return;
  return super.initWebVersionCache();
 }
 inject(){
  if(this.stopping)return Promise.resolve();
  if(this.injection)return this.injection;
  const task=this.injectWhenReady();this.injection=task;const clear=()=>{if(this.injection===task)this.injection=null;};task.then(clear,clear);return task;
 }
 async injectWhenReady(){
  const page=this.pupPage,signal=this.controller.signal,active=()=>!signal.aborted&&!this.stopping&&this.pupPage===page;
  if(!page||!active())return;
  if(await page.evaluate(injected).catch(()=>false))return;
  if(!active())return;this.emit('cota_reloading');
  const deadline=Date.now()+(this.options.authTimeoutMs||90000);let attempts=0;
  while(active()){
   try{
    const handle=await page.waitForFunction(authModulesReady,{timeout:Math.max(1,deadline-Date.now()),polling:100,signal});await handle.dispose();
    if(!active())return;
    const token=randomUUID();await page.evaluate(beginInjection,token);if(!active())return;
    await within(()=>super.inject(),signal,deadline-Date.now());if(!active())return;
    if(await page.evaluate(markInjected,token)!==true)throw new Error('COTA_AUTH_DOCUMENT_CHANGED');return;
   }catch(error){
    if(!active())return;
    if(error?.name==='TimeoutError'){await this.destroy().catch(()=>{});throw new Error('COTA_AUTH_MODULES_UNAVAILABLE');}
    if(transientInjectionError(error)&&attempts++<2&&Date.now()<deadline){this.emit('cota_reloading');continue;}
    throw error;
   }
  }
 }
 destroy(){
  if(this.destroying)return this.destroying;
  this.stopping=true;this.controller.abort();
  this.destroying=super.destroy();return this.destroying;
 }
}
