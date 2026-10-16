import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
function checkPassword(password,hash){try{const[salt,key]=hash.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64));}catch{return false;}}
const name=z.string().trim().min(2).max(60).regex(/^[^\r\n*]+$/,'Nome inválido');
const email=z.email().max(200).transform(value=>value.toLowerCase());
const password=z.string().min(10).max(200);
const role=z.enum(['admin','comercial']);
const profile=z.object({name,email,role:role.default('comercial')}).strict();

export function createAccounts(store,cookie){
 function getUser(req){return req.cookies.cota_session?store.get('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1',tokenHash(req.cookies.cota_session),Date.now()):null;}
 function session(res,userId){const token=randomBytes(32).toString('hex');store.run('DELETE FROM sessions WHERE expires<?',Date.now());store.run('INSERT INTO sessions(token,expires,user_id) VALUES(?,?,?)',tokenHash(token),Date.now()+cookie.maxAge,userId);res.cookie('cota_session',token,cookie);}
 function adminOnly(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'Somente um Admin pode realizar esta ação.'});next();}
 function middleware(req,res,next){const user=getUser(req);if(!user)return res.status(401).json({error:'Entre no painel para continuar.'});req.user=user;next();}
 function publicRoutes(app,authLimit){
  app.get('/api/auth/status',(req,res)=>{const user=getUser(req);res.json({setupRequired:!store.get("SELECT id FROM users WHERE role='admin' AND active=1"),authenticated:!!user,user:user||null,owner:user||null});});
  app.post('/api/auth/setup',authLimit,(req,res)=>{
   if(store.get("SELECT id FROM users WHERE role='admin' AND active=1"))throw fail('O Admin já está cadastrado. Faça login.',409);
   const input=z.object({name,email,password}).strict().parse(req.body),hash=hashPassword(input.password);
   store.transaction(()=>{store.run('INSERT INTO owner VALUES(1,?,?,?)',input.name,input.email,hash);store.run("INSERT INTO users(id,name,email,password,role,created) VALUES('owner',?,?,?,'admin',?)",input.name,input.email,hash,Date.now());});
   session(res,'owner');res.status(201).json({id:'owner',name:input.name,email:input.email,role:'admin'});
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
   const hash=hashPassword(input.password);store.transaction(()=>{store.run('UPDATE users SET password=? WHERE id=?',hash,user.id);if(user.id==='owner')store.run('UPDATE owner SET password=? WHERE id=1',hash);store.run('DELETE FROM sessions WHERE user_id=?',user.id);});session(res,user.id);res.json({ok:true});
  });
  const safeUser=id=>store.get('SELECT id,name,email,role,active,created FROM users WHERE id=?',id);
  function insertUser(input,secret){
   if(store.get('SELECT id FROM users WHERE email=?',input.email))throw fail(`Já existe uma conta com o e-mail ${input.email}.`,409);
   const id=randomUUID();store.run('INSERT INTO users(id,name,email,password,role,created) VALUES(?,?,?,?,?,?)',id,input.name,input.email,hashPassword(secret),input.role,Date.now());return safeUser(id);
  }
  app.get('/api/users',adminOnly,(_req,res)=>res.json(store.all('SELECT id,name,email,role,active,created FROM users ORDER BY role,name')));
  app.post('/api/users',adminOnly,(req,res)=>{
   const input=profile.extend({password}).parse(req.body),user=insertUser(input,input.password);store.event('team',`Usuário ${input.name} (${input.role}) cadastrado por ${req.user.name}.`);res.status(201).json(user);
  });
  app.post('/api/users/batch',adminOnly,(req,res)=>{
   const input=z.object({users:z.array(profile).min(1).max(50),password}).strict().parse(req.body);
   const users=store.transaction(()=>input.users.map(user=>insertUser(user,input.password)));
   store.event('team',`${users.length} usuários cadastrados por ${req.user.name}.`);res.status(201).json({users});
  });
  app.patch('/api/users/:id',adminOnly,(req,res)=>{
   const user=store.get('SELECT * FROM users WHERE id=?',req.params.id);if(!user)throw fail('Usuário não encontrado.',404);
   const input=z.object({name:name.optional(),email:email.optional(),password:password.optional(),role:role.optional(),active:z.boolean().optional()}).strict().parse(req.body);
   if(!Object.keys(input).length)throw fail('Informe uma alteração.');
   if(input.email&&store.get('SELECT id FROM users WHERE email=? AND id<>?',input.email,user.id))throw fail('Já existe uma conta com esse e-mail.',409);
   store.transaction(()=>{
    const nextRole=input.role??user.role,nextActive=input.active===undefined?user.active:input.active?1:0;
    if(user.role==='admin'&&user.active&&(!nextActive||nextRole!=='admin')&&!store.get("SELECT id FROM users WHERE role='admin' AND active=1 AND id<>?",user.id))throw fail('Mantenha pelo menos um Admin ativo. Cadastre ou promova outro antes de alterar esta conta.',409);
    const hash=input.password?hashPassword(input.password):user.password;
    store.run('UPDATE users SET name=?,email=?,password=?,role=?,active=? WHERE id=?',input.name??user.name,input.email??user.email,hash,nextRole,nextActive,user.id);
    if(user.id==='owner')store.run('UPDATE owner SET name=?,email=?,password=? WHERE id=1',input.name??user.name,input.email??user.email,hash);
    if(input.password||input.email||input.active===false||nextRole!==user.role)store.run('DELETE FROM sessions WHERE user_id=?',user.id);
    if(input.active===false)store.run('UPDATE chats SET assigned_user_id=NULL WHERE assigned_user_id=?',user.id);
   });
   if(input.active===false||input.role&&input.role!==user.role)clearPresence(user.id);store.event('team',`Conta de ${input.name??user.name} atualizada por ${req.user.name}.`);res.json(safeUser(user.id));
  });
 }
 return{getUser,middleware,adminOnly,publicRoutes,protectedRoutes};
}
