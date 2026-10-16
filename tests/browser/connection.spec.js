import {test,expect} from '@playwright/test';
import express from 'express';
import {EventEmitter} from 'node:events';
import {resolve} from 'node:path';
import {Store} from '../../server/db.js';
import {WhatsApp} from '../../server/whatsapp.js';
import {createApp,hashPassword} from '../../server/app.js';
test('QR failure shows a specific safe reason and a retry generates a QR without sending or deleting the session',async({page})=>{
 const store=new Store(':memory:'),logs=[],clients=[];let starts=0,logouts=0,sends=0;
 class Client extends EventEmitter{async initialize(){if(++starts===1)throw new Error('The profile appears to be in use by another Chromium process at https://private-user:private-password@proxy.example/?token=private-token');this.emit('qr','browser-test-qr-not-for-pairing');}async destroy(){}async logout(){logouts++;}async sendMessage(){sends++;}}
 const whatsapp=new WhatsApp(store,'/tmp/cota-browser-connection-fake',{logger:{error:message=>logs.push(message)},clientFactory:()=>{const client=new Client();clients.push(client);return client;}}),app=createApp({store,whatsapp,production:true,appUrl:''});store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)','manager','Gestora Conexão','connection@example.test',hashPassword('connection-ui-fixture-123'),'admin',Date.now());app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByLabel('E-mail',{exact:true}).fill('connection@example.test');await page.getByLabel('Senha',{exact:true}).fill('connection-ui-fixture-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await page.getByRole('button',{name:'Gerar QR Code',exact:true}).click();await expect(page.locator('.inline-error')).toContainText('profile_busy');await expect(page.locator('.inline-error')).not.toContainText('private-password');await expect(page.getByAltText('QR Code para conectar seu WhatsApp')).toHaveCount(0);expect(logs).toHaveLength(1);expect(logs[0]).not.toContain('private-password');expect(logs[0]).not.toContain('private-token');
  await page.getByRole('button',{name:'Gerar QR Code',exact:true}).click();await expect(page.getByAltText('QR Code para conectar seu WhatsApp')).toBeVisible();await expect(page.locator('.inline-error')).toHaveCount(0);expect(clients).toHaveLength(2);expect(logouts).toBe(0);expect(sends).toBe(0);expect(store.chats()).toHaveLength(0);
 }finally{await page.goto('about:blank');app.locals.close();await whatsapp.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
});
