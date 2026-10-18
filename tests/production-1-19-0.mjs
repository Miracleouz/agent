// Production dependencies only. Controlled WhatsApp transport, no pairing.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Store} from '../server/db.js';
import {createApp,hashPassword} from '../server/app.js';
import {replaceCatalog} from '../server/catalog.js';
const store=new Store(':memory:'),sent=[],app=createApp({store,whatsapp:{snapshot:()=>({status:'ready'}),send:async(_chat,body)=>{sent.push(body);return randomUUID();}}});
const token=randomUUID();store.run('INSERT INTO users VALUES(?,?,?,?,?,1,?)','admin','Equipe','smoke@example.test',hashPassword('smoke-only-123'),'admin',1);store.run('INSERT INTO sessions VALUES(?,?,?)',createHash('sha256').update(token).digest('hex'),Date.now()+60000,'admin');
for(let i=0;i<125;i++)store.run('INSERT INTO contacts VALUES(?,?,?,?,?,?,?)','c-'+i,'Contato '+i,String(5511980000000+i),'','admin',1,1);
store.run("INSERT INTO chats(id,phone,name,channel,provider,mode,assigned_user_id,updated,last_inbound) VALUES('chat','5511999999999@c.us','Cliente','whatsapp','qr','manual','admin',?,0)",Date.now());
replaceCatalog(store,[{id:'b30',sku:'B30',name:'CORREIA B30',variant:'',brand:'GATES',price:50,quantity:20,unit:'Peça (PC)'}],'test');
const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));}),url=`http://127.0.0.1:${server.address().port}`,headers={Cookie:`cota_session=${token}`};
try{
 const response=await fetch(url+'/api/contacts/export.xlsx',{headers});assert.equal(response.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.equal(workbook.worksheets[0].rowCount,126);assert.equal(workbook.worksheets[0].getCell('B2').type,ExcelJS.ValueType.String);
 const write=async(path,body,method='POST')=>fetch(url+path,{method,headers:{...headers,'Content-Type':'application/json','X-Cota-Request':'1'},body:JSON.stringify(body)}),items=[{productId:store.get("SELECT id FROM products WHERE sku='B30'").id,pieces:2}];
 const preview=await write('/api/chats/chat/order/preview',{items,version:0});assert.equal(preview.status,200);const draft=await preview.json();const purchase=await write('/api/chats/chat/order/checkout',{items,version:0,revision:draft.revision,requestId:randomUUID()});assert.equal(purchase.status,201);const sale=await purchase.json();assert.equal(store.get("SELECT quantity FROM products WHERE sku='B30'").quantity,18);
 const report=await fetch(url+'/api/orders',{headers});assert.equal(report.status,200);assert.equal((await report.json()).summary.closed,1);
 const cancelled=await write(`/api/orders/${sale.id}/status`,{state:'cancelled',version:0},'PATCH');assert.equal(cancelled.status,200);assert.equal(store.get("SELECT quantity FROM products WHERE sku='B30'").quantity,20);
 const closed=await write('/api/chats/chat/close',{version:0});assert.equal(closed.status,200);assert.equal((await closed.json()).mode,'auto');assert.equal(sent.length,0);
 await app.locals.agent.receive({phone:'5511999999999@c.us',body:'vocês têm correia B30?',providerId:'new-customer-message',liveVerified:true});assert.equal(sent.length,1);assert.match(sent[0],/R\$/);
 console.log('PASS: production HTTP Excel export (125 contacts), checkout, order report, cancellation with stock return, closure without sending and automatic B30 quote only after customer inbound. No real WhatsApp account.');
}finally{app.locals.close();server.closeAllConnections();await new Promise(r=>server.close(r));store.close();}
