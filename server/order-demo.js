import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Store} from './db.js';
import {Agent} from './agent.js';
import {demoProducts,replaceCatalog} from './catalog.js';
import {confirmOrder,orderPreview} from './orders.js';
import {changeOrderState} from './order-board.js';

export function orderDemoRoutes({app,store}){
 app.post('/api/simulator/order',async(req,res)=>{
  const{requestId}=z.object({requestId:z.uuid()}).strict().parse(req.body);
  const prior=store.get('SELECT o.id,o.chat_id,o.confirmed_by FROM sales_orders o JOIN chats c ON c.id=o.chat_id WHERE o.request_id=? AND c.channel=\'simulator\' AND c.provider=\'demo\'',requestId);
  if(prior){if(prior.confirmed_by!==req.user.id)throw Object.assign(new Error('Solicitação já utilizada.'),{status:409});return res.json({orderId:prior.id,chatId:prior.chat_id,duplicate:true});}
  const sandbox=new Store(':memory:'),agent=new Agent(sandbox,async()=>{throw new Error('Simulação tentou transporte externo.');});
  try{
   replaceCatalog(sandbox,demoProducts,'Catálogo fictício de demonstração');
   const phone='demo-pedido-'+randomUUID(),receive=body=>agent.receive({phone,name:'Cliente de teste · Pedido completo',body,channel:'simulator',provider:'demo',providerId:randomUUID()});
   const first=await receive('oi vim pelo site');const id=first.chatId;
   await receive('quero cotar duas correias A42');await receive('quero comprar a primeira opção');await receive('vou retirar');await receive('Quem vai retirar é Motorista Teste, da Empresa Demonstração');
   sandbox.pause(id,null,req.user.id);let chat=sandbox.chat(id);
   await agent.reply(chat,'Vou conferir os itens e registrar seu pedido de teste: duas correias A42, com retirada. Preços e produtos desta conversa são fictícios.',[],'owner',{author:req.user});
   const product=sandbox.get('SELECT id FROM products ORDER BY price,id LIMIT 1'),items=[{productId:product.id,pieces:2}];
   const preview=orderPreview(sandbox,chat,items),sale=confirmOrder(sandbox,chat,req.user,{items,version:chat.routing_version,revision:preview.revision,requestId});
   await agent.reply(chat,'Pedido de teste confirmado: 2 correias A42. Retirada registrada. O estoque real permanece preservado.',[],'owner',{author:req.user});
   changeOrderState(sandbox,req.user,sale.id,{state:'completed',version:0,note:'Teste completo: cotação, compra, retirada e conclusão.'});
   await agent.reply(chat,'Pedido de teste concluído. Obrigado! O diálogo ficará salvo para sua conferência.',[],'owner',{author:req.user});sandbox.closeChat(id);
   const saved=store.transaction(()=>{
    const previous=store.get('SELECT id,chat_id,confirmed_by FROM sales_orders WHERE request_id=?',requestId);if(previous){if(previous.confirmed_by!==req.user.id)throw Object.assign(new Error('Solicitação já utilizada.'),{status:409});return{orderId:previous.id,chatId:previous.chat_id,simulation:true,duplicate:true};}
    // Only simulated records leave the in-memory sandbox. No products or ledger.
    for(const table of ['chats','messages','sales_orders','sales_order_tracking','sales_order_events']){
     const rows=table==='chats'?[sandbox.get('SELECT * FROM chats WHERE id=?',id)]:table==='messages'?sandbox.all('SELECT * FROM messages WHERE chat_id=? ORDER BY rowid',id):table==='sales_orders'?[sandbox.get('SELECT * FROM sales_orders WHERE id=?',sale.id)]:sandbox.all(`SELECT * FROM ${table} WHERE order_id=?`,sale.id);
     for(const row of rows){const columns=Object.keys(row);store.run(`INSERT INTO ${table}(${columns.map(c=>'"'+c+'"').join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,...columns.map(c=>row[c]));}
    }
    return{orderId:sale.id,chatId:id,simulation:true};
   });store.changed();res.status(saved.duplicate?200:201).json(saved);
  }finally{agent.followups.close();sandbox.close();}
 });
}
