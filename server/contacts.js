import {randomUUID} from 'node:crypto';
import {z} from 'zod';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function normalizeContactPhone(value){
 if(typeof value!=='string'||value.length>40||!/^\+?[\d ().-]+$/.test(value.trim()))throw fail('Informe um telefone válido com DDD; para outros países, use + e o código do país.');
 const raw=value.trim();let digits=raw.replace(/\D/g,'');
 if(!raw.startsWith('+')&&[10,11].includes(digits.length))digits='55'+digits;
 if(!/^[1-9]\d{7,14}$/.test(digits)||/^(\d)\1+$/.test(digits)||digits.startsWith('55')&&(![12,13].includes(digits.length)||!/^55[1-9]\d[1-9]\d{7,8}$/.test(digits)))throw fail('Informe um telefone válido com DDD e código do país.');
 return digits;
}
const fields={name:z.string().trim().min(2).max(100),phone:z.string().min(1).max(40),company:z.string().trim().max(120)};
const profile=z.object({...fields,company:fields.company.default('')}).strict(),patchProfile=z.object(fields).partial().strict();
export function contactRoutes({app,store,accounts,agent,whatsapp}){
 const contact=id=>{const value=store.get('SELECT * FROM contacts WHERE id=?',id);if(!value)throw fail('Contato não encontrado.',404);return value;};
 app.get('/api/contacts',(req,res)=>{
  const search=String(req.query.search||'').trim().slice(0,100),digits=search.replace(/\D/g,''),page=Math.max(0,Math.min(5000,Math.trunc(Number(req.query.page))||0)),limit=50,query=`%${search}%`,numeric=digits?`%${digits}%`:query;
  const where='WHERE name LIKE ? OR company LIKE ? OR phone LIKE ?',params=[query,query,numeric];
  res.json({items:store.all('SELECT id,name,phone,company,created,updated FROM contacts '+where+' ORDER BY name COLLATE NOCASE,id LIMIT ? OFFSET ?',...params,limit,page*limit),total:store.get('SELECT count(*) n FROM contacts '+where,...params).n,page,limit});
 });
 app.post('/api/contacts',(req,res)=>{
  const input=profile.parse(req.body),phone=normalizeContactPhone(input.phone);if(store.get('SELECT id FROM contacts WHERE phone=?',phone))throw fail('Já existe um contato com esse telefone.',409);
  const id=randomUUID(),now=Date.now();store.run('INSERT INTO contacts VALUES(?,?,?,?,?,?,?)',id,input.name,phone,input.company,req.user.id,now,now);store.changed();res.status(201).json(contact(id));
 });
 app.patch('/api/contacts/:id',(req,res)=>{
  const previous=contact(req.params.id),input=patchProfile.parse(req.body),phone=input.phone===undefined?previous.phone:normalizeContactPhone(input.phone);
  if(store.get('SELECT id FROM contacts WHERE phone=? AND id<>?',phone,previous.id))throw fail('Já existe um contato com esse telefone.',409);
  store.run('UPDATE contacts SET name=?,phone=?,company=?,updated=? WHERE id=?',input.name??previous.name,phone,input.company??previous.company,Date.now(),previous.id);store.changed();res.json(contact(previous.id));
 });
 app.delete('/api/contacts/:id',accounts.adminOnly,(req,res)=>{contact(req.params.id);store.run('DELETE FROM contacts WHERE id=?',req.params.id);store.changed();res.json({ok:true});});
 app.post('/api/contacts/:id/open',async(req,res)=>{
  z.object({}).strict().parse(req.body||{});const initial=contact(req.params.id);
  if(whatsapp.snapshot().status!=='ready')throw fail('Conecte o WhatsApp antes de iniciar uma conversa.',409);
  const identity=await whatsapp.resolveContact(initial.phone),aliases=[...new Set([identity.id,...identity.aliases])];
  if(!aliases.length||aliases.some(alias=>!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(alias)))throw fail('Não foi possível confirmar o WhatsApp deste contato.',422);
  function existing(){const placeholders=aliases.map(()=>'?').join(',');return store.all(`SELECT DISTINCT c.id,c.phone FROM chats c LEFT JOIN whatsapp_chat_aliases a ON a.chat_id=c.id WHERE c.channel='whatsapp' AND c.provider='qr' AND (c.phone IN (${placeholders}) OR a.alias IN (${placeholders}))`,...aliases,...aliases);}
  const known=existing();if(known.length>1)throw fail('Há mais de um histórico para este contato. Abra a conversa existente em Conversas.',409);
  const key=`qr:whatsapp:${known[0]?.phone||identity.id}`;
  const result=await agent.enqueue(key,()=>{
   const user=accounts.getUser(req);if(!user)throw fail('Entre novamente no painel.',401);
   const current=contact(initial.id);if(current.phone!==initial.phone)throw fail('O telefone do contato mudou. Abra a conversa novamente.',409);
   if(whatsapp.snapshot().status!=='ready')throw fail('O WhatsApp desconectou. Conecte novamente antes de iniciar.',409);
   return store.transaction(()=>{
    const matches=existing();if(matches.length>1)throw fail('Há mais de um histórico para este contato. Abra a conversa existente em Conversas.',409);
    let chat=matches[0]&&store.chat(matches[0].id);const now=Date.now();
    if(chat?.assigned_user_id&&chat.assigned_user_id!==user.id&&user.role!=='admin')throw fail('Esta conversa está com outro usuário. Peça a um Admin para transferir o atendimento.',409);
    if(!chat){const id=randomUUID();store.run("INSERT INTO chats(id,phone,name,channel,provider,mode,updated,last_inbound) VALUES(?,?,?,'whatsapp','qr','manual',?,0)",id,identity.id,current.name,now);chat=store.chat(id);}
    // This is a manual draft: opening/cadastering never sends a message or creates inbound proof.
    const observing=!!chat.assigned_user_id&&chat.assigned_user_id!==user.id;
    if(!observing){
     store.cancelFollowups(chat.id);store.run("UPDATE chats SET name=?,mode='manual',pause_until=NULL,assigned_user_id=?,unread=0,service_origin_id=CASE WHEN closed_at IS NOT NULL THEN NULL ELSE service_origin_id END,closed_at=NULL,help_state=NULL,routing_version=routing_version+1 WHERE id=?",current.name,user.id,chat.id);
    }
    for(const alias of aliases){const mapped=store.get('SELECT chat_id FROM whatsapp_chat_aliases WHERE alias=?',alias);if(mapped&&mapped.chat_id!==chat.id)throw fail('O contato está vinculado a outro histórico. Atualize o painel.',409);store.run('INSERT OR IGNORE INTO whatsapp_chat_aliases VALUES(?,?)',alias,chat.id);}
    return{chat:store.chat(chat.id),observing};
   });
  });store.changed();res.json(result);
 });
}
