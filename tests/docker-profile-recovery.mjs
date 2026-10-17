// Opt-in Docker integration. Uses only uniquely named disposable test resources.
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
const exec=promisify(execFile),args=process.argv.slice(2),image=args[0];
if(!image||args.some((arg,index)=>index>0&&!['--expect-old-failure','--offline-recovery'].includes(arg)))throw new Error('Usage: node tests/docker-profile-recovery.mjs IMAGE [--expect-old-failure | --offline-recovery]');
const old=args.includes('--expect-old-failure'),offline=args.includes('--offline-recovery'),suffix=randomUUID().slice(0,8),volume=`cota-qr-test-${suffix}`;
assert(!(old&&offline),'Choose only one recovery mode');
let name,base,cookie='',browserProcess,uiBrowser,page,checks=0,authMarkerPath='/app/data/whatsapp/session/test-auth-marker';
const docker=async(...args)=>(await exec('docker',args,{maxBuffer:4*1024*1024})).stdout.trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=20000){const end=Date.now()+timeout;while(!await check()){if(Date.now()>end)throw new Error('Docker condition timed out');await pause(100);}}
async function api(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(base+'/api'+path,{method,headers:{'X-Cota-Request':'1',...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined});
 const value=await response.json();const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(value=>value.split(';')[0]).join('; ');return{status:response.status,value};
}
async function state(){return(await api('/bootstrap')).value.connection;}
async function start(index){
 name=`cota-qr-test-${suffix}-${index}`;cookie='';
 await docker('create','--init','--name',name,'--label','cota.disposable-profile-test=true','--shm-size=512m','-p','127.0.0.1::3000','-e','WHATSAPP_AUTO_CONNECT=false','-e','NODE_OPTIONS=--import=/app/tests/fixtures/docker-qr-bootstrap.mjs','-v',volume+':/app/data',image);
 await docker('cp','tests',name+':/app/tests');await docker('start',name);
 const address=await docker('port',name,'3000/tcp');base='http://'+address.split('\n')[0];
 await until(async()=>{try{return(await fetch(base+'/api/health')).ok;}catch{return false;}});
 const details=JSON.parse(await docker('exec',name,'node','--input-type=module','-e',"import fs from 'node:fs';console.log(JSON.stringify({uid:process.getuid(),init:fs.readFileSync('/proc/1/cmdline','utf8').split('\\0')[0]}));"));
 assert.equal(details.uid,1000);assert.match(details.init,/docker-init|tini/);checks++;
}
async function login(setup=false){const result=await api('/auth/'+(setup?'setup':'login'),{...(setup?{name:'Docker fixture'}:{}),email:'docker@example.test',password:'docker-recovery-fixture-123'});assert.equal(result.status,setup?201:200);}
async function connect(expected,code='profile_busy'){assert.equal((await api('/whatsapp/connect',{})).status,200);await until(async()=>['qr','error'].includes((await state()).status));const s=await state();assert.equal(s.status,expected,s.error);if(expected==='error')assert.match(s.error,new RegExp(code));else assert.match(s.qr,/^data:image\/png/);checks++;}
async function recover(){const r=await api('/whatsapp/recover',{allOtherInstancesStopped:true});assert.equal(r.status,200,r.value.error);await until(async()=>['qr','error'].includes((await state()).status));const s=await state();assert.equal(s.status,'qr',s.error);checks++;}
async function panel(){
 uiBrowser??=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 await page?.close();page=await uiBrowser.newPage();await page.goto(base);await page.getByLabel('E-mail',{exact:true}).fill('docker@example.test');await page.getByLabel('Senha',{exact:true}).fill('docker-recovery-fixture-123');await page.getByRole('button',{name:'Entrar no painel',exact:true}).click();await page.getByRole('button',{name:'WhatsApp',exact:true}).click();
}
async function recoverInPanel(){await page.getByRole('button',{name:'Recuperar conexão',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Recuperar conexão',exact:true});await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Recuperar e gerar QR',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByAltText('QR Code para conectar seu WhatsApp').waitFor({state:'visible'});assert.equal((await state()).status,'qr');checks++;}
async function preserved(chatId){const data=(await api('/bootstrap')).value;assert.equal(data.settings.businessName,'Docker preserved');assert.equal(data.currentUser.email,'docker@example.test');const messages=(await api('/chats/'+chatId+'/messages')).value;assert(messages.some(message=>message.body==='oi vim pelo site'));assert.equal(await docker('exec',name,'node','--input-type=module','-e',"import fs from 'node:fs';if(fs.readFileSync("+JSON.stringify(authMarkerPath)+",'utf8')!=='preserve'||fs.existsSync('/app/data/test-send-attempts'))process.exit(1);console.log('preserved-without-sends');"),'preserved-without-sends');checks++;}
try{
 await docker('volume','create','--label','cota.disposable-profile-test=true',volume);await start(1);await login(true);
 await api('/settings',{businessName:'Docker preserved'},'PATCH');const simulated=await api('/simulator/message',{phone:'demo-cliente',name:'Docker customer fixture',body:'oi vim pelo site'});assert.equal(simulated.status,201);const chatId=simulated.value.chatId;
 await docker('exec',name,'node','--input-type=module','-e',"import fs from 'node:fs';const root='/app/data/whatsapp/session';fs.mkdirSync(root,{recursive:true});fs.writeFileSync(root+'/test-auth-marker','preserve');for(const key of ['SingletonLock','SingletonCookie','SingletonSocket'])fs.symlinkSync(key==='SingletonLock'?'old-docker-container-347':'/tmp/retired/'+key,root+'/'+key);");
 await connect('error');
 if(offline){
  // Use the running container's actual image/volume, rather than a guessed
  // Compose project name or a newly extracted installation directory.
  const currentImage=await docker('inspect','--format','{{.Image}}',name);
  const mounts=JSON.parse(await docker('inspect','--format','{{json .Mounts}}',name));
  const currentVolume=mounts.find(mount=>mount.Type==='volume'&&mount.Destination==='/app/data')?.Name;
  assert.equal(currentVolume,volume);assert.match(currentImage,/^sha256:/);
  assert.equal(await docker('inspect','--format','{{range .Mounts}}{{if and (eq .Destination "/app/data") (eq .Type "volume")}}{{.Name}}{{end}}{{end}}',name),volume);
  assert.equal(await docker('volume','inspect','--format','{{.Driver}}',volume),'local');
  assert(['null','{}'].includes(await docker('volume','inspect','--format','{{json .Options}}',volume)));checks++;
  assert.notEqual(await docker('ps','--filter','volume='+volume,'--format','{{.Names}}'),'');checks++;
  await docker('stop','--time','30',name);
  assert.equal(await docker('ps','--filter','volume='+volume,'--format','{{.Names}}'),'');checks++;
  const report=await docker('run','--rm','--init','--network','none','--label','cota.disposable-profile-test=true','--mount','type=volume,source='+currentVolume+',target=/app/data','-e','DATA_DIR=/app/data','--entrypoint','node',currentImage,'server/recover-whatsapp-profile.js','--clear-stale-locks','--confirm-all-instances-stopped');
  assert.match(report,/3 links de bloqueio removidos/);checks++;
  await docker('start',name);base='http://'+(await docker('port',name,'3000/tcp')).split('\n')[0];await until(async()=>{try{return(await fetch(base+'/api/health')).ok;}catch{return false;}});await login();await connect('qr');await preserved(chatId);
  console.log(`PASS: offline recovery using exact container image and volume, active-volume checks, isolated maintenance without network, preserved user/history/authentication, QR after restart and no sends (${checks} checks).`);
 }
 else if(old){const r=await api('/whatsapp/recover',{allOtherInstancesStopped:true});assert.equal(r.status,409);assert.match(r.value.error,/profile_recovery_failed/);checks++;console.log(`REPRODUCED: 1.15.5 refuses recovery with docker-init and uid=1000 (${checks} checks).`);}
 else{
  await panel();await recoverInPanel();await preserved(chatId);
  for(let cycle=0;cycle<3;cycle++){await page.getByRole('button',{name:'Desconectar sessão',exact:true}).click();await page.getByRole('button',{name:'Gerar QR Code',exact:true}).waitFor({state:'visible'});assert.equal((await state()).status,'disconnected');await page.getByRole('button',{name:'Gerar QR Code',exact:true}).click();await page.getByAltText('QR Code para conectar seu WhatsApp').waitFor({state:'visible'});assert.equal((await state()).status,'qr');checks++;await preserved(chatId);}
  // An abrupt stop leaves real Chromium links with the previous hostname.
  await page.close();page=null;await docker('kill',name);await docker('rm',name);name=null;await start(2);await login();await connect('error');await panel();await recoverInPanel();await preserved(chatId);
  assert.equal((await api('/whatsapp/disconnect',{})).status,200);
  browserProcess=spawn('docker',['exec','-i',name,'node','tests/fixtures/docker-active-profile.mjs'],{stdio:['pipe','pipe','pipe']});let text='';browserProcess.stdout.on('data',data=>{text+=data;});let externalError='';browserProcess.stderr.on('data',data=>{externalError+=data;});await until(()=>text.includes('owned-browser-ready'));
  await connect('error');const blocked=await api('/whatsapp/recover',{allOtherInstancesStopped:true});assert.equal(blocked.status,409);assert.match(blocked.value.error,/profile_active/);checks++;
  const exited=new Promise((resolve,reject)=>{browserProcess.once('exit',code=>code===0?resolve():reject(new Error('Owned browser failed to close')));});browserProcess.stdin.end();await exited;browserProcess=null;
  await recover();await preserved(chatId);
  await api('/whatsapp/disconnect',{});await docker('exec',name,'node','--input-type=module','-e',"import fs from 'node:fs';fs.writeFileSync('/app/data/whatsapp/session/test-broken-shell','unavailable auth modules');");await connect('error','auth_modules|connection_timeout');
  await panel();await page.getByRole('button',{name:'Recriar conexão',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Recriar conexão',exact:true});assert.equal(await dialog.getByRole('button',{name:'Recriar e gerar QR',exact:true}).isDisabled(),true);await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Recriar e gerar QR',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByAltText('QR Code para conectar seu WhatsApp').waitFor({state:'visible'});assert.equal((await state()).status,'qr');checks++;
  const backup=await docker('exec',name,'node','--input-type=module','-e',"import fs from 'node:fs';const backups=fs.readdirSync('/app/data/whatsapp').filter(name=>name.startsWith('session-backup-'));if(backups.length!==1)process.exit(1);console.log(backups[0]);");assert.match(backup,/^session-backup-[a-f0-9-]+$/);authMarkerPath='/app/data/whatsapp/'+backup+'/test-auth-marker';await preserved(chatId);
  await page.getByRole('button',{name:'Desconectar sessão',exact:true}).click();await page.getByRole('button',{name:'Gerar QR Code',exact:true}).waitFor({state:'visible'});assert.equal((await state()).status,'disconnected');await page.getByRole('button',{name:'Gerar QR Code',exact:true}).click();await page.getByAltText('QR Code para conectar seu WhatsApp').waitFor({state:'visible'});checks++;await preserved(chatId);
  console.log(`PASS: Docker init + uid=1000, recovery, disconnect cycles, abrupt recreate, active-profile refusal, persistent-module timeout, explicit profile backup and new QR, preserved data and no sends (${checks} checks).`);
 }
}finally{
 await uiBrowser?.close();
 if(browserProcess){browserProcess.stdin.end();await new Promise(resolve=>{browserProcess.once('exit',resolve);setTimeout(resolve,6000);});}
 if(name)await docker('rm','--force',name).catch(()=>{});
 await docker('volume','rm',volume).catch(()=>{});
}
