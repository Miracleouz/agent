import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from './db.js';
import {WhatsApp} from './whatsapp.js';
import {safeConnectionDetail} from './connection-errors.js';
// A new temporary profile cannot read the installation's chats or paired session.
const dir=mkdtempSync(join(tmpdir(),'cota-qr-check-')),store=new Store(':memory:'),whatsapp=new WhatsApp(store,dir);
console.log('Diagnóstico do QR: perfil temporário, sem pareamento e sem envio de mensagens.');
let timer;
try{
 const result=await new Promise((resolve,reject)=>{
  const inspect=()=>{const state=whatsapp.snapshot();if(state.status==='qr')resolve(true);else if(state.status==='error')reject(new Error(state.error));};
  store.on('change',inspect);timer=setTimeout(()=>reject(new Error('Tempo limite de 120 segundos. Confira rede, memória e logs do Chromium.')),120000);
  whatsapp.connect().then(inspect,reject);
 });
 if(result)console.log('OK: Chromium abriu o WhatsApp Web e gerou um QR Code. O QR não foi exibido e nenhum número foi conectado. Se o painel ainda falhar, confira o perfil persistente e o código de erro no painel.');
}catch(error){console.error('FALHA:',safeConnectionDetail(error));process.exitCode=1;}finally{
 clearTimeout(timer);await whatsapp.close().catch(()=>{});store.close();rmSync(dir,{recursive:true,force:true});
}
