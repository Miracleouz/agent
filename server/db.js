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
   CREATE TABLE IF NOT EXISTS chat_drafts(user_id TEXT NOT NULL REFERENCES users(id),chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,body TEXT NOT NULL,revision INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,chat_id));
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
  if(!this.all('PRAGMA table_info(chats)').some(column=>column.name==='auto_reply_after'))this.transaction(()=>{
   this.db.exec('ALTER TABLE chats ADD COLUMN auto_reply_after INTEGER NOT NULL DEFAULT 0');
   // Older releases erased closed_at on resume. Previously controlled services
   // must wait for a new customer message rather than replay their unread history.
   this.run('UPDATE chats SET auto_reply_after=? WHERE routing_version>0 OR closed_at IS NOT NULL',Date.now());
  });
  if(!this.all('PRAGMA table_info(chats)').some(column=>column.name==='auto_reply_sequence'))this.transaction(()=>{
   this.db.exec('ALTER TABLE chats ADD COLUMN auto_reply_sequence INTEGER NOT NULL DEFAULT 0');
   this.run('UPDATE chats SET auto_reply_sequence=(SELECT COALESCE(MAX(rowid),0) FROM messages) WHERE auto_reply_after>0');
  });
  for(const [name,type] of [['delivery_method','TEXT'],['delivery_detail','TEXT'],['delivery_allowed','INTEGER NOT NULL DEFAULT 0'],['delivery_due_at','INTEGER'],['delivery_state',"TEXT NOT NULL DEFAULT 'idle'"],['delivery_origin_id','TEXT'],['delivery_anchor_id','TEXT'],['delivery_last_attempt','INTEGER'],['delivery_menu','INTEGER NOT NULL DEFAULT 0'],['help_state','TEXT'],['last_quote_message_id','TEXT'],['help_offered_quote_id','TEXT']])if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${type}`);
  for(const [name,type] of [['pickup_prompted_at','INTEGER'],['pickup_pending_details','INTEGER NOT NULL DEFAULT 0'],['pickup_details','TEXT']])if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${type}`);
  for(const name of ['service_origin_id','followup_inbound_id'])if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} TEXT`);
  if(!this.all('PRAGMA table_info(messages)').some(column=>column.name==='inbound_verified'))this.db.exec('ALTER TABLE messages ADD COLUMN inbound_verified INTEGER NOT NULL DEFAULT 0');
  if(!this.all('PRAGMA table_info(messages)').some(column=>column.name==='sent_at'))this.db.exec('ALTER TABLE messages ADD COLUMN sent_at INTEGER');
  this.db.exec("CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS whatsapp_history_sync(chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,cutoff INTEGER NOT NULL,oldest_at INTEGER,last_sync INTEGER NOT NULL,status TEXT NOT NULL,error TEXT);");
  if(!this.get("SELECT name FROM app_migrations WHERE name='live_unread_only'"))this.transaction(()=>{this.run("UPDATE chats SET unread=0 WHERE channel='whatsapp'");this.run("INSERT INTO app_migrations VALUES('live_unread_only')");});
  this.run("UPDATE whatsapp_history_sync SET status='partial',error='Importação interrompida. Sincronize novamente para continuar.' WHERE status='loading'");
  this.db.exec('CREATE TABLE IF NOT EXISTS whatsapp_read_sync(id TEXT PRIMARY KEY,channel TEXT NOT NULL,anchor INTEGER NOT NULL,state TEXT NOT NULL,updated INTEGER NOT NULL,error TEXT);');
  this.db.exec('CREATE TABLE IF NOT EXISTS whatsapp_avatars(remote_id TEXT PRIMARY KEY,status TEXT NOT NULL,data BLOB,media_type TEXT,version TEXT,checked INTEGER NOT NULL);');
  this.run("UPDATE whatsapp_read_sync SET state='failed',error='Confirmação interrompida. Use Sincronizar leitura para tentar novamente.' WHERE state='pending'");
  if(!this.all('PRAGMA table_info(messages)').some(column=>column.name==='provider_ack'))this.db.exec('ALTER TABLE messages ADD COLUMN provider_ack INTEGER');
  for(const [name,type] of [['media_type','TEXT'],['media_name','TEXT'],['media_size','INTEGER'],['media_data','BLOB'],['media_hash','TEXT'],['manual_request_id','TEXT'],['edit_version','INTEGER NOT NULL DEFAULT 0'],['edited_at','INTEGER'],['edited_by','TEXT'],['edited_name','TEXT'],['edit_state',"TEXT NOT NULL DEFAULT 'idle'"],['edit_error','TEXT']])if(!this.all('PRAGMA table_info(messages)').some(column=>column.name===name))this.db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
  this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS manual_photo_request ON messages(author_id,manual_request_id) WHERE manual_request_id IS NOT NULL;CREATE TABLE IF NOT EXISTS message_edits(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id),old_body TEXT NOT NULL,new_body TEXT NOT NULL,old_delivery_body TEXT,new_delivery_body TEXT,editor_id TEXT NOT NULL,editor_name TEXT NOT NULL,requested INTEGER NOT NULL,completed INTEGER,status TEXT NOT NULL,error TEXT);CREATE INDEX IF NOT EXISTS edits_message ON message_edits(message_id,requested);");
  for(const[name,type]of [['media_kind','TEXT'],['quoted_message_id','TEXT'],['quoted_provider_id','TEXT'],['quoted_body','TEXT'],['quoted_author','TEXT'],['transcript','TEXT'],['transcription_state',"TEXT NOT NULL DEFAULT 'idle'"],['transcription_error','TEXT']])if(!this.all('PRAGMA table_info(messages)').some(column=>column.name===name))this.db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
  this.db.exec("CREATE TABLE IF NOT EXISTS message_reactions(message_id TEXT NOT NULL REFERENCES messages(id),sender_key TEXT NOT NULL,emoji TEXT NOT NULL,actor_name TEXT,updated INTEGER NOT NULL,PRIMARY KEY(message_id,sender_key));CREATE TABLE IF NOT EXISTS sales_orders(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL REFERENCES chats(id),request_id TEXT UNIQUE NOT NULL,confirmed_by TEXT NOT NULL,confirmed_name TEXT NOT NULL,created INTEGER NOT NULL,total REAL NOT NULL,items TEXT NOT NULL);CREATE TABLE IF NOT EXISTS stock_movements(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES sales_orders(id),product_id TEXT NOT NULL,sku TEXT NOT NULL,quantity REAL NOT NULL,before_quantity REAL NOT NULL,after_quantity REAL NOT NULL,created INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS product_stock_lots(product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,lots TEXT NOT NULL);");
  if(!this.all('PRAGMA table_info(sales_orders)').some(c=>c.name==='customer_origin'))this.db.exec("ALTER TABLE sales_orders ADD COLUMN customer_origin TEXT;CREATE UNIQUE INDEX IF NOT EXISTS sale_customer_origin ON sales_orders(chat_id,customer_origin);");
  this.db.exec("CREATE TABLE IF NOT EXISTS sales_order_tracking(order_id TEXT PRIMARY KEY REFERENCES sales_orders(id) ON DELETE CASCADE,state TEXT NOT NULL CHECK(state IN ('closed','completed','cancelled')),version INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,updated_by TEXT,updated_name TEXT,note TEXT NOT NULL DEFAULT '',customer_name TEXT,customer_phone TEXT,stock_returned INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS sales_order_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,from_state TEXT,to_state TEXT NOT NULL,actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,created INTEGER NOT NULL,note TEXT NOT NULL DEFAULT '',stock_returned INTEGER NOT NULL DEFAULT 0);CREATE INDEX IF NOT EXISTS sales_orders_created ON sales_orders(created);");
  if(!this.all('PRAGMA table_info(chats)').some(c=>c.name==='audio_pending_quote'))this.db.exec('ALTER TABLE chats ADD COLUMN audio_pending_quote TEXT');
  if(!this.all('PRAGMA table_info(messages)').some(c=>c.name==='transcription_uncertain'))this.db.exec('ALTER TABLE messages ADD COLUMN transcription_uncertain INTEGER NOT NULL DEFAULT 0');
  for(const[name,type]of [['audio_agent_state','TEXT'],['audio_routing_version','INTEGER']])if(!this.all('PRAGMA table_info(messages)').some(c=>c.name===name))this.db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
  this.run("UPDATE messages SET audio_agent_state='skipped' WHERE audio_agent_state='pending'");
  this.run("UPDATE messages SET transcription_state='failed',transcription_error='Transcrição interrompida pelo reinício. Tente novamente.' WHERE transcription_state IN ('queued','processing')");
  for(const[name,type]of [['deleted_at','INTEGER'],['deleted_by','TEXT'],['deleted_name','TEXT'],['delete_state',"TEXT NOT NULL DEFAULT 'idle'"],['delete_error','TEXT']])if(!this.all('PRAGMA table_info(messages)').some(c=>c.name===name))this.db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${type}`);
  this.db.exec("CREATE TABLE IF NOT EXISTS message_deletions(id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES messages(id),request_id TEXT UNIQUE,actor_id TEXT,actor_name TEXT,requested INTEGER NOT NULL,completed INTEGER,state TEXT NOT NULL,error TEXT,old_body TEXT NOT NULL);");
  this.run("UPDATE message_deletions SET state='uncertain',error='Exclusão interrompida. Confira no WhatsApp; não houve nova tentativa.' WHERE state='pending'");
  this.run("UPDATE messages SET delete_state='uncertain',delete_error='Exclusão interrompida. Confira no WhatsApp; não houve nova tentativa.' WHERE delete_state='pending'");
  this.messageFields=this.all('PRAGMA table_info(messages)').filter(column=>column.name!=='media_data').map(column=>'"'+column.name.replaceAll('"','""')+'"').join(',');
  this.run("UPDATE message_edits SET status='uncertain',error='Edição interrompida pelo reinício. Confira no WhatsApp antes de tentar novamente.' WHERE status='pending'");
  this.run("UPDATE messages SET edit_state='uncertain',edit_error='Edição interrompida pelo reinício. Confira no WhatsApp antes de tentar novamente.' WHERE edit_state='pending'");
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
 chat(id){const c=this.get('SELECT c.*,h.status history_status,h.error history_error,(SELECT version FROM whatsapp_avatars WHERE remote_id=c.phone) avatar_version,r.state read_sync_state,r.error read_sync_error,r.updated read_sync_at,(SELECT name FROM users WHERE id=c.assigned_user_id) assigned_name FROM chats c LEFT JOIN whatsapp_history_sync h ON h.chat_id=c.id LEFT JOIN whatsapp_read_sync r ON r.id=c.id WHERE c.id=?',id);return c?{...c,shown:JSON.parse(c.shown)}:null;}
 resumeExpired(){const now=Date.now(),r=this.run("UPDATE chats SET mode='auto',auto_reply_after=MAX(auto_reply_after,?),auto_reply_sequence=(SELECT COALESCE(MAX(rowid),0) FROM messages),service_origin_id=NULL,pause_until=NULL,needs_human=0,handoff_reason=NULL,purchase_summary=NULL,human_requested=0,purchase_requested=0,audio_pending_quote=NULL,routing_version=routing_version+1 WHERE mode='manual' AND pause_until IS NOT NULL AND pause_until<=?",now,now);if(r.changes)this.changed();}
 chats(){this.resumeExpired();return this.all(`SELECT c.*,h.status history_status,h.error history_error,(SELECT version FROM whatsapp_avatars WHERE remote_id=c.phone) avatar_version,r.state read_sync_state,r.error read_sync_error,r.updated read_sync_at, (SELECT name FROM users WHERE id=c.assigned_user_id) AS assigned_name, (SELECT CASE WHEN media_type IS NOT NULL AND body='' THEN '📷 Foto' ELSE body END FROM messages WHERE chat_id=c.id ORDER BY created DESC,rowid DESC LIMIT 1) AS preview FROM chats c LEFT JOIN whatsapp_history_sync h ON h.chat_id=c.id LEFT JOIN whatsapp_read_sync r ON r.id=c.id ORDER BY c.updated DESC`).map(c=>({...c,shown:JSON.parse(c.shown)}));}
 message(id){const m=this.get(`SELECT ${this.messageFields} FROM messages WHERE id=?`,id);return m?{...m,actions:JSON.parse(m.actions),reactions:this.reactions(m.id)}:null;}
 revokeMessage(id,actor=null){const row=this.get('SELECT * FROM messages WHERE id=?',id);if(!row)return;actor=actor||this.get("SELECT actor_id id,actor_name name FROM message_deletions WHERE message_id=? AND state IN ('pending','uncertain') ORDER BY requested DESC LIMIT 1",id);const now=Date.now();this.transaction(()=>{this.run("UPDATE messages SET body='Mensagem apagada',actions='[]',delivery_body=NULL,media_type=NULL,media_kind=NULL,media_name=NULL,media_size=NULL,media_data=NULL,transcript=NULL,transcription_state='idle',transcription_error=NULL,deleted_at=COALESCE(deleted_at,?),deleted_by=COALESCE(deleted_by,?),deleted_name=COALESCE(deleted_name,?),delete_state='sent',delete_error=NULL WHERE id=?",now,actor?.id||null,actor?.name||'WhatsApp',id);this.run('DELETE FROM message_reactions WHERE message_id=?',id);this.run("UPDATE messages SET quoted_body='Mensagem apagada' WHERE quoted_message_id=? OR (quoted_provider_id IS NOT NULL AND quoted_provider_id=?)",id,row.provider_id);this.run("UPDATE message_deletions SET state='sent',completed=?,error=NULL WHERE message_id=? AND state IN ('pending','uncertain')",now,id);this.cancelFollowups(row.chat_id);});this.changed();}
 setReaction(id,sender,emoji,name=null){if(!emoji)this.run('DELETE FROM message_reactions WHERE message_id=? AND sender_key=?',id,sender);else this.run('INSERT INTO message_reactions VALUES(?,?,?,?,?) ON CONFLICT(message_id,sender_key) DO UPDATE SET emoji=excluded.emoji,actor_name=excluded.actor_name,updated=excluded.updated',id,sender,emoji,name,Date.now());this.changed();}
 reactions(id){return this.all('SELECT emoji,actor_name,sender_key,updated FROM message_reactions WHERE message_id=? ORDER BY updated',id);}
 messages(id,{since=null}={}){return this.all(`SELECT ${this.messageFields} FROM messages WHERE chat_id=? AND (? IS NULL OR created>=?) ORDER BY created,rowid`,id,since,since).map(m=>({...m,actions:JSON.parse(m.actions),reactions:this.reactions(m.id)}));}
 conversationMessages(id){const chat=this.chat(id);return this.messages(id,{since:chat?.channel==='whatsapp'&&chat.provider==='qr'?Date.now()-30*86400000:null});}
 addMessage({chatId,providerId=null,direction,body,actions=[],status='received',author=null,deliveryBody=null}){
  const id=randomUUID(),now=Date.now();this.run('INSERT INTO messages(id,chat_id,provider_id,direction,body,actions,status,created,author_id,author_name,author_role,delivery_body) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,chatId,providerId,direction,body,JSON.stringify(actions),status,now,author?.id||null,author?.name||null,author?.role||null,deliveryBody);
  this.run('UPDATE chats SET updated=? WHERE id=?',now,chatId);this.changed();return this.get('SELECT * FROM messages WHERE id=?',id);
 }
 pause(id,minutes,userId=null){this.cancelFollowups(id);this.run("UPDATE chats SET mode='manual',pause_until=?,assigned_user_id=COALESCE(?,assigned_user_id),audio_pending_quote=NULL,routing_version=routing_version+1 WHERE id=?",minutes?Date.now()+minutes*60000:null,userId,id);this.changed();return this.chat(id);}
 resume(id){this.cancelFollowups(id);this.run("UPDATE chats SET mode='auto',auto_reply_after=MAX(auto_reply_after,?),auto_reply_sequence=(SELECT COALESCE(MAX(rowid),0) FROM messages),closed_at=NULL,help_state=NULL,service_origin_id=NULL,pause_until=NULL,needs_human=0,handoff_reason=NULL,purchase_summary=NULL,pending_selection=NULL,human_requested=0,purchase_requested=0,audio_pending_quote=NULL,routing_version=routing_version+1 WHERE id=?",Date.now(),id);this.changed();return this.chat(id);}
 closeChat(id,now=Date.now(),{keepOrigin=false}={}){this.cancelFollowups(id);this.run("UPDATE chats SET mode='auto',auto_reply_after=MAX(auto_reply_after,?),auto_reply_sequence=(SELECT COALESCE(MAX(rowid),0) FROM messages),pause_until=NULL,closed_at=?,help_state='closed',service_origin_id=CASE WHEN ? THEN service_origin_id ELSE NULL END,needs_human=0,handoff_reason=NULL,human_requested=0,purchase_requested=0,query=NULL,shown='[]',quoted_options='[]',batch_queries='[]',pending_item_index=NULL,pending_measure=NULL,pending_selection=NULL,pickup_pending_details=0,audio_pending_quote=NULL,routing_version=routing_version+1 WHERE id=?",now,now,keepOrigin?1:0,id);this.changed();return this.chat(id);}
 openChat(id,user){
  const result=this.transaction(()=>{
   const chat=this.chat(id);if(!chat)throw Object.assign(new Error('Conversa não encontrada.'),{status:404});
   if(chat.assigned_user_id&&chat.assigned_user_id!==user.id){
    if(user.role==='admin')return{chat,observing:true};
    throw Object.assign(new Error('Outro usuário assumiu esta conversa. Atualize a fila.'),{status:409});
   }
   if(!chat.assigned_user_id){this.cancelFollowups(id);this.run("UPDATE chats SET assigned_user_id=?,mode='manual',pause_until=NULL,unread=0,audio_pending_quote=NULL,routing_version=routing_version+1 WHERE id=? AND assigned_user_id IS NULL",user.id,id);}
   else this.run('UPDATE chats SET unread=0 WHERE id=?',id);
   return{chat:this.chat(id),observing:false};
  });this.changed();return result;
 }
 releaseChat(id){this.cancelFollowups(id);this.run("UPDATE chats SET assigned_user_id=NULL,mode='auto',auto_reply_after=MAX(auto_reply_after,?),auto_reply_sequence=(SELECT COALESCE(MAX(rowid),0) FROM messages),service_origin_id=NULL,pause_until=NULL,needs_human=0,human_requested=0,purchase_requested=0,handoff_reason=NULL,pending_selection=NULL,audio_pending_quote=NULL,routing_version=routing_version+1 WHERE id=?",Date.now(),id);this.changed();return this.chat(id);}
 groupList(){return this.all("SELECT g.*,(SELECT version FROM whatsapp_avatars WHERE remote_id=g.id) avatar_version,r.state read_sync_state,r.error read_sync_error,r.updated read_sync_at,g.id phone,'group' channel,'readonly' mode,(SELECT body FROM whatsapp_group_messages WHERE group_id=g.id ORDER BY created DESC,rowid DESC LIMIT 1) preview FROM whatsapp_groups g LEFT JOIN whatsapp_read_sync r ON r.id=g.id ORDER BY g.updated DESC");}
 upsertGroup(id,name){if(!/^\d+(?:-\d+)?@g\.us$/.test(id))return;this.run('INSERT INTO whatsapp_groups(id,name,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',id,String(name||id).slice(0,150),Date.now());}
 addGroupMessage({id,name,providerId,author,body,created,incoming=true}){
  if(!/^\d+(?:-\d+)?@g\.us$/.test(id)||!providerId||!body?.trim())return;
  this.transaction(()=>{this.upsertGroup(id,name||this.get('SELECT name FROM whatsapp_groups WHERE id=?',id)?.name||id);const result=this.run('INSERT OR IGNORE INTO whatsapp_group_messages VALUES(?,?,?,?,?,?)',randomUUID(),id,providerId,String(author||'Participante').slice(0,100),body.trim().slice(0,10000),created);if(result.changes)this.run('UPDATE whatsapp_groups SET unread=unread+?,updated=MAX(updated,?) WHERE id=?',incoming?1:0,created,id);});this.changed();
 }
 groupMessages(id,{since=null,limit=500}={}){return this.all("SELECT *,'in' direction,'received' status FROM (SELECT *,rowid sequence FROM whatsapp_group_messages WHERE group_id=? AND (? IS NULL OR created>=?) ORDER BY created DESC,rowid DESC LIMIT ?) ORDER BY created,sequence",id,since,since,limit??-1).map(message=>({...message,actions:[]}));}
 stats({userId=null}={}){
  const scope=userId?' AND (c.assigned_user_id IS NULL OR c.assigned_user_id=?)':'',args=userId?[userId]:[];
  return {products:this.get('SELECT count(*) n FROM products WHERE quantity>0 AND price>0').n,conversations:this.get("SELECT count(*) n FROM chats c WHERE c.channel='whatsapp'"+scope,...args).n,replies:this.get("SELECT count(*) n FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.direction='bot' AND m.status='sent' AND c.channel='whatsapp'"+scope,...args).n,waiting:this.get('SELECT count(*) n FROM chats c WHERE c.needs_human=1'+scope,...args).n};
 }
 close(){this.db.close();}
}
