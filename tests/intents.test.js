import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../server/db.js';
import {Agent} from '../server/agent.js';
import {classifyMessage,quoteSearchText} from '../server/intents.js';
import {demoProducts,replaceCatalog} from '../server/catalog.js';
import {commercialCases} from './fixtures/commercial-messages.js';

function fixture(t){
 const store=new Store(':memory:');replaceCatalog(store,demoProducts,'test');
 const sent=[];const agent=new Agent(store,async(chat,body)=>{sent.push(body);return randomUUID();});
 t.after(()=>store.close());
 const receive=(body,extra={})=>agent.receive({body,phone:'5511999999999@c.us',channel:'whatsapp',provider:'qr',...extra});
 return{store,sent,receive};
}

test('commercial corpus has at least 100 unique, explicitly labeled messages',()=>{
 assert(commercialCases.length>=100);assert.equal(new Set(commercialCases.map(item=>item.text)).size,commercialCases.length);
});
for(const {text,expected,group} of commercialCases){
 test(`intenção ${group}: ${text}`,async t=>{
  const{store,sent,receive}=fixture(t);const first=await receive('A42');
  const stockBefore=store.all('SELECT sku,quantity FROM products ORDER BY sku');
  const options=JSON.parse(store.chat(first.chatId).quoted_options);
  assert.equal(classifyMessage(text,{options}).type,expected);
  const result=await receive(text);const chat=store.chat(first.chatId);
  assert.equal(result.intent,expected);assert.equal(chat.needs_human,expected==='purchase'?1:0);
  assert.equal(chat.mode,expected==='purchase'?'manual':'auto');
  assert.equal(sent.length,2);
  if(expected==='purchase'){
   assert.equal(chat.handoff_reason,'purchase');assert(chat.purchase_summary);
   assert.match(sent.at(-1),/fechar uma compra/);assert.match(sent.at(-1),/ainda não está confirmado/);
  }else if(expected==='quote'){
   assert.match(sent.at(-1),/R\$/);assert.doesNotMatch(sent.at(-1),/Avisei|fechar uma compra/);
   // Quote requests must also work as the first message, without borrowing an earlier reference.
   const fresh=await receive(text,{phone:'5511888888888@c.us'});
   assert.equal(fresh.intent,'quote');assert.equal(store.chat(fresh.chatId).needs_human,0);assert.match(sent.at(-1),/R\$/);
  }else{
   assert.match(sent.at(-1),/COTAR.*FECHAR PEDIDO/);assert.equal(chat.handoff_reason,null);
  }
  assert.deepEqual(store.all('SELECT sku,quantity FROM products ORDER BY sku'),stockBefore);
 });
}

test('bare selection asks intent and subsequent purchase retains the chosen option',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');const options=JSON.parse(store.chat(r.chatId).quoted_options);
 await receive('2');assert.equal(store.chat(r.chatId).needs_human,0);assert.equal(store.chat(r.chatId).pending_selection,1);
 await receive('quero fechar');const chat=store.chat(r.chatId);
 assert.equal(chat.handoff_reason,'purchase');assert.match(chat.purchase_summary,new RegExp(options[1].brand));
 assert.match(chat.purchase_summary,/Opção 2/);assert.match(sent.at(-1),/opção 2/);
});
test('bare selection followed by COTAR quotes the selected item without pausing',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');const options=JSON.parse(store.chat(r.chatId).quoted_options);
 await receive('2');await receive('COTAR');assert.equal(store.chat(r.chatId).needs_human,0);
 assert.match(sent.at(-1),/1 opção/);assert.match(sent.at(-1),new RegExp(options[1].brand));
});
test('a new explicit belt reference supersedes an earlier ambiguous choice',async t=>{
 const{store,receive}=fixture(t);const r=await receive('A42');await receive('2');
 await receive('quero comprar PJ350 com 5 frisos');const chat=store.chat(r.chatId);
 assert.equal(chat.handoff_reason,'purchase');assert.match(chat.purchase_summary,/PJ350 com 5 frisos/);
 assert.doesNotMatch(chat.purchase_summary,/Opção 2:/);
});
test('asking the selected option price remains a quote',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');const options=JSON.parse(store.chat(r.chatId).quoted_options);
 await receive('Quanto custa a segunda?');assert.equal(store.chat(r.chatId).mode,'auto');
 assert.match(sent.at(-1),/1 opção/);assert.match(sent.at(-1),new RegExp(options[1].brand));
});
test('purchase on a later page uses its visible numbering and survives agent restart',async t=>{
 const{store,receive}=fixture(t);const r=await receive('A42');await receive('MAIS');
 const options=JSON.parse(store.chat(r.chatId).quoted_options);assert.equal(options.length,3);
 const restarted=new Agent(store,async()=>randomUUID());
 await restarted.receive({body:'vou levar a primeira',phone:'5511999999999@c.us',channel:'whatsapp',provider:'qr'});
 assert.match(store.chat(r.chatId).purchase_summary,new RegExp(options[0].brand));
});
test('invalid option never becomes a purchase or fabricates an item',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');
 for(const text of ['quero a opção 9','vou levar a opção 0','quero a opção 8']){
  await receive(text);assert.equal(store.chat(r.chatId).mode,'auto');assert.match(sent.at(-1),/não está na última cotação/);
 }
});
test('direct purchase without a prior quote alerts the owner without inventing price or brand',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('quero comprar uma correia PJ350 5 frisos');
 assert.equal(store.chat(r.chatId).handoff_reason,'purchase');assert.match(store.chat(r.chatId).purchase_summary,/PJ350 5 frisos/);
 assert.doesNotMatch(sent.at(-1),/R\$|Gates/);
});
test('repeated purchase messages acknowledge once and preserve the chosen item',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');await receive('quero a segunda');const before=store.chat(r.chatId).purchase_summary;
 await receive('ATENDENTE');await receive('quero fechar');await receive('oi?');assert.equal(sent.length,2);assert.equal(store.chat(r.chatId).purchase_summary,before);
 assert.equal(store.chat(r.chatId).handoff_reason,'purchase');store.resume(r.chatId);
 assert.equal(store.chat(r.chatId).handoff_reason,null);assert.equal(store.chat(r.chatId).purchase_summary,null);
});
test('purchase alert respects manual takeover and disabled automation',async t=>{
 for(const mode of ['manual','disabled']){
  const{store,receive,sent}=fixture(t);const r=await receive('A42');
  if(mode==='manual')store.pause(r.chatId,30);else store.setSettings({agentEnabled:false});
  await receive('quero fechar');assert.equal(sent.length,1);assert.equal(store.chat(r.chatId).handoff_reason,'purchase');
 }
});
test('option price can be recalculated for a new quantity without creating a purchase',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');
 await receive('Quanto fica a segunda com 3 peças?');
 assert.equal(store.chat(r.chatId).mode,'auto');assert.match(sent.at(-1),/3 peças/);assert.match(sent.at(-1),/140,70 no total/);
});
test('selection summary retains requested changes and labels the previous quote',async t=>{
 const{store,receive}=fixture(t);const r=await receive('A42');await receive('vou levar a segunda, mas quero 2 peças');
 const chat=store.chat(r.chatId);assert.equal(chat.handoff_reason,'purchase');
 assert.match(chat.purchase_summary,/Cotação de referência:/);assert.match(chat.purchase_summary,/quero 2 peças/);
});
test('a number is a requested cut measurement before it can be an option',async t=>{
 for(const [name,unit,price,query,answer,total] of [
  ['CORREIA MICRO V PJ350 50 FRISOS','Friso (FRI)',7.93,'PJ350','5','39,65'],
  ['CORREIA SINCR 1200 8M 100MM','Milímetro (MM)',4.75,'1200 8M','2','9,50'],
  ['CORREIA AT10 50MM ABERTA','Metro (M)',114,'AT10 aberta 2 metros','5','22,80'],
 ]){
  const{store,receive,sent}=fixture(t);replaceCatalog(store,[{...demoProducts[0],name,variant:'',unit,price,quantity:100}],'test');
  const r=await receive(query);assert(store.chat(r.chatId).pending_measure);
  await receive(answer);assert.equal(store.chat(r.chatId).mode,'auto');assert(sent.at(-1).includes(total));
 }
});
test('commercial word corrections do not alter alphanumeric model references',()=>{
 assert.equal(quoteSearchText('COT350 VLW500 PF100 5V500 1304-8M-20'),'cot350 vlw500 pf100 5v500 1304-8m-20');
});
test('replacing stock requires review before quoting an old option again',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('A42');replaceCatalog(store,demoProducts,'replacement');
 await receive('quanto custa a segunda?');assert.equal(store.chat(r.chatId).needs_human,1);
 assert.match(sent.at(-1),/estoque mudou/);assert.doesNotMatch(sent.at(-1),/R\$/);
});
test('old database migration preserves chat history and pending selection survives reopening',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-migration-'));const path=join(dir,'db.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const legacy=new DatabaseSync(path);
 legacy.exec(`CREATE TABLE chats(id TEXT PRIMARY KEY,phone TEXT,name TEXT,channel TEXT,provider TEXT,mode TEXT DEFAULT 'auto',pause_until INTEGER,needs_human INTEGER DEFAULT 0,unread INTEGER DEFAULT 0,query TEXT,shown TEXT DEFAULT '[]',updated INTEGER,last_inbound INTEGER);
 INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES('legacy','5511@c.us','Cliente existente','whatsapp','qr',1,1);`);
 legacy.close();let store=new Store(path);
 try{
  assert.equal(store.chat('legacy').name,'Cliente existente');assert.equal(store.chat('legacy').quoted_options,'[]');
  replaceCatalog(store,demoProducts,'test');let agent=new Agent(store,async()=>randomUUID());
  const input={phone:'5511@c.us',channel:'whatsapp',provider:'qr'};
  await agent.receive({...input,body:'A42'});await agent.receive({...input,body:'2'});
  const options=JSON.parse(store.chat('legacy').quoted_options);
  store.close();store=new Store(path);agent=new Agent(store,async()=>randomUUID());
  await agent.receive({...input,body:'quero fechar'});
  assert.equal(store.chat('legacy').handoff_reason,'purchase');assert.match(store.chat('legacy').purchase_summary,new RegExp(options[1].brand));
  assert(store.messages('legacy').some(message=>message.body==='2'));
 }finally{store.close();}
});
