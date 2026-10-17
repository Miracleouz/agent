import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer';
import {WhatsAppClient,authModulesReady} from '../server/whatsapp-client.js';
import {seedAuthBrowser} from './fixtures/auth-browser.js';

// Real Chromium persistence and real installed SDK injection, with a local
// application shell. This does not connect to WhatsApp or pair any account.
test('a stale service worker survives restart, then cache bypass restores QR without losing browser credentials',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'cota-stale-worker-'));
 const html='<!doctype html><script>('+seedAuthBrowser.toString()+')();window.authFixture.ready=true;</script>';
 const worker="self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(new Response('<!doctype html><title>Old cached shell without modules</title>',{headers:{'Content-Type':'text/html'}}));});";
 const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',req.url==='/sw.js'?'application/javascript':'text/html');res.end(req.url==='/sw.js'?worker:html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
 const launch=()=>puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,userDataDir:profile,args:['--no-sandbox','--disable-dev-shm-usage']});
 let browser,client;
 try{
  browser=await launch();let page=(await browser.pages())[0];await page.goto(url);
  await page.evaluate(async()=>{localStorage.setItem('auth-sentinel','keep-auth');await new Promise((resolve,reject)=>{const r=indexedDB.open('auth-sentinel',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('keys','readwrite');tx.objectStore('keys').put('keep-key','key');tx.oncomplete=()=>{db.close();resolve();};};});await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
  await page.reload();assert.equal(await page.evaluate(authModulesReady),false);
  await browser.close();browser=await launch();page=(await browser.pages())[0];await page.goto(url);
  assert.equal(await page.evaluate(authModulesReady),false,'old worker must still break authentication after restart');
  client=new WhatsAppClient({authTimeoutMs:3000,webVersionCache:{type:'none'}});client.pupBrowser=browser;client.pupPage=page;const qrs=[];client.on('qr',value=>qrs.push(value));
  await client.initWebVersionCache();await page.goto(url);assert.equal(await page.evaluate(authModulesReady),true);
  await client.inject();assert.equal(qrs.length,1);assert.match(qrs[0],/^test-reference,/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('auth-sentinel')),'keep-auth');
  assert.equal(await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('auth-sentinel');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('keys');const read=tx.objectStore('keys').get('key');read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};})),'keep-key');
  await client.destroy();browser=null;
 }finally{await client?.destroy().catch(()=>{});await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true});}
});

test('a cached application script is refreshed while LocalAuth data remains intact',async()=>{
 let script='window.cachedVersion="old"';const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.setHeader('Cache-Control',req.url==='/app.js'?'public, max-age=86400':'no-store');res.end(req.url==='/app.js'?script:'<!doctype html><script src="/app.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{const page=await browser.newPage(),url=`http://127.0.0.1:${server.address().port}/`;await page.goto(url);await page.evaluate(()=>localStorage.setItem('key','keep'));script='window.cachedVersion="current"';await page.goto(url);assert.equal(await page.evaluate(()=>window.cachedVersion),'old');const client=new WhatsAppClient({webVersionCache:{type:'none'}});client.pupPage=page;await client.initWebVersionCache();await page.goto(url);assert.equal(await page.evaluate(()=>window.cachedVersion),'current');assert.equal(await page.evaluate(()=>localStorage.getItem('key')),'keep');}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
