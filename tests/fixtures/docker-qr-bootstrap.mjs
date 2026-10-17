// Test-only preload copied into disposable containers by docker-profile-recovery.
// Production Dockerfile never copies tests or enables NODE_OPTIONS.
import {appendFileSync,existsSync} from 'node:fs';
import {WhatsAppClient} from '../../server/whatsapp-client.js';
import {seedAuthBrowser} from './auth-browser.js';
const initialize=WhatsAppClient.prototype.initialize;
WhatsAppClient.prototype.initialize=function(){
 const stale=existsSync('/app/data/whatsapp/session/test-broken-shell');
 this.options.evalOnNewDoc=`(${seedAuthBrowser.toString()})();setTimeout(()=>{window.authFixture.ready=true;},${stale?100000:50});`;
 if(stale)this.options.authTimeoutMs=1500;
 const strategy=this.authStrategy,after=strategy.afterBrowserInitialized.bind(strategy);
 strategy.afterBrowserInitialized=async()=>{
  await after();const page=this.pupPage;await page.setRequestInterception(true);
  page.on('request',request=>request.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Docker QR fixture</title>'}).catch(()=>{}));
 };
 this.sendMessage=async()=>{appendFileSync('/app/data/test-send-attempts','unexpected send\n');throw new Error('Docker test forbids sending');};
 return initialize.call(this);
};
