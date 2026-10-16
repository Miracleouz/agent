import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {Agent,quoteReply,searchProducts,intent} from '../server/agent.js';
import {demoProducts,replaceCatalog,validateRows,readRows,sheetExport} from '../server/catalog.js';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'cota-test-'));const store=new Store(join(dir,'db.sqlite'));const sent=[];const agent=new Agent(store,async(...args)=>{sent.push(args);return `sent-${sent.length}`;});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return{store,agent,sent};}
const incoming=(body,phone='5511999999999@c.us',extra={})=>({phone,name:'Cliente',body,channel:'whatsapp',provider:'qr',...extra});
test('quote returns five different brands with real prices and paginates without repeats',()=>{const first=quoteReply(demoProducts,'Oi preciso de cotação da correia A42');assert.equal(first.ids.length,5);assert.equal(new Set(first.ids).size,5);assert.match(first.body,/R\$/);assert(first.actions.some(a=>a.id==='more'));const next=quoteReply(demoProducts,'correia A-42',first.ids);assert.equal(next.ids.length,3);assert(!next.ids.some(id=>first.ids.includes(id)));assert(!next.actions.some(a=>a.id==='more'));});
test('search recognizes wording, accents, brand, budget and strict industrial belt profiles',()=>{for(const q of ['Quanto custa a correia A-42?','bom dia teria correias A42 pra cotar','quero orçamento de A 42','A42'])assert.equal(searchProducts(demoProducts,q).length,8,q);assert.equal(searchProducts(demoProducts,'correia B42').length,0);assert.equal(searchProducts(demoProducts,'A43').length,0);assert.equal(searchProducts(demoProducts,'correia A42 Gates').length,1);assert.equal(searchProducts(demoProducts,'A42 até R$ 50').length,2);assert.equal(searchProducts([{...demoProducts[0],quantity:0}],'A42').length,0);});
test('synchronous belt size/pitch/width match numeric components, with no substitutes',()=>{const p={...demoProducts[0],name:'Correia sincronizadora',variant:'1200-8M-30'};assert.equal(searchProducts([p],'correia dentada 1200 8M 30').length,1);assert.equal(searchProducts([p],'1200 5M 30').length,0);assert.equal(searchProducts([p],'1200 8M 20').length,0);});
test('never invents five options when stock only has two',()=>{const r=quoteReply(demoProducts.slice(0,2),'A42');assert.equal(r.ids.length,2);assert.match(r.body,/todas as opções/);assert(!r.actions.some(a=>a.id==='more'));});
test('groups, broadcasts, status and own messages are ignored before persistence',async t=>{const{store,agent,sent}=fixture(t);for(const e of [{phone:'111@g.us'},{phone:'status@broadcast'},{phone:'canal@newsletter'},{isGroup:true},{fromMe:true},{isStatus:true}])assert.equal((await agent.receive(incoming('A42',e.phone||'5511@c.us',e))).ignored,true);assert.equal(store.chats().length,0);assert.equal(sent.length,0);});
test('no sample prices leak to live chats without stock',async t=>{const{store,agent,sent}=fixture(t);const r=await agent.receive(incoming('A42'));assert.equal(store.chat(r.chatId).needs_human,1);assert.equal(store.chat(r.chatId).mode,'manual');assert.equal(sent.length,1);assert(!sent[0][1].includes('39,90'));assert.match(sent[0][1],/estoque está sendo atualizado/);});
test('simulator uses sample stock only when real catalog is empty',async t=>{const{store,agent,sent}=fixture(t);const r=await agent.receive(incoming('A42','demo-client',{channel:'simulator',provider:'demo'}));assert.equal(sent.length,0);assert.match(store.messages(r.chatId).at(-1).body,/5 opções/);assert.equal(store.all('SELECT * FROM products').length,0);});
test('handoff is persistent, flags one chat and pauses subsequent bot replies',async t=>{const{store,agent,sent}=fixture(t);replaceCatalog(store,demoProducts,'test');const one=await agent.receive(incoming('A42'));const other=await agent.receive(incoming('A42','5522@c.us'));await agent.receive(incoming('quero falar com atendente'));assert.equal(store.chat(one.chatId).needs_human,1);assert.equal(store.chat(one.chatId).pause_until,null);const count=sent.length;await agent.receive(incoming('Oi?'));await agent.receive(incoming('ATENDENTE'));assert.equal(sent.length,count);assert.equal(store.chat(other.chatId).mode,'auto');await agent.receive(incoming('MAIS','5522@c.us'));assert.equal(sent.length,count+1);store.resume(one.chatId);assert.equal(store.chat(one.chatId).needs_human,0);await agent.receive(incoming('A42'));assert.equal(sent.length,count+2);});
test('manual pause expires, does not backfill old replies, and new messages resume',async t=>{const{store,agent,sent}=fixture(t);replaceCatalog(store,demoProducts,'test');const r=await agent.receive(incoming('A42'));store.pause(r.chatId,15);const count=sent.length;await agent.receive(incoming('A42'));assert.equal(sent.length,count);store.run('UPDATE chats SET pause_until=? WHERE id=?',Date.now()-100,r.chatId);await agent.receive(incoming('A42'));assert.equal(store.chat(r.chatId).mode,'auto');assert.equal(sent.length,count+1);});
test('duplicate messages produce one reply even when received concurrently',async t=>{const{store,agent,sent}=fixture(t);replaceCatalog(store,demoProducts,'test');await Promise.all([agent.receive(incoming('A42',undefined,{providerId:'same'})),agent.receive(incoming('A42',undefined,{providerId:'same'}))]);assert.equal(sent.length,1);assert.equal(store.all("SELECT * FROM messages WHERE direction='in'").length,1);});
test('failed outbound send is persisted visibly instead of pretending success',async t=>{const{store}=fixture(t);replaceCatalog(store,demoProducts,'test');const agent=new Agent(store,async()=>{throw new Error('Desconectado');});const r=await agent.receive(incoming('A42'));assert.equal(store.messages(r.chatId).at(-1).status,'failed');assert.match(store.messages(r.chatId).at(-1).error,/Desconectado/);});
test('CSV accepts Brazilian currency, XLSX-style numbers and rejects invalid/duplicate stock',async()=>{const rows=await readRows(Buffer.from('sku;produto;marca;medida;preço;quantidade\na1;Correia;Gates;A42;"R$ 1.234,56";5'));const products=validateRows(rows);assert.equal(products[0].price,1234.56);assert.throws(()=>validateRows([rows[0],rows[1],rows[1]]),/repetido/);assert.throws(()=>validateRows([rows[0],['a','P','B','A42','invalido','1']]),/Linha/);assert.throws(()=>validateRows([rows[0]]),/Nenhum/);});
test('Google Sheets URLs restrict host/protocol and preserve selected tab',()=>{assert.match(sheetExport('https://docs.google.com/spreadsheets/d/abc/edit#gid=123'),/gid=123/);assert.throws(()=>sheetExport('http://127.0.0.1/secret'),/HTTPS/);assert.throws(()=>sheetExport('https://docs.google.com.evil.com/spreadsheets/d/abc/edit'),/HTTPS/);});
test('menu intent recognizes varied human requests and more',()=>{for(const s of ['Falar com atendente','quero falar com uma pessoa','ATENDENTE','tem vendedor?'])assert.equal(intent(s),'human');for(const s of ['ver mais','mais','outras marcas','more'])assert.equal(intent(s),'more');});
test('real spreadsheet headers, fractional stock and sale units are imported without invented prices',async()=>{
 const rows=await readRows(Buffer.from('MARCA,DESCRIÇÃO PADRONIZADA,QUANTIDADE TOTAL,UNIDADE,REGISTROS UNIFICADOS,DESCRIÇÕES ORIGINAIS,VALOR UNITÁRIO ORIGINAL (R$)\nGATES,CORREIA EM V A42,"1,",Peça (PC),1,original,"49,90"\nGATES,CORREIA EM V A42,"2,5",Metro (M),1,original,"10,50"\nBANDO,CORREIA EM V A42,"3,",Peça (PC),1,original,\nOPTIBELT,CORREIA EM V A42,"1,",Peça (PC),1,original,0'));
 const items=validateRows(rows);assert.equal(items.length,4);assert.equal(items[1].quantity,2.5);assert.equal(items[1].unit,'Metro (M)');assert.equal(items[2].price,null);assert.equal(items[3].price,null);
 const products=items.map((p,i)=>({...p,id:String(i)}));const prompt=quoteReply(products,'A42');assert.equal(prompt.ids.length,0);assert.match(prompt.body,/comprimento desejado em metros/);const result=quoteReply(products,'A42 2 metros');assert.equal(result.ids.length,1);assert.match(result.body,/21,00/);assert.match(result.body,/2 m/);assert(!result.body.includes('BANDO'));const piece=quoteReply(products.filter(p=>p.unit==='Peça (PC)'),'A42');assert.match(piece.body,/Peça \(PC\)/);
});
test('brand and budget follow-ups retain the belt reference',async t=>{
 const{store,agent,sent}=fixture(t);replaceCatalog(store,demoProducts,'test');await agent.receive(incoming('correia A42'));await agent.receive(incoming('e da Gates?'));assert.match(sent.at(-1)[1],/Gates/);assert.match(sent.at(-1)[1],/1 opção/);await agent.receive(incoming('até 50'));assert.match(sent.at(-1)[1],/A-42/);
});
test('unsupported media is routed to a human and never parsed as a product request',async t=>{
 const{store,agent}=fixture(t);const r=await agent.receive(incoming('[Áudio recebido]',undefined,{forceHuman:true}));assert.equal(store.chat(r.chatId).needs_human,1);assert.equal(store.chat(r.chatId).mode,'manual');
});
test('manual takeover records attendant requests without sending an automatic acknowledgment',async t=>{
 const{store,agent,sent}=fixture(t);replaceCatalog(store,demoProducts,'test');
 const r=await agent.receive(incoming('A42'));store.pause(r.chatId,30);const count=sent.length;
 await agent.receive(incoming('ATENDENTE'));
 assert.equal(sent.length,count);assert.equal(store.chat(r.chatId).needs_human,1);assert.equal(store.chat(r.chatId).mode,'manual');
});
test('globally disabled agent never acknowledges handoffs but retains the owner alert',async t=>{
 const{store,agent,sent}=fixture(t);store.setSettings({agentEnabled:false});
 for(const extra of [{},{forceHuman:true}]){
  const r=await agent.receive(incoming('ATENDENTE',extra.forceHuman?'5522@c.us':'5511@c.us',extra));
  assert.equal(store.chat(r.chatId).needs_human,1);assert.equal(store.chat(r.chatId).mode,'manual');
 }
 assert.equal(sent.length,0);
});
test('stock without a price requests human verification instead of declaring it unavailable',async t=>{
 const{store,agent,sent}=fixture(t);replaceCatalog(store,[{...demoProducts[0],price:null}],'test');const r=await agent.receive(incoming('A42'));assert.equal(store.chat(r.chatId).needs_human,1);assert.match(sent[0][1],/preço está sob consulta/);assert(!sent[0][1].includes('R$'));
});
test('industrial pitch and profile letters are mandatory even when numbers are identical',()=>{
 const products=[{...demoProducts[0],name:'Correia em V',variant:'5V500'},{...demoProducts[1],name:'Correia em V',variant:'5VX500'},{...demoProducts[2],name:'Correia em V',variant:'3L260'},{...demoProducts[3],name:'Correia em V',variant:'3V260'}];
 assert.deepEqual(searchProducts(products,'5VX500').map(p=>p.variant),['5VX500']);assert.deepEqual(searchProducts(products,'5V 500').map(p=>p.variant),['5V500']);assert.deepEqual(searchProducts(products,'3L 260').map(p=>p.variant),['3L260']);
});
