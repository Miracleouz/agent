import wa from 'whatsapp-web.js';
import {seedAuthBrowser} from './auth-browser.js';
// Exercise the SDK's real initialize(), navigation listener and inject() in
// Chromium. Every page request is answered locally; no WhatsApp account exists.
export class AuthFixtureStrategy extends wa.NoAuth{
 async afterBrowserInitialized(){
  const page=this.client.pupPage;await page.setRequestInterception(true);
  page.on('request',request=>{request.respond({status:200,contentType:'text/html',body:'<!doctype html><title>Auth fixture</title><body>Local SDK fixture</body>'}).catch(()=>{});});
 }
}
export function authFixtureOptions(delay=50){return{authStrategy:new AuthFixtureStrategy(),authTimeoutMs:3000,webVersionCache:{type:'none'},puppeteer:{headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']},evalOnNewDoc:'('+seedAuthBrowser.toString()+')();setTimeout(()=>{window.authFixture.ready=true;},'+Number(delay)+');'};}
