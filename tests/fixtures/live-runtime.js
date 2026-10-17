import {createRequire} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {Store} from '../../server/db.js';
import {WhatsApp} from '../../server/whatsapp.js';
import {WhatsAppClient} from '../../server/whatsapp-client.js';
import {createApp} from '../../server/app.js';
import {replaceCatalog} from '../../server/catalog.js';
import {industrialStock} from './industrial-stock.js';
import {seedAuthBrowser} from './auth-browser.js';
import {seedSendBrowser} from './whatsapp-send-browser.js';
import {seedLiveBrowser} from './live-browser.js';
const require=createRequire(import.meta.url),{LoadUtils}=require('whatsapp-web.js/src/util/Injected/Utils.js');
export async function liveRuntime({page=null,nativeAuth=false}={}){
 let context;
 if(!page){context=createContext({window:{},console,setTimeout,clearTimeout,Uint8Array});page=new EventEmitter();page.mainFrame=()=>null;page.evaluate=async(fn,...args)=>{context.args=args;return structuredClone(await runInContext(typeof fn==='string'?fn:'('+fn.toString()+')(...args)',context));};page.waitForFunction=async fn=>{if(!await page.evaluate(fn))throw new Error('Fixture auth modules not ready');return{dispose:async()=>{}};};page.exposeFunction=async(name,fn)=>{context.window[name]=fn;};}
 await page.evaluate(seedAuthBrowser);await page.evaluate(()=>{window.authRequire=window.require;window.authFixture.ready=true;});await page.evaluate(seedSendBrowser);await page.evaluate(seedLiveBrowser);if(nativeAuth!==true)await page.evaluate(LoadUtils);
 if(nativeAuth)await page.evaluate(()=>{window.authFixture.socket.state='CONNECTED';window.require('WAWebConnModel').Conn.serialize=()=>({pushname:'Loja teste'});});
 const client=new WhatsAppClient({webVersionCache:{type:'none'}});client.pupPage=page;client.info={wid:{_serialized:'5511888888888@c.us',user:'5511888888888'}};client.getContactLidAndPhone=async()=>[{pn:'5511999999999@c.us',lid:'991122334455@lid'}];
 let initialization;client.initialize=()=>initialization??=(async()=>{if(nativeAuth){await client.inject();await page.evaluate(()=>window.onAppStateHasSyncedEvent());}else{await client.attachEventListeners();client.emit('ready');}})();client.destroy=async()=>{client.stopping=true;};client.logout=async()=>{client.stopping=true;};
 const store=new Store(':memory:');replaceCatalog(store,industrialStock,'live test');const logs=[],wa=new WhatsApp(store,'/tmp/cota-live-fixture',{clientFactory:()=>client,logger:{info(){},error:line=>logs.push(line)}}),app=createApp({store,whatsapp:wa});await wa.connect();
 const drain=async()=>{for(let i=0;i<12;i++){await new Promise(resolve=>setImmediate(resolve));await Promise.all([...app.locals.agent.queues.values()]);}await wa.drainMedia();};
 await client.initialize();await drain();if(wa.status!=='ready'){app.locals.close();await wa.close();store.close();throw new Error('Fixture initialization failed: '+logs.join('\n'));}await wa.sync();
 return{page,context,client,store,wa,app,logs,drain,async add(options){try{await page.evaluate(options=>window.liveFixture.add(options),options);}catch(error){if(!/^(?:Error: )?r(?:\n|$)/.test(error.message))throw error;}await drain();},async sent(){return page.evaluate(()=>window.sendFixture.sent.map(row=>({id:row.id._serialized,body:row.body,to:row.to})));},async close(){app.locals.close();await wa.close();store.close();}};
}
