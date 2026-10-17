import {test,expect} from '@playwright/test';
import express from 'express';
import puppeteer from 'puppeteer';
import {resolve} from 'node:path';
import {liveRuntime} from '../fixtures/live-runtime.js';
import {hashPassword} from '../../server/app.js';
let hash;
async function fixture(){
 const linkedBrowser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),linkedPage=await linkedBrowser.newPage(),f=await liveRuntime({page:linkedPage});
 hash??=hashPassword('realtime-browser-fixture-123');f.store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)','admin','Robson','live@example.test',hash,'admin',Date.now());f.app.use(express.static(resolve('dist')));f.app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));const server=await new Promise(resolve=>{const instance=f.app.listen(0,'127.0.0.1',()=>resolve(instance));});
 return{...f,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await f.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await linkedBrowser.close();}};
}
async function login(page,f){await page.goto(f.url);await page.getByLabel('E-mail',{exact:true}).fill('live@example.test');await page.getByLabel('Senha',{exact:true}).fill('realtime-browser-fixture-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await expect(page.getByRole('heading',{name:'Conversas',exact:true})).toBeVisible();}
test('live browser events push incoming, bot, signed panel reply and mobile reply without reload or a 15-second poll',async({page})=>{
 const f=await fixture();try{
  // Fail the test if it accidentally depends on the fallback refresh interval.
  await page.addInitScript(()=>{const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===15000?-1:interval(fn,ms,...args);});await login(page,f);await page.getByRole('tab',{name:/Histórico/}).click();await f.page.evaluate(()=>{window.liveFixture.failSerialize=true;});await f.add({id:'ui-inbound',body:'cotar corr B 72'});
  await expect(page.locator('.chat-item')).toContainText('R$',{timeout:3000});await page.locator('.chat-item').click();await expect(page.locator('.message-body')).toContainText(['cotar corr B 72','R$'],{timeout:3000});expect(await f.sent()).toHaveLength(1);
  await page.getByLabel('Mensagem manual').fill('Robson atendendo pelo Cota');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(page.locator('.message-body').last()).toHaveText('Robson atendendo pelo Cota');expect((await f.sent()).at(-1).body).toBe('*Robson*: Robson atendendo pelo Cota');
  await f.add({id:'ui-mobile',fromMe:true,to:'5511999999999@c.us',body:'Respondido pelo celular'});await expect(page.locator('.message-body').last()).toHaveText('Respondido pelo celular',{timeout:3000});await expect(page.locator('.message-role').last()).toContainText('Enviado pelo WhatsApp');expect(await f.sent()).toHaveLength(2);expect(f.store.messages(f.store.chats()[0].id)).toHaveLength(4);
 }finally{await page.goto('about:blank').catch(()=>{});await f.close();}
});
test('a continuous import cannot starve push updates and contact history displays only the last 30 days',async({page})=>{
 const f=await fixture();let pulse;try{
  const chat=f.store.chats()[0],old=f.store.addMessage({chatId:chat.id,direction:'in',body:'Mensagem de 31 dias não deve aparecer'});f.store.run('UPDATE messages SET created=? WHERE id=?',Date.now()-31*86400000,old.id);const recent=f.store.addMessage({chatId:chat.id,direction:'in',body:'Histórico recente de 29 dias'});f.store.run('UPDATE messages SET created=? WHERE id=?',Date.now()-29*86400000,recent.id);await login(page,f);await page.getByRole('tab',{name:/Histórico/}).click();await page.locator('.chat-item').click();await expect(page.locator('.message-body')).toContainText(['Histórico recente de 29 dias']);await expect(page.getByText('Mensagem de 31 dias não deve aparecer',{exact:true})).toHaveCount(0);
  await page.route('**/api/bootstrap',async route=>{await new Promise(resolve=>setTimeout(resolve,450));await route.continue().catch(()=>{});});pulse=setInterval(()=>f.store.changed(),50);await f.add({id:'ui-burst',fromMe:true,to:'5511999999999@c.us',body:'Atualização durante importação contínua'});await expect(page.locator('.message-body').last()).toHaveText('Atualização durante importação contínua',{timeout:3500});clearInterval(pulse);pulse=null;
  await page.getByRole('button',{name:'Contatos',exact:true}).click();await page.getByRole('button',{name:'Ver histórico de Cliente MP',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Histórico recente de 29 dias');await expect(page.getByRole('dialog')).not.toContainText('Mensagem de 31 dias não deve aparecer');expect(f.store.messages(chat.id).some(row=>row.id===old.id)).toBe(true);expect(await f.sent()).toHaveLength(0);
 }finally{clearInterval(pulse);await page.goto('about:blank').catch(()=>{});await f.close();}
});
test('sync button imports browser history into the panel and active bot answers while disabled bot stays silent',async({page})=>{
 const f=await fixture();try{
  await f.page.evaluate(()=>{for(const[age,id,body]of[[29*86400,'provider-day29','Histórico real da coleção de 29 dias'],[31*86400,'provider-day31','Mensagem de 31 dias fora da janela']]){const row=window.liveFixture.make({id,age,body,fresh:false});window.sendFixture.records.set(id,row);}});await login(page,f);
  await page.getByRole('button',{name:'WhatsApp',exact:true}).click();await page.getByRole('button',{name:'Sincronizar WhatsApp',exact:true}).click();await expect.poll(()=>f.store.get("SELECT count(*) n FROM messages WHERE provider_id='provider-day29'").n).toBe(1);expect(await f.sent()).toHaveLength(0);
  await page.getByRole('button',{name:'Ver diagnóstico de mensagens',exact:true}).click();await expect(page.locator('.sync-diagnostics pre')).toContainText('"attached": true');await page.getByRole('button',{name:'Conversas',exact:true}).click();await page.getByRole('tab',{name:/Histórico/}).click();await page.locator('.chat-item').click();await expect(page.locator('.message-body')).toContainText(['Histórico real da coleção de 29 dias']);await expect(page.getByText('Mensagem de 31 dias fora da janela',{exact:true})).toHaveCount(0);
  // Opening claims the chat in manual mode. Release it with the agent enabled.
  await page.getByRole('button',{name:'Reativar agente',exact:true}).click();await f.add({id:'ui-enabled-bot',body:'cotar B72'});await expect(page.locator('.message-body')).toContainText(['R$'],{timeout:3000});expect(await f.sent()).toHaveLength(1);
  f.store.setSettings({agentEnabled:false});await f.add({id:'ui-disabled-bot',body:'preço correia A89'});await expect(page.locator('.message-body').last()).toHaveText('preço correia A89',{timeout:3000});expect(await f.sent()).toHaveLength(1);
 }finally{await page.goto('about:blank').catch(()=>{});await f.close();}
});
