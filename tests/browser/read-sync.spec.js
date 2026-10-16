import {test,expect} from '@playwright/test';
import express from 'express';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {Store} from '../../server/db.js';
import {WhatsApp} from '../../server/whatsapp.js';
import {createApp,hashPassword} from '../../server/app.js';
import {replaceCatalog} from '../../server/catalog.js';
import {industrialStock} from '../fixtures/industrial-stock.js';
const pn='5511999999999@c.us';let hash;
async function fixture(){
 const store=new Store(':memory:');replaceCatalog(store,industrialStock,'read-browser');store.setSettings({agentEnabled:false});
 class Client extends EventEmitter{
  constructor(){super();this.info={wid:{_serialized:'5511000000000@c.us'}};this.sent=[];this.seen=[];this.unread=0;this.confirm=true;}
  async initialize(){}async destroy(){}async logout(){}
  async sendSeen(phone){this.seen.push(phone);if(this.confirm)this.unread=0;return this.confirm;}
  async sendMessage(phone,body){const id=randomUUID();this.sent.push({phone,body,id});return{id:{_serialized:id}};}
 }
 const client=new Client(),wa=new WhatsApp(store,'/tmp/cota-browser-read-fixture',{clientFactory:()=>client,logger:{error(){}}}),app=createApp({store,whatsapp:wa});hash??=hashPassword('read-browser-password-123');for(const[id,name,role]of[['admin','Robson','admin'],['sales','Bianca','comercial']])store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,id+'@example.test',hash,role,Date.now());await wa.connect();client.emit('ready');await wa.sync();
 const emit=async(body,from=pn)=>{client.unread++;client.emit('message',{from,body,type:'chat',timestamp:wa.readyAt+1,id:{_serialized:randomUUID(),fromMe:false},_data:{isNewMsg:true,notifyName:'Cliente MP'}});while(app.locals.agent.queues.size)await Promise.all([...app.locals.agent.queues.values()]);};
 app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 return{store,client,wa,app,emit,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{app.locals.close();await wa.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}};
}
async function login(page,f){await page.goto(f.url);await page.getByLabel('E-mail',{exact:true}).fill('admin@example.test');await page.getByLabel('Senha',{exact:true}).fill('read-browser-password-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await expect(page.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();}
test('premium panel reads opened and newly displayed messages; hidden panel waits for visibility',async({page})=>{
 const f=await fixture();try{
  await f.emit('oi vim pelo site');await login(page,f);expect(f.client.seen).toHaveLength(0);await page.locator('.chat-item').click();await expect(page.locator('.read-sync-status')).toHaveText('Leitura sincronizada com o WhatsApp');expect(f.client.unread).toBe(0);expect(f.client.sent).toHaveLength(0);
  await f.emit('cotar corr B 72');await expect.poll(()=>f.client.unread).toBe(0);await expect(page.locator('.message-body').last()).toHaveText('cotar corr B 72');
  await page.evaluate(()=>{window.readVisibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.readVisibility});document.dispatchEvent(new Event('visibilitychange'));});await f.emit('mensagem com o painel oculto');await expect(page.locator('.message-body').last()).toHaveText('mensagem com o painel oculto');expect(f.client.unread).toBe(1);
  await page.evaluate(()=>{window.readVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>f.client.unread).toBe(0);expect(f.client.sent).toHaveLength(0);await page.screenshot({path:'test-results/mp-premium-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect(page.getByLabel('Mensagem manual')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(await page.getByRole('button',{name:'Enviar mensagem',exact:true}).evaluate(button=>button.getBoundingClientRect().bottom<=innerHeight-66)).toBeTruthy();await page.screenshot({path:'test-results/mp-premium-mobile.png',fullPage:true});
 }finally{await page.goto('about:blank');await f.close();}
});
test('failed reading offers an explicit retry and does not send a customer message',async({page})=>{
 const f=await fixture();try{f.client.confirm=false;await f.emit('oi');await login(page,f);await page.locator('.chat-item').click();await expect(page.getByRole('button',{name:'Sincronizar leitura',exact:true})).toBeVisible();expect(f.client.unread).toBe(1);expect(f.client.sent).toHaveLength(0);f.client.confirm=true;await page.getByRole('button',{name:'Sincronizar leitura',exact:true}).click();await expect(page.locator('.read-sync-status')).toHaveText('Leitura sincronizada com o WhatsApp');expect(f.client.unread).toBe(0);expect(f.client.sent).toHaveLength(0);}finally{await page.goto('about:blank');await f.close();}
});
test('bot and manual replies clear phone unread; blue checks require a real client acknowledgement',async({page})=>{
 const f=await fixture();try{
  f.store.setSettings({agentEnabled:true});await f.emit('cotar corr B 72');expect(f.client.sent).toHaveLength(1);expect(f.client.unread).toBe(0);await login(page,f);await page.getByRole('tab',{name:/Histórico/}).click();await page.locator('.chat-item').click();await expect(page.locator('.message-body').last()).toContainText('R$');await expect(page.getByTitle('Lida pelo cliente',{exact:true})).toHaveCount(0);
  f.client.emit('message_ack',{to:pn,fromMe:true,id:{_serialized:f.client.sent[0].id}},3);await expect(page.getByTitle('Lida pelo cliente',{exact:true})).toHaveCount(1);
  await page.getByLabel('Mensagem manual').fill('Boa tarde, sou o Robson.');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(page.locator('.message-body').last()).toHaveText('Boa tarde, sou o Robson.');expect(f.client.sent).toHaveLength(2);expect(f.client.sent[1].body).toBe('*Robson*: Boa tarde, sou o Robson.');expect(f.client.unread).toBe(0);
 }finally{await page.goto('about:blank');await f.close();}
});
test('contact history and group view synchronize reading without taking over or sending',async({page})=>{
 const f=await fixture();try{
  await f.emit('quero cotar A89');const chat=f.store.chats()[0];f.store.pause(chat.id,null,'sales');f.store.run('INSERT INTO contacts VALUES(?,?,?,?,?,?,?)','contact','Cliente MP','5511999999999','','admin',Date.now(),Date.now());await f.emit('mensagem para leitura','123456@g.us');await login(page,f);await page.getByRole('button',{name:'Contatos',exact:true}).click();await page.getByRole('button',{name:'Ver histórico de Cliente MP',exact:true}).click();await expect(page.getByRole('dialog').locator('.read-sync-status')).toHaveText('Leitura sincronizada com o WhatsApp');expect(f.store.chat(chat.id).assigned_user_id).toBe('sales');expect(f.client.sent).toHaveLength(0);await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();await page.getByRole('button',{name:'Conversas',exact:true}).click();await page.getByRole('tab',{name:/Grupos/}).click();await page.locator('.chat-item').click();await expect(page.locator('.read-sync-status')).toHaveText('Leitura sincronizada com o WhatsApp');expect(f.client.seen).toContain('123456@g.us');expect(f.client.sent).toHaveLength(0);await expect(page.getByLabel('Mensagem manual')).toHaveCount(0);
 }finally{await page.goto('about:blank');await f.close();}
});
