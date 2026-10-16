import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
// Each installation supplies its own inventory link in the owner panel.
export const DEFAULT_SHEET = '';
export class Store extends EventEmitter {
 constructor(file) {
  super();mkdirSync(dirname(file),{recursive:true});this.db=new DatabaseSync(file);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','comercial')),active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL, brand TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', price REAL CHECK(price>0), quantity REAL NOT NULL CHECK(quantity>=0), unit TEXT NOT NULL DEFAULT 'unidade', updated INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY, source TEXT NOT NULL, count INTEGER NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, phone TEXT NOT NULL, name TEXT NOT NULL, channel TEXT NOT NULL, provider TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'auto', pause_until INTEGER, needs_human INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, query TEXT, shown TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL, last_inbound INTEGER NOT NULL, UNIQUE(phone,channel,provider));
   CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id), provider_id TEXT UNIQUE, direction TEXT NOT NULL, body TEXT NOT NULL, actions TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL, error TEXT, created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id,created);
   CREATE INDEX IF NOT EXISTS chats_updated ON chats(updated);
   CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL UNIQUE,company TEXT NOT NULL DEFAULT '',created_by TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS contacts_name ON contacts(name);
   CREATE TABLE IF NOT EXISTS whatsapp_chat_aliases(alias TEXT PRIMARY KEY,chat_id TEXT NOT NULL REFERENCES chats(id));
   CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, kind TEXT NOT NULL, detail TEXT NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS whatsapp_groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,unread INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS whatsapp_group_messages(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES whatsapp_groups(id),provider_id TEXT NOT NULL UNIQUE,author_name TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS group_messages_created ON whatsapp_group_messages(group_id,created);
  `);
  // Rebuild the old CHECK constraint without changing user IDs or session references.
  if(!this.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").sql.includes("'comercial'")){
   this.db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
   try{
    this.db.exec("CREATE TABLE users_next(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','comercial')),active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);INSERT INTO users_next SELECT id,name,email,password,CASE role WHEN 'owner' THEN 'admin' WHEN 'agent' THEN 'comercial' ELSE role END,active,created FROM users;DROP TABLE users;ALTER TABLE users_next RENAME TO users;");
    if(this.all('PRAGMA foreign_key_check').length)throw new Error('Não foi possível preservar as referências dos usuários.');
    this.db.exec('COMMIT');
   }catch(error){this.db.exec('ROLLBACK');throw error;}finally{this.db.exec('PRAGMA foreign_keys=ON');}
  }
  const legacyOwner=this.get('SELECT * FROM owner WHERE id=1');
  if(legacyOwner&&!this.get("SELECT id FROM users WHERE id='owner'"))this.run("INSERT INTO users(id,name,email,password,role,created) VALUES('owner',?,?,?,'admin',?)",legacyOwner.name,legacyOwner.email.toLowerCase(),legacyOwner.password,Date.now());
  if(!this.all('PRAGMA table_info(sessions)').some(column=>column.name==='user_id')){this.db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id)');if(legacyOwner)this.run("UPDATE sessions SET user_id='owner' WHERE user_id IS NULL");}
  for(const [name,type] of [['author_id','TEXT'],['author_name','TEXT'],['author_role','TEXT'],['delivery_body','TEXT']])if(!this.all('PRAGMA table_info(messages)').some(column=>column.name===name))this.db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
  if(!this.all('PRAGMA table_info(chats)').some(column=>column.name==='pending_measure'))this.db.exec('ALTER TABLE chats ADD COLUMN pending_measure TEXT');
  const migrateAlerts=!this.all('PRAGMA table_info(chats)').some(column=>column.name==='order_state');
  for(const [name,type] of [['quoted_options',"TEXT NOT NULL DEFAULT '[]'"],['pending_selection','INTEGER'],['handoff_reason','TEXT'],['purchase_summary','TEXT'],['followup_due_at','INTEGER'],['followup_quote_id','TEXT'],['followup_last_attempt','INTEGER'],['followup_state',"TEXT NOT NULL DEFAULT 'idle'"],['followup_menu','INTEGER NOT NULL DEFAULT 0'],['closed_at','INTEGER'],['introduced_at','INTEGER'],['batch_queries',"TEXT NOT NULL DEFAULT '[]'"],['pending_item_index','INTEGER'],['assigned_user_id','TEXT'],['human_requested','INTEGER NOT NULL DEFAULT 0'],['purchase_requested','INTEGER NOT NULL DEFAULT 0'],['order_state','TEXT'],['order_confirmed_at','INTEGER'],['order_confirmed_by','TEXT'],['order_confirmed_name','TEXT']]){
   if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${type}`);
  }
  if(migrateAlerts)this.db.exec("UPDATE chats SET purchase_requested=1,order_state='interest' WHERE needs_human=1 AND handoff_reason='purchase';UPDATE chats SET human_requested=1 WHERE needs_human=1 AND handoff_reason='human';");
  if(!this.all('PRAGMA table_info(chats)').some(column=>column.name==='routing_version'))this.db.exec('ALTER TABLE chats ADD COLUMN routing_version INTEGER NOT NULL DEFAULT 0');
  for(const [name,type] of [['delivery_method','TEXT'],['delivery_detail','TEXT'],['delivery_allowed','INTEGER NOT NULL DEFAULT 0'],['delivery_due_at','INTEGER'],['delivery_state',"TEXT NOT NULL DEFAULT 'idle'"],['delivery_origin_id','TEXT'],['delivery_anchor_id','TEXT'],['delivery_last_attempt','INTEGER'],['delivery_menu','INTEGER NOT NULL DEFAULT 0'],['help_state','TEXT'],['last_quote_message_id','TEXT'],['help_offered_quote_id','TEXT']])if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${type}`);
  for(const [name,type] of [['pickup_prompted_at','INTEGER'],['pickup_pending_details','INTEGER NOT NULL DEFAULT 0'],['pickup_details','TEXT']])if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${type}`);
  for(const name of ['service_origin_id','followup_inbound_id'])if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} TEXT`);
  if(!this.all('PRAGMA table_info(messages)').some(column=>column.name==='inbound_verified'))this.db.exec('ALTER TABLE messages ADD COLUMN inbound_verified INTEGER NOT NULL DEFAULT 0');
  if(!this.all('PRAGMA table_info(messages)').some(column=>column.name==='sent_at'))this.db.exec('ALTER TABLE messages ADD COLUMN sent_at INTEGER');
  this.db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify({priceMode:'sale',markupPercent:0,mmDimension:'width',openBeltPriceBasis:'per_meter_full_width',businessName:'Minha loja',pauseMinutes:30,sheetUrl:DEFAULT_SHEET,syncMinutes:0,agentEnabled:true,lastSync:null}));
  this.db.prepare("UPDATE messages SET status='failed',error='Envio interrompido pelo reinício. Confira no WhatsApp antes de reenviar.' WHERE status='pending'").run();
  // Never deliver old reminders when a process is restarted or a database is reopened.
  this.cancelFollowups();
 }
 all(sql,...args){return this.db.prepare(sql).all(...args);}
 get(sql,...args){return this.db.prepare(sql).get(...args);}
 run(sql,...args){return this.db.prepare(sql).run(...args);}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 changed(){this.emit('change');}
 settings(){return {signHumanMessages:true,...JSON.parse(this.get('SELECT value FROM settings WHERE id=1').value),followupMinutes:5};}
 setSettings(patch){const s={...this.settings(),...patch,followupMinutes:5};this.run('UPDATE settings SET value=? WHERE id=1',JSON.stringify(s));if(patch.agentEnabled===false)this.cancelFollowups();this.changed();return s;}
 cancelFollowups(id=null,{whatsappOnly=false,keepMenu=false,keepDelivery=false,quoteOnly=false}={}){
  this.run(`UPDATE chats SET followup_due_at=NULL,followup_state=CASE WHEN followup_state IN ('scheduled','sending') THEN 'cancelled' ELSE followup_state END${keepMenu?'':',followup_menu=0'} WHERE ${id?'id=?':whatsappOnly?"channel='whatsapp'":'1=1'}`, ...(id?[id]:[]));
  if(!quoteOnly)this.run(`UPDATE chats SET delivery_due_at=NULL,delivery_state=CASE WHEN delivery_state IN ('scheduled','sending') THEN 'cancelled' ELSE delivery_state END${keepDelivery?'':',delivery_allowed=0,delivery_menu=0'} WHERE ${id?'id=?':whatsappOnly?"channel='whatsapp'":'1=1'}`,...(id?[id]:[]));
 }
 event(kind,detail){this.run('INSERT INTO events VALUES(?,?,?,?)',randomUUID(),kind,detail,Date.now());this.changed();}
 chat(id){const c=this.get('SELECT c.*,(SELECT name FROM users WHERE id=c.assigned_user_id) assigned_name FROM chats c WHERE id=?',id);return c?{...c,shown:JSON.parse(c.shown)}:null;}
 resumeExpired(){const r=this.run("UPDATE chats SET mode='auto',pause_until=NULL,needs_human=0,handoff_reason=NULL,purchase_summary=NULL,human_requested=0,purchase_requested=0,routing_version=routing_version+1 WHERE mode='manual' AND pause_until IS NOT NULL AND pause_until<=?",Date.now());if(r.changes)this.changed();}
 chats(){this.resumeExpired();return this.all(`SELECT c.*, (SELECT name FROM users WHERE id=c.assigned_user_id) AS assigned_name, (SELECT body FROM messages WHERE chat_id=c.id ORDER BY created DESC,rowid DESC LIMIT 1) AS preview FROM chats c ORDER BY updated DESC`).map(c=>({...c,shown:JSON.parse(c.shown)}));}
 messages(id){return this.all('SELECT * FROM messages WHERE chat_id=? ORDER BY created,rowid',id).map(m=>({...m,actions:JSON.parse(m.actions)}));}
 addMessage({chatId,providerId=null,direction,body,actions=[],status='received',author=null,deliveryBody=null}){
  const id=randomUUID(),now=Date.now();this.run('INSERT INTO messages(id,chat_id,provider_id,direction,body,actions,status,created,author_id,author_name,author_role,delivery_body) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,chatId,providerId,direction,body,JSON.stringify(actions),status,now,author?.id||null,author?.name||null,author?.role||null,deliveryBody);
  this.run('UPDATE chats SET updated=? WHERE id=?',now,chatId);this.changed();return this.get('SELECT * FROM messages WHERE id=?',id);
 }
 pause(id,minutes,userId=null){this.cancelFollowups(id);this.run("UPDATE chats SET mode='manual',pause_until=?,assigned_user_id=COALESCE(?,assigned_user_id),routing_version=routing_version+1 WHERE id=?",minutes?Date.now()+minutes*60000:null,userId,id);this.changed();return this.chat(id);}
 resume(id){this.cancelFollowups(id);this.run("UPDATE chats SET mode='auto',pause_until=NULL,needs_human=0,handoff_reason=NULL,purchase_summary=NULL,pending_selection=NULL,human_requested=0,purchase_requested=0,routing_version=routing_version+1 WHERE id=?",id);this.changed();return this.chat(id);}
 openChat(id,user){
  const result=this.transaction(()=>{
   const chat=this.chat(id);if(!chat)throw Object.assign(new Error('Conversa não encontrada.'),{status:404});
   if(chat.assigned_user_id&&chat.assigned_user_id!==user.id){
    if(user.role==='admin')return{chat,observing:true};
    throw Object.assign(new Error('Outro usuário assumiu esta conversa. Atualize a fila.'),{status:409});
   }
   if(!chat.assigned_user_id){this.cancelFollowups(id);this.run("UPDATE chats SET assigned_user_id=?,mode='manual',pause_until=NULL,unread=0,routing_version=routing_version+1 WHERE id=? AND assigned_user_id IS NULL",user.id,id);}
   else this.run('UPDATE chats SET unread=0 WHERE id=?',id);
   return{chat:this.chat(id),observing:false};
  });this.changed();return result;
 }
 releaseChat(id){this.cancelFollowups(id);this.run("UPDATE chats SET assigned_user_id=NULL,mode='manual',pause_until=NULL,unread=MAX(unread,1),routing_version=routing_version+1 WHERE id=?",id);this.changed();return this.chat(id);}
 groupList(){return this.all("SELECT g.*,g.id phone,'group' channel,'readonly' mode,(SELECT body FROM whatsapp_group_messages WHERE group_id=g.id ORDER BY created DESC,rowid DESC LIMIT 1) preview FROM whatsapp_groups g ORDER BY updated DESC");}
 upsertGroup(id,name){if(!/^\d+(?:-\d+)?@g\.us$/.test(id))return;this.run('INSERT INTO whatsapp_groups(id,name,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',id,String(name||id).slice(0,150),Date.now());}
 addGroupMessage({id,name,providerId,author,body,created}){
  if(!/^\d+(?:-\d+)?@g\.us$/.test(id)||!providerId||!body?.trim())return;
  this.transaction(()=>{this.upsertGroup(id,name||this.get('SELECT name FROM whatsapp_groups WHERE id=?',id)?.name||id);const result=this.run('INSERT OR IGNORE INTO whatsapp_group_messages VALUES(?,?,?,?,?,?)',randomUUID(),id,providerId,String(author||'Participante').slice(0,100),body.trim().slice(0,10000),created);if(result.changes)this.run('UPDATE whatsapp_groups SET unread=unread+1,updated=MAX(updated,?) WHERE id=?',created,id);});this.changed();
 }
 groupMessages(id){return this.all("SELECT *,'in' direction,'received' status FROM (SELECT *,rowid sequence FROM whatsapp_group_messages WHERE group_id=? ORDER BY created DESC,rowid DESC LIMIT 500) ORDER BY created,sequence",id).map(message=>({...message,actions:[]}));}
 stats({userId=null}={}){
  const scope=userId?' AND (c.assigned_user_id IS NULL OR c.assigned_user_id=?)':'',args=userId?[userId]:[];
  return {products:this.get('SELECT count(*) n FROM products WHERE quantity>0 AND price>0').n,conversations:this.get("SELECT count(*) n FROM chats c WHERE c.channel='whatsapp'"+scope,...args).n,replies:this.get("SELECT count(*) n FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.direction='bot' AND m.status='sent' AND c.channel='whatsapp'"+scope,...args).n,waiting:this.get('SELECT count(*) n FROM chats c WHERE c.needs_human=1'+scope,...args).n};
 }
 close(){this.db.close();}
}
