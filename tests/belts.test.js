import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBeltRequest,productBeltSpec,calculateBeltQuote,mergeBeltRequest} from '../server/belts.js';
import {quoteReply,searchProducts,Agent} from '../server/agent.js';
import {Store} from '../server/db.js';
import {replaceCatalog} from '../server/catalog.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const rib=(patch={})=>({id:'rib1',sku:'AUTO-LOT',name:'CORREIA MICRO V PJ 350 59 FRISOS-0',variant:'',brand:'GATES',price:7.93,quantity:59,unit:'Friso (FRI)',...patch});
const mm=(patch={})=>rib({id:'mm1',name:'CORREIA SINCR 1200 8M 150MM-4',unit:'Milímetro (MM)',price:4.75,quantity:150,...patch});
function fixture(t,products){const dir=mkdtempSync(join(tmpdir(),'cota-belts-'));const store=new Store(join(dir,'db.sqlite'));replaceCatalog(store,products,'test');const agent=new Agent(store,async()=>{throw new Error('Teste não pode enviar mensagens reais');});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});const receive=body=>agent.receive({body,phone:'demo-belts',name:'Cliente de teste',channel:'simulator',provider:'demo'});return{store,agent,receive};}

test('PJ 350 with five ribs separates the reference, number of belts and billed ribs',()=>{
 for(const text of ['quero uma correia pj 350 5 frisos','PJ350 com 5 canais','350 PJ de 5 frisos','5PJ350']){
  const request=parseBeltRequest(text);assert.equal(request.ribs,5,text);assert.equal(request.pieces,1,text);assert(!request.error,text);
  const q=calculateBeltQuote(rib(),request);assert(q.ok,text);assert.equal(q.each,39.65,text);assert.equal(q.total,39.65,text);
  assert.equal(searchProducts([rib()],text).length,1,text);
 }
});
test('five available brands are quoted using actual finished-belt totals and formulas',()=>{
 const products=Array.from({length:7},(_,i)=>rib({id:`p${i}`,brand:`MARCA ${String.fromCharCode(65+i)}`,price:7.93+i}));
 const r=quoteReply(products,'quero uma correia pj 350 5 frisos');assert.equal(r.ids.length,5);assert.match(r.body,/39,65 por correia/);assert.match(r.body,/7,93 por friso × 5 frisos/);assert(!r.body.includes('59 FRISOS'));assert(r.actions.some(a=>a.id==='more'));
 const next=quoteReply(products,'quero uma correia pj 350 5 frisos',r.ids);assert.equal(next.ids.length,2);assert(!next.ids.some(id=>r.ids.includes(id)));
});
test('multiple belts multiply the rib calculation and require enough stock',()=>{
 const request=parseBeltRequest('quero 3 correias PJ350 de 5 frisos cada');assert.equal(request.pieces,3);const q=calculateBeltQuote(rib(),request);assert.equal(q.total,118.95);assert.equal(q.each,39.65);assert(!calculateBeltQuote(rib({quantity:14}),request).ok);
 const r=quoteReply([rib()],'3 correias PJ350 5 frisos');assert.match(r.body,/3 correias: \*R\$.*118,95/);
});
test('cannot merge narrow lots into one wider belt or overpromise cut count',()=>{
 const stock=rib({name:'CORREIA MICRO V PJ350 4 FRISOS-0',quantity:20});assert(!calculateBeltQuote(stock,parseBeltRequest('PJ350 5 frisos')).ok);
 const twoLots=rib({name:'CORREIA MICRO V PJ350 9 FRISOS-0',quantity:18});assert(!calculateBeltQuote(twoLots,parseBeltRequest('3 correias PJ350 5 frisos')).ok);
 assert(calculateBeltQuote(twoLots,parseBeltRequest('2 correias PJ350 5 frisos')).ok);
});
test('a fixed piece with five ribs is charged once, never once per rib',()=>{
 const piece=rib({name:'CORREIA MICRO V PJ350 5 FRISOS-0',price:100,quantity:3,unit:'Peça (PC)'});
 assert.equal(calculateBeltQuote(piece,parseBeltRequest('2 correias PJ350 5 frisos')).total,200);
 assert(!calculateBeltQuote(piece,parseBeltRequest('PJ350 4 frisos')).ok);
 const r=quoteReply([piece],'PJ350 5 frisos');assert.match(r.body,/100,00/);assert(!r.body.includes('500,00'));
});
test('channels are billed per channel, while 5V remains the profile',()=>{
 const product=rib({name:'CORREIA EM V 5V2240 6 CANAIS',price:247.11,quantity:6});
 const r=quoteReply([product],'correia 5V2240 de 4 canais');assert.equal(r.ids.length,1);assert.match(r.body,/988,44 por correia/);assert.match(r.body,/247,11 por canal × 4 canais/);
 assert.equal(parseBeltRequest('5V2240').ribs,null);
});
test('synchronous stock sold per mm is cut by requested measure and charged per mm',()=>{
 for(const query of ['correia 1200 8M 20mm','1200-8M-20','1200 8M com largura de 20 mm']){
  const request=parseBeltRequest(query);assert.equal(request.mm,20,query);assert.equal(searchProducts([mm()],query).length,1,query);assert.equal(calculateBeltQuote(mm(),request).each,95,query);
 }
 const r=quoteReply([mm()],'duas correias 1200 8M largura 20mm',[],{mmDimension:'width'});assert.match(r.body,/20 mm de largura/);assert.match(r.body,/4,75\/mm × 20 mm/);assert.match(r.body,/190,00 no total/);assert(!r.body.includes('150MM'));
});
test('piece-priced synchronous belt has a fixed width and is never multiplied by mm',()=>{
 const product=mm({name:'CORREIA SINCR 1200 8M 20MM-0',price:100,quantity:4,unit:'Peça (PC)'});
 assert.equal(calculateBeltQuote(product,parseBeltRequest('1200 8M 20mm')).each,100);
 assert(!calculateBeltQuote(product,parseBeltRequest('1200 8M 19mm')).ok);
});
test('missing ribs or mm triggers a question and follow-up keeps the reference',async t=>{
 const{store,receive}=fixture(t,[rib(),mm()]);const first=await receive('PJ350');let last=store.messages(first.chatId).at(-1);assert.match(last.body,/Quantos frisos/);assert(!last.body.includes('R$'));
 await receive('5 frisos');last=store.messages(first.chatId).at(-1);assert.match(last.body,/39,65/);
 await receive('PJ350');await receive('quero 2 correias com 4 frisos');last=store.messages(first.chatId).at(-1);assert.match(last.body,/4 frisos/);assert.match(last.body,/63,44 no total/);
 await receive('1200 8M');last=store.messages(first.chatId).at(-1);assert.match(last.body,/largura de corte/);
 await receive('20 mm de largura');last=store.messages(first.chatId).at(-1);assert.match(last.body,/95,00/);
});
test('open belt calculates requested length and width with a full-width catalog price',()=>{
 const product=rib({name:'CORREIA SINCR AT10 50MM PU ACO ABERTA-1',price:114,quantity:2.6,unit:'Metro (M)'});
 const request=parseBeltRequest('correia aberta AT10 50mm quero 2,5 metros');const opts={openBeltPriceBasis:'per_meter_full_width'};const q=calculateBeltQuote(product,request,opts);assert(q.ok);assert.equal(q.total,285);assert.equal(searchProducts([product],'correia aberta AT10 50mm 2,5 metros',opts).length,1);
 assert(!calculateBeltQuote(product,parseBeltRequest('AT10 50mm 3 metros'),opts).ok);assert.equal(calculateBeltQuote(product,parseBeltRequest('AT10 25mm 2 metros'),opts).total,114);
});
test('whole-belt budget is applied after multiplying by ribs',()=>{
 assert.equal(searchProducts([rib()],'PJ350 5 frisos até 30').length,0);assert.equal(searchProducts([rib()],'PJ350 5 frisos até 40').length,1);
});
test('invalid, zero, fractional ribs and conflicting widths are never quoted',()=>{
 for(const text of ['PJ350 0 frisos','PJ350 -5 frisos','PJ350 2,5 frisos','PJ350 5 frisos e 6 frisos','1200 8M 20mm e 30mm']){const r=quoteReply([rib(),mm()],text);assert.equal(r.ids.length,0,text);assert(!r.body.includes('R$'),text);assert(parseBeltRequest(text).error,text);}
});
test('same brand, reference and unit price do not generate duplicate lot options',()=>{
 const products=[rib(),rib({id:'lot2',name:'CORREIA MICRO V PJ350 20 FRISOS-2',quantity:20})];
 const result=quoteReply(products,'PJ350 5 frisos');assert.equal(result.ids.length,1);
});
test('model, pitch and cut dimensions remain distinct and cannot substitute each other',()=>{
 assert.equal(searchProducts([rib({name:'CORREIA MICRO V EPJ350 50 FRISOS-1'})],'PJ350 5 frisos').length,0);
 assert.equal(searchProducts([mm({name:'CORREIA SINCR 1200 S8M 150MM-0'})],'1200 8M 20mm').length,0);
 assert.equal(searchProducts([rib()],'PJ351 5 frisos').length,0);
});
test('changing the cut detail in context replaces the old value and keeps brand/budget',()=>{
 const q=mergeBeltRequest('PJ350 5 frisos Gates até 100','agora 6 frisos',['Gates']);const parsed=parseBeltRequest(q);assert(!parsed.error);assert.equal(parsed.ribs,6);assert.equal(parsed.budget,100);assert.match(q,/gates/);
});
test('fractional cut prices round once per belt and order total agrees with item price',()=>{
 const request=parseBeltRequest('2 correias 1200 8M 12,5mm');const result=calculateBeltQuote(mm({price:1.57}),request);assert(result.ok);assert.equal(result.each,19.63);assert.equal(result.total,39.26);
});
test('open belts ask fixed width before quoting a length-only request',()=>{
 const product=rib({name:'CORREIA SINCR AT10 50MM ABERTA-1',unit:'Metro (M)',price:114,quantity:10});const r=quoteReply([product],'AT10 aberta 2 metros');assert.equal(r.ids.length,0);assert.match(r.body,/largura da correia aberta/);assert(!r.body.includes('R$'));
});
test('a bare number answers the requested cut measurement in persistent chat context',async t=>{
 const{store,receive}=fixture(t,[rib(),mm()]);const first=await receive('PJ350');assert.equal(store.chat(first.chatId).pending_measure,'ribs');await receive('5');assert.match(store.messages(first.chatId).at(-1).body,/39,65/);assert.equal(store.chat(first.chatId).pending_measure,null);
 await receive('1200 8M');assert.equal(store.chat(first.chatId).pending_measure,'mm');await receive('20');assert.match(store.messages(first.chatId).at(-1).body,/95,00/);
});
test('open-belt unit rate per meter-mm multiplies both dimensions and number of cuts',()=>{
 const p=rib({name:'CORREIA SINCR AT10 50MM ABERTA-0',price:2.28,quantity:10,unit:'Metro (M)'}),opts={openBeltPriceBasis:'per_meter_mm'};
 const req=parseBeltRequest('2 correias AT10 abertas 25mm 2,5 metros');const q=calculateBeltQuote(p,req,opts);assert(q.ok);assert.equal(q.each,142.5);assert.equal(q.total,285);
 const reply=quoteReply([p],'AT10 aberta 25mm 2,5 metros',[],opts);assert.match(reply.body,/2,28\/\(m × mm\) × 2,5 m × 25 mm/);assert.match(reply.body,/142,50 por corte/);
});
test('full-width open-belt price is normalized before length times width, without rounding the rate',()=>{
 const p=rib({name:'CORREIA SINCR AT10 13MM ABERTA-0',price:15,quantity:5,unit:'Metro (M)'}),opts={openBeltPriceBasis:'per_meter_full_width'};
 assert.equal(calculateBeltQuote(p,parseBeltRequest('AT10 aberta 13mm 2 metros'),opts).total,30);
 assert.equal(calculateBeltQuote(p,parseBeltRequest('AT10 aberta 6,5mm 2 metros'),opts).total,15);
 assert.match(quoteReply([p],'AT10 aberta 6,5mm 2 metros',[],opts).body,/15,00\/m na faixa de 13 mm ÷ 13 mm/);
});
test('open-belt stock must fit width and continuous length as well as the number of cuts',()=>{
 const p=rib({name:'CORREIA SINCR AT10 50MM ABERTA-0',price:2,quantity:5,unit:'Metro (M)'}),opts={openBeltPriceBasis:'per_meter_mm'};
 assert(!calculateBeltQuote(p,parseBeltRequest('AT10 aberta 51mm 1 metro'),opts).ok);
 assert(!calculateBeltQuote(p,parseBeltRequest('AT10 aberta 25mm 6 metros'),opts).ok);
 assert(calculateBeltQuote(p,parseBeltRequest('4 correias AT10 abertas 20mm 2 metros'),opts).ok);
 assert(!calculateBeltQuote(p,parseBeltRequest('5 correias AT10 abertas 20mm 2 metros'),opts).ok);
});
test('unconfirmed open-belt price basis requests human confirmation and never returns a guessed price',()=>{
 const p=rib({name:'CORREIA SINCR AT10 50MM ABERTA-0',price:114,quantity:10,unit:'Metro (M)'});
 const r=quoteReply([p],'AT10 aberta 25mm 2 metros');assert(r.needsHuman);assert.equal(r.ids.length,0);assert(!r.body.includes('R$'));
});
test('open-belt row with incompatible stock unit requires review instead of using synchronous width-only formula',()=>{
 const p=mm({name:'CORREIA SINCR S8M 12MM ABERTA-2',price:36,quantity:5.5});
 const r=quoteReply([p],'S8M aberta 10mm 2 metros',[],{openBeltPriceBasis:'per_meter_mm'});assert(r.needsHuman);assert.equal(r.ids.length,0);assert(!r.body.includes('R$'));
});
test('closed synchronous belt always asks for width in mm',()=>{
 const r=quoteReply([mm()],'1200 8M');assert.match(r.body,/largura de corte/);assert.equal(r.awaiting,'mm');
});
test('open-belt dimensions accept meters times mm and explicitly labeled length in mm',()=>{
 const p=rib({name:'CORREIA SINCR AT10 50MM ABERTA-0',price:2.28,quantity:10,unit:'Metro (M)'}),opts={openBeltPriceBasis:'per_meter_mm'};
 for(const text of ['AT10 aberta 2m x25mm','AT10 aberta 25mm x2m','AT10 aberta comprimento 2000mm e largura 25mm','AT10 aberta 2000mm de comprimento e 25mm de largura']){const request=parseBeltRequest(text);assert(!request.error,text);assert.equal(request.meters,2,text);assert.equal(request.mm,25,text);assert.equal(calculateBeltQuote(p,request,opts).total,114,text);assert.equal(quoteReply([p],text,[],opts).ids.length,1,text);}
});
test('open-belt conversation gathers width and length before calculating',async t=>{
 const p=rib({name:'CORREIA SINCR AT10 50MM ABERTA-0',price:2.28,quantity:10,unit:'Metro (M)'});const{store,receive}=fixture(t,[p]);store.setSettings({openBeltPriceBasis:'per_meter_mm',mmDimension:'width'});
 const first=await receive('AT10 aberta');assert.equal(store.chat(first.chatId).pending_measure,'fixedWidth');await receive('25');assert.equal(store.chat(first.chatId).pending_measure,'meters');await receive('2');assert.match(store.messages(first.chatId).at(-1).body,/114,00 por corte/);
});
