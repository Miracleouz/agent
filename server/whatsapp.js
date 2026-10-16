import wa from 'whatsapp-web.js';
import QRCode from 'qrcode';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
const {Client,LocalAuth}=wa;
export class WhatsApp {
 constructor(store,dataDir,{clientFactory=options=>new Client(options)}={}){this.store=store;this.dataDir=dataDir;this.clientFactory=clientFactory;this.client=null;this.status='disconnected';this.qr=null;this.error=null;this.number=null;this.receiver=null;this.generation=0;}
 snapshot(){return {status:this.status,qr:this.qr,error:this.error,number:this.number,transport:'qr',nativeButtons:false};}
 update(status,error=null){this.status=status;this.error=error;this.store.changed();}
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
  client.on('ready',()=>{if(this.generation!==generation)return;readyAt=Math.floor(Date.now()/1000);this.qr=null;this.number=client.info?.wid?.user||null;this.update('ready');this.store.event('whatsapp','WhatsApp conectado.');});
  client.on('auth_failure',()=>{if(this.generation===generation)this.update('error','A sessão expirou. Desconecte e leia um novo QR Code.');});
  client.on('disconnected',()=>{if(this.generation===generation){this.qr=null;this.number=null;this.update('disconnected','A conexão foi encerrada. Conecte novamente no painel.');}});
  client.on('message',message=>{
   if(this.generation!==generation||this.client!==client||this.status!=='ready'||readyAt===null)return;
   if(message.fromMe||message.id?.fromMe||message.isStatus||!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(message.from))return;
   if(message.from===client.info?.wid?._serialized||message.from===client.info?.lid?._serialized)return;
   // Reconnection can replay history. Only accept new, identifiable customer messages.
   if(!message.id?._serialized||!Number.isFinite(message.timestamp)||message.timestamp<readyAt||message._data?.isNewMsg===false)return;
   const text=['chat','buttons_response','list_response','template_button_reply'].includes(message.type);
   const attachment=['audio','ptt','image','album','video','document','sticker','location','vcard','multi_vcard','order','product','groups_v4_invite','poll_creation'].includes(message.type);
   // Internal events, including encryption and call notifications, are not customer requests.
   if(!text&&!attachment)return;
   const body=attachment?'[Áudio ou anexo recebido — requer atendimento humano]':(message.selectedButtonId||message.selectedRowId||message.body);
   if(typeof body!=='string'||!body.trim())return;
   this.receiver?.({phone:message.from,name:message._data?.notifyName||message.from.replace(/@.*$/,''),body,forceHuman:attachment,providerId:message.id._serialized,channel:'whatsapp',provider:'qr'}).catch(()=>this.store.event('error','Falha no processamento de uma mensagem recebida. Verifique a conversa.'));
  });
  client.initialize().catch(()=>{if(this.generation===generation)this.update('error','Não foi possível abrir o WhatsApp Web. Verifique a rede, a liberação de web.whatsapp.com e tente reconectar.');});
  return this.snapshot();
 }
 async send(chat,body,actions){
  if(this.status!=='ready'||!this.client)throw new Error('WhatsApp desconectado. Conecte no painel e reenvie a mensagem.');
  if(/@g\.us$|@broadcast$|@newsletter$/.test(chat.phone))throw new Error('O envio para grupos é bloqueado.');
  const menu=actions?.length?'\n\n'+actions.map(a=>a.id==='more'?'↪ Digite *MAIS* para ver mais opções.':'👤 Digite *ATENDENTE* para falar com uma pessoa.').join('\n'):'';
  const result=await this.client.sendMessage(chat.phone,body+menu);return result.id?._serialized;
 }
 async disconnect(){++this.generation;const client=this.client;this.client=null;if(client){try{if(this.status==='ready')await client.logout();}catch{}await client.destroy().catch(()=>{});}this.qr=null;this.number=null;this.update('disconnected');}
 async close(){++this.generation;if(this.client)await this.client.destroy().catch(()=>{});}
}
