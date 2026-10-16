import wa from 'whatsapp-web.js';
import QRCode from 'qrcode';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {photoInfo,maxPhotoBytes} from './images.js';
const {Client,LocalAuth,MessageMedia}=wa;
export class WhatsApp {
 constructor(store,dataDir,{clientFactory=options=>new Client(options)}={}){this.store=store;this.dataDir=dataDir;this.clientFactory=clientFactory;this.client=null;this.status='disconnected';this.qr=null;this.error=null;this.number=null;this.receiver=null;this.generation=0;this.mediaTasks=new Set();}
 snapshot(){return {status:this.status,qr:this.qr,error:this.error,number:this.number,transport:'qr',nativeButtons:false};}
 update(status,error=null){this.status=status;this.error=error;if(status!=='ready')this.store.cancelFollowups(null,{whatsappOnly:true});this.store.changed();}
 async connect(){
  if(this.client&&['starting','qr','authenticated','ready'].includes(this.status))return this.snapshot();
  if(this.client){await this.client.destroy().catch(()=>{});this.client=null;}
  const executablePath=process.env.CHROME_PATH||['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync);
  if(!executablePath)throw new Error('Chromium não encontrado. Instale chromium ou configure CHROME_PATH.');
  const args=['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'];
  let proxyAuthentication;
  const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;
  if(proxy){const url=new URL(proxy);args.push(`--proxy-server=${url.protocol}//${url.host}`);if(url.username)proxyAuthentication={username:decodeURIComponent(url.username),password:decodeURIComponent(url.password)};}
  this.qr=null;this.number=null;this.update('starting');const generation=++this.generation;
  const client=this.clientFactory({authStrategy:new LocalAuth({dataPath:join(this.dataDir,'whatsapp')}),puppeteer:{headless:true,executablePath,args},...(proxyAuthentication?{proxyAuthentication}:{}),webVersionCache:{type:'local',path:join(this.dataDir,'web-cache')}});
  let readyAt=null;
  this.client=client;
  client.on('qr',async code=>{const qr=await QRCode.toDataURL(code,{width:300,margin:2});if(this.generation!==generation)return;this.qr=qr;this.update('qr');});
  client.on('authenticated',()=>{if(this.generation!==generation)return;this.qr=null;this.update('authenticated');});
  client.on('ready',()=>{if(this.generation!==generation)return;readyAt=Math.floor(Date.now()/1000);this.qr=null;this.number=client.info?.wid?.user||null;this.update('ready');this.store.event('whatsapp','WhatsApp conectado.');this.loadGroups(client,generation).catch(()=>{if(this.generation===generation&&this.status==='ready')this.store.event('groups_error','Não foi possível carregar a lista de grupos. Novas mensagens de grupos continuam somente para consulta.');});});
  client.on('auth_failure',()=>{if(this.generation===generation)this.update('error','A sessão expirou. Desconecte e leia um novo QR Code.');});
  client.on('disconnected',()=>{if(this.generation===generation){this.qr=null;this.number=null;this.update('disconnected','A conexão foi encerrada. Conecte novamente no painel.');}});
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
  client.initialize().catch(()=>{if(this.generation===generation)this.update('error','Não foi possível abrir o WhatsApp Web. Verifique a rede, a liberação de web.whatsapp.com e tente reconectar.');});
  return this.snapshot();
 }
 async loadGroups(client,generation){
  if(typeof client.getChats!=='function')return;
  const chats=await client.getChats();if(this.generation!==generation||this.client!==client||this.status!=='ready')return;
  this.store.transaction(()=>{for(const chat of chats)if(chat.isGroup)this.store.upsertGroup(chat.id?._serialized,chat.name);});this.store.changed();
 }
 async send(chat,body,actions){
  if(this.status!=='ready'||!this.client)throw new Error('WhatsApp desconectado. Conecte no painel e reenvie a mensagem.');
  if(/@g\.us$|@broadcast$|@newsletter$/.test(chat.phone))throw new Error('O envio para grupos é bloqueado.');
  const numbered=actions?.length&&['close_order','help_yes','delivery_pickup'].includes(actions[0].id);
  const menu=numbered?'\n\n'+actions.map((a,i)=>`${i+1} — ${a.label}`).join('\n')+(actions.length===2?'\n\nResponda *1* ou *2*.':'\n\nResponda *1*, *2* ou *3*.'):actions?.length?'\n\n'+actions.map(a=>a.id==='more'?'↪ Digite *MAIS* para ver mais opções.':'👤 Digite *ATENDENTE* para falar com uma pessoa.').join('\n'):'';
  const result=await this.client.sendMessage(chat.phone,body+menu);return result.id?._serialized;
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
  const result=await this.client.sendMessage(chat.phone,media,{caption});if(!result?.id?._serialized)throw new Error('Não foi possível confirmar o envio da foto.');return result.id._serialized;
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
 async disconnect(){++this.generation;const client=this.client;this.client=null;if(client){try{if(this.status==='ready')await client.logout();}catch{}await client.destroy().catch(()=>{});}this.qr=null;this.number=null;this.update('disconnected');}
 async close(){++this.generation;if(this.client)await this.client.destroy().catch(()=>{});}
}
