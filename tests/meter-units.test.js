import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBeltRequest,billingUnit} from '../server/belts.js';
import {quoteReply,intent} from '../server/agent.js';

const product={id:'open',sku:'AT10',name:'CORREIA AT10 50MM ABERTA',variant:'',brand:'GATES',price:114,quantity:100,unit:'MT'};
for(const unit of ['MT','MTS','METRO','METROS','mt','mts','metros','MT.','MTS.']){
 for(const query of [`AT10 aberta 2 ${unit} 25mm`,`AT10 2${unit} x25mm`,`AT10 aberta comprimento de 2 ${unit}, largura 25mm`]){
  test(`meter spelling calculates the same open-belt cut: ${query}`,()=>{
   const request=parseBeltRequest(query);assert.equal(request.meters,2);assert.equal(request.mm,25);assert.equal(request.error,null);
   const quote=quoteReply([product],query,[],{openBeltPriceBasis:'per_meter_full_width'});assert.equal(quote.ids.length,1);assert.match(quote.body,/114,00 por corte/);
  });
 }
}
test('MT and MTS stock units are meters while millimeters and pitch codes keep their meanings',()=>{
 for(const unit of ['MT','MTS','METROS','M'])assert.equal(billingUnit(unit),'meter');assert.equal(billingUnit('MM'),'mm');
 for(const text of ['1200 8M 20mm','1304-8M-20','3VX500','5V2240','4 PK 650'])assert.equal(parseBeltRequest(text).meters,null,text);
});
for(const text of ['pode separar','quero fechar','vou comprar','Pode separar pra mim','QRO FEXAR','vou conprar'])test(`closing intent remains a purchase: ${text}`,()=>assert.equal(intent(text),'purchase'));
