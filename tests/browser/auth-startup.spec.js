import {test,expect} from '@playwright/test';
import express from 'express';
import {resolve} from 'node:path';
import {Store} from '../../server/db.js';
import {WhatsApp} from '../../server/whatsapp.js';
import {WhatsAppClient} from '../../server/whatsapp-client.js';
import {createApp,hashPassword} from '../../server/app.js';
import {authFixtureOptions} from '../fixtures/auth-sdk-client.js';
let hash;
async function fixture(){
 const store=new Store(':memory:'),clients=[],sent=[],qrs=[],logs=[],whatsapp=new WhatsApp(store,'/tmp/cota-browser-auth-guard',{clientFactory:options=>{const client=new WhatsAppClient({...options,...authFixtureOptions(150)});client.on('qr',qr=>qrs.push(qr));client.sendMessage=async(...args)=>{sent.push(args);throw new Error('No sends allowed in authentication tests');};clients.push(client);return client;},logger:{error:line=>logs.push(line)}}),app=createApp({store,whatsapp});hash??=hashPassword('auth-browser-password-123');store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)','admin','Gestora Auth','auth@example.test',hash,'admin',Date.now());app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});return{store,whatsapp,app,clients,sent,qrs,logs,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{app.locals.close();await whatsapp.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}};
}
async function open(page,f){await page.goto(f.url);await page.getByLabel('E-mail',{exact:true}).fill('auth@example.test');await page.getByLabel('Senha',{exact:true}).fill('auth-browser-password-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await page.getByRole('button',{name:'Gerar QR Code',exact:true}).click();await expect(page.getByAltText('QR Code para conectar seu WhatsApp')).toBeVisible();}
test('installed SDK waits for Socket and keeps QR available after actual Chromium reload',async({page})=>{
 const f=await fixture();try{await open(page,f);expect(f.qrs).toHaveLength(1);await f.clients[0].pupPage.reload({waitUntil:'load'});await expect.poll(()=>f.qrs.length).toBe(2);await expect(page.getByAltText('QR Code para conectar seu WhatsApp')).toBeVisible();await expect(page.locator('.inline-error')).toHaveCount(0);expect(f.clients).toHaveLength(1);expect(f.sent).toHaveLength(0);expect(f.store.chats()).toHaveLength(0);await page.screenshot({path:'test-results/auth-socket-reload-qr.png',fullPage:true});}finally{await page.goto('about:blank');await f.close();}
});
test('SDK detached Frame keeps server alive and a new QR attempt works without clearing data',async({page})=>{
 const f=await fixture();try{await open(page,f);f.clients[0].inject=async()=>{throw new Error("Attempted to use detached Frame 'private-test-frame'");};await f.clients[0].pupPage.reload({waitUntil:'load'}).catch(()=>{});await expect(page.locator('.inline-error')).toContainText('page_reloaded');await expect(page.locator('.inline-error')).not.toContainText('private-test-frame');expect((await page.request.get(f.url+'/api/health')).ok()).toBeTruthy();await page.getByRole('button',{name:'Gerar QR Code',exact:true}).click();await expect(page.getByAltText('QR Code para conectar seu WhatsApp')).toBeVisible();await expect(page.locator('.inline-error')).toHaveCount(0);expect(f.clients).toHaveLength(2);expect(f.sent).toHaveLength(0);expect(f.store.get('SELECT count(*) n FROM users').n).toBe(1);}finally{await page.goto('about:blank');await f.close();}
});
