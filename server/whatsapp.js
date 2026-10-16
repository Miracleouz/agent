import wa from 'whatsapp-web.js';
import QRCode from 'qrcode';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {photoInfo,maxPhotoBytes} from './images.js';
import {connectionError,safeConnectionDetail,authenticationTimeout} from './connection-errors.js';
import {WhatsAppSync} from './whatsapp-sync.js';
import {WhatsAppReadSync} from './whatsapp-read.js';
import {WhatsAppAvatars} from './whatsapp-avatars.js';
import {sendConfirmed} from './whatsapp-send.js';
import {WhatsAppClient} from './whatsapp-client.js';
const {LocalAuth,MessageMedia}=wa;
export class WhatsApp {
 constructor(store,dataDir,{clientFactory=options=>new WhatsAppClient(options),logger=console}={}){this.store=store;this.dataDir=dataDir;this.clientFactory=clientFactory;this.logger=logger;this.client=null;this.status='disconnected';this.qr=null;this.error=null;this.number=null;this.receiver=null;this.generation=0;this.mediaTasks=new Set();this.syncer=new WhatsAppSync(this);this.readSync=new WhatsAppReadSync(this);this.avatars=new WhatsAppAvatars(this);}
 snapshot(){return {status:this.status,qr:this.qr,error:this.error,number:this.number,transport:'qr',nativeButtons:false,sync:this.syncer.snapshot()};}
 update(status,error=null){if(status!=='ready'&&this.readSync?.pending.size)this.readSync.reset();this.status=status;this.error=error;if(status!=='ready')this.store.cancelFollowups(null,{whatsappOnly:true});this.store.changed();}
 connectionFailed(error){const diagnosis=connectionError(error);this.qr=null;this.number=null;this.update('error',`${diagnosis.message} Código: ${diagnosis.code}.`);this.store.event('whatsapp_error',this.error);this.logger.error(`[WhatsApp] ${diagnosis.code}: ${safeConnectionDetail(error)}`);}
 connect(){
  if(this.connecting)return this.connecting;
  const task=this.startConnection();this.connecting=task;return task.finally(()=>{if(this.connecting===task)this.connecting=null;});
 }
 async startConnection(){
  if(this.client&&['starting','qr','authenticated','ready'].includes(this.status))return this.snapshot();
  const generation=++this.generation;
  this.syncer.reset();this.readSync.reset();this.avatars.reset();this.readyAt=null;
  const previous=this.client;this.client=null;if(previous)await previous.destroy().catch(()=>{});
  if(this.generation!==generation)return this.snapshot();
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
  this.readSync.register(client,generation);
  client.on('cota_reloading',()=>{if(this.generation!==generation||this.client!==client||this.status==='error')return;readyAt=null;this.readyAt=null;this.syncer.reset();this.readSync.reset();this.avatars.reset();this.qr=null;this.number=null;this.update('starting');});
  client.on('cota_connection_error',error=>{if(this.generation!==generation||this.client!==client||this.status==='error')return;this.syncer.reset();this.readSync.reset();this.avatars.reset();this.connectionFailed(error);Promise.resolve().then(()=>client.destroy()).catch(()=>{});});
  client.on('qr',async code=>{try{const qr=await QRCode.toDataURL(code,{width:300,margin:2});if(this.generation!==generation||this.status==='error')return;this.qr=qr;this.update('qr');}catch(error){if(this.generation===generation&&this.status!=='error')this.connectionFailed(error);}});
  client.on('authenticated',()=>{if(this.generation!==generation||this.status==='error')return;this.qr=null;this.update('authenticated');});
  client.on('ready',()=>{if(this.generation!==generation||this.status==='error')return;readyAt=Math.floor(Date.now()/1000);this.readyAt=readyAt;this.qr=null;this.number=client.info?.wid?.user||null;this.update('ready');this.store.event('whatsapp','WhatsApp conectado.');this.syncer.run().catch(error=>{if(this.generation===generation)this.syncer.report(error);});});
  client.on('auth_failure',()=>{if(this.generation===generation)this.update('error','A sessão expirou. Desconecte e leia um novo QR Code.');});
  client.on('disconnected',()=>{if(this.generation===generation&&this.status!=='error'){this.syncer.reset();this.readSync.reset();this.avatars.reset();this.qr=null;this.number=null;this.update('disconnected','A conexão foi encerrada. Conecte novamente no painel.');}});
  client.on('message',message=>{
   if(this.generation!==generation||this.client!==client||this.status!=='ready'||readyAt===null)return;
   const group=/^\d+(?:-\d+)?@g\.us$/.test(message.from);
   if(message.fromMe||message.id?.fromMe||message.isStatus||!group&&!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(message.from))return;
   if(message.from===client.info?.wid?._serialized||message.from===client.info?.lid?._serialized)return;
   // Reconnection can replay history. Only accept new, identifiable customer messages.
   if(!message.id?._serialized||!Number.isFinite(message.timestamp)||message.timestamp<readyAt||message._data?.isNewMsg===false)return;
   const text=['chat','buttons_response','list_response','template_button_reply'].includes(message.type);
   const attachment=['audio','ptt','image','album','video','document','sticker','location','vcard','multi_vcard','order','product','groups_v4_invite','poll_creation'].includes(message.type);
   // Internal events, including encryption and call notifications, are not customer requests.
   if(!text&&!attachment)return;
   const body=attachment?'[Áudio ou anexo recebido — requer atendimento humano]':(message.selectedButtonId||message.selectedRowId||message.body);
   if(typeof body!=='string'||!body.trim())return;
   if(group){this.store.addGroupMessage({id:message.from,providerId:message.id._serialized,author:message._data?.notifyName||message.author?.replace(/@.*$/,'')||'Participante',body:attachment?'[Áudio ou anexo recebido no grupo]':body,created:message.timestamp*1000});return;}
   const mapped=this.store.get("SELECT c.phone FROM whatsapp_chat_aliases a JOIN chats c ON c.id=a.chat_id WHERE a.alias=? AND c.channel='whatsapp' AND c.provider='qr'",message.from);
   const processing=this.receiver?.({phone:mapped?.phone||message.from,name:message._data?.notifyName||message.from.replace(/@.*$/,''),body,forceHuman:attachment,providerId:message.id._serialized,channel:'whatsapp',provider:'qr'});
   processing?.catch(()=>{if(this.generation===generation)this.store.event('error','Falha no processamento de uma mensagem recebida. Verifique a conversa.');});
   if(message.type==='image'&&typeof message.downloadMedia==='function'&&processing){
    const task=processing.then(async result=>{
     if(!result.chatId||result.duplicate||result.ignored)return;
     const media=await message.downloadMedia();if(this.generation!==generation||this.client!==client||!media?.data||media.data.length>Math.ceil(maxPhotoBytes*4/3)+4)return;
     const data=Buffer.from(media.data,'base64'),info=photoInfo(data);
     this.store.run("UPDATE messages SET media_type=?,media_name=?,media_size=?,media_data=?,body=? WHERE provider_id=? AND chat_id=? AND direction='in' AND inbound_verified=1",info.type,'foto.'+info.extension,data.length,data,String(message.body||'').slice(0,4000),message.id._serialized,result.chatId);this.store.changed();
    }).catch(()=>{});this.mediaTasks.add(task);task.finally(()=>this.mediaTasks.delete(task));
   }
  });
  Promise.resolve().then(()=>client.initialize()).catch(error=>{if(this.generation===generation)this.connectionFailed(error);});
  return this.snapshot();
 }
 sync(){return this.syncer.run();}
 loadHistory(chat,options){return this.syncer.history(chat,options);}
 loadContactHistory(person,options){return this.syncer.contact(person,options);}
 markRead(chat,options){return this.readSync.mark(chat,options);}
 async send(chat,body,actions){
  if(this.status!=='ready'||!this.client)throw new Error('WhatsApp desconectado. Conecte no painel e reenvie a mensagem.');
  if(/@g\.us$|@broadcast$|@newsletter$/.test(chat.phone))throw new Error('O envio para grupos é bloqueado.');
  const numbered=actions?.length&&['close_order','help_yes','delivery_pickup'].includes(actions[0].id);
  const menu=numbered?'\n\n'+actions.map((a,i)=>`${i+1} — ${a.label}`).join('\n')+(actions.length===2?'\n\nResponda *1* ou *2*.':'\n\nResponda *1*, *2* ou *3*.'):actions?.length?'\n\n'+actions.map(a=>a.id==='more'?'↪ Digite *MAIS* para ver mais opções.':'👤 Digite *ATENDENTE* para falar com uma pessoa.').join('\n'):'';
  return sendConfirmed(this,chat,body+menu);
 }
 async resolveContact(phone){
  if(this.status!=='ready'||!this.client)throw Object.assign(new Error('Conecte o WhatsApp antes de iniciar uma conversa.'),{status:409});
  const client=this.client,generation=this.generation,id=(await client.getNumberId(phone))?._serialized;
  if(!id)throw Object.assign(new Error('Este telefone não foi encontrado no WhatsApp.'),{status:422});
  if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(id))throw Object.assign(new Error('Não foi possível confirmar o número do WhatsApp.'),{status:422});
  const identities=await client.getContactLidAndPhone([id]);
  if(this.client!==client||this.generation!==generation||this.status!=='ready')throw Object.assign(new Error('O WhatsApp desconectou. Tente novamente depois de conectar.'),{status:409});
  const aliases=[...new Set([id,...identities.filter(item=>item.pn===id||item.lid===id).flatMap(item=>[item.pn,item.lid]).filter(Boolean)])];
  for(const alias of [...aliases])if(/^\d+@(c\.us|s\.whatsapp\.net)$/.test(alias)){const number=alias.split('@')[0];for(const suffix of ['c.us','s.whatsapp.net'])if(!aliases.includes(number+'@'+suffix))aliases.push(number+'@'+suffix);}
  if(aliases.includes(client.info?.wid?._serialized)||aliases.includes(client.info?.lid?._serialized))throw Object.assign(new Error('Escolha o WhatsApp de um cliente, diferente do número da loja.'),{status:400});
  return{id,aliases};
 }
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
 async disconnect(){++this.generation;this.syncer.reset();this.readSync.reset();this.avatars.reset();const client=this.client;this.client=null;if(client){try{if(this.status==='ready')await client.logout();}catch{}await client.destroy().catch(()=>{});}this.qr=null;this.number=null;this.update('disconnected');}
 async close(){++this.generation;this.syncer.reset();this.readSync.reset();this.avatars.reset();if(this.client)await this.client.destroy().catch(()=>{});}
}
