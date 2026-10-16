import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {Agent,quoteReply} from '../server/agent.js';
import {parseBeltRequest} from '../server/belts.js';
import {replaceCatalog} from '../server/catalog.js';

const product={id:'open',sku:'AT10',name:'CORREIA AT10 50MM ABERTA',variant:'',brand:'GATES',price:114,quantity:100,unit:'Metro (M)'};
for(const text of ['AT10 33000','at10 33.000','AT 10 33000','AT10-33000','AT10 33000mm','AT10 33000 milímetros','AT10 33m','AT10 33 metros','quanto custa AT10 33000','quero cotar AT10 33000 aberta']){
 test(`open belt length shorthand converts to 33 meters: ${text}`,()=>{
  const request=parseBeltRequest(text);assert.equal(request.meters,33);assert.equal(request.error,null);
  const result=quoteReply([product],text,[],{openBeltPriceBasis:'per_meter_full_width'});assert.equal(result.awaiting,'fixedWidth');assert.doesNotMatch(result.body,/R\$/);
 });
}
for(const text of ['AT10 33000 25mm','AT10 33.000 25 mm','AT10 33000 x 25mm','AT10 33000x25','AT10 33000 / 25mm','AT10 33000, 25mm','AT10 33m 25mm']){
 test(`open belt quote multiplies 33 meters by cut width: ${text}`,()=>{
  const quote=quoteReply([product],text,[],{openBeltPriceBasis:'per_meter_full_width'});
  assert.equal(quote.ids.length,1);assert.match(quote.body,/33 m × 25 mm/);assert.match(quote.body,/1\.881,00 por corte/);
 });
}
test('shorthand request keeps its length when the client answers only the requested width',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());replaceCatalog(store,[product],'test');const sent=[];const agent=new Agent(store,async(chat,body)=>{sent.push(body);return null;});
 const input={phone:'demo-open',channel:'simulator',provider:'demo'};const first=await agent.receive({...input,body:'valor AT10 33000'});
 assert.equal(store.chat(first.chatId).pending_measure,'fixedWidth');assert(store.chat(first.chatId).followup_due_at);await agent.receive({...input,body:'25'});
 assert.match(store.messages(first.chatId).at(-1).body,/1\.881,00 por corte/);assert.equal(store.chat(first.chatId).mode,'auto');
 assert(store.chat(first.chatId).followup_due_at);
});
test('small stock widths and normal closed belt codes are not interpreted as long open lengths',()=>{
 for(const text of ['AT10 50mm','AT10 3300','AT10 33000 fechada','1200 8M 20mm','PJ350 5 frisos','5V2240 4 canais'])assert.equal(parseBeltRequest(text).meters,null,text);
});
test('conflicting lengths require clarification, and insufficient continuous stock is never quoted',()=>{
 const conflict=parseBeltRequest('AT10 33000 20 metros');assert(conflict.error);
 const quote=quoteReply([{...product,quantity:10}],'AT10 33000 25mm',[],{openBeltPriceBasis:'per_meter_full_width'});assert.equal(quote.ids.length,0);assert.doesNotMatch(quote.body,/R\$/);
});
