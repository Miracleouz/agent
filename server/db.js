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
   CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL, brand TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', price REAL CHECK(price>0), quantity REAL NOT NULL CHECK(quantity>=0), unit TEXT NOT NULL DEFAULT 'unidade', updated INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY, source TEXT NOT NULL, count INTEGER NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, phone TEXT NOT NULL, name TEXT NOT NULL, channel TEXT NOT NULL, provider TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'auto', pause_until INTEGER, needs_human INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, query TEXT, shown TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL, last_inbound INTEGER NOT NULL, UNIQUE(phone,channel,provider));
   CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id), provider_id TEXT UNIQUE, direction TEXT NOT NULL, body TEXT NOT NULL, actions TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL, error TEXT, created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id,created);
   CREATE INDEX IF NOT EXISTS chats_updated ON chats(updated);
   CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, kind TEXT NOT NULL, detail TEXT NOT NULL, created INTEGER NOT NULL);
  `);
  if(!this.all('PRAGMA table_info(chats)').some(column=>column.name==='pending_measure'))this.db.exec('ALTER TABLE chats ADD COLUMN pending_measure TEXT');
  for(const [name,type] of [['quoted_options',"TEXT NOT NULL DEFAULT '[]'"],['pending_selection','INTEGER'],['handoff_reason','TEXT'],['purchase_summary','TEXT']]){
   if(!this.all('PRAGMA table_info(chats)').some(column=>column.name===name))this.db.exec(`ALTER TABLE chats ADD COLUMN ${name} ${type}`);
  }
  this.db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify({priceMode:'sale',markupPercent:0,mmDimension:'width',openBeltPriceBasis:'per_meter_full_width',businessName:'Minha loja',pauseMinutes:30,sheetUrl:DEFAULT_SHEET,syncMinutes:0,agentEnabled:true,lastSync:null}));
  this.db.prepare("UPDATE messages SET status='failed',error='Envio interrompido pelo reinício. Confira no WhatsApp antes de reenviar.' WHERE status='pending'").run();
 }
 all(sql,...args){return this.db.prepare(sql).all(...args);}
 get(sql,...args){return this.db.prepare(sql).get(...args);}
 run(sql,...args){return this.db.prepare(sql).run(...args);}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 changed(){this.emit('change');}
 settings(){return JSON.parse(this.get('SELECT value FROM settings WHERE id=1').value);}
 setSettings(patch){const s={...this.settings(),...patch};this.run('UPDATE settings SET value=? WHERE id=1',JSON.stringify(s));this.changed();return s;}
 event(kind,detail){this.run('INSERT INTO events VALUES(?,?,?,?)',randomUUID(),kind,detail,Date.now());this.changed();}
 chat(id){const c=this.get('SELECT * FROM chats WHERE id=?',id);return c?{...c,shown:JSON.parse(c.shown)}:null;}
 resumeExpired(){const r=this.run("UPDATE chats SET mode='auto',pause_until=NULL,needs_human=0,handoff_reason=NULL,purchase_summary=NULL WHERE mode='manual' AND pause_until IS NOT NULL AND pause_until<=?",Date.now());if(r.changes)this.changed();}
 chats(){this.resumeExpired();return this.all(`SELECT c.*, (SELECT body FROM messages WHERE chat_id=c.id ORDER BY created DESC,rowid DESC LIMIT 1) AS preview FROM chats c ORDER BY updated DESC`).map(c=>({...c,shown:JSON.parse(c.shown)}));}
 messages(id){return this.all('SELECT * FROM messages WHERE chat_id=? ORDER BY created,rowid',id).map(m=>({...m,actions:JSON.parse(m.actions)}));}
 addMessage({chatId,providerId=null,direction,body,actions=[],status='received'}){
  const id=randomUUID(),now=Date.now();this.run('INSERT INTO messages(id,chat_id,provider_id,direction,body,actions,status,created) VALUES(?,?,?,?,?,?,?,?)',id,chatId,providerId,direction,body,JSON.stringify(actions),status,now);
  this.run('UPDATE chats SET updated=? WHERE id=?',now,chatId);this.changed();return this.get('SELECT * FROM messages WHERE id=?',id);
 }
 pause(id,minutes){this.run("UPDATE chats SET mode='manual',pause_until=? WHERE id=?",minutes?Date.now()+minutes*60000:null,id);this.changed();return this.chat(id);}
 resume(id){this.run("UPDATE chats SET mode='auto',pause_until=NULL,needs_human=0,handoff_reason=NULL,purchase_summary=NULL,pending_selection=NULL WHERE id=?",id);this.changed();return this.chat(id);}
 stats(){return {products:this.get('SELECT count(*) n FROM products WHERE quantity>0 AND price>0').n,conversations:this.get("SELECT count(*) n FROM chats WHERE channel='whatsapp'").n,replies:this.get("SELECT count(*) n FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.direction='bot' AND m.status='sent' AND c.channel='whatsapp'").n,waiting:this.get('SELECT count(*) n FROM chats WHERE needs_human=1').n};}
 close(){this.db.close();}
}
