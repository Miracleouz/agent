import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';
import {readRows,validateRows,replaceCatalog,fetchSheet,sheetExport} from './catalog.js';
import {Agent} from './agent.js';
const hashToken=token=>createHash('sha256').update(token).digest('hex');
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
function checkPassword(password,hash){const[salt,key]=hash.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64));}
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createApp({store,whatsapp,production=false,appUrl=process.env.APP_URL}){
 const app=express();app.disable('x-powered-by');
 const secure=!!appUrl?.startsWith('https:');
 app.use(helmet({contentSecurityPolicy:production?{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],upgradeInsecureRequests:secure?[]:null}}:false,strictTransportSecurity:secure?undefined:false}));
 app.use(express.json({limit:'100kb'}));app.use(cookieParser());
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
  if(req.get('X-Cota-Request')!=='1')return res.status(403).json({error:'Requisição inválida. Atualize o painel.'});
  const origin=req.get('Origin');if(origin){const allowed=appUrl?new URL(appUrl).origin:`${req.protocol}://${req.get('host')}`;if(origin!==allowed)return res.status(403).json({error:'Origem não autorizada.'});}
 }next();});
 const authLimit=rateLimit({windowMs:15*60000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas tentativas. Aguarde 15 minutos.'}});
 const cookie={httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:7*86400000};
 function session(res){const token=randomBytes(32).toString('hex');store.run('DELETE FROM sessions WHERE expires<?',Date.now());store.run('INSERT INTO sessions VALUES(?,?)',hashToken(token),Date.now()+cookie.maxAge);res.cookie('cota_session',token,cookie);}
 function isOwner(req){return !!(req.cookies.cota_session&&store.get('SELECT token FROM sessions WHERE token=? AND expires>?',hashToken(req.cookies.cota_session),Date.now()));}
 app.get('/api/auth/status',(req,res)=>{const owner=store.get('SELECT name,email FROM owner WHERE id=1');res.json({setupRequired:!owner,authenticated:isOwner(req),owner:isOwner(req)?owner:null});});
 app.post('/api/auth/setup',authLimit,(req,res)=>{
  if(store.get('SELECT id FROM owner'))throw fail('O dono já está cadastrado. Faça login.',409);
  const input=z.object({name:z.string().trim().min(2).max(60),email:z.email().max(200),password:z.string().min(10).max(200)}).parse(req.body);
  store.run('INSERT INTO owner VALUES(1,?,?,?)',input.name,input.email.toLowerCase(),hashPassword(input.password));session(res);res.status(201).json({name:input.name,email:input.email});
 });
 app.post('/api/auth/login',authLimit,(req,res)=>{const input=z.object({email:z.email(),password:z.string().max(200)}).parse(req.body);const owner=store.get('SELECT * FROM owner WHERE id=1');if(!owner||owner.email!==input.email.toLowerCase()||!checkPassword(input.password,owner.password))throw fail('E-mail ou senha incorretos.',401);session(res);res.json({name:owner.name,email:owner.email});});
 app.use('/api',(req,res,next)=>{if(!isOwner(req))return res.status(401).json({error:'Entre no painel para continuar.'});next();});
 app.use('/api',rateLimit({windowMs:60000,limit:600,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas solicitações. Aguarde um minuto.'}}));
 app.post('/api/auth/logout',(req,res)=>{store.run('DELETE FROM sessions WHERE token=?',hashToken(req.cookies.cota_session));res.clearCookie('cota_session',{path:'/'}).json({ok:true});});
 app.post('/api/auth/password',(req,res)=>{const body=z.object({current:z.string().max(200),password:z.string().min(10).max(200)}).parse(req.body);const owner=store.get('SELECT password FROM owner');if(!checkPassword(body.current,owner.password))throw fail('Senha atual incorreta.',401);store.run('UPDATE owner SET password=? WHERE id=1',hashPassword(body.password));store.run('DELETE FROM sessions');session(res);res.json({ok:true});});
 app.get('/api/bootstrap',(_req,res)=>res.json({settings:store.settings(),stats:store.stats(),chats:store.chats(),connection:whatsapp.snapshot(),imports:store.all('SELECT * FROM imports ORDER BY created DESC LIMIT 8'),events:store.all('SELECT * FROM events ORDER BY created DESC LIMIT 12')}));
 app.get('/api/events',(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('event: ready\ndata: {}\n\n');
  const onChange=()=>res.write('event: change\ndata: {}\n\n');store.on('change',onChange);
  const keepalive=setInterval(()=>{if(!isOwner(req)){res.end();return;}res.write(': heartbeat\n\n');},25000);
  req.on('close',()=>{clearInterval(keepalive);store.off('change',onChange);});
 });
 app.patch('/api/settings',(req,res)=>{
  const input=z.object({businessName:z.string().trim().min(2).max(80).optional(),pauseMinutes:z.number().int().min(1).max(1440).optional(),agentEnabled:z.boolean().optional(),followupMinutes:z.union([z.literal(0),z.number().int().min(5).max(60)]).optional(),syncMinutes:z.union([z.literal(0),z.number().int().min(5).max(1440)]).optional(),sheetUrl:z.string().max(500).optional(),priceMode:z.enum(['unconfirmed','sale','cost']).optional(),markupPercent:z.number().min(0).max(1000).optional(),mmDimension:z.literal('width').optional(),openBeltPriceBasis:z.enum(['unconfirmed','per_meter_mm','per_meter_full_width']).optional()}).strict().parse(req.body);
  if(input.sheetUrl)sheetExport(input.sheetUrl);res.json(store.setSettings(input));
 });
 function getChat(id){const chat=store.chat(id);if(!chat)throw fail('Conversa não encontrada.',404);return chat;}
 app.get('/api/chats/:id/messages',(req,res)=>{getChat(req.params.id);res.json(store.messages(req.params.id));});
 app.post('/api/chats/:id/read',(req,res)=>{getChat(req.params.id);store.run('UPDATE chats SET unread=0 WHERE id=?',req.params.id);res.json({ok:true});});
 app.post('/api/chats/:id/pause',(req,res)=>{getChat(req.params.id);const{minutes}=z.object({minutes:z.number().int().min(1).max(1440).nullable()}).parse(req.body);res.json(store.pause(req.params.id,minutes));});
 app.post('/api/chats/:id/resume',(req,res)=>{getChat(req.params.id);res.json(store.resume(req.params.id));});
 const agent=new Agent(store,(chat,body,actions)=>whatsapp.send(chat,body,actions),{canSend:chat=>chat.channel==='simulator'||whatsapp.snapshot().status==='ready'});whatsapp.receiver=input=>agent.receive(input);
 app.post('/api/chats/:id/send',async(req,res)=>{
  const chat=getChat(req.params.id);const{body}=z.object({body:z.string().trim().min(1).max(4000)}).parse(req.body);
  if(chat.mode!=='manual')throw fail('Ative "Responder manual" antes de enviar.',409);
  const result=await agent.enqueue(`${chat.provider}:${chat.channel}:${chat.phone}`,()=>agent.reply(chat,body,[],'owner'));res.status(result.status==='failed'?502:201).json(result.status==='failed'?{error:result.error,message:result}:result);
 });
 app.post('/api/simulator/message',async(req,res)=>{
  const input=z.object({phone:z.string().regex(/^demo-[a-zA-Z0-9-]{1,50}$/).default('demo-cliente'),name:z.string().trim().min(1).max(80).default('Cliente de teste'),body:z.string().trim().min(1).max(4000),isGroup:z.boolean().optional()}).parse(req.body);
  res.status(201).json(await agent.receive({...input,channel:'simulator',provider:'demo',providerId:randomUUID()}));
 });
 app.delete('/api/simulator',(req,res)=>{store.transaction(()=>{store.run("DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE channel='simulator')");store.run("DELETE FROM chats WHERE channel='simulator'");});store.changed();res.json({ok:true});});
 app.get('/api/products',(req,res)=>{const search=String(req.query.search||'').slice(0,100),page=Math.max(0,Math.min(2000,Number(req.query.page)||0)),limit=100;const where='WHERE name LIKE ? OR brand LIKE ? OR variant LIKE ? OR sku LIKE ?',params=Array(4).fill(`%${search}%`);res.json({items:store.all('SELECT * FROM products '+where+' ORDER BY name,brand LIMIT ? OFFSET ?',...params,limit,page*limit),total:store.get('SELECT count(*) n FROM products '+where,...params).n,page,limit,unpriced:store.get('SELECT count(*) n FROM products WHERE price IS NULL').n});});
 app.get('/api/stock/template',(_req,res)=>res.type('text/csv').attachment('modelo-estoque.csv').send('\uFEFFsku;produto;marca;medida;preco;quantidade\nEXEMPLO-A42;Correia industrial em V;Marca exemplo;A-42;49,90;12\n'));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}});
 app.post('/api/stock/preview',upload.single('file'),async(req,res)=>{if(!req.file)throw fail('Selecione um arquivo CSV ou Excel.');const items=validateRows(await readRows(req.file.buffer,req.file.originalname));res.json({count:items.length,unpriced:items.filter(p=>p.price===null).length,preview:items.slice(0,8)});});
 app.post('/api/stock/import',upload.single('file'),async(req,res)=>{
  if(req.body.confirm!=='replace')throw fail('Confirme a substituição do estoque.');if(!req.file)throw fail('Selecione um arquivo.');
  const items=validateRows(await readRows(req.file.buffer,req.file.originalname));const count=replaceCatalog(store,items,'Arquivo '+req.file.originalname.slice(0,120));res.json({count});
 });
 let syncing=false;
 async function syncStock(url){if(syncing)throw fail('Já existe uma sincronização em andamento.',409);syncing=true;try{const items=await fetchSheet(url);const count=replaceCatalog(store,items,'Google Sheets');store.setSettings({sheetUrl:url,lastSync:Date.now()});return count;}finally{syncing=false;}}
 app.post('/api/stock/sync',async(req,res)=>{const{url}=z.object({url:z.string().max(500)}).parse(req.body);res.json({count:await syncStock(url)});});
 app.post('/api/whatsapp/connect',async(_req,res)=>res.json(await whatsapp.connect()));
 app.post('/api/whatsapp/disconnect',async(_req,res)=>{await whatsapp.disconnect();res.json(whatsapp.snapshot());});
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
 const timer=setInterval(()=>{store.resumeExpired();agent.followups.check().catch(()=>store.event('followup_error','Não foi possível conferir o acompanhamento. Nenhum reenvio automático foi agendado.'));const s=store.settings();if(s.syncMinutes>0&&Date.now()-Math.max(s.lastSync||0,lastAttempt)>s.syncMinutes*60000){lastAttempt=Date.now();syncStock(s.sheetUrl).catch(()=>store.event('sync_error','Não foi possível sincronizar a planilha. O estoque anterior foi preservado.'));}},10000);timer.unref();
 app.locals.close=()=>{clearInterval(timer);agent.followups.close();};app.locals.agent=agent;return app;
}
