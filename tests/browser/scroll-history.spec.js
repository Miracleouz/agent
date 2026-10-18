import {test,expect} from '@playwright/test';
import express from 'express';
import {resolve} from 'node:path';
import {Store} from '../../server/db.js';
import {createApp,hashPassword} from '../../server/app.js';

async function fixture(group){
 const store=new Store(':memory:'),whatsapp={snapshot:()=>({status:'ready'}),send:async()=>{throw new Error('Scrolling must not send messages');}};
 const app=createApp({store,whatsapp,production:true,appUrl:''});store.setSettings({agentEnabled:false});
 store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)','admin','Robson','scroll@example.test',hashPassword('scroll-test-only-123'),'admin',1);
 const id=group?'123456@g.us':'scroll-chat',start=Date.now()-3600000;
 if(!group)store.run("INSERT INTO chats(id,phone,name,channel,provider,mode,assigned_user_id,updated,last_inbound) VALUES(?,?,'Cliente do histórico','whatsapp','qr','manual','admin',?,0)",id,'5511999999999@c.us',start);
 const add=(body,created)=>{if(group){store.addGroupMessage({id,name:'Grupo do histórico',providerId:'group-'+created,author:'Cliente',body,created});return store.get('SELECT id FROM whatsapp_group_messages WHERE provider_id=?','group-'+created).id;}const m=store.addMessage({chatId:id,direction:'in',providerId:'private-'+created,body});store.run('UPDATE messages SET created=? WHERE id=?',created,m.id);return m.id;};
 for(let i=0;i<100;i++)add(`Mensagem ${i}: registro do atendimento para leitura do histórico. `.repeat(3),start+i*1000);
 app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 return{store,add,start,id,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{app.locals.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}};
}
async function login(page,f,group){await page.goto(f.url);await page.getByLabel('E-mail',{exact:true}).fill('scroll@example.test');await page.getByLabel('Senha',{exact:true}).fill('scroll-test-only-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await page.getByRole('tab',{name:group?/^Grupos/:/^Conversas · Robson/}).click();await page.locator('.chat-item').click();await expect(page.locator('.messages .message')).toHaveCount(100);}
async function anchor(page){return page.locator('.messages').evaluate(node=>{const top=node.getBoundingClientRect().top,m=[...node.querySelectorAll('.message')].find(m=>m.getBoundingClientRect().bottom>top);return{body:m.querySelector('.message-body').textContent,offset:m.getBoundingClientRect().top-top};});}
async function preserved(page,before){await expect.poll(()=>page.locator('.messages').evaluate((node,before)=>{const m=[...node.querySelectorAll('.message')].find(m=>m.querySelector('.message-body').textContent===before.body);return m?Math.abs(m.getBoundingClientRect().top-node.getBoundingClientRect().top-before.offset):9999;},before)).toBeLessThan(3);}

for(const group of [false,true])for(const mobile of [false,true])test(`${group?'group':'private'} history keeps reading position through live refresh, new messages and older history (${mobile?'mobile':'desktop'})`,async({page})=>{
 const f=await fixture(group);try{
  if(mobile)await page.setViewportSize({width:390,height:844});await login(page,f,group);const list=page.locator('.messages');
  const bottom=()=>list.evaluate(n=>n.scrollHeight-n.clientHeight-n.scrollTop);
  await expect.poll(bottom).toBeLessThan(64);await list.hover();await page.mouse.wheel(0,-1800);await expect.poll(bottom).toBeGreaterThan(900);const before=await anchor(page);
  // Same messages are re-fetched on every live change, including receipts.
  for(let i=0;i<3;i++){const table=group?'whatsapp_group_messages':'messages',key=group?'group_id':'chat_id';f.store.run(`UPDATE ${table} SET body=? WHERE ${key}=? AND created=?`,'Atualização de confirmação '+i,f.id,f.start);f.store.changed();await expect(page.locator('.message-body').filter({hasText:'Atualização de confirmação '+i})).toHaveCount(1);await preserved(page,before);}
  f.add('Mensagem nova enquanto estou lendo acima',Date.now());await expect(page.locator('.message-body').filter({hasText:'Mensagem nova enquanto estou lendo acima'})).toHaveCount(1);await preserved(page,before);
  f.add('Histórico anterior carregado agora',f.start-86400000);f.store.changed();await expect(page.locator('.message-body').filter({hasText:'Histórico anterior carregado agora'})).toHaveCount(1);await preserved(page,before);
  if(!group){
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;c.getContext('2d').fillRect(0,0,600,400);return c.toDataURL('image/png').split(',')[1];});
   let release;const gate=new Promise(r=>release=r),pattern='**/api/chats/*/messages/*/media';await page.route(pattern,async route=>{await gate;await route.continue();});
   try{const m=f.store.get('SELECT id FROM messages WHERE chat_id=? AND created=?',f.id,f.start);f.store.run("UPDATE messages SET media_type='image/png',media_kind='image',media_data=? WHERE id=?",Buffer.from(png,'base64'),m.id);f.store.changed();const image=list.locator('img.chat-photo');await expect(image).toHaveCount(1);await image.evaluate(img=>{img.loading='eager';});release();await expect.poll(()=>image.evaluate(img=>img.naturalHeight)).toBe(400);await preserved(page,before);}finally{release();await page.unroute(pattern);}
  }
  await list.evaluate(n=>{n.scrollTop=n.scrollHeight;});await expect.poll(bottom).toBeLessThan(3);
  f.add('Mensagem acompanhada no fim da conversa',Date.now()+1000);await expect(page.locator('.message-body').filter({hasText:'Mensagem acompanhada no fim da conversa'})).toHaveCount(1);await expect.poll(bottom).toBeLessThan(3);
 }finally{await page.goto('about:blank');await f.close();}
});
