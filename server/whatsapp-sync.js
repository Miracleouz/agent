import {randomUUID} from 'node:crypto';
import {normalizeContactPhone} from './contacts.js';
import {safeConnectionDetail} from './connection-errors.js';
import {readCachedRoster} from './whatsapp-roster.js';
const privateId=id=>/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(id||'');
const groupId=id=>/^\d+(?:-\d+)?@g\.us$/.test(id||'');
const idOf=value=>value?.id?._serialized;
const stamp=value=>Number.isFinite(value)&&value>0?Math.min(value*1000,Date.now()):0;
export const historyDays=30,historyWindow=historyDays*86400000;
function bounded(fn,signal,ms){return new Promise((resolve,reject)=>{let done=false;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(result);},abort=()=>finish(new Error('Sincronização cancelada.')),timer=setTimeout(()=>finish(new Error('Tempo limite ao consultar dados do WhatsApp.')),ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();Promise.resolve().then(fn).then(result=>finish(null,result),finish);});}
export class WhatsAppSync{
 constructor(whatsapp,{timeout=20000,historyTimeout=60000}={}){this.wa=whatsapp;this.store=whatsapp.store;this.timeout=timeout;this.historyTimeout=historyTimeout;this.reset();}
 reset(){this.controller?.abort();this.controller=new AbortController();this.promise=null;this.histories=new Map();this.remotes=new Map();this.state={status:'idle',chats:0,groups:0,contacts:0,completedAt:null,error:null,historyDays,historiesDone:0,historiesTotal:0,stage:'lists'};}
 snapshot(){return{...this.state,issues:[...(this.state.issues||[])]};}
 active(client,generation){return this.wa.client===client&&this.wa.generation===generation&&this.wa.status==='ready';}
 report(error,stage='history'){this.wa.logger.error(`[WhatsApp sync] stage=${stage}: ${safeConnectionDetail(error?.stack||error)}`);}
 issue(stage,code,message){if(!this.state.issues)this.state.issues=[];if(!this.state.issues.some(issue=>issue.stage===stage&&issue.code===code))this.state.issues.push({stage,code,message});}
 async roster(client,kind,signal){
  const method=kind==='chats'?'getChats':'getContacts';let original;
  try{const items=await bounded(()=>typeof client[method]==='function'?client[method]():[],signal,this.timeout);if(!Array.isArray(items))throw new Error('Resposta da lista inválida.');if(items.length||typeof client.pupPage?.evaluate!=='function')return items;original=new Error('A consulta retornou uma lista vazia.');}
  catch(error){if(signal.aborted)throw error;original=error;}
  this.report(original,kind);
  try{const result=await bounded(()=>readCachedRoster(client,kind),signal,this.timeout);if(signal.aborted)throw new Error('Sincronização cancelada.');if(result.skipped)this.issue(kind,'items_skipped',`Alguns ${kind==='chats'?'chats':'contatos'} não puderam ser lidos; os demais foram carregados.`);this.state[kind+'Source']='cache';return result.items;}
  catch(error){if(signal.aborted)throw error;this.report(error,kind+'_fallback');this.issue(kind,'list_unavailable',kind==='chats'?'Não foi possível carregar a lista de conversas e grupos. Consulte o log [WhatsApp sync] stage=chats.':'Não foi possível carregar a agenda do WhatsApp. Os contatos salvos no Cota foram preservados.');throw original;}
 }
 run(){
  if(this.wa.status!=='ready'||!this.wa.client)return Promise.reject(Object.assign(new Error('Aguarde o WhatsApp ficar Conectado antes de sincronizar.'),{status:409}));
  if(this.promise)return this.promise;
  const client=this.wa.client,generation=this.wa.generation,signal=this.controller.signal;this.readAnchor=this.store.get('SELECT COALESCE(MAX(rowid),0) seq FROM messages').seq;this.groupReadAnchor=this.store.get('SELECT COALESCE(MAX(rowid),0) seq FROM whatsapp_group_messages').seq;this.histories.clear();this.cutoff=Date.now()-historyWindow;this.state={status:'loading',chats:0,groups:0,contacts:0,completedAt:null,error:null,issues:[],historyDays,historiesDone:0,historiesTotal:0,stage:'lists'};this.store.changed();
  const task=this.perform(client,generation,signal).catch(error=>{if(this.active(client,generation)&&!signal.aborted){this.report(error);this.state={...this.state,status:'error',error:'A sincronização falhou. Os dados já salvos foram preservados. Tente Sincronizar WhatsApp novamente.'};this.store.event('whatsapp_sync_error',this.state.error);}return this.snapshot();});this.promise=task;task.finally(()=>{if(this.promise===task)this.promise=null;}).catch(()=>{});return task;
 }
 async perform(client,generation,signal){
  let failures=0;const checked=()=>this.active(client,generation)&&!signal.aborted;
  const results=await Promise.allSettled([
   this.roster(client,'chats',signal),
   this.roster(client,'contacts',signal),
  ]);if(!checked())return this.snapshot();
  const values=results.map(result=>{if(result.status==='fulfilled'&&Array.isArray(result.value))return result.value;failures++;return[];});
  const [chats,contacts]=values,own=new Set([client.info?.wid?._serialized,client.info?.lid?._serialized].filter(Boolean)),identities=new Map();
  for(const id of [...own])if(/@(?:c\.us|s\.whatsapp\.net)$/.test(id)){own.add(id.split('@')[0]+'@c.us');own.add(id.split('@')[0]+'@s.whatsapp.net');}
  const privateChats=chats.filter(chat=>!chat.isGroup&&privateId(idOf(chat))&&!own.has(idOf(chat)));
  const people=contacts.filter(contact=>privateId(idOf(contact))&&!contact.isMe&&!own.has(idOf(contact))&&contact.isMyContact===true&&contact.isWAContact!==false);
  const ids=[...new Set([...privateChats,...people].map(idOf))];
  for(const id of ids)identities.set(id,new Set([id]));
  if(typeof client.getContactLidAndPhone==='function')for(let i=0;i<ids.length;i+=100){
   try{const requested=ids.slice(i,i+100),pairs=await bounded(()=>client.getContactLidAndPhone(requested),signal,this.timeout);if(!checked())return this.snapshot();for(const pair of pairs||[]){if(!/^\d+@(c\.us|s\.whatsapp\.net)$/.test(pair.pn||'')||!/^\d+@lid$/.test(pair.lid||'')||!requested.includes(pair.pn)&&!requested.includes(pair.lid))continue;const aliases=new Set([pair.pn,pair.lid]);identities.set(pair.pn,aliases);identities.set(pair.lid,aliases);}}
   catch(error){if(!checked())return this.snapshot();failures++;this.report(error,'identities');this.issue('identities','identity_unavailable','Alguns vínculos entre telefone e identificador do WhatsApp não puderam ser consultados. As listas disponíveis foram preservadas.');}
  }
  if(!checked())return this.snapshot();
  this.store.transaction(()=>{
   for(const remote of chats){const id=idOf(remote);if(!remote.isGroup||!groupId(id))continue;this.store.upsertGroup(id,remote.name);if(remote.unreadCount===0)this.wa.readSync?.snapshotRead({id,phone:id,channel:'group'},this.groupReadAnchor);this.state.groups++;}
   for(const remote of privateChats){
    const id=idOf(remote),aliases=new Set(identities.get(id)||[id]);
    for(const alias of [...aliases])if(/@(?:c\.us|s\.whatsapp\.net)$/.test(alias)){const number=alias.split('@')[0];for(const domain of ['c.us','s.whatsapp.net'])aliases.add(number+'@'+domain);}
    if([...aliases].some(alias=>own.has(alias)))continue;
    const params=[...aliases],slots=params.map(()=>'?').join(','),matches=this.store.all(`SELECT DISTINCT c.id FROM chats c LEFT JOIN whatsapp_chat_aliases a ON a.chat_id=c.id WHERE c.channel='whatsapp' AND c.provider='qr' AND (c.phone IN (${slots}) OR a.alias IN (${slots}))`,...params,...params);
    if(matches.length>1){failures++;this.issue('identities','history_conflict','Há históricos separados para um mesmo contato. Eles foram preservados sem juntar ou trocar o responsável.');continue;}
    let chat=matches[0]&&this.store.chat(matches[0].id);const name=String(remote.name||id.split('@')[0]).slice(0,150);
    if(!chat){const chatId=randomUUID(),phone=params.find(alias=>alias.endsWith('@c.us'))||id;this.store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound,unread) VALUES(?,?,?,'whatsapp','qr',?,0,0)",chatId,phone,name,stamp(remote.timestamp));chat=this.store.chat(chatId);}
    else if(chat.name===chat.phone||chat.name===chat.phone.split('@')[0])this.store.run('UPDATE chats SET name=? WHERE id=?',name,chat.id);
    for(const alias of aliases)this.store.run('INSERT OR IGNORE INTO whatsapp_chat_aliases VALUES(?,?)',alias,chat.id);
    if(remote.unreadCount===0)this.wa.readSync?.snapshotRead(chat,this.readAnchor);
    this.remotes.set(chat.id,remote);this.state.chats++;if(remote.lastMessage)this.importMessage(chat,remote.lastMessage);
   }
   for(const person of people){
    const aliases=identities.get(idOf(person))||new Set([idOf(person)]),pn=[...aliases].find(alias=>/@(?:c\.us|s\.whatsapp\.net)$/.test(alias));if(!pn)continue;
    let phone;try{phone=normalizeContactPhone('+'+pn.split('@')[0]);}catch{continue;}
    const name=String(person.name||person.pushname||person.shortName||phone).trim().slice(0,100)||phone;
    this.store.run('INSERT OR IGNORE INTO contacts VALUES(?,?,?,?,?,?,?)',randomUUID(),name,phone,'',null,Date.now(),Date.now());this.state.contacts++;
   }
  });
  const jobs=[...this.remotes.keys()].map(id=>this.store.chat(id)).filter(Boolean);this.state.historiesTotal=jobs.length;this.state.stage='history';this.store.changed();let next=0;
  const worker=async()=>{while(checked()&&next<jobs.length){const chat=jobs[next++];const result=await this.history(chat);if(!checked())return;if(result===false)failures++;this.state.historiesDone++;this.store.changed();}};
  await Promise.all([worker(),worker()]);if(!checked())return this.snapshot();
  if(!chats.length&&typeof client.pupPage?.evaluate==='function')this.issue('chats','empty_list','O WhatsApp ainda não disponibilizou conversas nesta sessão. Aguarde o carregamento e tente Sincronizar WhatsApp novamente.');
  const incomplete=failures>0||this.state.issues.length>0;
  this.state={...this.state,status:incomplete?'partial':'ready',completedAt:Date.now(),error:incomplete?'Alguns dados não puderam ser carregados. As listas disponíveis e os dados existentes foram preservados.':null};this.store.event(incomplete?'whatsapp_sync_error':'whatsapp_sync',`Sincronização: ${this.state.chats} conversas, ${this.state.groups} grupos e ${this.state.contacts} contatos encontrados.`);return this.snapshot();
 }
 importMessage(chat,message){
  const providerId=idOf(message),created=stamp(message.timestamp);if(!providerId||!created||created<(this.cutoff||Date.now()-historyWindow)||message.isStatus)return;
  const incoming=!(message.fromMe||message.id?.fromMe),from=message.from,to=message.to;
  // A live inbound must reach the verified receiver first; a history read cannot consume it.
  if(incoming&&(!Number.isFinite(this.wa.readyAt)||message.timestamp>=this.wa.readyAt))return;
  // Check the original conversation, not the message text, before storing a snapshot.
  const target=incoming?from:to,alias=target&&this.store.get('SELECT chat_id FROM whatsapp_chat_aliases WHERE alias=?',target);if(target!==chat.phone&&alias?.chat_id!==chat.id)return;
  const text=['chat','buttons_response','list_response','template_button_reply'].includes(message.type),media=['image','audio','ptt','video','document','sticker','location','vcard','multi_vcard'].includes(message.type);if(!text&&!media)return;
  const body=String(message.body|| (media?'[Anexo anterior à conexão — disponível no WhatsApp]':'')).trim().slice(0,10000);if(!body)return;
  this.store.run('INSERT OR IGNORE INTO messages(id,chat_id,provider_id,direction,body,status,created,author_name,inbound_verified) VALUES(?,?,?,?,?,?,?,?,0)',randomUUID(),chat.id,providerId,incoming?'in':'owner',body,'imported',created,incoming?null:'Enviado pelo WhatsApp');
 }
 history(chat){
  if(chat.channel!=='whatsapp'||chat.provider!=='qr'||this.wa.status!=='ready')return Promise.resolve();
  if(this.histories.has(chat.id))return this.histories.get(chat.id);
  const client=this.wa.client,generation=this.wa.generation,signal=this.controller.signal;
  const cutoff=this.cutoff||Date.now()-historyWindow,task=(async()=>{try{
   this.store.run("INSERT INTO whatsapp_history_sync VALUES(?,?,NULL,?,'loading',NULL) ON CONFLICT(chat_id) DO UPDATE SET cutoff=excluded.cutoff,last_sync=excluded.last_sync,status='loading',error=NULL",chat.id,cutoff,Date.now());this.store.changed();
   let remote=this.remotes.get(chat.id);if(!remote&&typeof client.getChatById==='function')remote=await bounded(()=>client.getChatById(chat.phone),signal,this.timeout);if(!this.active(client,generation)||signal.aborted)return false;if(typeof remote?.fetchMessages!=='function')throw new Error('O WhatsApp não disponibilizou a consulta do histórico deste chat.');
   let limit=200,oldest=null;const seen=new Set();
   while(this.active(client,generation)&&!signal.aborted){
    const messages=await bounded(()=>remote.fetchMessages({limit}),signal,this.historyTimeout);if(!this.active(client,generation)||signal.aborted)return false;if(!Array.isArray(messages))throw new Error('Resposta de histórico inválida.');
    const times=messages.map(message=>stamp(message.timestamp)).filter(Boolean);oldest=times.length?times.reduce((minimum,value)=>Math.min(minimum,value),Infinity):null;let added=0;
    this.store.transaction(()=>{for(const message of messages){const id=idOf(message);if(!id||seen.has(id))continue;seen.add(id);added++;this.importMessage(chat,message);}});this.store.changed();
    if(oldest!==null&&oldest<=cutoff||messages.length<limit){this.store.run('UPDATE whatsapp_history_sync SET status=?,oldest_at=?,last_sync=?,error=NULL WHERE chat_id=?',oldest!==null&&oldest<=cutoff?'complete':'available',oldest,Date.now(),chat.id);this.store.changed();return true;}
    if(!added)throw new Error('O WhatsApp repetiu a mesma página sem disponibilizar mensagens mais antigas.');limit*=2;
   }return false;
  }catch(error){if(this.active(client,generation)&&!signal.aborted){this.report(error);this.issue('history','history_incomplete','As listas foram carregadas, mas parte do histórico dos últimos 30 dias não pôde ser concluída. Use Sincronizar WhatsApp para tentar novamente.');const detail='Não foi possível concluir os últimos 30 dias. O histórico salvo foi mantido. Use Sincronizar WhatsApp para continuar.';this.store.run("UPDATE whatsapp_history_sync SET status='partial',error=?,last_sync=? WHERE chat_id=?",detail,Date.now(),chat.id);this.store.event('whatsapp_history_error',detail);}return false;}})();this.histories.set(chat.id,task);return task;
 }
}
