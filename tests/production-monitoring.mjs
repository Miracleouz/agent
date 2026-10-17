// Executed against production dependencies in a disposable Docker container.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/db.js';
import {createApp,hashPassword} from '../server/app.js';

test('production HTTP: private drafts, confirmed reply metrics, live transfer and disconnected data guards',async()=>{
 const store=new Store(':memory:'),sent=[];let connected=true;
 const whatsapp={snapshot:()=>({status:connected?'ready':'disconnected'}),send:async(_chat,body)=>{sent.push(body);return randomUUID();}};
 const app=createApp({store,whatsapp}),secret='production-monitoring-123',hash=hashPassword(secret);
 for(const[id,name,role]of[['admin','Robson','admin'],['a','Bianca','comercial'],['b','Nicole','comercial']])store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)',id,name,id+'@example.test',hash,role,Date.now());
 store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound,assigned_user_id,mode) VALUES('chat','5511999999999@c.us','Cliente produção','whatsapp','qr',?,?,'a','manual')",Date.now(),Date.now());
 const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));}),base=`http://127.0.0.1:${server.address().port}`;let reader;
 const call=async(path,{cookie,method='GET',body,status=200}={})=>{const response=await fetch(base+'/api'+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),'X-Cota-Request':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.equal(response.status,status,await response.clone().text());return{data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const cookies={};for(const id of ['admin','a','b'])cookies[id]=(await call('/auth/login',{method:'POST',body:{email:id+'@example.test',password:secret}})).cookie;
  await call('/monitoring',{cookie:cookies.a,status:403});
  await call('/chats/chat/draft',{cookie:cookies.a,method:'PUT',body:{body:'Conferindo correias',revision:0,version:0}});
  assert.equal(sent.length,0);assert.equal((await call('/chats/chat/draft',{cookie:cookies.admin})).data.body,'');
  await app.locals.agent.receive({phone:'5511999999999@c.us',name:'Cliente produção',body:'Quanto está a correia B72?',providerId:randomUUID(),liveVerified:true});assert.equal(sent.length,0);
  const message=(await call('/chats/chat/send',{cookie:cookies.a,method:'POST',status:201,body:{body:'Conferindo correias',version:0,draftRevision:1}})).data;assert.equal(message.status,'sent');assert.equal(message.draft.body,'');assert.equal(sent.length,1);
  let report=(await call('/monitoring',{cookie:cookies.admin})).data;assert.equal(report.totals.samples,1);assert.equal(report.users.find(u=>u.id==='a').samples,1);assert.equal(report.chats[0].assignedName,'Bianca');
  const events=await fetch(base+'/api/events',{headers:{Cookie:cookies.admin}});reader=events.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: ready/);
  await call('/chats/chat/assign',{cookie:cookies.admin,method:'POST',body:{userId:'b'}});
  const pushed=await Promise.race([reader.read(),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Missing SSE push')),2000);timer.unref();})]);assert.match(new TextDecoder().decode(pushed.value),/event: change/);
  report=(await call('/monitoring',{cookie:cookies.admin})).data;assert.equal(report.chats[0].assignedName,'Nicole');assert.equal(report.users.find(u=>u.id==='a').samples,1);assert.equal((await call('/chats/chat/draft',{cookie:cookies.b})).data.body,'');
  connected=false;store.changed();report=(await call('/monitoring',{cookie:cookies.admin})).data;assert.deepEqual(report.chats,[]);assert.deepEqual(report.users,[]);assert.equal(report.connected,false);assert.equal(sent.length,1);
 }finally{await reader?.cancel();app.locals.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
});
