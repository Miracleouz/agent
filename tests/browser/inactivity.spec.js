import {test,expect} from '@playwright/test';
import express from 'express';
import {resolve} from 'node:path';
import {Store} from '../../server/db.js';
import {createApp} from '../../server/app.js';
import {replaceCatalog} from '../../server/catalog.js';
import {industrialStock} from '../fixtures/industrial-stock.js';
import {inactivityMessage} from '../../server/followups.js';

test('panel displays a single five-minute closure and only a new customer request reopens it',async({page})=>{
 const store=new Store(':memory:');replaceCatalog(store,industrialStock,'test');let clock=Date.now();
 const whatsapp={snapshot:()=>({status:'disconnected',transport:'qr',nativeButtons:false}),send:async()=>{throw new Error('Test must never send WhatsApp');}};
 const app=createApp({store,whatsapp,production:true,appUrl:''});const agent=app.locals.agent;agent.now=()=>clock;agent.followups.now=()=>clock;agent.followups.delivery.now=()=>clock;
 app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
 const server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByLabel('Seu nome').fill('Admin Teste');await page.getByLabel('E-mail',{exact:true}).fill('idle@example.test');await page.getByLabel('Senha',{exact:true}).fill('test-owner-idle-123');await page.getByRole('button',{name:'Criar meu painel'}).click();await expect(page.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();
  async function incoming(body){await page.getByRole('button',{name:'Testar agente',exact:true}).click();await page.getByLabel('Mensagem do cliente').fill(body);await page.getByRole('button',{name:'Enviar teste',exact:true}).click();}
  await incoming('oi vim pelo site');await expect(page.locator('.message-body').last()).toContainText('Olá, sou o agente ROBINHO');clock+=120000;await incoming('cotar B72');await expect(page.locator('.message-body').last()).toContainText('R$');
  clock+=299999;await agent.followups.check();expect(store.messages(store.chats()[0].id).filter(m=>m.body===inactivityMessage)).toHaveLength(0);clock++;await agent.followups.check();await expect(page.locator('.chat-notice')).toContainText('Conversa encerrada');await expect(page.locator('.message-body').last()).toHaveText(inactivityMessage);await expect(page.locator('.message').last().locator('.message-actions')).toHaveCount(0);
  const id=store.chats()[0].id,count=store.messages(id).filter(m=>m.direction==='bot').length;clock+=86400000;await agent.followups.check();await incoming('obgd');expect(store.messages(id).filter(m=>m.direction==='bot')).toHaveLength(count);await expect(page.locator('.chat-notice')).toContainText('Conversa encerrada');await page.screenshot({path:'test-results/inactivity-closure.png',fullPage:true});
  await incoming('cotar A89');await expect(page.locator('.message-body').last()).toContainText('R$');expect(store.chat(id).closed_at).toBeNull();
 }finally{app.locals.close();await page.goto('about:blank');server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
});
