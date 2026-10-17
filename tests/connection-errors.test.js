import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {connectionError,safeConnectionDetail,authenticationTimeout} from '../server/connection-errors.js';
const cases=[
 ['COTA_CONNECTION_TIMEOUT','connection_timeout'],
 ['COTA_LOGOUT_FAILED','logout_failed'],
 ['COTA_PROFILE_RECOVERY_FAILED','profile_recovery_failed'],
 ['COTA_PROFILE_ACTIVE','profile_active'],
 ['COTA_PROFILE_PROCESS_CHECK','profile_process_check'],
 ['COTA_PROFILE_PERMISSIONS','profile_permissions'],
 ['COTA_PROFILE_LOCK_FORMAT','profile_lock_format'],
 ['COTA_PROFILE_PATH','profile_path'],
 ['COTA_PROFILE_CHANGED','profile_changed'],
 ['COTA_PROFILE_CONFIRMATION','profile_confirmation'],

 ['COTA_BROWSER_CLOSE_TIMEOUT','browser_close_timeout'],
 ['Cannot read properties of null (reading \'Socket\')','auth_modules'],
 ['COTA_AUTH_MODULES_UNAVAILABLE','auth_modules'],
 ['Attempted to use detached Frame \'test-frame\'','page_reloaded'],
 ['Execution context was destroyed','page_reloaded'],
 ['COTA_AUTH_DOCUMENT_CHANGED','page_reloaded'],
 ['Failed to create SingletonLock: File exists (17)','profile_busy'],
 ['The profile appears to be in use by another Chromium process on another computer','profile_busy'],
 ['The browser is already running for this userDataDir','profile_busy'],
 ['Chromium não encontrado. Confira CHROME_PATH.','browser_missing'],
 ['Browser was not found at the configured executablePath','browser_missing'],
 ['Could not find Chrome','browser_missing'],
 ['spawn /bin/chromium ENOENT','browser_missing'],
 ['Failed to create /app/data/whatsapp/session/SingletonLock: Permission denied (13)','permissions'],
 ['EACCES mkdir session','permissions'],
 ['EROFS: read-only file system','permissions'],
 ['ENOSPC: no space left on device','disk_full'],
 ['Failed to launch the browser process: Cannot allocate memory','memory'],
 ['net::ERR_CERT_AUTHORITY_INVALID at https://web.whatsapp.com/','certificate'],
 ['net::ERR_PROXY_CONNECTION_FAILED','proxy'],
 ['net::ERR_TUNNEL_CONNECTION_FAILED','proxy'],
 ['Proxy configuration failed: endereço inválido.','proxy'],
 ['net::ERR_NAME_NOT_RESOLVED','dns'],
 ['EAI_AGAIN web.whatsapp.com','dns'],
 ['net::ERR_CONNECTION_RESET','network'],
 ['ENETUNREACH','network'],
 ['auth timeout','timeout'],
 ['Navigation timeout of 30000 ms exceeded','timeout'],
 ['error while loading shared libraries: libnss3.so','browser_dependencies'],
 ['Failed to launch the browser process','browser_start'],
 ['Protocol error (Target closed)','browser_start'],
 ['Evaluation failed: a new upstream error','initialization'],
];
for(const [message,code] of cases)test(`connection diagnosis: ${message}`,()=>{assert.equal(connectionError(new Error(message)).code,code);assert.equal(connectionError(message).code,code);assert(connectionError(message).message.length>40);});
test('unknown failures do not blame the network or leak their content into guidance',()=>{const result=connectionError(new Error('private detail=customer'));assert.equal(result.code,'initialization');assert.doesNotMatch(result.message,/private|customer|Verifique a rede/);});
test('server details strip proxy credentials, query strings, authorization, cookies, QR and control characters',()=>{
 const safe=safeConnectionDetail(new Error('Failed at https://alice:private-password@proxy.example:3128/path?token=private-query Authorization: Bearer private-bearer cookie=private-cookie password="private quoted" QR=private-qr\u001b[31m'));
 for(const secret of ['alice','private-password','private-query','private-bearer','private-cookie','private quoted','private-qr','/path','\u001b'])assert(!safe.includes(secret),secret);assert(safe.includes('https://proxy.example:3128'));assert(safe.length<=2500);assert.equal(safeConnectionDetail('a'.repeat(3000)).length,2500);
});
for(const [value,expected] of [[undefined,90000],['',90000],['abc',90000],['Infinity',90000],['30000',30000],['300000',300000],['29999',90000],['300001',90000],['-1',90000],['45000.1',90000],['120000',120000]])test(`authentication timeout is bounded: ${String(value)}`,()=>assert.equal(authenticationTimeout(value),expected));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function waitStatus(f,status){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{f.store.off('change',check);reject(new Error('Status não chegou: '+status));},2000);function check(){if(f.whatsapp.status===status){clearTimeout(timer);f.store.off('change',check);resolve();}}f.store.on('change',check);check();});}
async function fixture(t,behavior){
 const store=new Store(':memory:'),dir=mkdtempSync(join(tmpdir(),'cota-connection-test-')),logs=[],clients=[],options=[];
 class Client extends EventEmitter{async initialize(){if(behavior)return behavior(this);}async destroy(){this.destroyed=true;}async logout(){throw new Error('The diagnostic must not log out the session');}async sendMessage(){throw new Error('Connection must never send a message');}}
 const whatsapp=new WhatsApp(store,dir,{logger:{error:value=>logs.push(value)},clientFactory:config=>{options.push(config);const client=new Client();clients.push(client);return client;}});
 t.after(async()=>{await whatsapp.close();store.close();rmSync(dir,{recursive:true,force:true});});return{store,dir,logs,clients,options,whatsapp};
}
test('failed initialization shows a specific safe error, records logs and never deletes session data',async t=>{
 const f=await fixture(t,()=>Promise.reject(new Error('Failed to launch Chromium: The profile appears to be in use by another process'))),sentinel=join(f.dir,'existing-session-marker');writeFileSync(sentinel,'preserve');await f.whatsapp.connect();await tick();assert.equal(f.whatsapp.status,'error');assert.match(f.whatsapp.error,/profile_busy/);assert.equal(f.logs.length,1);assert.equal(f.store.all('SELECT * FROM events').at(-1).kind,'whatsapp_error');assert.equal(readFileSync(sentinel,'utf8'),'preserve');assert.equal(f.store.chats().length,0);
 f.clients[0].emit('ready');f.clients[0].emit('authenticated');f.clients[0].emit('qr','late-code');f.clients[0].emit('disconnected');await tick();assert.equal(f.whatsapp.status,'error');assert.equal(f.whatsapp.qr,null);
});
test('synchronous initialize failures are caught and sensitive technical text is restricted to sanitized logs',async t=>{
 const f=await fixture(t,()=>{throw new Error('net::ERR_PROXY_CONNECTION_FAILED https://user:secret-value@proxy.example/?token=secret-query');});await f.whatsapp.connect();await tick();assert.match(f.whatsapp.error,/proxy/);assert.equal(f.logs.length,1);assert.doesNotMatch(f.logs[0],/secret-value|secret-query|user:/);assert.doesNotMatch(JSON.stringify(f.whatsapp.snapshot()),/proxy.example|secret-value/);
});
test('late failure of a disconnected client does not overwrite a new QR and does not send anything',async t=>{
 let reject;const f=await fixture(t,()=>new Promise((_,fail)=>{reject=fail;}));await f.whatsapp.connect();await tick();const old=f.clients[0],oldReject=reject;await f.whatsapp.disconnect();await f.whatsapp.connect();f.clients[1].emit('qr','new-qr-only-for-test');await waitStatus(f,'qr');oldReject(new Error('old failure'));old.emit('ready');await tick();assert.equal(f.whatsapp.status,'qr');assert.match(f.whatsapp.qr,/^data:image\/png/);assert.equal(f.logs.length,0);assert.equal(f.store.chats().length,0);
});
test('new QR generation clears previous failure and uses a longer bounded authentication timeout',async t=>{
 let count=0;const f=await fixture(t,()=>{if(++count===1)throw 'auth timeout';});await f.whatsapp.connect();await tick();assert.equal(f.whatsapp.status,'error');await f.whatsapp.connect();await tick();f.clients[1].emit('qr','test-code');await waitStatus(f,'qr');assert.equal(f.whatsapp.status,'qr');assert.equal(f.whatsapp.error,null);assert.equal(f.clients[0].destroyed,true);assert(f.options.every(option=>option.authTimeoutMs>=30000&&option.authTimeoutMs<=300000));assert.equal(f.store.messages('none').length,0);
});
test('missing configured Chromium returns actionable status instead of generic HTTP failure',async t=>{
 const previous=process.env.CHROME_PATH;process.env.CHROME_PATH='/tmp/cota-intentionally-missing-browser';t.after(()=>{if(previous===undefined)delete process.env.CHROME_PATH;else process.env.CHROME_PATH=previous;});const f=await fixture(t);await f.whatsapp.connect();assert.equal(f.whatsapp.status,'error');assert.match(f.whatsapp.error,/browser_missing/);assert.equal(f.clients.length,0);assert.equal(f.logs.length,1);
});
test('client construction failure is reported and does not leave a permanent starting state',async t=>{
 const store=new Store(':memory:'),logs=[],dir=mkdtempSync(join(tmpdir(),'cota-factory-test-'));const whatsapp=new WhatsApp(store,dir,{logger:{error:value=>logs.push(value)},clientFactory:()=>{throw new Error('EACCES session');}});t.after(async()=>{await whatsapp.close();store.close();rmSync(dir,{recursive:true,force:true});});await whatsapp.connect();assert.equal(whatsapp.status,'error');assert.match(whatsapp.error,/permissions/);assert.equal(logs.length,1);
});
test('diagnostic command exits on failure without touching the real data directory or exposing a QR',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'cota-cli-check-')),sentinel=join(dir,'keep');writeFileSync(sentinel,'history');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['server/diagnose-whatsapp.js'],{cwd:process.cwd(),env:{...process.env,CHROME_PATH:'/tmp/cota-intentionally-missing-browser',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);child.on('error',reject);child.on('close',code=>resolve({code,output}));});assert.equal(result.code,1);assert.match(result.output,/browser_missing/);assert.doesNotMatch(result.output,/data:image|base64|cota.sqlite/);assert.equal(readFileSync(sentinel,'utf8'),'history');
});
test('concurrent reconnect clicks cannot launch two browsers on the same session',async t=>{
 const f=await fixture(t,()=>{throw new Error('auth timeout');});await f.whatsapp.connect();await tick();let finish;f.clients[0].destroy=()=>new Promise(resolve=>{finish=resolve;});const one=f.whatsapp.connect(),two=f.whatsapp.connect();await tick();assert.equal(f.clients.length,1);finish();await Promise.all([one,two]);await tick();assert.equal(f.clients.length,2);assert.equal(f.whatsapp.status,'error');
});
test('disconnect during previous browser cleanup cancels the reconnect before a new browser starts',async t=>{
 const f=await fixture(t,()=>{throw new Error('auth timeout');});await f.whatsapp.connect();await tick();let finish;f.clients[0].destroy=()=>new Promise(resolve=>{finish=resolve;});const pending=f.whatsapp.connect();await tick();const stopping=f.whatsapp.disconnect();assert.equal(f.whatsapp.status,'disconnecting');finish();await Promise.all([pending,stopping]);assert.equal(f.clients.length,1);assert.equal(f.whatsapp.status,'disconnected');assert.equal(f.whatsapp.client,null);
});
