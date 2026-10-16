import {test,expect} from '@playwright/test';
import express from 'express';
import {EventEmitter} from 'node:events';
import {resolve} from 'node:path';
import {Store} from '../../server/db.js';
import {WhatsApp} from '../../server/whatsapp.js';
import {createApp,hashPassword} from '../../server/app.js';
let passwordHash;
async function fixture(){
 const store=new Store(':memory:'),pn='5511999999999@c.us',group='123@g.us',old=Math.floor(Date.now()/1000)-600,sent=[];
 const messages=[{id:{_serialized:'old-client'},from:pn,to:'5511000000000@c.us',type:'chat',body:'quero separar B72',timestamp:old},{id:{_serialized:'old-reply',fromMe:true},fromMe:true,from:'5511000000000@c.us',to:pn,type:'chat',body:'Resposta antiga do WhatsApp',timestamp:old+1}];
 const remote={id:{_serialized:pn},name:'Cliente Sincronizado',timestamp:old+1,unreadCount:2,lastMessage:messages[1],fetchMessages:async()=>messages};
 class Client extends EventEmitter{constructor(){super();this.info={wid:{_serialized:'5511000000000@c.us',user:'5511000000000'}};this.contacts=[{id:{_serialized:pn},name:'Cliente Sincronizado',isMyContact:true,isWAContact:true}];}async initialize(){this.emit('ready');}async destroy(){}async logout(){}async getChats(){return[remote,{id:{_serialized:group},name:'Grupo Sincronizado',isGroup:true}];}async getContacts(){return this.contacts;}async getContactLidAndPhone(){return[];}async sendMessage(...args){sent.push(args);return{id:{_serialized:'never'}};}}
 const client=new Client(),wa=new WhatsApp(store,'/tmp/cota-sync-browser-fake',{clientFactory:()=>client}),app=createApp({store,whatsapp:wa});passwordHash??=hashPassword('sync-browser-fixture-123');for(const[id,name,role]of[['manager','Gestora Sync','admin'],['sales','Comercial Sync','comercial']])store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,id+'@example.test',passwordHash,role,Date.now());app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});return{store,wa,app,client,sent,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{app.locals.close();await wa.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}};
}
async function login(page,f,email){await page.goto(f.url);await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill('sync-browser-fixture-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await expect(page.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();}
test('connecting fills contacts, groups and private history without answering any imported message',async({page})=>{
 const f=await fixture();try{
  await login(page,f,'manager@example.test');await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await page.getByRole('button',{name:'Gerar QR Code',exact:true}).click();await expect(page.locator('.whatsapp-sync-status')).toContainText('1 conversas · 1 grupos · 1 contatos');
  await page.getByRole('button',{name:'Contatos',exact:true}).click();await expect(page.locator('.contacts-table')).toContainText('Cliente Sincronizado');await expect(page.locator('.contacts-table')).toContainText('+5511999999999');
  await page.getByRole('button',{name:'Conversas',exact:true}).click();await page.getByRole('tab',{name:/Grupos/}).click();await expect(page.locator('.chat-item')).toContainText('Grupo Sincronizado');await page.locator('.chat-item').click();await expect(page.getByText('Grupo em modo de consulta',{exact:true})).toBeVisible();await expect(page.getByLabel('Mensagem manual')).toHaveCount(0);
  await page.getByRole('tab',{name:/Não lidas/}).click();await page.locator('.chat-item').filter({hasText:'Cliente Sincronizado'}).click();await expect(page.locator('.message-body')).toContainText(['quero separar B72','Resposta antiga do WhatsApp']);await expect(page.getByText('Histórico do WhatsApp · somente consulta',{exact:true})).toHaveCount(2);expect(f.sent).toHaveLength(0);expect(f.store.chats()[0].service_origin_id).toBeNull();await page.screenshot({path:'test-results/whatsapp-synced-history.png',fullPage:true});
 }finally{await page.goto('about:blank');await f.close();}
});
test('Admin can resync contacts while existing responsibility and historical messages remain shared correctly',async({page,browser})=>{
 const f=await fixture();let context;try{
  await f.wa.connect();await f.wa.sync();await login(page,f,'manager@example.test');await page.locator('.chat-item').filter({hasText:'Cliente Sincronizado'}).click();await expect(page.locator('.message-body')).toHaveCount(2);await page.getByRole('button',{name:'Transferir',exact:true}).click();await page.getByLabel('Responsável pelo atendimento').selectOption('sales');await page.getByRole('button',{name:'Confirmar transferência',exact:true}).click();
  f.client.contacts.push({id:{_serialized:'5511988888888@c.us'},name:'Segundo Contato',isMyContact:true,isWAContact:true});await page.getByRole('button',{name:'Contatos',exact:true}).click();await page.getByRole('button',{name:'Sincronizar WhatsApp',exact:true}).click();await expect(page.locator('.contacts-table')).toContainText('Segundo Contato');expect(f.store.chats()[0].assigned_user_id).toBe('sales');
  context=await browser.newContext();const sales=await context.newPage();await login(sales,f,'sales@example.test');await sales.getByRole('tab',{name:/Conversas · Comercial Sync/}).click();await sales.locator('.chat-item').click();await expect(sales.locator('.message-body')).toContainText(['quero separar B72','Resposta antiga do WhatsApp']);await sales.getByRole('button',{name:'Contatos',exact:true}).click();await expect(sales.locator('.contacts-table')).toContainText('Segundo Contato');await expect(sales.getByRole('button',{name:'Sincronizar WhatsApp',exact:true})).toHaveCount(0);expect(f.sent).toHaveLength(0);
 }finally{await context?.close();await page.goto('about:blank');await f.close();}
});
