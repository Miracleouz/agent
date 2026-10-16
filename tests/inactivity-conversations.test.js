import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/db.js';
import {Agent,introduction} from '../server/agent.js';
import {WhatsApp} from '../server/whatsapp.js';
import {replaceCatalog} from '../server/catalog.js';
import {industrialStock} from './fixtures/industrial-stock.js';
import {inactivityMessage} from '../server/followups.js';
const minute=60000,day=86400000;
const openers=['oi vim pelo site','Olá, vim pelo site!','Bom dia, vim pelo site','Boa tarde vim pelo site','Boa noite vim pelo site','vim pelo site','oi','olá','opa','cheguei pelo site','OI!!!','OLÁ!','bom dia','boa tarde','boa noite','e aí','hello','vim do site','cheguei do site','Olá, vim através do site'];
const quotes=['cotar corr B 72','QRO COTACAO B72','kero orcamento A89','vlr da coreia A 89','precu 3VX500','orcamentu B-72','quanto custa 4 PK 650','PK650 com 4 frizos','cotar 4PK650','correia 3vx 500','me passa os valores da B72','quero cotar B72 e A89','cotar corr B72; A89; 3VX500','A-89','preciso de uma correia B 72'];
const noises=['e2e_notification','notification','call_log','protocol','reaction','ciphertext','revoked','unknown','gp2','group_notification','broadcast_notification','future_system_type'];
class Client extends EventEmitter{
 constructor(){super();this.sent=[];this.info={wid:{user:'5511000000000',_serialized:'5511000000000@c.us'}};}
 async initialize(){} async destroy(){} async logout(){}
 async sendMessage(phone,body){this.sent.push({phone,body});return{id:{_serialized:randomUUID()}};}
}
async function fixture(t){
 const store=new Store(':memory:');replaceCatalog(store,industrialStock,'test');const client=new Client(),pending=[];let clock=Date.now();
 const wa=new WhatsApp(store,'/tmp/cota-idle-fake',{clientFactory:()=>client}),agent=new Agent(store,(...args)=>wa.send(...args),{now:()=>clock,canSend:()=>wa.status==='ready'});
 wa.receiver=input=>{const result=agent.receive(input);pending.push(result);return result;};await wa.connect();t.after(async()=>{agent.followups.close();await wa.close();store.close();});
 const emit=(body,from,extra={})=>{const message={body,from,type:'chat',id:{_serialized:randomUUID(),fromMe:false},timestamp:Math.floor(clock/1000),_data:{isNewMsg:true,notifyName:'Cliente de teste'},...extra};client.emit('message',message);return message;};
 return{store,agent,client,wa,emit,advance:ms=>{clock+=ms;},drain:()=>Promise.all(pending.splice(0))};
}
for(const [oi,opener] of openers.entries())for(const [qi,quote] of quotes.entries()){
 const index=oi*quotes.length+qi;
 test(`segurança e inatividade ${index+1}/300: ${opener} → ${quote}`,async t=>{
  const{store,agent,client,emit,advance,drain}=await fixture(t),phone=`551199${String(index).padStart(7,'0')}@c.us`,stranger=`557799${String(index).padStart(7,'0')}@c.us`;
  // Registration and imported/local history are not actual received messages.
  store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES('local',?,'Cadastro','whatsapp','qr',0,0)",stranger);
  const localInbound=store.addMessage({chatId:'local',direction:'in',body:quote}),localBot=store.addMessage({chatId:'local',direction:'bot',body:'Cotação local sem contato inicial',status:'sent'});
  store.run('UPDATE chats SET service_origin_id=? WHERE id=?',localInbound.id,'local');
  assert.equal((await agent.reply(store.chat('local'),'Não pode enviar')).status,'blocked');agent.followups.schedule('local');assert.equal(store.chat('local').followup_due_at,null);
  store.run("UPDATE chats SET followup_due_at=?,followup_quote_id=?,followup_inbound_id=?,followup_state='scheduled' WHERE id='local'",agent.now()+5*minute,localBot.id,localInbound.id);
  emit('quero comprar',stranger);advance(5*minute);await agent.followups.check();assert.equal(client.sent.length,0);
  client.emit('ready');
  emit('ATENDENTE',stranger,{type:noises[index%noises.length],hasMedia:true});emit('oi',stranger,{fromMe:true});emit('oi','123@g.us');emit('oi','status@broadcast');emit('oi','123@newsletter');emit(quote,stranger,{timestamp:Math.floor(Date.now()/1000)-600});emit(quote,stranger,{_data:{isNewMsg:false}});await drain();advance(5*minute);await agent.followups.check();assert.equal(client.sent.length,0);assert.equal(store.chat('local').introduced_at,null);assert.equal(store.chat('local').needs_human,0);
  const first=emit(opener,phone);await drain();assert.equal(client.sent.length,1);assert.equal(client.sent[0].body,introduction);assert(store.get("SELECT id FROM messages WHERE chat_id=(SELECT id FROM chats WHERE phone=?) AND direction='in' AND inbound_verified=1",phone));
  client.emit('message',first);await drain();assert.equal(client.sent.length,1);
  advance(2*minute);emit(quote,phone);await drain();assert.equal(client.sent.length,2);assert.match(client.sent.at(-1).body,/R\$/);assert(!client.sent.at(-1).body.includes(inactivityMessage));
  const chat=store.get('SELECT * FROM chats WHERE phone=?',phone);assert.equal(chat.mode,'auto');assert.equal(chat.purchase_requested,0);
  advance(3*minute);await agent.followups.check();assert.equal(client.sent.length,2); // First inbound is already five minutes old; latest inbound controls the deadline.
  advance(2*minute-1);await agent.followups.check();assert.equal(client.sent.length,2);advance(1);await Promise.all(Array.from({length:10},()=>agent.followups.check()));
  assert.equal(client.sent.length,3);assert.equal(client.sent.at(-1).body,inactivityMessage);assert(store.chat(chat.id).closed_at);assert.equal(store.chat(chat.id).query,null);assert.equal(store.chat(chat.id).followup_menu,0);assert.equal(store.chat(chat.id).followup_due_at,null);assert.equal(store.chat(chat.id).delivery_due_at,null);
  for(const courtesy of ['ok','obgd','sim','não','1','2','3'])emit(courtesy,phone);await drain();assert.equal(client.sent.length,3);
  advance(30*day);for(let i=0;i<25;i++)await agent.followups.check();assert.equal(client.sent.length,3);assert(client.sent.every(message=>message.phone===phone));assert.equal(store.messages('local').filter(message=>message.direction==='bot').length,1);
  // Only a new meaningful received request can reopen; another close is allowed for that new service.
  emit('cotar B72',phone);await drain();assert.equal(client.sent.length,4);assert.match(client.sent.at(-1).body,/R\$/);assert.equal(store.chat(chat.id).closed_at,null);advance(5*minute);await agent.followups.check();assert.equal(client.sent.length,5);assert.equal(client.sent.at(-1).body,inactivityMessage);
 });
}
for(const [index,type] of noises.entries())test(`sem primeiro contato: evento interno ${type}`,async t=>{
 const{store,agent,client,emit,advance,drain}=await fixture(t);client.emit('ready');emit('quero comprar',`551188${index}@c.us`,{type,hasMedia:true});await drain();advance(30*day);await agent.followups.check();assert.equal(client.sent.length,0);assert.equal(store.chats().length,0);
});
for(const extra of [{fromMe:true},{id:{_serialized:'own',fromMe:true}},{isStatus:true},{from:'123@g.us'},{from:'status@broadcast'},{from:'123@newsletter'},{from:'invalid'},{_data:{isNewMsg:false}}])test(`sem primeiro contato: ${JSON.stringify(extra)}`,async t=>{
 const{store,agent,client,emit,advance,drain}=await fixture(t);client.emit('ready');emit('ATENDENTE','5511888@c.us',extra);await drain();advance(30*day);await agent.followups.check();assert.equal(client.sent.length,0);assert.equal(store.chats().length,0);
});
for(const type of noises)test(`evento interno não reinicia prazo de atendimento ativo: ${type}`,async t=>{
 const{store,agent,client,emit,advance,drain}=await fixture(t);client.emit('ready');const phone='5511888@c.us';emit('cotar A89',phone);await drain();const due=store.chats()[0].followup_due_at;advance(4*minute);emit('ATENDENTE',phone,{type,hasMedia:true});await drain();assert.equal(store.chats()[0].followup_due_at,due);assert.equal(client.sent.length,1);advance(minute);await agent.followups.check();assert.equal(client.sent.length,2);assert.equal(client.sent.at(-1).body,inactivityMessage);
});
for(const extra of [{fromMe:true},{id:{_serialized:'own',fromMe:true}},{isStatus:true},{from:'123@g.us'},{from:'status@broadcast'},{from:'123@newsletter'},{from:'invalid'},{_data:{isNewMsg:false}}])test(`entrada ignorada não reinicia prazo ativo: ${JSON.stringify(extra)}`,async t=>{
 const{store,agent,client,emit,advance,drain}=await fixture(t);client.emit('ready');const phone='5511888@c.us';emit('cotar A89',phone);await drain();const due=store.chats()[0].followup_due_at;advance(4*minute);emit('ATENDENTE',phone,extra);await drain();assert.equal(store.chats()[0].followup_due_at,due);advance(minute);await agent.followups.check();assert.equal(client.sent.length,2);assert.equal(client.sent.at(-1).body,inactivityMessage);
});
