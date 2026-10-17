import wa from 'whatsapp-web.js';
import {seedAuthBrowser} from './auth-browser.js';
// Exercise the SDK's real initialize(), navigation listener and inject() in
// Chromium. Every page request is answered locally; no WhatsApp account exists.
export class AuthFixtureStrategy extends wa.NoAuth{
 constructor(stall=null){super();this.stall=stall;this.resourcePending=false;}
 async afterBrowserInitialized(){
  const page=this.client.pupPage;await page.setRequestInterception(true);
  page.on('request',request=>{if(this.stall==='document'||this.stall==='image'&&request.url().endsWith('/slow-image.png')){this.resourcePending=true;return;}request.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Auth fixture</title><body>Local SDK fixture'+(this.stall==='image'?'<img src="/slow-image.png">':'')+'</body>'}).catch(()=>{});});
 }
}
export function authFixtureOptions(delay=50,stall=null){return{authStrategy:new AuthFixtureStrategy(stall),authTimeoutMs:10000,webVersionCache:{type:'none'},puppeteer:{headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']},evalOnNewDoc:'('+seedAuthBrowser.toString()+')();setTimeout(()=>{window.authFixture.ready=true;},'+Number(delay)+');'};}
