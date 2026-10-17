import wa from 'whatsapp-web.js';
import manifest from '../package.json' with {type:'json'};
import QRCode from 'qrcode';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {mediaInfo,maxMediaBytes} from './media.js';
import {AudioTranscription} from './audio-transcription.js';
import {photoInfo,maxPhotoBytes} from './images.js';
import {connectionError,safeConnectionDetail,authenticationTimeout} from './connection-errors.js';
import {WhatsAppMonitor} from './whatsapp-monitor.js';
import {WhatsAppSync} from './whatsapp-sync.js';
import {WhatsAppReadSync} from './whatsapp-read.js';
import {WhatsAppAvatars} from './whatsapp-avatars.js';
import {sendConfirmed} from './whatsapp-send.js';
import {WhatsAppClient} from './whatsapp-client.js';
import {connectionStageLabel} from './connection-progress.js';
import {acquireProfileLease,prepareManagedProfile,markManagedProfile} from './whatsapp-profile-lease.js';
import {recoverProfile,recreateProfile,profileRecoveryError} from './whatsapp-profile.js';
const {LocalAuth,MessageMedia}=wa;
function bounded(operation,timeout,code){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(code)),timeout);Promise.resolve().then(operation).then(value=>{clearTimeout(timer);resolve(value);},()=>{clearTimeout(timer);reject(new Error(code));});});}
const closures=new WeakMap();
function closeClient(client,timeout){if(!closures.has(client))closures.set(client,bounded(()=>client.destroy(),timeout,'COTA_BROWSER_CLOSE_TIMEOUT'));return closures.get(client);}
export class WhatsApp {
 constructor(store,dataDir,{clientFactory=options=>new WhatsAppClient(options),logger=console,startupTimeout=null,cleanupTimeout=6000}={}){this.store=store;this.dataDir=dataDir;this.clientFactory=clientFactory;this.logger=logger;this.startupTimeout=startupTimeout;this.cleanupTimeout=cleanupTimeout;this.client=null;this.status='disconnected';this.qr=null;this.error=null;this.number=null;this.receiver=null;this.generation=0;this.mediaTasks=new Set();this.transcription=new AudioTranscription(store,dataDir);this.monitor=new WhatsAppMonitor(this);this.syncer=new WhatsAppSync(this);this.readSync=new WhatsAppReadSync(this);this.avatars=new WhatsAppAvatars(this);}
 snapshot(){return {status:this.status,qr:this.qr,error:this.error,number:this.number,transport:'qr',nativeButtons:false,progress:{stage:this.stage||null,message:connectionStageLabel(this.stage),deadlineAt:this.deadlineAt||null},sync:this.syncer.snapshot(),realtime:this.monitor.snapshot()};}
 clearStartup(){clearTimeout(this.startupTimer);this.startupTimer=null;this.deadlineAt=null;}
 progress(stage){if(!connectionStageLabel(stage)||stage===this.stage)return;this.stage=stage;this.logger.info?.(`[WhatsApp connect] stage=${stage}`);this.store.changed();}
 armStartup(client,generation){this.clearStartup();const timeout=this.startupTimeout??authenticationTimeout(process.env.WHATSAPP_AUTH_TIMEOUT_MS);this.deadlineAt=Date.now()+timeout;this.startupTimer=setTimeout(()=>{if(this.client!==client||this.generation!==generation||!['starting','authenticated'].includes(this.status))return;this.connectionFailed(new Error('COTA_CONNECTION_TIMEOUT'));closeClient(client,this.cleanupTimeout).catch(()=>{});},timeout);this.startupTimer.unref?.();}
 update(status,error=null){if(status!=='ready')this.monitor.reset();if(!['starting','authenticated'].includes(status))this.clearStartup();if(status!=='ready'&&this.readSync?.pending.size)this.readSync.reset();this.status=status;this.error=error;if(status!=='ready')this.store.cancelFollowups(null,{whatsappOnly:true});this.store.changed();}
 connectionFailed(error){const diagnosis=connectionError(error);this.qr=null;this.number=null;this.update('error',`${diagnosis.message} Código: ${diagnosis.code}.`);this.store.event('whatsapp_error',this.error);this.logger.error(`[WhatsApp] ${diagnosis.code}: ${safeConnectionDetail(error)}`);}
 connect(){
  if(this.disconnecting)return this.disconnecting.then(()=>this.connect());
  if(this.logoutWork)return Promise.reject(Object.assign(new Error('A desvinculação anterior ainda está pendente. Aguarde ou reinicie o serviço antes de conectar novamente.'),{status:503}));
  if(this.recovering)return this.recovering;
  if(this.connecting)return this.connecting;
  const task=this.startConnection();this.connecting=task;return task.finally(()=>{if(this.connecting===task)this.connecting=null;});
 }
 async startConnection(){
  if(this.client&&['starting','qr','authenticated','ready'].includes(this.status))return this.snapshot();
  const generation=++this.generation;
  this.clearStartup();
  this.syncer.reset();this.readSync.reset();this.avatars.reset();this.readyAt=null;
  const previous=this.client;this.qr=null;this.number=null;this.update('starting');
  if(previous){this.progress('closing_previous');try{await closeClient(previous,this.cleanupTimeout);}catch(error){if(this.generation===generation){this.client=previous;this.connectionFailed(error);}return this.snapshot();}}
  if(this.generation!==generation)return this.snapshot();
  this.client=null;
  const executablePath=process.env.CHROME_PATH||['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync);
  if(!executablePath||!existsSync(executablePath)){this.connectionFailed(new Error('Chromium não encontrado. Confira CHROME_PATH.'));return this.snapshot();}
  const args=['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'];
  let proxyAuthentication;
  const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;
  if(proxy){try{const url=new URL(proxy);args.push(`--proxy-server=${url.protocol}//${url.host}`);if(url.username)proxyAuthentication={username:decodeURIComponent(url.username),password:decodeURIComponent(url.password)};}catch{this.connectionFailed(new Error('Proxy configuration failed: endereço inválido.'));return this.snapshot();}}
  this.qr=null;this.number=null;this.update('starting');
  let client;try{client=this.clientFactory({authStrategy:new LocalAuth({dataPath:join(this.dataDir,'whatsapp')}),authTimeoutMs:authenticationTimeout(process.env.WHATSAPP_AUTH_TIMEOUT_MS),puppeteer:{headless:true,executablePath,args},...(proxyAuthentication?{proxyAuthentication}:{}),webVersionCache:{type:'none'}});}catch(error){this.connectionFailed(error);return this.snapshot();}
  let readyAt=null;
  this.client=client;
  if(client.cotaManaged&&client.authStrategy instanceof LocalAuth){try{this.profileLease??=await acquireProfileLease(this.dataDir);const repair=await prepareManagedProfile(this.dataDir,{lease:this.profileLease});if(repair?.removed?.length)this.logger.info?.('[WhatsApp profile] stale_locks_recovered');}catch(error){this.connectionFailed(error);return this.snapshot();}if(this.generation!==generation){await this.profileLease?.release();this.profileLease=null;return this.snapshot();}}
  this.progress('browser_start');this.armStartup(client,generation);
  this.readSync.register(client,generation);
  client.on('cota_stage',stage=>{if(this.generation===generation&&this.client===client&&this.status!=='error')this.progress(stage);});
  client.on('cota_reloading',()=>{if(this.generation!==generation||this.client!==client||this.status==='error')return;readyAt=null;this.readyAt=null;this.syncer.reset();this.readSync.reset();this.avatars.reset();this.qr=null;this.number=null;this.update('starting');if(!this.startupTimer)this.armStartup(client,generation);});
  client.on('cota_connection_error',error=>{if(this.generation!==generation||this.client!==client||this.status==='error')return;this.syncer.reset();this.readSync.reset();this.avatars.reset();this.connectionFailed(error);Promise.resolve().then(()=>client.destroy()).catch(()=>{});});
  client.on('qr',async code=>{try{const qr=await QRCode.toDataURL(code,{width:300,margin:2});if(this.generation!==generation||this.status==='error')return;this.qr=qr;this.update('qr');this.progress('qr_wait');}catch(error){if(this.generation===generation&&this.status!=='error')this.connectionFailed(error);}});
  client.on('authenticated',()=>{if(this.generation!==generation||this.status==='error'||this.status==='ready')return;const initial=this.status!=='authenticated';this.qr=null;this.update('authenticated');this.progress('session_sync');if(initial)this.armStartup(client,generation);});
  client.on('ready',()=>{if(this.generation!==generation||this.status==='error')return;if(this.status==='ready'){this.monitor.check();return;}readyAt=Math.floor(Date.now()/1000);this.readyAt=readyAt;this.qr=null;this.number=client.info?.wid?.user||null;this.update('ready');this.progress('ready');this.monitor.check();this.store.event('whatsapp','WhatsApp conectado.');this.syncer.run().catch(error=>{if(this.generation===generation)this.syncer.report(error);});});
  client.on('auth_failure',()=>{if(this.generation===generation)this.update('error','A sessão expirou. Desconecte e leia um novo QR Code.');});
  client.on('disconnected',()=>{if(this.generation===generation&&this.status!=='error'){this.syncer.reset();this.readSync.reset();this.avatars.reset();this.qr=null;this.number=null;this.update('disconnected','A conexão foi encerrada. Conecte novamente no painel.');}});
  const received=message=>{
   if(this.generation!==generation||this.client!==client||this.status!=='ready'||readyAt===null)return;
   this.monitor.received();
   if(!message.id?._serialized&&typeof message.id?.$1==='string')message.id={...message.id,_serialized:message.id.$1};
   const group=/^\d+(?:-\d+)?@g\.us$/.test(message.from);
   if(message.fromMe||message.id?.fromMe||message.isStatus||!group&&!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(message.from)){this.monitor.reject('destination_or_own');return;}
   if(message.from===(client.info?.wid?._serialized||client.info?.wid?.$1)||message.from===(client.info?.lid?._serialized||client.info?.lid?.$1))return;
   // Reconnection can replay history. Only accept new, identifiable customer messages.
   if(!message.id?._serialized){this.monitor.reject('identifier');return;}
   if(!Number.isFinite(message.timestamp)){this.monitor.reject('invalid_timestamp');return;}
   if(message.timestamp<readyAt){this.monitor.reject('before_connection');return;}
   if(message._data?.isNewMsg===false){this.monitor.reject('history_event');return;}
   const text=['chat','buttons_response','list_response','template_button_reply'].includes(message.type);
   const attachment=['audio','ptt','image','album','video','document','sticker','location','vcard','multi_vcard','order','product','groups_v4_invite','poll_creation'].includes(message.type);
   // Internal events, including encryption and call notifications, are not customer requests.
   if(!text&&!attachment){this.monitor.reject('type');return;}
   const body=attachment?'[Áudio ou anexo recebido — requer atendimento humano]':(message.selectedButtonId||message.selectedRowId||message.body);
   if(typeof body!=='string'||!body.trim()){this.monitor.reject('empty');return;}
   if(group){this.store.addGroupMessage({id:message.from,providerId:message.id._serialized,author:message._data?.notifyName||message.author?.replace(/@.*$/,'')||'Participante',body:attachment?'[Áudio ou anexo recebido no grupo]':body,created:message.timestamp*1000});return;}
   const mapped=this.store.get("SELECT c.phone FROM whatsapp_chat_aliases a JOIN chats c ON c.id=a.chat_id WHERE a.alias=? AND c.channel='whatsapp' AND c.provider='qr'",message.from);
   const processing=this.receiver?.({phone:mapped?.phone||message.from,name:message._data?.notifyName||message.from.replace(/@.*$/,''),body,forceHuman:attachment,providerId:message.id._serialized,channel:'whatsapp',provider:'qr',liveVerified:true});
   processing?.then(result=>{const row=this.store.get('SELECT id FROM messages WHERE provider_id=?',message.id._serialized);if(row){const kind={image:'image',video:'video',audio:'audio',ptt:'audio'}[message.type];if(kind){this.store.run('UPDATE messages SET media_kind=? WHERE id=?',kind,row.id);this.store.changed();}if(message.hasQuotedMsg&&typeof message.getQuotedMessage==='function'){const task=this.hydrateQuote(row.id,message,client,generation).catch(()=>{});this.trackMedia(task);}}if(result?.duplicate)this.monitor.state.duplicates++;else if(!result?.ignored)this.monitor.state.accepted++;}).catch(()=>{});
   processing?.catch(error=>{if(this.generation===generation){this.logger.error(`[WhatsApp live] receive_failed: ${safeConnectionDetail(error)}`);this.store.event('error','Falha no processamento de uma mensagem recebida. Verifique a conversa.');}});
   if(['image','video','audio','ptt'].includes(message.type)&&typeof message.downloadMedia==='function'&&processing){
    const task=processing.then(async result=>{
     const existing=result.duplicate?this.store.get("SELECT chat_id,media_type FROM messages WHERE provider_id=? AND direction='in' AND inbound_verified=1",message.id._serialized):null;
     const chatId=result.chatId||existing?.chat_id;if(!chatId||result.ignored||existing?.media_type)return;
     const media=await message.downloadMedia();if(this.generation!==generation||this.client!==client||!media?.data||media.data.length>Math.ceil(maxMediaBytes*4/3)+4)return;
     const data=Buffer.from(media.data,'base64'),info=mediaInfo(data,media.mimetype);
     this.store.run("UPDATE messages SET media_type=?,media_kind=?,media_name=?,media_size=?,media_data=?,body=? WHERE provider_id=? AND chat_id=? AND direction='in' AND inbound_verified=1",info.type,info.kind,'arquivo.'+info.extension,data.length,data,String(message.body||'').slice(0,4000),message.id._serialized,chatId);this.store.changed();if(info.kind==='audio'&&process.env.AUTO_TRANSCRIBE==='true')this.transcription.request(this.store.get('SELECT id FROM messages WHERE provider_id=?',message.id._serialized).id).catch(()=>{});
    }).catch(()=>{});this.mediaTasks.add(task);task.finally(()=>this.mediaTasks.delete(task));
   }
  };
  client.on('message',received);
  client.on('cota_live_message',message=>{if(message?.fromMe)this.mirrorOutgoing(message,client,generation);else received(message);});
  client.on('message_create',message=>{const task=this.mirrorOutgoing(message,client,generation);if(message.fromMe||message.id?.fromMe){if(['image','video','audio','ptt'].includes(message.type)&&typeof message.downloadMedia==='function')this.trackMedia(this.hydrateOutgoingMedia(message,task));}});
  client.on('message_reaction',reaction=>{if(this.client!==client||this.generation!==generation||this.status!=='ready')return;const id=reaction.msgId?._serialized||reaction.msgId?.$1||reaction.msgId,m=this.store.get('SELECT id FROM messages WHERE provider_id=?',typeof id==='string'?id:'');if(!m)return;const ownIds=[client.info?.wid?._serialized||client.info?.wid?.$1,client.info?.lid?._serialized||client.info?.lid?.$1].filter(Boolean),sender=typeof reaction.senderId==='string'?reaction.senderId:reaction.senderId?._serialized||reaction.senderId?.$1;if(!sender)return;this.store.setReaction(m.id,ownIds.includes(sender)?'store':sender,String(reaction.reaction||'').slice(0,32),ownIds.includes(sender)?'WhatsApp da loja':'Cliente');});
  client.on('cota_live_error',()=>{if(this.generation===generation&&this.client===client)this.logger.error('[WhatsApp live] message_model_unavailable');});
  Promise.resolve().then(()=>client.initialize()).catch(error=>{if(this.generation===generation&&this.client===client&&this.status!=='error')this.connectionFailed(error);});
  return this.snapshot();
 }
 async diagnostics(){
  await Promise.race([this.monitor.check(),new Promise(resolve=>{const timer=setTimeout(resolve,5500);timer.unref?.();})]);
  return{version:manifest.version,serverTime:new Date().toISOString(),connection:this.status,agentEnabled:this.store.settings().agentEnabled!==false,realtime:this.monitor.snapshot(),history:this.store.all("SELECT h.status,count(*) count FROM whatsapp_history_sync h JOIN chats c ON c.id=h.chat_id WHERE c.channel='whatsapp' AND c.provider='qr' GROUP BY h.status"),messages:this.store.all("SELECT direction,status,inbound_verified,count(*) count FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.channel='whatsapp' AND c.provider='qr' AND m.created>=? GROUP BY direction,status,inbound_verified",Date.now()-30*86400000)};
 }
 sync(){return this.syncer.run();}
 loadGroupHistory(id){return this.syncer.groupHistory(id);}
 mirrorOutgoing(message,client=this.client,generation=this.generation){
  const active=()=>this.client===client&&this.generation===generation&&this.status==='ready';
  if(!active()||message?.cotaOrigin||message?.fromMe!==true&&message?.id?.fromMe!==true||message.isStatus||message._data?.isNewMsg===false||!Number.isFinite(message.timestamp)||message.timestamp<this.readyAt)return;
  const phone=message.to,providerId=message.id?._serialized||message.id?.$1;
  if(!['chat','image','audio','ptt','video','document','sticker','location','vcard','multi_vcard'].includes(message.type))return;
  if(/^\d+(?:-\d+)?@g\.us$/.test(phone||'')&&providerId){const body=String(message.body||'[Anexo enviado pelo WhatsApp]').trim();this.store.addGroupMessage({id:phone,providerId,author:'Enviado pelo WhatsApp',body,created:message.timestamp*1000,incoming:false});return;}
  if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(phone||'')||!providerId||![ 'chat','image','audio','ptt','video','document','sticker','location','vcard','multi_vcard'].includes(message.type))return;
  if([(client.info?.wid?._serialized||client.info?.wid?.$1),(client.info?.lid?._serialized||client.info?.lid?.$1)].includes(phone))return;
  let chat=this.readSync.find(phone);
  if(!chat){const id=randomUUID();this.store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound,unread) VALUES(?,?,?,'whatsapp','qr',?,0,0)",id,phone,phone.split('@')[0],Date.now());chat=this.store.chat(id);this.store.run('INSERT OR IGNORE INTO whatsapp_chat_aliases VALUES(?,?)',phone,id);}
  const update=()=>{if(!active()||this.store.get('SELECT id FROM messages WHERE provider_id=?',providerId))return;
   const body=String(message.body||(message.type==='chat'?'':'[Anexo enviado pelo WhatsApp]')).trim().slice(0,10000);if(!body)return;
   const observedAt=Date.now();this.store.run("INSERT OR IGNORE INTO messages(id,chat_id,provider_id,direction,body,status,created,author_name,inbound_verified,provider_ack,sent_at) VALUES(?,?,?,'owner',?,'external',?,'Enviado pelo WhatsApp',0,?,?)",randomUUID(),chat.id,providerId,body,observedAt,Number.isInteger(message.ack)&&message.ack>=0&&message.ack<=4?message.ack:null,message.timestamp*1000);
   // Mirroring a phone/Web reply does not claim the chat or authorize the bot.
   // Manual mode remains an explicit panel action; cancel an obsolete reminder.
   this.store.run('UPDATE chats SET updated=MAX(updated,?) WHERE id=?',observedAt,chat.id);this.store.cancelFollowups(chat.id);this.store.changed();
  };
  const task=this.enqueueSideEffect?this.enqueueSideEffect(chat,update):Promise.resolve().then(update);task.catch(()=>this.logger.error('[WhatsApp live] outbound_sync_failed'));return task;
 }
 loadHistory(chat,options){return this.syncer.history(chat,options);}
 loadContactHistory(person,options){return this.syncer.contact(person,options);}
 markRead(chat,options){return this.readSync.mark(chat,options);}
 async send(chat,body,actions,options={}){
  if(this.status!=='ready'||!this.client)throw new Error('WhatsApp desconectado. Conecte no painel e reenvie a mensagem.');
  if(/@g\.us$|@broadcast$|@newsletter$/.test(chat.phone))throw new Error('O envio para grupos é bloqueado.');
  const numbered=actions?.length&&['close_order','help_yes','delivery_pickup'].includes(actions[0].id);
  const menu=numbered?'\n\n'+actions.map((a,i)=>`${i+1} — ${a.label}`).join('\n')+(actions.length===2?'\n\nResponda *1* ou *2*.':'\n\nResponda *1*, *2* ou *3*.'):actions?.length?'\n\n'+actions.map(a=>a.id==='more'?'↪ Digite *MAIS* para ver mais opções.':'👤 Digite *ATENDENTE* para falar com uma pessoa.').join('\n'):'';
  return sendConfirmed(this,chat,body+menu,{...(options.quotedMessageId?{quotedMessageId:options.quotedMessageId,ignoreQuoteErrors:false}:{})});
 }
 async resolveContact(phone){
  if(this.status!=='ready'||!this.client)throw Object.assign(new Error('Conecte o WhatsApp antes de iniciar uma conversa.'),{status:409});
  const client=this.client,generation=this.generation,identity=await client.getNumberId(phone),id=identity?._serialized||identity?.$1;
  if(!id)throw Object.assign(new Error('Este telefone não foi encontrado no WhatsApp.'),{status:422});
  if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(id))throw Object.assign(new Error('Não foi possível confirmar o número do WhatsApp.'),{status:422});
  const identities=await client.getContactLidAndPhone([id]);
  if(this.client!==client||this.generation!==generation||this.status!=='ready')throw Object.assign(new Error('O WhatsApp desconectou. Tente novamente depois de conectar.'),{status:409});
  const aliases=[...new Set([id,...identities.filter(item=>item.pn===id||item.lid===id).flatMap(item=>[item.pn,item.lid]).filter(Boolean)])];
  for(const alias of [...aliases])if(/^\d+@(c\.us|s\.whatsapp\.net)$/.test(alias)){const number=alias.split('@')[0];for(const suffix of ['c.us','s.whatsapp.net'])if(!aliases.includes(number+'@'+suffix))aliases.push(number+'@'+suffix);}
  if(aliases.includes((client.info?.wid?._serialized||client.info?.wid?.$1))||aliases.includes((client.info?.lid?._serialized||client.info?.lid?.$1)))throw Object.assign(new Error('Escolha o WhatsApp de um cliente, diferente do número da loja.'),{status:400});
  return{id,aliases};
 }
 trackMedia(task){this.mediaTasks.add(task);task.finally(()=>this.mediaTasks.delete(task)).catch(()=>{});return task;}
 async hydrateQuote(id,message,client,generation){const quote=await message.getQuotedMessage();if(!quote||this.client!==client||this.generation!==generation)return;const chat=this.store.chat(this.store.get('SELECT chat_id FROM messages WHERE id=?',id)?.chat_id);if(!chat||!this.belongsToChat(quote,chat))return;const provider=quote.id?._serialized||quote.id?.$1;if(!provider)return;const local=this.store.get('SELECT id FROM messages WHERE provider_id=? AND chat_id=?',provider,chat.id);this.store.run('UPDATE messages SET quoted_message_id=?,quoted_provider_id=?,quoted_body=?,quoted_author=? WHERE id=?',local?.id||null,provider,String(quote.body||'[Mídia]').slice(0,4000),quote.fromMe?'WhatsApp da loja':chat.name,id);this.store.changed();}
 async hydrateOutgoingMedia(message,task){try{await task;const row=this.store.get('SELECT id,media_type FROM messages WHERE provider_id=?',message.id?._serialized||message.id?.$1);if(!row||row.media_type)return;await this.loadMessageMedia(row.id,message);}catch{}}
 async loadMessageMedia(id,source){const row=this.store.get('SELECT * FROM messages WHERE id=?',id);if(!row||row.media_type)return;const client=this.client,generation=this.generation;if(this.status!=='ready')throw new Error('WhatsApp desconectado.');const message=source||await client.getMessageById(row.provider_id),media=await message?.downloadMedia?.();if(!media?.data||media.data.length>Math.ceil(maxMediaBytes*4/3)+4)throw new Error('Mídia indisponível ou maior que 32 MB.');const data=Buffer.from(media.data,'base64'),info=mediaInfo(data,media.mimetype);if(this.client!==client||this.generation!==generation)return;this.store.run('UPDATE messages SET media_type=?,media_kind=?,media_name=?,media_size=?,media_data=? WHERE id=?',info.type,info.kind,'arquivo.'+info.extension,data.length,data,id);this.store.changed();}
 async sendMedia(chat,file,caption,{quotedMessageId}={}){if(this.status!=='ready')throw new Error('WhatsApp desconectado.');if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(chat.phone))throw new Error('O envio para grupos é bloqueado.');const info=mediaInfo(file.data,file.type);return sendConfirmed(this,chat,new MessageMedia(info.type,file.data.toString('base64'),file.name),{caption,...(quotedMessageId?{quotedMessageId,ignoreQuoteErrors:false}:{})});}
 async react(chat,providerId,emoji){if(this.status!=='ready')throw new Error('WhatsApp desconectado.');const client=this.client,generation=this.generation,message=await client.getMessageById(providerId);if(this.client!==client||this.generation!==generation||this.status!=='ready')throw new Error('WhatsApp desconectado.');if(!message||!this.belongsToChat(message,chat))throw new Error('Mensagem não encontrada nesta conversa.');await message.react(emoji);}
 belongsToChat(message,chat){const target=message.fromMe?message.to:message.from;return target===chat.phone||this.store.get('SELECT chat_id FROM whatsapp_chat_aliases WHERE alias=?',target)?.chat_id===chat.id;}
 async sendPhoto(chat,photo,caption){
  if(this.status!=='ready'||!this.client)throw new Error('WhatsApp desconectado.');
  if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(chat.phone))throw new Error('O envio para grupos é bloqueado.');
  const info=photoInfo(photo.data);if(info.type!==photo.type)throw new Error('Foto inválida.');
  const media=new MessageMedia(info.type,photo.data.toString('base64'),photo.name);
  return sendConfirmed(this,chat,media,{caption});
 }
 async editMessage(chat,providerId,body){
  const denied=message=>Object.assign(new Error(message),{definite:true});
  if(this.status!=='ready'||!this.client)throw denied('WhatsApp desconectado.');
  if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(chat.phone))throw denied('Edição em grupos bloqueada.');
  const client=this.client,generation=this.generation,message=await client.getMessageById(providerId);
  if(this.client!==client||this.generation!==generation||this.status!=='ready')throw denied('O WhatsApp desconectou.');
  if(!message?.fromMe||message.id?._serialized!==providerId)throw denied('Mensagem enviada não encontrada.');
  const mapped=this.store.get('SELECT chat_id FROM whatsapp_chat_aliases WHERE alias=?',message.to||'');
  if(message.to!==chat.phone&&mapped?.chat_id!==chat.id)throw denied('O destinatário da mensagem não corresponde à conversa.');
  const edited=await message.edit(body,{linkPreview:false});if(!edited)throw denied('O WhatsApp não permitiu esta edição.');
  if(edited.id?._serialized!==providerId)throw new Error('Não foi possível confirmar a edição.');return providerId;
 }
 async drainMedia(){await Promise.allSettled([...this.mediaTasks]);}
 disconnect(){
  if(this.disconnecting)return this.disconnecting;
  if(this.logoutWork)return Promise.reject(Object.assign(new Error('A desvinculação anterior ainda está pendente. Aguarde ou reinicie o serviço antes de desconectar novamente.'),{status:503}));
  if(this.recovering)return this.recovering.then(()=>this.disconnect());
  const logout=this.status==='ready';++this.generation;this.clearStartup();this.syncer.reset();this.readSync.reset();this.avatars.reset();this.readyAt=null;this.qr=null;this.number=null;this.progress('disconnecting');this.update('disconnecting');
  const task=this.stopConnection(logout);this.disconnecting=task;task.then(()=>{if(this.disconnecting===task)this.disconnecting=null;},()=>{if(this.disconnecting===task)this.disconnecting=null;});return task;
 }
 async stopConnection(logout){
  try{
   await this.connecting?.catch(()=>{});const client=this.client;let logoutError;
   if(client){if(logout)try{const work=Promise.resolve().then(()=>client.logout());this.logoutWork=work;const settled=()=>{if(this.logoutWork===work)this.logoutWork=null;};work.then(settled,settled);await bounded(()=>work,this.cleanupTimeout,'COTA_LOGOUT_FAILED');}catch(error){logoutError=error;}
    await closeClient(client,this.cleanupTimeout);if(this.client===client)this.client=null;
   }
   if(logoutError)throw logoutError;
   await this.profileLease?.release();this.profileLease=null;this.stage=null;this.update('disconnected');return this.snapshot();
  }catch(error){this.connectionFailed(error);throw Object.assign(new Error(this.error),{status:503});}
 }
 recover({allOtherInstancesStopped=false,recreate=false}={}){
  if(allOtherInstancesStopped!==true)return Promise.reject(Object.assign(new Error('Confirme que todas as outras instâncias que usam esta sessão estão paradas.'),{status:400}));
  if(this.recovering)return this.recovering;
  if(this.logoutWork)return Promise.reject(Object.assign(new Error('Aguarde a desvinculação pendente ou reinicie o serviço antes de recuperar.'),{status:503}));
  if(this.disconnecting||['starting','qr','authenticated','ready'].includes(this.status))return Promise.reject(Object.assign(new Error('Desconecte esta tentativa antes de recuperar a conexão.'),{status:409}));
  ++this.generation;this.qr=null;this.number=null;this.progress('profile_recovery');this.update('recovering');
  const task=this.recoverConnection(recreate);this.recovering=task;task.then(()=>{if(this.recovering===task)this.recovering=null;},()=>{if(this.recovering===task)this.recovering=null;});return task;
 }
 async recoverConnection(recreate=false){
  try{
   await this.connecting?.catch(()=>{});
   if(this.client){await closeClient(this.client,this.cleanupTimeout);this.client=null;}
   this.profileLease??=await acquireProfileLease(this.dataDir);
   if(recreate){await recreateProfile(this.dataDir,{offlineConfirmed:true});this.store.event('whatsapp','Conexão recriada. O perfil anterior foi guardado no servidor; leia um novo QR Code.');}
   else await recoverProfile(this.dataDir,{clear:true,offlineConfirmed:true});
   if(this.profileLease)await markManagedProfile(this.dataDir);
   this.stage=null;this.update('disconnected');return await this.startConnection();
  }catch(error){const failure=error.message==='COTA_BROWSER_CLOSE_TIMEOUT'?error:profileRecoveryError(error);this.logger.error(`[WhatsApp profile] stage=${failure.stage||'browser_close'} code=${failure.code||'COTA_BROWSER_CLOSE_TIMEOUT'}${failure.fsCode?' fs='+failure.fsCode:''}`);this.connectionFailed(failure);throw Object.assign(new Error(this.error),{status:409});}
 }
 async close(){this.transcription.close();this.monitor.reset();++this.generation;this.clearStartup();this.syncer.reset();this.readSync.reset();this.avatars.reset();await this.connecting?.catch(()=>{});await this.disconnecting?.catch(()=>{});await this.recovering?.catch(()=>{});++this.generation;this.clearStartup();if(this.client)await closeClient(this.client,this.cleanupTimeout).catch(()=>{});await this.profileLease?.release();this.profileLease=null;}
}
