import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/db.js';
import {Agent,introduction} from '../server/agent.js';
import {WhatsApp} from '../server/whatsapp.js';
import {replaceCatalog} from '../server/catalog.js';
import {industrialStock} from './fixtures/industrial-stock.js';

const minute=60000,day=24*60*minute;
const openers=['oi vim pelo site','Olá, vim pelo site!','Bom dia, vim pelo site','Boa tarde vim pelo site','Boa noite vim pelo site','vim pelo site','oi','olá','opa','cheguei pelo site'];
const quotes=[
 'cotar corr B 72\ncorreia a 89\ncorreia 3VX 500',
 'B72, A89 e 3VX500',
 'preciso cotar B-72; A-89; 3VX-500',
 'quero orçamento de B72 e A89 e 3VX500',
 'QRO COTACAO B72,A89,3VX500',
 'correia B72\ncorreia A89\ncorreia 3VX500',
 'me passa preço da B72; valor da A89; 3VX500',
 'B 72 / A89 / 3VX500',
 'cotar 4 PK 650, B72 e A89',
 'quanto custa 4PK650',
];
class FakeClient extends EventEmitter{
 constructor(){super();this.sent=[];this.info={wid:{user:'5511000000000',_serialized:'5511000000000@c.us'}};}
 async initialize(){} async destroy(){} async logout(){}
 async sendMessage(phone,body){this.sent.push({phone,body});return{id:{_serialized:randomUUID()}};}
}
async function fixture(t){
 const store=new Store(':memory:');replaceCatalog(store,industrialStock,'test');const client=new FakeClient();let clock=Date.now();const pending=[];
 const whatsapp=new WhatsApp(store,'/tmp/cota-conversation-fake',{clientFactory:()=>client});
 const agent=new Agent(store,(...args)=>whatsapp.send(...args),{now:()=>clock,canSend:()=>whatsapp.status==='ready'});
 whatsapp.receiver=input=>{const result=agent.receive(input);pending.push(result);return result;};await whatsapp.connect();
 t.after(async()=>{await whatsapp.close();store.close();});
 const emit=(body,from,extra={})=>{const message={body,from,type:'chat',id:{_serialized:randomUUID(),fromMe:false},timestamp:Math.floor(clock/1000),_data:{isNewMsg:true,notifyName:'Cliente de teste'},...extra};client.emit('message',message);return message;};
 return{store,client,agent,emit,advance:ms=>{clock+=ms;},drain:()=>Promise.all(pending.splice(0))};
}

for(const [openerIndex,opener] of openers.entries())for(const [quoteIndex,quote] of quotes.entries()){
 const index=openerIndex*quotes.length+quoteIndex;
 test(`conversa ${index+1}: ${opener} → ${quote.replaceAll('\n',' / ')}`,async t=>{
  const{store,client,agent,emit,advance,drain}=await fixture(t);const phone=`551199${String(index).padStart(7,'0')}@c.us`,stranger=`559999${String(index).padStart(7,'0')}@c.us`;
  emit('quero comprar',stranger);advance(day);await agent.followups.check();assert.equal(client.sent.length,0);assert.equal(store.chats().length,0);
  client.emit('ready');
  const noise=['e2e_notification','notification','call_log','protocol','reaction','ciphertext','revoked','unknown'];
  emit('ATENDENTE',stranger,{type:noise[index%noise.length]});emit('oi',stranger,{fromMe:true});emit('oi','123@g.us');emit('oi','status@broadcast');
  emit('oi',stranger,{timestamp:Math.floor(Date.now()/1000)-600});await drain();advance(5*minute);await agent.followups.check();
  assert.equal(client.sent.length,0);assert.equal(store.chats().length,0);
  const first=emit(opener,phone);await drain();assert.equal(client.sent.length,1);assert.equal(client.sent[0].body,introduction);
  client.emit('message',first);await drain();assert.equal(client.sent.length,1);
  emit(quote,phone);await drain();assert.equal(client.sent.length,2);assert.match(client.sent[1].body,/R\$/);
  if(quoteIndex<9){assert.match(client.sent[1].body,/Cotação dos 3 itens/);assert.equal(JSON.parse(store.chats()[0].quoted_options).length,15);}
  else{assert.match(client.sent[1].body,/peça pronta/);assert.match(client.sent[1].body,/por friso × 4/);}
  assert.equal(client.sent.filter(message=>message.body.includes(introduction)).length,1);
  if(index%2===0){advance(5*minute-1);await agent.followups.check();emit('obrigado',phone);await drain();const count=client.sent.length;advance(6*minute);await agent.followups.check();assert.equal(client.sent.length,count);}
  else{advance(5*minute);await agent.followups.check();assert.equal(client.sent.length,3);assert.match(client.sent[2].body,/Quer fechar o pedido/);advance(minute);await agent.followups.check();assert.equal(client.sent.length,3);emit('3',phone);await drain();assert(store.chats()[0].closed_at);}
  const count=client.sent.length;advance(7*day);for(let tick=0;tick<10;tick++)await agent.followups.check();assert.equal(client.sent.length,count);
  assert(client.sent.every(message=>message.phone===phone));assert.equal(store.get('SELECT count(*) n FROM chats WHERE phone=?',stranger).n,0);
 });
}
for(let index=0;index<20;index++){
 test(`conversa sem início ${index+1}: cadastro e registros locais não autorizam primeiro contato`,async t=>{
  const{store,client,agent,advance}=await fixture(t);client.emit('ready');const id=randomUUID(),phone=`5577${String(index).padStart(9,'0')}@c.us`;
  store.run('INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES(?,?,?,?,?,?,?)',id,phone,'Cadastro sem mensagem','whatsapp','qr',Date.now(),0);
  const local=store.addMessage({chatId:id,direction:'bot',body:'Cotação local sem contato inicial',status:'sent'});
  agent.followups.schedule(id,local.id);assert.equal(store.chat(id).followup_due_at,null);
  store.run("UPDATE chats SET followup_due_at=?,followup_quote_id=?,followup_state='scheduled' WHERE id=?",agent.now()+5*minute,local.id,id);
  advance(5*minute);for(let tick=0;tick<100;tick++)await agent.followups.check();
  assert.equal(client.sent.length,0);assert.equal(store.chat(id).introduced_at,null);assert.equal(store.chat(id).followup_due_at,null);
 });
}
test('ROBINHO introduces himself once per 24 hours and only upon actual inbound messages',async t=>{
 const{store,client,agent,emit,advance,drain}=await fixture(t);client.emit('ready');const phone='5511222@c.us';
 emit('oi vim pelo site',phone);await drain();assert.equal(client.sent[0].body,introduction);
 advance(day-1);emit('oi',phone);await drain();assert.equal(client.sent.filter(message=>message.body===introduction).length,1);
 advance(1);await agent.followups.check();assert.equal(client.sent.length,2);
 emit('oi',phone);await drain();assert.equal(client.sent.at(-1).body,introduction);assert.equal(client.sent.filter(message=>message.body===introduction).length,2);
 assert(store.chats()[0].introduced_at);
});
test('introduction remains claimed after restart and does not bypass manual or disabled automation',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-intro-'));const file=join(dir,'db.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));let store=new Store(file),clock=Date.now();const sent=[];
 const send=async(chat,body)=>{sent.push(body);return randomUUID();};let agent=new Agent(store,send,{now:()=>clock});const input={phone:'5511@c.us',channel:'whatsapp',provider:'qr',body:'oi'};
 const first=await agent.receive(input);store.close();store=new Store(file);agent=new Agent(store,send,{now:()=>clock});
 try{
  await agent.receive(input);assert.equal(sent.filter(body=>body===introduction).length,1);
  clock+=day;store.pause(first.chatId,null);await agent.receive(input);assert.equal(sent.length,2);
  store.resume(first.chatId);store.setSettings({agentEnabled:false});await agent.receive(input);assert.equal(sent.length,2);
  store.setSettings({agentEnabled:true});await agent.receive(input);assert.equal(sent.at(-1),introduction);
 }finally{store.close();}
});
