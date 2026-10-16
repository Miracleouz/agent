import {test,expect} from '@playwright/test';
import express from 'express';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import wa from 'whatsapp-web.js';
import {Store} from '../../server/db.js';
import {WhatsApp} from '../../server/whatsapp.js';
import {createApp,hashPassword} from '../../server/app.js';
import {seedBrokenRoster} from '../fixtures/broken-whatsapp-roster.js';
const require=createRequire(import.meta.url),{LoadUtils}=require('whatsapp-web.js/src/util/Injected/Utils.js');let hash;
async function fixture(browser){
 const linkedPage=await browser.newPage();await linkedPage.evaluate(seedBrokenRoster);await linkedPage.evaluate(LoadUtils);
 const client=new wa.Client(),sent=[];client.pupPage=linkedPage;client.info={wid:{_serialized:'5511888888888@c.us'}};client.initialize=async()=>client.emit('ready');client.destroy=async()=>{};client.getContactLidAndPhone=async()=>[];client.sendMessage=async(...args)=>{sent.push(args);return{id:{_serialized:'forbidden'}};};
 const store=new Store(':memory:'),whatsapp=new WhatsApp(store,'/tmp/cota-roster-browser-fixture',{clientFactory:()=>client,logger:{error(){}}}),app=createApp({store,whatsapp});hash??=hashPassword('roster-browser-password-123');store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)','admin','Gestor','admin@example.test',hash,'admin',Date.now());await whatsapp.connect();await whatsapp.sync();
 app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 return{app,store,whatsapp,client,linkedPage,sent,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{app.locals.close();await whatsapp.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await linkedPage.close();store.close();}};
}
async function login(page,f){await page.goto(f.url);await page.getByLabel('E-mail',{exact:true}).fill('admin@example.test');await page.getByLabel('Senha',{exact:true}).fill('roster-browser-password-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await expect(page.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();}
test('actual SDK r from a group recovers lists and history in Chromium without a real WhatsApp account',async({page,browser})=>{
 const f=await fixture(browser);try{
  await expect(f.client.getChats()).rejects.toThrow('r');await login(page,f);await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await expect(page.locator('.whatsapp-sync-status')).toContainText('2 conversas · 1 grupos · 30 contatos');await expect(page.locator('.whatsapp-sync-status')).toContainText('Histórico');
  await page.getByRole('button',{name:'Contatos',exact:true}).click();await expect(page.locator('.contacts-table tbody tr')).toHaveCount(30);await page.getByRole('button',{name:'Conversas',exact:true}).click();await page.getByRole('tab',{name:/Não lidas/}).click();await expect(page.locator('.chat-item')).toHaveCount(0);await page.getByRole('tab',{name:/Histórico/}).click();await expect(page.locator('.chat-item')).toHaveCount(2);await page.locator('.chat-item').filter({hasText:'Cliente Particular'}).click();await expect(page.locator('.message-body')).toContainText(['quero fechar B72']);expect(f.sent).toHaveLength(0);
  await page.getByRole('tab',{name:/Grupos/}).click();await expect(page.locator('.chat-item')).toContainText('Grupo com erro');await page.locator('.chat-item').click();await expect(page.getByText('Grupo em modo de consulta',{exact:true})).toBeVisible();expect(f.sent).toHaveLength(0);await page.screenshot({path:'test-results/roster-recovered-chromium.png',fullPage:true});
 }finally{await page.goto('about:blank');await f.close();}
});
test('30 imported contacts become visible even while bootstrap changes faster than the contacts request',async({page,browser})=>{
 const f=await fixture(browser);let pulse;try{
  await login(page,f);await page.route('**/api/contacts?*',async route=>{await new Promise(resolve=>setTimeout(resolve,650));await route.continue().catch(()=>{});});pulse=setInterval(()=>f.store.changed(),220);await page.getByRole('button',{name:'Contatos',exact:true}).click();await expect(page.locator('.contacts-table tbody tr')).toHaveCount(30,{timeout:4000});await expect(page.getByRole('cell',{name:'Contato importado 29',exact:true})).toBeVisible();expect(f.sent).toHaveLength(0);await page.screenshot({path:'test-results/contacts-during-sync.png',fullPage:true});
 }finally{clearInterval(pulse);await page.goto('about:blank');await f.close();}
});
test('unavailable chat collection reports its stage while existing contacts remain usable',async({page,browser})=>{
 const f=await fixture(browser);try{
  await f.linkedPage.evaluate(()=>{window.require('WAWebCollections').Chat.getModelsArray=()=>{throw new Error('r');};});await f.whatsapp.sync();await login(page,f);await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await expect(page.locator('.whatsapp-sync-status')).toContainText('Sincronização incompleta');await expect(page.locator('.sync-issues')).toContainText('chats/list_unavailable');await expect(page.locator('.sync-issues')).toContainText('lista de conversas e grupos');await page.getByRole('button',{name:'Contatos',exact:true}).click();await expect(page.locator('.contacts-table tbody tr')).toHaveCount(30);expect(f.sent).toHaveLength(0);
 }finally{await page.goto('about:blank');await f.close();}
});
