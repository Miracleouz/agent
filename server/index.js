import {resolve,join} from 'node:path';
import {existsSync} from 'node:fs';
import express from 'express';
import {EnvHttpProxyAgent,setGlobalDispatcher} from 'undici';
import {Store} from './db.js';
import {WhatsApp} from './whatsapp.js';
import {createApp} from './app.js';
setGlobalDispatcher(new EnvHttpProxyAgent());
const dataDir=resolve(process.env.DATA_DIR||'./data');
const store=new Store(join(dataDir,'cota.sqlite'));const whatsapp=new WhatsApp(store,dataDir);
const production=process.env.NODE_ENV==='production';const app=createApp({store,whatsapp,production});
let vite;
if(production){if(!existsSync(resolve('dist/index.html')))throw new Error('Execute npm run build antes de npm start.');app.use(express.static(resolve('dist')));app.get('/{*splat}',(_req,res)=>res.sendFile(resolve('dist/index.html')));}
else{const{createServer}=await import('vite');vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Cota iniciado na porta ${process.env.PORT||3000}. Abra o painel para configurar a conta do dono.`));
if(process.env.WHATSAPP_AUTO_CONNECT==='true'&&store.get('SELECT id FROM owner'))whatsapp.connect().catch(()=>store.event('whatsapp_error','Não foi possível restaurar a sessão do WhatsApp. Conecte pelo painel.'));
async function shutdown(){app.locals.close();await whatsapp.close();await vite?.close();server.close(()=>{store.close();process.exit(0);});setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
