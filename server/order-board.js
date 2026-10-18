import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {productBeltSpec} from './belts.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const round=n=>Math.round(n*1e8)/1e8;
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
export const orderDate=(now=Date.now())=>formatter.format(now);
export function orderPeriod(period,date){
 if(!['day','week','month'].includes(period)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw fail('Período ou data inválidos.',400);
 const base=new Date(date+'T00:00:00Z');if(!Number.isFinite(+base)||base.toISOString().slice(0,10)!==date)throw fail('Data inválida.',400);
 let start=+base,end;if(period==='week')start-=((base.getUTCDay()+6)%7)*86400000;if(period==='month')start=Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),1);
 end=period==='month'?Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,1):start+(period==='week'?7:1)*86400000;
 const midnight=value=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return value-(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-value);};
 return{from:midnight(start),to:midnight(end)};
}
export function orderCustomer(store,chat){const aliases=[chat.phone,...store.all('SELECT alias FROM whatsapp_chat_aliases WHERE chat_id=?',chat.id).map(x=>x.alias)],phone=aliases.find(id=>/^\d+@(c\.us|s\.whatsapp\.net)$/.test(id));return{name:chat.name,phone:phone?.split('@')[0]||null};}
const select=`SELECT o.*,(c.channel='simulator') simulation,COALESCE(t.state,'closed') state,COALESCE(t.version,0) version,t.updated status_updated,t.updated_name,t.note,COALESCE(t.stock_returned,0) stock_returned,COALESCE(t.customer_name,c.name) customer_name,COALESCE(t.customer_phone,CASE WHEN c.phone LIKE '%@c.us' OR c.phone LIKE '%@s.whatsapp.net' THEN substr(c.phone,1,instr(c.phone,'@')-1) END,(SELECT substr(a.alias,1,instr(a.alias,'@')-1) FROM whatsapp_chat_aliases a WHERE a.chat_id=c.id AND (a.alias LIKE '%@c.us' OR a.alias LIKE '%@s.whatsapp.net') LIMIT 1)) customer_phone FROM sales_orders o JOIN chats c ON c.id=o.chat_id LEFT JOIN sales_order_tracking t ON t.order_id=o.id`;
function order(store,id,user){const row=store.get(select+" WHERE o.id=? AND ((c.channel='whatsapp' AND c.provider='qr') OR (c.channel='simulator' AND c.provider='demo'))",id);if(!row||user.role!=='admin'&&row.confirmed_by!==user.id)throw fail('Pedido não encontrado.',404);return{...row,items:JSON.parse(row.items)};}
function restoreStock(store,sale,now){
 if(!sale.items.length)throw fail('O pedido não contém itens para uma devolução automática.');
 for(const line of sale.items){const p=store.get('SELECT * FROM products WHERE id=?',line.productId)||store.get('SELECT * FROM products WHERE sku=?',line.sku);if(!p||p.sku!==line.sku||p.unit!==line.unit)throw fail('O cadastro do produto mudou. Confira o cadastro antes de cancelar; o pedido e o estoque foram preservados.');
  if(!Number.isFinite(line.stockQuantity)||line.stockQuantity<=0)throw fail('Este pedido antigo não contém os dados necessários para devolver o estoque automaticamente.');
  const spec=productBeltSpec(p),saved=store.get('SELECT lots FROM product_stock_lots WHERE product_id=?',p.id);
  if(spec.open||['ribs','mm'].includes(spec.unit)){
   if(!saved)throw fail('O cadastro dos cortes foi substituído. Confira o estoque antes de cancelar; o pedido foi preservado.');const width=spec.open?line.mm:spec.unit==='ribs'?line.ribs:line.mm,length=spec.open?line.meters:1;
   if(!(width>0&&length>0&&Number.isInteger(line.pieces)&&line.pieces>0))throw fail('Medidas insuficientes para devolver os cortes.');
   const expected=spec.open?width*length*line.pieces/spec.mm:width*line.pieces;if(!Number.isFinite(expected)||Math.abs(expected-line.stockQuantity)>1e-6)throw fail('A unidade ou largura do produto mudou. Confira o cadastro antes de cancelar; o pedido foi preservado.');
   const lots=JSON.parse(saved.lots);for(let i=0;i<line.pieces;i++)lots.push({width,length});store.run('UPDATE product_stock_lots SET lots=? WHERE product_id=?',JSON.stringify(lots),p.id);
  }
  const after=round(p.quantity+line.stockQuantity);store.run('UPDATE products SET quantity=?,updated=? WHERE id=?',after,now,p.id);store.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?,?)',randomUUID(),sale.id,p.id,p.sku,-line.stockQuantity,p.quantity,after,now);
 }
}
export function changeOrderState(store,user,id,input){const result=store.transaction(()=>{const sale=order(store,id,user);if(sale.state===input.state)return{...sale,duplicate:true};if(sale.version!==input.version)throw fail('O pedido foi atualizado por outra pessoa. Atualize a lista.');if(sale.state!=='closed')throw fail('Este pedido já foi finalizado. O histórico da situação é preservado.');const now=Date.now(),restock=input.state==='cancelled'&&!sale.simulation;if(restock)restoreStock(store,sale,now);
   store.run('INSERT INTO sales_order_tracking(order_id,state,version,updated,updated_by,updated_name,note,customer_name,customer_phone,stock_returned) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET state=excluded.state,version=excluded.version,updated=excluded.updated,updated_by=excluded.updated_by,updated_name=excluded.updated_name,note=excluded.note,stock_returned=excluded.stock_returned',sale.id,input.state,sale.version+1,now,user.id,user.name,input.note,sale.customer_name,sale.customer_phone,restock?1:0);
   store.run('INSERT INTO sales_order_events VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),sale.id,sale.state,input.state,user.id,user.name,now,input.note,restock?1:0);
   store.run("UPDATE chats SET order_state=?,needs_human=CASE WHEN handoff_reason='order_closed' AND human_requested=0 THEN 0 ELSE needs_human END,purchase_requested=CASE WHEN handoff_reason='order_closed' THEN 0 ELSE purchase_requested END,handoff_reason=CASE WHEN handoff_reason='order_closed' AND human_requested=0 THEN NULL ELSE handoff_reason END WHERE id=? AND order_state='confirmed' AND order_confirmed_at=?",input.state,sale.chat_id,sale.created);
   return order(store,sale.id,user);});store.changed();return result;}
export function orderBoardRoutes({app,store}){
 app.get('/api/orders',(req,res)=>{const input=z.object({period:z.enum(['day','week','month']).default('day'),date:z.string().default(orderDate()),state:z.enum(['all','closed','completed','cancelled']).default('all'),mode:z.enum(['live','test']).default('live'),page:z.coerce.number().int().min(0).max(100000).default(0)}).parse(req.query),range=orderPeriod(input.period,input.date),params=[range.from,range.to];
  let where=(input.mode==='test'?" WHERE c.channel='simulator' AND c.provider='demo'":" WHERE c.channel='whatsapp' AND c.provider='qr'")+" AND o.created>=? AND o.created<?";if(req.user.role!=='admin'){where+=' AND o.confirmed_by=?';params.push(req.user.id);}
  const totals=store.all("SELECT COALESCE(t.state,'closed') state,count(*) count,sum(o.total) amount FROM sales_orders o JOIN chats c ON c.id=o.chat_id LEFT JOIN sales_order_tracking t ON t.order_id=o.id"+where+" GROUP BY COALESCE(t.state,'closed')",...params),summary={closed:0,completed:0,cancelled:0,amount:0};for(const row of totals){summary[row.state]=row.count;if(row.state!=='cancelled')summary.amount+=row.amount;}summary.amount=round(summary.amount);
  if(input.state!=='all'){where+=" AND COALESCE(t.state,'closed')=?";params.push(input.state);}const total=store.get('SELECT count(*) n FROM sales_orders o JOIN chats c ON c.id=o.chat_id LEFT JOIN sales_order_tracking t ON t.order_id=o.id'+where,...params).n;
  const items=store.all(select+where+' ORDER BY o.created DESC,o.id LIMIT 50 OFFSET ?',...params,input.page*50).map(row=>({...row,items:JSON.parse(row.items)}));res.json({...input,...range,total,limit:50,summary,items});
 });
 app.get('/api/orders/:id',(req,res)=>{const sale=order(store,req.params.id,req.user);res.json({...sale,events:store.all('SELECT from_state,to_state,actor_name,created,note,stock_returned FROM sales_order_events WHERE order_id=? ORDER BY created,id',sale.id)});});
 app.patch('/api/orders/:id/status',(req,res)=>{const input=z.object({state:z.enum(['completed','cancelled']),version:z.number().int().min(0),note:z.string().trim().max(500).default('')}).strict().parse(req.body);
  res.json(changeOrderState(store,req.user,req.params.id,input));
 });
}
