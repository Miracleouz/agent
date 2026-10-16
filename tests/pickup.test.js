import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {Agent,introduction} from '../server/agent.js';
import {demoProducts,replaceCatalog} from '../server/catalog.js';
import {deliveryMethod,pickupQuestion} from '../server/conversation.js';
const minute=60000,day=86400000;
function fixture(t,{send}={}){
 const store=new Store(':memory:');replaceCatalog(store,demoProducts,'test');let now=Date.now();const sent=[];
 const agent=new Agent(store,async(chat,body,actions)=>{sent.push({body,actions});return send?send(chat,body,actions):randomUUID();},{now:()=>now});
 t.after(()=>{agent.followups.close();store.close();});
 const receive=(body,extra={})=>agent.receive({phone:'5511999999999@c.us',body,providerId:randomUUID(),channel:'whatsapp',provider:'qr',...extra});
 return{store,agent,sent,receive,advance:time=>{now+=time;}};
}
const pickupVariants=[
 'vou mandar o motorista','vou mandar motoboy','vou mandar o uber','vou mandar o 99','vou mandar retirar','vou retirar',
 'Vou mandar um motorista','eu vou mandar meu motorista','vou enviar o motorista','vou chamar o motorista',
 'mando o motorista','vou mandar um motoboy','vou mandar o moto boy','vou mandar um moto-boy','vou enviar meu motoboy',
 'vou chamar um uber','vou pedir um Uber','mando um uber','vou enviar um uber','vou mandar um 99','vou chamar o 99',
 'vou mandar o entregador','vou enviar meu entregador','vamos mandar nosso motorista','irei mandar o motorista',
 'vou mandar o motorista para retirar','vou mandar um uber buscar aí','vou retirar na loja','eu retiro aí',
 'vou buscar aí','vou pegar na loja','RETIRA'
];
for(const context of ['primeiro contato','após cotação','junto com compra','durante espera de envio','após menu de envio'])for(const phrase of pickupVariants)test(`retirada: ${context} → ${phrase}`,async t=>{
 const{store,agent,sent,receive,advance}=fixture(t);
 if(context==='após cotação')await receive('cotar A42');
 if(context==='durante espera de envio'||context==='após menu de envio'){
  await receive('pode separar');advance(context==='após menu de envio'?3*minute:minute);await agent.followups.check();
 }
 const before=sent.length,result=await receive(context==='junto com compra'?'pode separar, '+phrase:phrase),chat=store.chat(result.chatId);
 assert.equal(chat.delivery_method,'retira');assert.equal(sent.length,before+1);assert(sent.at(-1).body.endsWith(pickupQuestion));assert.equal(chat.pickup_pending_details,1);assert.equal(chat.delivery_due_at,null);if(['primeiro contato','após cotação'].includes(context))assert(chat.followup_due_at);else assert.equal(chat.followup_due_at,null);
 if(context==='primeiro contato'){assert(sent.at(-1).body.startsWith(introduction));assert.equal(chat.purchase_requested,0);}
 if(context==='após cotação'){assert.equal(sent.at(-1).body,pickupQuestion);assert.equal(chat.purchase_requested,0);}
 if(context==='junto com compra'){assert.equal(chat.purchase_requested,1);assert.equal(chat.order_state,'interest');}
 const count=sent.length;
 await receive(phrase);await receive('vou mandar retirar');await receive('ok obgd');
 await receive('João da empresa Exemplo Industrial');await receive('Empresa: Exemplo Industrial Ltda');
 assert.equal(sent.length,count);assert.match(store.chat(result.chatId).pickup_details,/João da empresa Exemplo Industrial/);assert.match(store.chat(result.chatId).pickup_details,/Empresa: Exemplo Industrial Ltda/);
 for(let i=0;i<30;i++){advance(minute);await agent.followups.check();}assert.equal(sent.length,count+(['primeiro contato','após cotação'].includes(context)?1:0));
});
const otherDelivery=[
 ['pode mandar por motoboy','consultar_outros'],['manda por uber','consultar_outros'],['pode enviar por entregador','consultar_outros'],
 ['quero entrega por motoboy','consultar_outros'],['vou receber por uber','consultar_outros'],['consultar outros','consultar_outros'],
 ['vai por transportadora','consultar_outros'],['manda pelos Correios','correios'],['sedex','correios'],['não vou retirar, manda pelos correios','correios'],
 ['A99',null],['correia A 99',null],['99',null],['quero 99 correias A42',null],
 ['não vou retirar',null],['não vou mandar o motorista',null],['não vou mandar motoboy',null],['não vou mandar o uber',null],['não vou mandar o 99',null],
 ['não quero retirada',null],['talvez vou retirar',null],['se eu comprar vou mandar o motorista',null],['caso feche vou mandar um uber',null],
 ['vou retirar ou correios?',null],['vou mandar o uber ou correios',null],['vou mandar o motorista ou motoboy',null],
 ['vocês têm retirada?',null],['como funciona a retirada?',null],['vocês mandam uber?',null],['ainda não decidi',null]
];
for(const [phrase,expected] of otherDelivery)test(`não confundir retirada: ${phrase}`,()=>assert.equal(deliveryMethod(phrase),expected));
for(const guard of ['manual','desligado','responsável','liberada','atendente','pedido confirmado'])test(`retirada respeita ${guard}`,async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('pode separar');
 if(guard==='manual')store.pause(result.chatId,null);
 if(guard==='desligado')store.setSettings({agentEnabled:false});
 if(guard==='responsável'||guard==='liberada'){
  store.run("INSERT INTO users VALUES('test-user','Teste','test@example.test','unused','comercial',1,?)",Date.now());store.openChat(result.chatId,{id:'test-user',role:'comercial'});
  if(guard==='liberada')store.releaseChat(result.chatId);
 }
 if(guard==='atendente')await receive('quero falar com atendente');
 if(guard==='pedido confirmado'){store.cancelFollowups(result.chatId);store.run("UPDATE chats SET order_state='confirmed' WHERE id=?",result.chatId);}
 const count=sent.length;await receive('vou mandar o motorista');assert.equal(sent.length,count);assert.equal(store.chat(result.chatId).delivery_method,'retira');assert.equal(store.chat(result.chatId).pickup_prompted_at,null);
});
for(const [flag,value] of [['isGroup',true],['fromMe',true],['isStatus',true],['phone','120363000000@g.us'],['phone','status@broadcast'],['phone','123@newsletter']])test(`retirada ignora ${flag}=${value}`,async t=>{
 const{store,agent,sent,receive,advance}=fixture(t);await receive('vou mandar o motorista',{[flag]:value});advance(30*day);await agent.followups.check();assert.equal(sent.length,0);assert.equal(store.chats().length,0);
});
test('sem mensagem recebida não existe pergunta de retirada, mesmo com dados locais antigos',async t=>{
 const{store,agent,sent,advance}=fixture(t);store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound,delivery_method,pickup_pending_details) VALUES('local','5511@c.us','Local','whatsapp','qr',0,0,'retira',1)");
 for(let i=0;i<100;i++){advance(day);await agent.followups.check();}assert.equal(sent.length,0);
});
test('falha no transporte não repete pergunta nem apresentação',async t=>{
 const{store,sent,receive}=fixture(t,{send:async()=>{throw new Error('uncertain send');}});const result=await receive('vou mandar o motorista');
 await receive('vou mandar o uber');await receive('vou retirar');assert.equal(sent.length,1);assert.equal(store.messages(result.chatId).filter(message=>message.direction==='bot').length,1);assert.equal(store.messages(result.chatId)[1].status,'failed');assert(store.chat(result.chatId).pickup_prompted_at);
});
test('concorrência de cem entregas duplicadas produz uma única pergunta',async t=>{
 const{store,sent,receive}=fixture(t);await Promise.all(Array.from({length:100},()=>receive('vou mandar o motorista',{providerId:'same-inbound'})));assert.equal(sent.length,1);assert.equal(store.chats().length,1);assert.equal(store.messages(store.chats()[0].id).filter(message=>message.direction==='in').length,1);
});
test('variações concorrentes no mesmo chat não repetem a pergunta',async t=>{
 const{sent,receive}=fixture(t);await Promise.all(pickupVariants.map(phrase=>receive(phrase)));assert.equal(sent.length,1);
});
test('nova mensagem de retirada após 24h pode pedir os dados de novo; silêncio não envia nada',async t=>{
 const{agent,sent,receive,advance}=fixture(t);await receive('vou retirar');advance(day);await agent.followups.check();assert.equal(sent.length,1);await receive('vou mandar o motorista');assert.equal(sent.length,2);assert(sent.at(-1).body.endsWith(pickupQuestion));
});
test('uma nova cotação sai do preenchimento da retirada e mantém a busca por produto',async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('vou mandar motoboy');await receive('A42');assert.match(sent.at(-1).body,/R\$/);assert.equal(store.chat(result.chatId).pickup_pending_details,0);assert.equal(store.chat(result.chatId).pickup_details,null);
});
test('pedido de atendente prevalece sobre dados de retirada',async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('vou retirar');await receive('quero atendente, vou mandar um uber');assert.equal(store.chat(result.chatId).human_requested,1);assert.equal(sent.filter(message=>message.body.includes(pickupQuestion)).length,1);assert.equal(store.chat(result.chatId).pickup_pending_details,0);
});
test('entrega por aplicativo solicitada à loja não pede dados de retirada',async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('pode separar, pode mandar por motoboy');assert.equal(store.chat(result.chatId).delivery_method,'consultar_outros');assert(!sent.at(-1).body.includes(pickupQuestion));
});
test('retirada após menu de agradecimento substitui a pergunta de ajuda',async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('A42');await receive('obgd');await receive('vou mandar o motorista');assert.equal(sent.at(-1).body,pickupQuestion);assert.equal(store.chat(result.chatId).help_state,null);await receive('João, Empresa Exemplo');assert.equal(sent.at(-1).body,pickupQuestion);
});
test('retirada depois do encerramento só reabre em resposta à nova solicitação',async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('A42');await receive('obgd');await receive('não');const count=sent.length;await receive('obgd');assert.equal(sent.length,count);await receive('vou retirar');assert.equal(sent.length,count+1);assert.equal(store.chat(result.chatId).closed_at,null);
});
test('reinício preserva a pergunta feita e os dados; não gera primeiro contato nem repetição',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-pickup-')),file=join(dir,'db.sqlite');let store=new Store(file),agent;const sent=[];t.after(()=>{agent.followups.close();store.close();rmSync(dir,{recursive:true,force:true});});
 const send=async(_chat,body)=>{sent.push(body);return randomUUID();};agent=new Agent(store,send);const receive=body=>agent.receive({phone:'5511@c.us',channel:'whatsapp',provider:'qr',providerId:randomUUID(),body});
 const result=await receive('vou mandar o motorista');await receive('João da empresa Teste');agent.followups.close();store.close();store=new Store(file);agent=new Agent(store,send);await agent.followups.check();await receive('vou mandar o uber');assert.equal(sent.length,1);assert.equal(store.chat(result.chatId).pickup_details,'João da empresa Teste');assert.equal(store.chat(result.chatId).pickup_pending_details,1);
});
for(const body of ['cotar A42, vou retirar','quanto custa A42? vou retirar','correia A42 vou mandar o motorista','vou retirar correia A42','cotar A42; vou mandar o uber','vou mandar um moto-boy buscar aí, cotar A42'])test(`cotação e retirada na mesma mensagem: ${body}`,async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive(body);assert.equal(sent.length,1);assert.match(sent[0].body,/R\$/);assert(sent[0].body.endsWith(pickupQuestion));assert.equal(store.chat(result.chatId).delivery_method,'retira');assert.equal(store.chat(result.chatId).pickup_pending_details,1);assert(store.chat(result.chatId).followup_due_at);
});
for(const body of ['sim','não','ok','claro','não obrigado'])test(`confirmação curta depois da pergunta de retirada fica em silêncio: ${body}`,async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('A42');await receive('vou retirar');const count=sent.length;await receive(body);assert.equal(sent.length,count);assert.equal(store.chat(result.chatId).pickup_details,null);
});
test('reativação explícita permite retirada em chat que mantém responsável',async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('A42');store.run("INSERT INTO users VALUES('test-user','Teste','test@example.test','unused','comercial',1,?)",Date.now());store.openChat(result.chatId,{id:'test-user',role:'comercial'});store.resume(result.chatId);await receive('vou retirar');assert.equal(store.chat(result.chatId).assigned_user_id,'test-user');assert.equal(sent.at(-1).body,pickupQuestion);
});
test('largura ou frisos numéricos não são guardados como nome durante cotação com retirada',async t=>{
 const{store,sent,receive}=fixture(t);replaceCatalog(store,[{...demoProducts[0],name:'CORREIA PJ350 50 FRISOS',variant:'',unit:'Friso',quantity:50,price:7}],'test');const result=await receive('cotar PJ350, vou retirar');assert.equal(store.chat(result.chatId).pending_measure,'ribs');await receive('2');assert.match(sent.at(-1).body,/14,00/);assert.equal(store.chat(result.chatId).pending_measure,null);assert.equal(store.chat(result.chatId).pickup_details,null);
});
for(const body of ['Nome de quem vai retirar: João. Empresa: Exemplo','quem vai retirar é o João, empresa Exemplo','Empresa: Exemplo Correias','Nome: João Silva','Motorista: João da empresa Exemplo','Retirante: João; Empresa: Exemplo','Empresa: Exemplo Correias 2026'])test(`identificação de retirada é preservada literalmente: ${body}`,async t=>{
 const{store,sent,receive}=fixture(t);const result=await receive('vou retirar');const count=sent.length;await receive(body);assert.equal(sent.length,count);assert.equal(store.chat(result.chatId).pickup_details,body);
});
