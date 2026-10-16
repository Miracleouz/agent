import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/db.js';
import {Agent,quoteReply,introduction} from '../server/agent.js';
import {parseBeltRequest,calculateBeltQuote} from '../server/belts.js';
import {quoteSearchText} from '../server/intents.js';
import {splitBeltRequests} from '../server/requests.js';
import {replaceCatalog} from '../server/catalog.js';
import {industrialStock} from './fixtures/industrial-stock.js';

function fixture(t){const store=new Store(':memory:');replaceCatalog(store,industrialStock,'test');const sent=[];const agent=new Agent(store,async(chat,body)=>{sent.push(body);return randomUUID();});t.after(()=>store.close());return{store,agent,sent,receive:body=>agent.receive({body,phone:'5511999999999@c.us',channel:'whatsapp',provider:'qr'})};}
for(const text of ['4 PK 650','4PK650','4 PK650','4-PK-650','PK 650 com 4 frisos','PK650 4 canais']){
 test(`PK ready belt and cut by rib share the requested dimensions: ${text}`,()=>{
  const request=parseBeltRequest(text);assert.equal(request.ribs,4);assert.equal(request.pieces,1);
  assert.equal(calculateBeltQuote(industrialStock.find(p=>p.id==='pk-cut-0'),request).each,28);
  assert.equal(calculateBeltQuote(industrialStock.find(p=>p.id==='pk-piece-0'),request).each,34);
  const quote=quoteReply(industrialStock,text);assert.equal(quote.ids.length,5);assert.match(quote.body,/peça pronta/);assert.match(quote.body,/por (?:friso|canal) × 4/);
  assert.equal(new Set(quote.quotedOptions.map(p=>p.brand)).size,5);assert(quote.quotedOptions.some(option=>option.id.startsWith('pk-cut-')));assert(quote.quotedOptions.some(option=>option.id.startsWith('pk-piece-')));
 });
}
test('PK quote excludes fixed three-rib pieces and other lengths',()=>{
 const stock=[...industrialStock,{...industrialStock.find(p=>p.id==='pk-piece-0'),id:'wrong-ribs',variant:'3PK650',price:1},{...industrialStock.find(p=>p.id==='pk-piece-0'),id:'wrong-length',variant:'4PK651',price:1}];
 const quote=quoteReply(stock,'4 PK 650');assert(!quote.ids.includes('wrong-ribs'));assert(!quote.ids.includes('wrong-length'));assert(!quote.body.includes('651'));
});
test('ready 3VX500 pieces are quoted even when cut stock also needs a channel count',()=>{
 const stock=[...industrialStock,{id:'banded',sku:'BANDED',name:'CORREIA EM V 3VX500 22 CANAIS',variant:'',brand:'EXTRA',price:20,quantity:44,unit:'Friso (FRI)'}];
 const quote=quoteReply(stock,'3VX500');assert.equal(quote.ids.length,5);assert.equal(quote.awaiting,undefined);assert.match(quote.body,/60,00/);assert(!quote.ids.includes('banded'));
 const batch=quoteReply(stock,'B72; A89; 3VX500');assert.equal(batch.quotedOptions.length,15);assert.equal(batch.awaiting,null);assert.match(batch.body,/Item 3/);
 const cut=quoteReply(stock,'3VX500 4 canais');assert(cut.ids.includes('banded'));assert.match(cut.body,/80,00 por correia/);
});
for(const text of ['cotar corr B 72\ncorreia a 89\ncorreia 3VX 500','B72, A89 e 3VX500','B-72; A-89; 3VX-500','B72 A89 3VX500','2 correias B72 e 3 correias A89 e 1 correia 3VX500']){
 test(`all requested references are quoted separately in one response: ${text}`,async t=>{
  const{store,receive,sent}=fixture(t);const r=await receive(text);const chat=store.chat(r.chatId),options=JSON.parse(chat.quoted_options);
  assert.equal(sent.length,1);assert(sent[0].startsWith(introduction+'\n\n'));assert.match(sent[0],/Cotação dos 3 itens/);
  assert.equal(options.length,15);assert.match(sent[0],/15\. \*/);assert.equal(chat.mode,'auto');
  for(let i=0;i<3;i++){const group=options.filter(option=>option.itemIndex===i);assert.equal(group.length,5);assert.equal(new Set(group.map(option=>option.brand)).size,5);assert(group.every(option=>option.line.includes('R$')));}
  assert.equal(chat.batch_queries&&JSON.parse(chat.batch_queries).length,3);
 });
}
test('the numeric profile 3VX and the rib prefix 4 PK each remain one item',()=>{
 assert.deepEqual(splitBeltRequests(quoteSearchText('4 PK 650')),['4 pk 650']);
 assert.equal(splitBeltRequests('3VX 500').length,1);assert.equal(parseBeltRequest('3VX500').ribs,null);
 assert.equal(splitBeltRequests('1200 8M 20mm e AT10 33000 25mm').length,2);
});
test('unavailable item is reported without omitting the other requested items or substituting models',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('B72, A90 e 3VX500');
 assert.match(sent[0],/Item 2 · A90/);assert.match(sent[0],/Não encontrei/);assert.match(sent[0],/Item 3 · 3VX500/);
 assert.equal(JSON.parse(store.chat(r.chatId).quoted_options).length,10);assert(!sent[0].includes('A89'));
});
test('missing ribs apply only to their item and preserve the complete request',async t=>{
 const{store,receive,sent}=fixture(t);replaceCatalog(store,industrialStock.filter(product=>!product.id.startsWith('pk-piece-')),'cut-only PK');const r=await receive('B72; PK650; A89');
 assert.equal(store.chat(r.chatId).pending_item_index,1);assert.equal(store.chat(r.chatId).pending_measure,'ribs');assert.equal(store.chat(r.chatId).followup_due_at,null);
 await receive('4');const chat=store.chat(r.chatId);
 assert.equal(chat.pending_measure,null);assert.equal(JSON.parse(chat.batch_queries).length,3);assert.match(sent.at(-1),/por friso × 4/);assert.match(sent.at(-1),/B72/);assert.match(sent.at(-1),/A89/);
});
test('pagination returns the next brands for each item without repeating prior stock rows',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('B72; A89; 3VX500');const first=JSON.parse(store.chat(r.chatId).quoted_options).map(option=>option.id);
 await receive('MAIS');const second=JSON.parse(store.chat(r.chatId).quoted_options);assert.equal(second.length,3);assert(second.every(option=>!first.includes(option.id)));assert.match(sent.at(-1),/Item 3/);
});
test('an option greater than five identifies the correct item when buying',async t=>{
 const{store,receive}=fixture(t);const r=await receive('B72; A89; 3VX500');await receive('quero a opção 7');
 const chat=store.chat(r.chatId);assert.equal(chat.handoff_reason,'purchase');assert.match(chat.purchase_summary,/Opção 7/);assert.match(chat.purchase_summary,/A89/);
});
test('a price question for a numbered option uses the correct item query',async t=>{
 const{store,receive,sent}=fixture(t);const r=await receive('B72; A89; 3VX500');await receive('quanto custa a opção 7?');
 assert.equal(store.chat(r.chatId).mode,'auto');assert.match(sent.at(-1),/A89/);assert.match(sent.at(-1),/50,00/);assert.equal(JSON.parse(store.chat(r.chatId).quoted_options).length,1);
});
test('quantity and total stay associated with the requested item',async t=>{
 const{receive,sent}=fixture(t);await receive('2 correias B72 e 3 correias A89');
 const parts=sent[0].split('──────────');assert.match(parts[0],/2 peças: \*R\$.*100,00/);assert.match(parts[1],/3 peças: \*R\$.*120,00/);
});
test('requests above ten items ask for smaller batches without silently dropping items',()=>{
 const text=Array.from({length:11},(_,i)=>`B${70+i}`).join(';');const quote=quoteReply(industrialStock,text);
 assert.match(quote.body,/11 referências/);assert.match(quote.body,/até 10 itens/);assert.equal(quote.ids.length,0);
});
