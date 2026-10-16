import wa from 'whatsapp-web.js';
import QRCode from 'qrcode';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
const {Client,LocalAuth}=wa;
export class WhatsApp {
 constructor(store,dataDir){this.store=store;this.dataDir=dataDir;this.client=null;this.status='disconnected';this.qr=null;this.error=null;this.number=null;this.receiver=null;this.generation=0;}
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
  const client=new Client({authStrategy:new LocalAuth({dataPath:join(this.dataDir,'whatsapp')}),puppeteer:{headless:true,executablePath,args},...(proxyAuthentication?{proxyAuthentication}:{}),webVersionCache:{type:'local',path:join(this.dataDir,'web-cache')}});
  this.client=client;
  client.on('qr',async code=>{const qr=await QRCode.toDataURL(code,{width:300,margin:2});if(this.generation!==generation)return;this.qr=qr;this.update('qr');});
  client.on('authenticated',()=>{if(this.generation!==generation)return;this.qr=null;this.update('authenticated');});
  client.on('ready',()=>{if(this.generation!==generation)return;this.qr=null;this.number=client.info?.wid?.user||null;this.update('ready');this.store.event('whatsapp','WhatsApp conectado.');});
  client.on('auth_failure',()=>{if(this.generation===generation)this.update('error','A sessão expirou. Desconecte e leia um novo QR Code.');});
  client.on('disconnected',()=>{if(this.generation===generation){this.qr=null;this.number=null;this.update('disconnected','A conexão foi encerrada. Conecte novamente no painel.');}});
  client.on('message',message=>{
   if(message.fromMe||message.isStatus||/@g\.us$|@broadcast$|@newsletter$/.test(message.from))return;
   const supported=['chat','buttons_response','list_response'];
   const unsupported=!supported.includes(message.type);
   const body=unsupported?'[Áudio ou anexo recebido — requer atendimento humano]':(message.selectedButtonId||message.selectedRowId||message.body);
   this.receiver?.({phone:message.from,name:message._data?.notifyName||message.from.replace(/@.*$/,''),body,forceHuman:unsupported,providerId:message.id?._serialized,channel:'whatsapp',provider:'qr'}).catch(()=>this.store.event('error','Falha no processamento de uma mensagem recebida. Verifique a conversa.'));
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
