import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {randomUUID} from 'node:crypto';
import {createAccounts} from './accounts.js';
export {hashPassword} from './accounts.js';
import {z} from 'zod';
import {readRows,validateRows,replaceCatalog,fetchSheet,sheetExport} from './catalog.js';
import {Agent} from './agent.js';
import {contactRoutes} from './contacts.js';
import {messageToolsRoutes} from './message-tools.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createApp({store,whatsapp,production=false,appUrl=process.env.APP_URL}){
 const app=express();app.disable('x-powered-by');
 const secure=!!appUrl?.startsWith('https:');
 app.use(helmet({contentSecurityPolicy:production?{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","blob:"],connectSrc:["'self'"],upgradeInsecureRequests:secure?[]:null}}:false,strictTransportSecurity:secure?undefined:false}));
 app.use(express.json({limit:'100kb'}));app.use(cookieParser());
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
  if(req.get('X-Cota-Request')!=='1')return res.status(403).json({error:'Requisição inválida. Atualize o painel.'});
  const origin=req.get('Origin');if(origin){const allowed=appUrl?new URL(appUrl).origin:`${req.protocol}://${req.get('host')}`;if(origin!==allowed)return res.status(403).json({error:'Origem não autorizada.'});}
 }next();});
 const authLimit=rateLimit({windowMs:15*60000,limit:12,skipSuccessfulRequests:true,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas tentativas. Aguarde 15 minutos.'}});
 const cookie={httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:7*86400000};
 const accounts=createAccounts(store,cookie),adminOnly=accounts.adminOnly;
 const typing=new Map();
 function clearPresence(userId,chatId=null){for(const [key,value] of typing)if(value.userId===userId&&(!chatId||value.chatId===chatId))typing.delete(key);store.changed();}
 function presence(){const now=Date.now();for(const [key,value] of typing)if(value.expires<=now||!store.get('SELECT id FROM users WHERE id=? AND active=1',value.userId))typing.delete(key);return [...typing.values()].map(({expires,...value})=>value);}
 accounts.publicRoutes(app,authLimit);
 app.use('/api',accounts.middleware);
 app.use('/api',rateLimit({windowMs:60000,limit:600,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas solicitações. Aguarde um minuto.'}}));
 accounts.protectedRoutes(app,clearPresence);
 app.get('/api/bootstrap',(req,res)=>{
  const settings=store.settings(),connection=whatsapp.snapshot(),admin=req.user.role==='admin';
  const chats=store.chats().filter(chat=>admin||!chat.assigned_user_id||chat.assigned_user_id===req.user.id),visibleIds=new Set(chats.map(chat=>chat.id));
  res.json({currentUser:req.user,settings:admin?settings:{businessName:settings.businessName,agentEnabled:settings.agentEnabled,pauseMinutes:settings.pauseMinutes},stats:store.stats({userId:admin?null:req.user.id}),chats,groups:store.groupList(),typing:presence().filter(item=>visibleIds.has(item.chatId)),team:admin?store.all('SELECT id,name,role FROM users WHERE active=1 ORDER BY name'):[],connection:admin?connection:{status:connection.status,number:connection.number},imports:admin?store.all('SELECT * FROM imports ORDER BY created DESC LIMIT 8'):[],events:admin?store.all('SELECT * FROM events ORDER BY created DESC LIMIT 12'):[]});
 });
 app.get('/api/events',(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('event: ready\ndata: {}\n\n');
  const onChange=()=>{if(!accounts.getUser(req)){res.end();return;}res.write('event: change\ndata: {}\n\n');};store.on('change',onChange);
  const keepalive=setInterval(()=>{if(!accounts.getUser(req)){res.end();return;}res.write(': heartbeat\n\n');},25000);
  req.on('close',()=>{clearInterval(keepalive);store.off('change',onChange);});
 });
 app.patch('/api/settings',adminOnly,(req,res)=>{
  const input=z.object({businessName:z.string().trim().min(2).max(80).optional(),pauseMinutes:z.number().int().min(1).max(1440).optional(),agentEnabled:z.boolean().optional(),signHumanMessages:z.boolean().optional(),followupMinutes:z.literal(5).optional(),syncMinutes:z.union([z.literal(0),z.number().int().min(5).max(1440)]).optional(),sheetUrl:z.string().max(500).optional(),priceMode:z.enum(['unconfirmed','sale','cost']).optional(),markupPercent:z.number().min(0).max(1000).optional(),mmDimension:z.literal('width').optional(),openBeltPriceBasis:z.enum(['unconfirmed','per_meter_mm','per_meter_full_width']).optional()}).strict().parse(req.body);
  if(input.sheetUrl)sheetExport(input.sheetUrl);res.json(store.setSettings(input));
 });
 function getChat(id){const chat=store.chat(id);if(!chat)throw fail('Conversa não encontrada.',404);return chat;}
 function visibleChat(req){const chat=getChat(req.params.id);if(req.user.role!=='admin'&&chat.assigned_user_id&&chat.assigned_user_id!==req.user.id)throw fail('Esta conversa está com outro usuário.',403);return chat;}
 app.get('/api/chats/:id/messages',(req,res)=>{const chat=visibleChat(req);whatsapp.loadHistory?.(chat).catch(()=>{});res.json(store.messages(req.params.id));});
 app.post('/api/chats/:id/read',(req,res)=>{const chat=visibleChat(req);if(chat.assigned_user_id===req.user.id){store.run('UPDATE chats SET unread=0 WHERE id=?',chat.id);store.changed();}res.json({ok:true});});
 function getGroup(id){const group=store.get('SELECT id FROM whatsapp_groups WHERE id=?',id);if(!group)throw fail('Grupo não encontrado.',404);return group;}
 app.get('/api/groups/:id/messages',(req,res)=>{getGroup(req.params.id);res.json(store.groupMessages(req.params.id));});
 app.post('/api/groups/:id/read',(req,res)=>{getGroup(req.params.id);store.run('UPDATE whatsapp_groups SET unread=0 WHERE id=?',req.params.id);store.changed();res.json({ok:true});});
 function queued(req,fn){const original=getChat(req.params.id);return agent.enqueue(`${original.provider}:${original.channel}:${original.phone}`,()=>{
  const user=accounts.getUser(req);if(!user)throw fail('Entre novamente no painel.',401);req.user=user;return fn(getChat(original.id),user);
 });}
 app.post('/api/chats/:id/open',async(req,res)=>{
  z.object({}).strict().parse(req.body||{});const result=await queued(req,(_chat,user)=>store.openChat(req.params.id,user));res.json(result);
 });
 app.post('/api/chats/:id/release',async(req,res)=>{
  const {version}=z.object({version:z.number().int().min(0)}).strict().parse(req.body);
  const result=await queued(req,(chat,user)=>{
   if(chat.routing_version!==version)throw fail('O atendimento mudou. Atualize antes de liberar.',409);
   if(!chat.assigned_user_id)throw fail('A conversa já está na fila.',409);
   if(chat.assigned_user_id!==user.id&&user.role!=='admin')throw fail('Somente o responsável ou um Admin pode liberar esta conversa.',403);
   clearPresence(chat.assigned_user_id,chat.id);const released=store.releaseChat(chat.id);store.event('release',`Conversa liberada por ${user.name}.`);return released;
  });res.json(result);
 });
 function canControl(req,chat,{takeover=false}={}){
  if(chat.assigned_user_id&&chat.assigned_user_id!==req.user.id&&!(takeover&&req.user.role==='admin'))throw fail('Esta conversa está com outro usuário. Peça a um Admin para transferir o atendimento.',409);
 }
 app.post('/api/chats/:id/pause',async(req,res)=>{
  const input=z.object({minutes:z.number().int().min(1).max(1440).nullable(),takeover:z.boolean().optional()}).strict().parse(req.body);
  res.json(await queued(req,chat=>{canControl(req,chat,input);return store.pause(chat.id,input.minutes,req.user.id);}));
 });
 app.post('/api/chats/:id/resume',async(req,res)=>{res.json(await queued(req,chat=>{if(req.user.role!=='admin')canControl(req,chat);clearPresence(chat.assigned_user_id,chat.id);return store.resume(chat.id);}));});
 app.post('/api/chats/:id/assign',adminOnly,async(req,res)=>{
  const {userId}=z.object({userId:z.string().min(1).max(100)}).strict().parse(req.body);
  res.json(await queued(req,chat=>{
   if(req.user.role!=='admin')throw fail('Somente um Admin pode transferir.',403);
   const user=store.get('SELECT id,name FROM users WHERE id=? AND active=1',userId);if(!user)throw fail('Escolha um usuário ativo.',400);
   clearPresence(chat.assigned_user_id,chat.id);store.pause(chat.id,null,user.id);store.event('assignment',`Atendimento transferido para ${user.name} por ${req.user.name}.`);return store.chat(chat.id);
  }));
 });
 app.post('/api/chats/:id/typing',(req,res)=>{
  const chat=getChat(req.params.id),input=z.object({typing:z.boolean()}).strict().parse(req.body);canControl(req,chat);
  const key=chat.id+':'+req.user.id;if(input.typing){if(chat.mode!=='manual')throw fail('Assuma o atendimento antes de digitar.',409);typing.set(key,{chatId:chat.id,userId:req.user.id,name:req.user.name,expires:Date.now()+8000});}else typing.delete(key);
  store.changed();res.json({ok:true});
 });
 app.post('/api/chats/:id/order/confirm',(req,res)=>{
  const chat=getChat(req.params.id);canControl(req,chat);
  if(chat.mode!=='manual')throw fail('Assuma o atendimento antes de marcar o pedido.',409);
  if(!['interest','confirmed'].includes(chat.order_state))throw fail('Não há intenção de compra registrada nesta conversa.',409);
  if(chat.order_state==='confirmed')return res.json(chat);
  store.cancelFollowups(chat.id);store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1,handoff_reason='order_closed',order_state='confirmed',order_confirmed_at=?,order_confirmed_by=?,order_confirmed_name=?,assigned_user_id=COALESCE(assigned_user_id,?) WHERE id=?",Date.now(),req.user.id,req.user.name,req.user.id,chat.id);
  store.event('order',`Pedido marcado como fechado por ${req.user.name}.`);res.json(store.chat(chat.id));
 });
 const agent=new Agent(store,(chat,body,actions)=>whatsapp.send(chat,body,actions),{canSend:chat=>chat.channel==='simulator'||whatsapp.snapshot().status==='ready'});whatsapp.receiver=input=>agent.receive(input);
 contactRoutes({app,store,accounts,agent,whatsapp});
 messageToolsRoutes({app,store,accounts,agent,whatsapp,getChat,visibleChat,queued,canControl});
 app.post('/api/chats/:id/send',async(req,res)=>{
  const original=getChat(req.params.id),{body,version}=z.object({body:z.string().trim().min(1).max(4000),version:z.number().int().min(0).optional()}).strict().parse(req.body);
  const result=await agent.enqueue(`${original.provider}:${original.channel}:${original.phone}`,async()=>{
   const user=accounts.getUser(req);if(!user)throw fail('Entre novamente no painel.',401);
   const chat=getChat(original.id);if(chat.mode!=='manual')throw fail('Ative "Responder manual" antes de enviar.',409);canControl(req,chat);
   if(chat.routing_version!==original.routing_version||version!==undefined&&version!==chat.routing_version)throw fail('O atendimento mudou. Confira a conversa antes de enviar.',409);
   if(!chat.assigned_user_id)store.openChat(chat.id,user);
   typing.delete(chat.id+':'+user.id);const transportBody=store.settings().signHumanMessages?`*${user.name}*: ${body}`:body;
   return agent.reply(chat,body,[],'owner',{author:user,transportBody});
  });
  res.status(result.status==='failed'?502:201).json(result.status==='failed'?{error:result.error,message:result}:result);
 });
 app.post('/api/simulator/message',async(req,res)=>{
  const input=z.object({phone:z.string().regex(/^demo-[a-zA-Z0-9-]{1,50}$/).default('demo-cliente'),name:z.string().trim().min(1).max(80).default('Cliente de teste'),body:z.string().trim().min(1).max(4000),isGroup:z.boolean().optional()}).parse(req.body);
  res.status(201).json(await agent.receive({...input,channel:'simulator',provider:'demo',providerId:randomUUID()}));
 });
 app.delete('/api/simulator',adminOnly,(req,res)=>{store.transaction(()=>{store.run("DELETE FROM message_edits WHERE message_id IN (SELECT id FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE channel='simulator'))");store.run("DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE channel='simulator')");store.run("DELETE FROM chats WHERE channel='simulator'");});store.changed();res.json({ok:true});});
 app.get('/api/products',(req,res)=>{const search=String(req.query.search||'').slice(0,100),page=Math.max(0,Math.min(2000,Number(req.query.page)||0)),limit=100;const where='WHERE name LIKE ? OR brand LIKE ? OR variant LIKE ? OR sku LIKE ?',params=Array(4).fill(`%${search}%`);res.json({items:store.all('SELECT * FROM products '+where+' ORDER BY name,brand LIMIT ? OFFSET ?',...params,limit,page*limit),total:store.get('SELECT count(*) n FROM products '+where,...params).n,page,limit,unpriced:store.get('SELECT count(*) n FROM products WHERE price IS NULL').n});});
 app.get('/api/stock/template',(_req,res)=>res.type('text/csv').attachment('modelo-estoque.csv').send('\uFEFFsku;produto;marca;medida;preco;quantidade\nEXEMPLO-A42;Correia industrial em V;Marca exemplo;A-42;49,90;12\n'));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}});
 app.post('/api/stock/preview',adminOnly,upload.single('file'),async(req,res)=>{if(!req.file)throw fail('Selecione um arquivo CSV ou Excel.');const items=validateRows(await readRows(req.file.buffer,req.file.originalname));res.json({count:items.length,unpriced:items.filter(p=>p.price===null).length,preview:items.slice(0,8)});});
 app.post('/api/stock/import',adminOnly,upload.single('file'),async(req,res)=>{
  if(req.body.confirm!=='replace')throw fail('Confirme a substituição do estoque.');if(!req.file)throw fail('Selecione um arquivo.');
  const items=validateRows(await readRows(req.file.buffer,req.file.originalname));const count=replaceCatalog(store,items,'Arquivo '+req.file.originalname.slice(0,120));res.json({count});
 });
 let syncing=false;
 async function syncStock(url){if(syncing)throw fail('Já existe uma sincronização em andamento.',409);syncing=true;try{const items=await fetchSheet(url);const count=replaceCatalog(store,items,'Google Sheets');store.setSettings({sheetUrl:url,lastSync:Date.now()});return count;}finally{syncing=false;}}
 app.post('/api/stock/sync',adminOnly,async(req,res)=>{const{url}=z.object({url:z.string().max(500)}).parse(req.body);res.json({count:await syncStock(url)});});
 app.post('/api/whatsapp/connect',adminOnly,async(_req,res)=>res.json(await whatsapp.connect()));
 app.post('/api/whatsapp/sync',adminOnly,(req,res)=>{z.object({}).strict().parse(req.body||{});if(whatsapp.snapshot().status!=='ready')throw fail('Aguarde o WhatsApp ficar Conectado antes de sincronizar.',409);whatsapp.sync().catch(()=>{});res.status(202).json({ok:true});});
 app.post('/api/whatsapp/disconnect',adminOnly,async(_req,res)=>{await whatsapp.disconnect();res.json(whatsapp.snapshot());});
 app.use('/api',(_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
 app.use((err,_req,res,next)=>{
  if(res.headersSent)return next(err);
  if(err instanceof z.ZodError)return res.status(400).json({error:'Verifique os campos: '+err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});
  if(err instanceof multer.MulterError)return res.status(400).json({error:'Arquivo inválido. O limite é de 8 MB.'});
  if(err.type==='entity.too.large')return res.status(413).json({error:'A mensagem excede o tamanho permitido.'});
  if(err.status||err.message?.match(/planilha|arquivo|coluna|Coluna|Cabeçalho|Linha|produto|estoque|CSV|Link|link|aba|Google|8 MB|100.000/i))return res.status(err.status||400).json({error:err.message});
  console.error('Erro interno:',err.name);res.status(500).json({error:'Não foi possível concluir. Verifique a conexão e tente novamente.'});
 });
 let lastAttempt=0;
 const timer=setInterval(()=>{store.resumeExpired();const typingCount=typing.size;presence();if(typing.size<typingCount)store.changed();agent.followups.check().catch(()=>store.event('followup_error','Não foi possível conferir o acompanhamento. Nenhum reenvio automático foi agendado.'));const s=store.settings();if(s.syncMinutes>0&&Date.now()-Math.max(s.lastSync||0,lastAttempt)>s.syncMinutes*60000){lastAttempt=Date.now();syncStock(s.sheetUrl).catch(()=>store.event('sync_error','Não foi possível sincronizar a planilha. O estoque anterior foi preservado.'));}},10000);timer.unref();
 app.locals.close=()=>{clearInterval(timer);agent.followups.close();};app.locals.agent=agent;return app;
}
