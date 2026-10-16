import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
function checkPassword(password,hash){try{const[salt,key]=hash.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64));}catch{return false;}}
const name=z.string().trim().min(2).max(60).regex(/^[^\r\n*]+$/,'Nome inválido');
const email=z.email().max(200).transform(value=>value.toLowerCase());
const password=z.string().min(10).max(200);

export function createAccounts(store,cookie){
 function getUser(req){return req.cookies.cota_session?store.get('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',tokenHash(req.cookies.cota_session),Date.now()):null;}
 function session(res,userId){const token=randomBytes(32).toString('hex');store.run('DELETE FROM sessions WHERE expires<?',Date.now());store.run('INSERT INTO sessions(token,expires,user_id) VALUES(?,?,?)',tokenHash(token),Date.now()+cookie.maxAge,userId);res.cookie('cota_session',token,cookie);}
 function ownerOnly(req,res,next){if(req.user.role!=='owner')return res.status(403).json({error:'Somente o dono pode realizar esta ação.'});next();}
 function middleware(req,res,next){const user=getUser(req);if(!user)return res.status(401).json({error:'Entre no painel para continuar.'});req.user=user;next();}
 function publicRoutes(app,authLimit){
  app.get('/api/auth/status',(req,res)=>{const user=getUser(req);res.json({setupRequired:!store.get("SELECT id FROM users WHERE role='owner'"),authenticated:!!user,user:user||null,owner:user||null});});
  app.post('/api/auth/setup',authLimit,(req,res)=>{
   if(store.get("SELECT id FROM users WHERE role='owner'"))throw fail('O dono já está cadastrado. Faça login.',409);
   const input=z.object({name,email,password}).strict().parse(req.body),hash=hashPassword(input.password);
   store.transaction(()=>{store.run('INSERT INTO owner VALUES(1,?,?,?)',input.name,input.email,hash);store.run("INSERT INTO users(id,name,email,password,role,created) VALUES('owner',?,?,?,'owner',?)",input.name,input.email,hash,Date.now());});
   session(res,'owner');res.status(201).json({id:'owner',name:input.name,email:input.email,role:'owner'});
  });
  app.post('/api/auth/login',authLimit,(req,res)=>{
   const input=z.object({email,password:z.string().max(200)}).strict().parse(req.body),user=store.get('SELECT * FROM users WHERE email=? AND active=1',input.email);
   if(!user||!checkPassword(input.password,user.password))throw fail('E-mail ou senha incorretos.',401);
   session(res,user.id);res.json({id:user.id,name:user.name,email:user.email,role:user.role});
  });
 }
 function protectedRoutes(app,clearPresence){
  app.post('/api/auth/logout',(req,res)=>{clearPresence(req.user.id);store.run('DELETE FROM sessions WHERE token=?',tokenHash(req.cookies.cota_session));res.clearCookie('cota_session',{path:'/'}).json({ok:true});});
  app.post('/api/auth/password',(req,res)=>{
   const input=z.object({current:z.string().max(200),password}).strict().parse(req.body),user=store.get('SELECT * FROM users WHERE id=?',req.user.id);
   if(!checkPassword(input.current,user.password))throw fail('Senha atual incorreta.',401);
   const hash=hashPassword(input.password);store.transaction(()=>{store.run('UPDATE users SET password=? WHERE id=?',hash,user.id);if(user.role==='owner')store.run('UPDATE owner SET password=? WHERE id=1',hash);store.run('DELETE FROM sessions WHERE user_id=?',user.id);});session(res,user.id);res.json({ok:true});
  });
  app.get('/api/users',ownerOnly,(_req,res)=>res.json(store.all('SELECT id,name,email,role,active,created FROM users ORDER BY role DESC,name')));
  app.post('/api/users',ownerOnly,(req,res)=>{
   const input=z.object({name,email,password}).strict().parse(req.body);if(store.get('SELECT id FROM users WHERE email=?',input.email))throw fail('Já existe uma conta com esse e-mail.',409);
   const id=randomUUID();store.run("INSERT INTO users(id,name,email,password,role,created) VALUES(?,?,?,?,'agent',?)",id,input.name,input.email,hashPassword(input.password),Date.now());store.event('team',`Atendente ${input.name} cadastrado por ${req.user.name}.`);res.status(201).json(store.get('SELECT id,name,email,role,active FROM users WHERE id=?',id));
  });
  app.patch('/api/users/:id',ownerOnly,(req,res)=>{
   const user=store.get('SELECT * FROM users WHERE id=?',req.params.id);if(!user)throw fail('Usuário não encontrado.',404);if(user.role==='owner')throw fail('A conta do dono não pode ser alterada por esta tela.',403);
   const input=z.object({name:name.optional(),email:email.optional(),password:password.optional(),active:z.boolean().optional()}).strict().parse(req.body);
   if(!Object.keys(input).length)throw fail('Informe uma alteração.');
   if(input.email&&store.get('SELECT id FROM users WHERE email=? AND id<>?',input.email,user.id))throw fail('Já existe uma conta com esse e-mail.',409);
   store.transaction(()=>{
    store.run('UPDATE users SET name=?,email=?,password=?,active=? WHERE id=?',input.name??user.name,input.email??user.email,input.password?hashPassword(input.password):user.password,input.active===undefined?user.active:input.active?1:0,user.id);
    if(input.password||input.email||input.active===false)store.run('DELETE FROM sessions WHERE user_id=?',user.id);
    if(input.active===false)store.run('UPDATE chats SET assigned_user_id=NULL WHERE assigned_user_id=?',user.id);
   });
   if(input.active===false)clearPresence(user.id);store.event('team',`Conta de ${input.name??user.name} atualizada por ${req.user.name}.`);res.json(store.get('SELECT id,name,email,role,active FROM users WHERE id=?',user.id));
  });
 }
 return{getUser,middleware,ownerOnly,publicRoutes,protectedRoutes};
}
