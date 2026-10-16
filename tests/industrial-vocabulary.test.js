import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.js';
import {Agent,searchProducts} from '../server/agent.js';
import {replaceCatalog} from '../server/catalog.js';
import {quoteSearchText} from '../server/intents.js';
import {mergeBeltRequest} from '../server/belts.js';

// Descriptions resemble industrial Excel abbreviations; all brands/prices are fictitious.
const stock=Array.from({length:6},(_,i)=>[
 {id:'sync-'+i,sku:'SYNC-'+i,name:'CORREIA SINCR 1304 8M 100MM',variant:'',brand:'MARCA '+i,price:4.75+i,quantity:100,unit:'Milímetro (MM)'},
 {id:'open-'+i,sku:'OPEN-'+i,name:'CORREIA SINCR AT10 50MM PU ACO ABERTA',variant:'',brand:'MARCA '+i,price:114+i*10,quantity:50,unit:'Metro (M)'},
]).flat();
stock.push({id:'different-pitch',sku:'DIFFERENT-PITCH',name:'CORREIA SINCR 1304 D8M 100MM',variant:'',brand:'OUTRO PASSO',price:1,quantity:100,unit:'Milímetro (MM)'},{id:'different-length',sku:'DIFFERENT-LENGTH',name:'CORREIA SINCR 1200 8M 100MM',variant:'',brand:'OUTRO COMPRIMENTO',price:1,quantity:100,unit:'Milímetro (MM)'});
const vocabulary=['sincronizadora','sincronizada','sincronizadoras','dentada','dentadas','sincr','sinc','sincron','síncrona','síncronas','sincrona','sincronas'];
for(const word of vocabulary)for(const kind of ['fechada','aberta']){
 const request=kind==='fechada'?`qto vlr da coreia ${word} 1304 8M largura 20mm pfv`:`cotar correa ${word} AT10 aberta 2 MTS por 25mm`;
 test(`vocabulário industrial: ${word} · ${kind}`,async t=>{
  const store=new Store(':memory:');replaceCatalog(store,stock,'industrial-vocabulary');store.setSettings({openBeltPriceBasis:'per_meter_full_width'});const sent=[],agent=new Agent(store,async(_chat,body)=>{sent.push(body);return'out-'+sent.length;});t.after(()=>{agent.followups.close();store.close();});
  await agent.receive({phone:'5511999999999@c.us',name:'Cliente',channel:'whatsapp',provider:'qr',providerId:'in-vocabulary',body:request});assert.equal(sent.length,1);assert.match(sent[0],/5 opções/);assert(sent[0].includes(kind==='fechada'?'95,00':'114,00'));assert.equal((sent[0].match(/MARCA /g)||[]).length,5);assert.doesNotMatch(sent[0],/OUTRO PASSO|OUTRO COMPRIMENTO/);
 });
}
test('a descriptive synonym never authorizes fuzzy replacement of the belt model or pitch',()=>{
 for(const request of ['sincronizadora 1305 8M 20mm','dentada 1304 5M 20mm','sincrona 1304 D5M 20mm'])assert.equal(searchProducts(stock,quoteSearchText(request),{openBeltPriceBasis:'per_meter_full_width'}).length,0);
});
for(const descriptor of ['sincronizadora','síncrona'])test(`brand names that are substrings of ${descriptor} do not restrict the quote`,()=>{
 const catalog=[...stock,...['SINCRO','SINCRON'].map((brand,i)=>({...stock[0],id:'brand-prefix-'+i,brand,name:'CORREIA SINCR 9999 8M 100MM'}))];
 const result=searchProducts(catalog,quoteSearchText(`correia ${descriptor} 1304 8M 20mm`));assert.equal(result.length,6);assert(result.every(product=>product.brand.startsWith('MARCA ')));
});
test('an explicitly requested whole brand is respected without matching a longer brand name',()=>{
 const catalog=['SINCRO','SINCRON','SINCRO EXTRA'].map((brand,i)=>({...stock[0],id:'brand-exact-'+i,brand}));const result=searchProducts(catalog,quoteSearchText('sincronizadora 1304 8M 20mm marca SINCRO'));assert.equal(result.length,1);assert.equal(result[0].brand,'SINCRO');
});
test('changing width or brand in context does not remove brand fragments inside product descriptors',()=>{
 const query=mergeBeltRequest('sincronizadora 1304 8M 10mm MARCA 0','20mm MARCA 1',['SINCRO','SINCRON','MARCA 0','MARCA 1']);assert.match(query,/sincronizadora/);assert.match(query,/1304 8m/);assert.match(query,/20 mm/);assert.doesNotMatch(query,/marca 0/);assert.match(query,/MARCA 1/);
});
