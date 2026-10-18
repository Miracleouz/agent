import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {randomUUID,createHash} from 'node:crypto';
import {Store} from '../server/db.js';
import {Agent} from '../server/agent.js';
import {createApp,hashPassword} from '../server/app.js';
import {replaceCatalog} from '../server/catalog.js';
import {industrialStock} from './fixtures/industrial-stock.js';
function fixture(t){const store=new Store(':memory:'),sent=[];replaceCatalog(store,industrialStock,'test');let now=Date.now();const agent=new Agent(store,async(_chat,body)=>{sent.push(body);return randomUUID();},{now:()=>now});t.after(()=>{agent.followups.close();store.close();});const receive=(body,extra={})=>agent.receive({phone:'5511999999999@c.us',body,providerId:randomUUID(),liveVerified:true,...extra});return{store,agent,sent,receive,time:()=>now,advance:ms=>now+=ms};}
for(const closure of ['customer-auto','customer-manual','owner','silence','help-no'])for(const input of ['text','audio'])test(`${closure}: closed service waits silently, then automatically handles the next ${input}`,async t=>{
 const f=fixture(t),first=await f.receive('cotar B72'),id=first.chatId;
 if(closure==='customer-manual'){f.store.pause(id,null,'attendant');f.store.run('UPDATE chats SET needs_human=1,human_requested=1,purchase_requested=1 WHERE id=?',id);}
 if(closure.startsWith('customer'))await f.receive('encerrar conversa');
 if(closure==='owner')f.store.closeChat(id);
 if(closure==='silence'){f.advance(300000);await f.agent.followups.check();}
 if(closure==='help-no'){await f.receive('obrigado');await f.receive('Não');}
 const closed=f.store.chat(id),count=f.sent.length;assert(closed.closed_at);assert.equal(closed.mode,'auto');assert.equal(closed.needs_human,0);assert.equal(closed.human_requested,0);assert.equal(closed.purchase_requested,0);
 for(let i=0;i<20;i++){f.advance(60000);await f.agent.followups.check();}assert.equal(f.sent.length,count);
 if(input==='audio'){const providerId=randomUUID();await f.receive('[Áudio recebido]',{providerId,deferAudio:true});const m=f.store.get('SELECT * FROM messages WHERE provider_id=?',providerId);f.store.run("UPDATE messages SET transcript='vocês têm correia A89?',created=? WHERE id=?",f.time(),m.id);await f.agent.finishAudio(m.id);}else await f.receive('vocês têm correia A89?');
 assert.equal(f.sent.length,count+1);assert.match(f.sent.at(-1),/R\$/);assert.match(f.sent.at(-1),/A\s*89/);assert.equal(f.store.chat(id).closed_at,null);
});
test('closing never overrides the global agent switch or responds to duplicate messages',async t=>{const f=fixture(t),r=await f.receive('cotar B72');f.store.closeChat(r.chatId);const count=f.sent.length;f.store.setSettings({agentEnabled:false});await f.receive('cotar A89',{providerId:'after-close-disabled'});assert.equal(f.sent.length,count);f.store.setSettings({agentEnabled:true});await f.receive('cotar A89',{providerId:'after-close-disabled'});assert.equal(f.sent.length,count);await f.receive('cotar A89');assert.equal(f.sent.length,count+1);});
test('closing during an audio job invalidates its routing version and prevents a delayed reply',async t=>{const f=fixture(t);const r=await f.receive('[Áudio recebido]',{providerId:'pending-close',deferAudio:true}),m=f.store.get("SELECT * FROM messages WHERE provider_id='pending-close'");f.store.closeChat(r.chatId);f.store.run("UPDATE messages SET transcript='cotar B72' WHERE id=?",m.id);await f.agent.finishAudio(m.id);assert.equal(f.sent.length,0);assert.equal(f.store.chat(r.chatId).mode,'auto');});
test('close API enforces owner/Admin, CSRF and routing version; sends nothing and preserves history',async t=>{
 const store=new Store(':memory:'),sent=[],whatsapp={snapshot:()=>({status:'ready'}),send:async(...args)=>{sent.push(args);return randomUUID();}},app=createApp({store,whatsapp});t.after(()=>{app.locals.close();store.close();});
 const hash=hashPassword('close-fixture-only-123'),clients=[];
 for(const[id,role]of [['owner','comercial'],['other','comercial'],['admin','admin']]){const token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,id,id+'@example.test',hash,role,1);store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+60000,id);const client=request.agent(app);client.jar.setCookie(`cota_session=${token}; Path=/`);clients.push(client);}
 store.run("INSERT INTO chats(id,phone,name,channel,provider,mode,assigned_user_id,updated,last_inbound) VALUES('close-chat','5511999999999@c.us','Cliente','whatsapp','qr','manual','owner',?,0)",Date.now());store.addMessage({chatId:'close-chat',direction:'in',body:'Histórico preservado'});
 const url='/api/chats/close-chat/close',post=(client,body)=>client.post(url).set('X-Cota-Request','1').send(body);
 await clients[0].post(url).send({version:0}).expect(403);assert.notEqual((await post(clients[1],{version:0})).status,200);await post(clients[0],{version:999}).expect(409);
 const r=await post(clients[0],{version:0}).expect(200);assert.equal(r.body.mode,'auto');assert(r.body.closed_at);assert.equal(r.body.assigned_user_id,'owner');assert.equal(store.messages('close-chat').length,1);assert.equal(sent.length,0);
 store.pause('close-chat',null,'owner');await post(clients[2],{version:store.chat('close-chat').routing_version}).expect(200);assert.equal(sent.length,0);
});
