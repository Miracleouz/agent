import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ExcelJS from 'exceljs';
import {Store} from '../server/db.js';
import {createApp} from '../server/app.js';
const csv='sku;produto;marca;medida;preco;quantidade\n1;Correia;Gates;A42;49,90;12\n2;Correia;Optibelt;A42;55,90;3';
async function fixture(t){const dir=mkdtempSync(join(tmpdir(),'cota-api-'));const store=new Store(join(dir,'db.sqlite'));const whatsapp={snapshot:()=>({status:'disconnected'}),send:async()=>{throw new Error('WhatsApp desconectado');},connect:async()=>({status:'starting'}),disconnect:async()=>{}};const app=createApp({store,whatsapp});t.after(()=>{app.locals.close();store.close();rmSync(dir,{recursive:true,force:true});});const owner=request.agent(app);await owner.post('/api/auth/setup').set('X-Cota-Request','1').send({name:'Dono teste',email:'dono@example.test',password:'password-secure-123'}).expect(201);return{app,owner,store};}
const post=(owner,url)=>owner.post(url).set('X-Cota-Request','1');
test('owner auth required; bootstrap claim locked; CSRF/cross-origin blocked',async t=>{const{app,owner}=await fixture(t);await request(app).get('/api/bootstrap').expect(401);await post(owner,'/api/auth/setup').send({}).expect(409);await owner.post('/api/settings').send({}).expect(403);await post(owner,'/api/whatsapp/connect').set('Origin','https://evil.test').expect(403);const b=await owner.get('/api/bootstrap').expect(200);assert.equal(b.body.settings.businessName,'Minha loja');});
test('preview does not mutate stock; confirmed import replaces atomically; invalid import preserves it',async t=>{const{owner,store}=await fixture(t);const p=await post(owner,'/api/stock/preview').attach('file',Buffer.from(csv),'estoque.csv').expect(200);assert.equal(p.body.count,2);assert.equal(store.all('SELECT * FROM products').length,0);await post(owner,'/api/stock/import').field('confirm','replace').attach('file',Buffer.from(csv),'estoque.csv').expect(200);assert.equal(store.all('SELECT * FROM products').length,2);await post(owner,'/api/stock/import').field('confirm','replace').attach('file',Buffer.from(csv.replace('55,90','errado')),'estoque.csv').expect(400);assert.equal(store.all('SELECT * FROM products').length,2);const newer=csv.split('\n').slice(0,2).join('\n');await post(owner,'/api/stock/import').field('confirm','replace').attach('file',Buffer.from(newer),'novo.csv').expect(200);assert.equal(store.all('SELECT * FROM products').length,1);});
test('Excel import preview reads numeric and currency cells correctly',async t=>{const{owner}=await fixture(t);const wb=new ExcelJS.Workbook();const sheet=wb.addWorksheet('Estoque');sheet.addRow(['Código','Descrição','Fabricante','Medida','Preço de venda','Saldo']);sheet.addRow(['G-A42','Correia em V','Gates','A-42',59.9,10]);const buffer=Buffer.from(await wb.xlsx.writeBuffer());const r=await post(owner,'/api/stock/preview').attach('file',buffer,'estoque.xlsx').expect(200);assert.equal(r.body.preview[0].price,59.9);assert.equal(r.body.count,1);});
test('manual send requires explicit takeover; human request flags chat; resume clears alert',async t=>{const{owner,store}=await fixture(t);const r=await post(owner,'/api/simulator/message').send({body:'A42'}).expect(201);const id=r.body.chatId;await post(owner,`/api/chats/${id}/send`).send({body:'Olá'}).expect(409);await post(owner,`/api/chats/${id}/pause`).send({minutes:30}).expect(200);const sent=await post(owner,`/api/chats/${id}/send`).send({body:'Eu vou te atender!'}).expect(201);assert.equal(sent.body.direction,'owner');await post(owner,'/api/simulator/message').send({body:'ATENDENTE'}).expect(201);assert.equal(store.chat(id).needs_human,1);await post(owner,`/api/chats/${id}/resume`).expect(200);assert.equal(store.chat(id).needs_human,0);assert.equal(store.chat(id).mode,'auto');});
test('global agent disable suppresses bot responses but preserves incoming messages',async t=>{const{owner,store}=await fixture(t);await owner.patch('/api/settings').set('X-Cota-Request','1').send({agentEnabled:false}).expect(200);const r=await post(owner,'/api/simulator/message').send({body:'A42'}).expect(201);assert.equal(store.messages(r.body.chatId).length,1);assert.equal(store.messages(r.body.chatId)[0].direction,'in');});
test('owner receives purchase reason and chosen quote in the dashboard then clears it on resume',async t=>{
 const{owner,store}=await fixture(t);const first=await post(owner,'/api/simulator/message').send({body:'A42'}).expect(201);
 await post(owner,'/api/simulator/message').send({body:'2'}).expect(201);
 assert.equal(store.chat(first.body.chatId).needs_human,0);
 await post(owner,'/api/simulator/message').send({body:'quero fechar'}).expect(201);
 const dashboard=await owner.get('/api/bootstrap').expect(200);const chat=dashboard.body.chats.find(chat=>chat.id===first.body.chatId);
 assert.equal(chat.handoff_reason,'purchase');assert.equal(chat.needs_human,1);assert.match(chat.purchase_summary,/Opção 2/);
 await post(owner,`/api/chats/${chat.id}/resume`).expect(200);assert.equal(store.chat(chat.id).handoff_reason,null);
});
test('owner controls the idle delay and cannot enable sub-five-minute followups',async t=>{
 const{owner,store}=await fixture(t);assert.equal(store.settings().followupMinutes,5);
 await owner.patch('/api/settings').set('X-Cota-Request','1').send({followupMinutes:1}).expect(400);
 await owner.patch('/api/settings').set('X-Cota-Request','1').send({followupMinutes:10}).expect(200);assert.equal(store.settings().followupMinutes,10);
 await post(owner,'/api/simulator/message').send({body:'A42'}).expect(201);assert.equal(store.chats()[0].followup_state,'scheduled');
 await owner.patch('/api/settings').set('X-Cota-Request','1').send({followupMinutes:0}).expect(200);assert.equal(store.chats()[0].followup_due_at,null);
});
test('persisted sessions are hashed, password changes invalidate other sessions',async t=>{const{app,owner,store}=await fixture(t);const other=request.agent(app);await post(other,'/api/auth/login').send({email:'dono@example.test',password:'password-secure-123'}).expect(200);await post(owner,'/api/auth/password').send({current:'password-secure-123',password:'new-password-123'}).expect(200);await other.get('/api/bootstrap').expect(401);await owner.get('/api/bootstrap').expect(200);assert(!store.get('SELECT password FROM owner').password.includes('new-password-123'));});
test('catalog pagination searches all rows and reports items without sale prices',async t=>{
 const{owner}=await fixture(t);await post(owner,'/api/stock/import').field('confirm','replace').attach('file',Buffer.from(csv),'estoque.csv').expect(200);const r=await owner.get('/api/products?search=Gates&page=0').expect(200);assert.equal(r.body.total,1);assert.equal(r.body.items[0].brand,'Gates');assert.equal(r.body.limit,100);assert.equal(r.body.unpriced,0);
});
