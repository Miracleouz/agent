import wa from 'whatsapp-web.js';
import {randomUUID} from 'node:crypto';
import {attachLiveBridge} from './whatsapp-live.js';
import {installExistingChatLookup,installMessageSerializerGuard} from './whatsapp-models.js';

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
  super(options);this.cotaManaged=true;this.stopping=false;this.controller=new AbortController();this.navigationTasks=new Set();this.guardedPages=new WeakSet();
  this.launchSettled=new Promise(resolve=>{this.finishLaunch=resolve;});
  let page=this.pupPage;
  Object.defineProperty(this,'pupPage',{configurable:true,get:()=>page,set:value=>{page=value;if(value)this.guardNavigation(value);}});
  let browser=this.pupBrowser;
  Object.defineProperty(this,'pupBrowser',{configurable:true,get:()=>browser,set:value=>{browser=value;if(value){this.launchPending=false;this.finishLaunch();if(this.stopping)this.closeLateBrowser(value);}}});
 }
 stage(value){this.connectionStage=value;this.emit('cota_stage',value);}
 initialize(){
  if(this.initializing)return this.initializing;
  if(this.stopping)return Promise.reject(new Error('COTA_AUTH_CANCELLED'));
  this.stage('browser_start');
  const before=this.authStrategy.beforeBrowserInitialized.bind(this.authStrategy);
  this.authStrategy.beforeBrowserInitialized=async()=>{await before();if(this.stopping)throw new Error('COTA_AUTH_CANCELLED');this.launchPending=true;};
  const task=within(()=>{const native=super.initialize();native.then(()=>{this.launchPending=false;this.finishLaunch();},()=>{this.launchPending=false;this.finishLaunch();});return native;},this.controller.signal,this.options.authTimeoutMs||90000).catch(async error=>{if(!this.stopping)await this.destroy().catch(()=>{});if(error?.name==='TimeoutError')throw new Error('COTA_CONNECTION_TIMEOUT');throw error;});
  this.initializing=task;return task;
 }
 closeLateBrowser(browser){
  const task=within(()=>browser.close(),new AbortController().signal,5000).catch(()=>{const process=browser.process?.();if(process&&!process.killed)process.kill('SIGKILL');});
  this.lateBrowserClose=task;return task;
 }
 guardNavigation(page){
  if(this.guardedPages.has(page))return;this.guardedPages.add(page);
  const on=page.on.bind(page);
  if(typeof page.goto==='function'){
   const goto=page.goto.bind(page);
   page.goto=(url,options={})=>{
    if(url!=='https://web.whatsapp.com/')return goto(url,options);
    this.stage('page_load');
    // Optional resources can keep the load event pending forever. The auth
    // readiness checks independently wait for the required WhatsApp modules.
    return goto(url,{...options,waitUntil:'domcontentloaded',timeout:this.options.authTimeoutMs||90000});
   };
  }
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
  // LocalAuth preserves Chromium's own HTTP cache and service workers too.
  // Bypass those for this page without clearing cookies or IndexedDB keys.
  await this.pupPage.setBypassServiceWorker(true);
  await this.pupPage.setCacheEnabled(false);
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
 async attachEventListeners(){
  // Register before the SDK: a throwing full serializer must not prevent the
  // independent observer from seeing the original new-message event.
  try{await this.pupPage.evaluate(installExistingChatLookup);await this.pupPage.evaluate(installMessageSerializerGuard);await attachLiveBridge(this);return await super.attachEventListeners();}
  catch(error){if(!this.stopping)this.emit('cota_connection_error',error);throw error;}
 }
 async injectWhenReady(){
  const page=this.pupPage,signal=this.controller.signal,active=()=>!signal.aborted&&!this.stopping&&this.pupPage===page;
  if(!page||!active())return;
  if(await page.evaluate(injected).catch(()=>false))return;
  if(!active())return;this.stage('auth_modules');this.emit('cota_reloading');
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
 logout(){
  if(this.loggingOut)return this.loggingOut;
  // Stop reload handlers before the SDK closes the page and removes LocalAuth.
  // A late navigation must not initialize that profile again during logout.
  this.stopping=true;this.controller.abort();this.loggingOut=super.logout();return this.loggingOut;
 }
 destroy(){
  if(this.destroying)return this.destroying;
  this.stopping=true;this.controller.abort();
  this.destroying=within(async()=>{if(this.launchPending&&!this.pupBrowser)await this.launchSettled;await super.destroy();await this.lateBrowserClose;},new AbortController().signal,5000).catch(error=>{const process=this.pupBrowser?.process?.();if(process&&!process.killed)process.kill('SIGKILL');throw error;});return this.destroying;
 }
}
