import {spawn} from 'node:child_process';
import {mkdir,lstat,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {recoverProfile} from './whatsapp-profile.js';

const failure=(code,message)=>Object.assign(new Error('COTA_PROFILE_'+code+': '+message),{code:'COTA_PROFILE_'+code});
const missing=error=>error.code==='ENOENT';
async function entry(path){try{return await lstat(path);}catch(error){if(missing(error))return null;throw error;}}
const markerName='.cota-managed-profile-v1';
export async function markManagedProfile(dataDir){
 const profile=join(resolve(dataDir),'whatsapp','session'),info=await entry(profile);if(!info)return;
 if(!info.isDirectory()||info.isSymbolicLink())throw failure('PATH','Perfil inválido.');
 const marker=join(profile,markerName),prior=await entry(marker);if(prior&&(!prior.isFile()||prior.isSymbolicLink()))throw failure('PATH','Marcador de perfil inválido.');
 await writeFile(marker,'cota-kernel-lease-v1\n',{mode:0o600});
}
// Linux kernel locks survive PID/hostname changes and are released on process
// exit. Never unlink this lock file: every cooperating container uses its inode.
export async function acquireProfileLease(dataDir){
 if(process.platform!=='linux')return null;
 const root=join(resolve(dataDir),'whatsapp');await mkdir(root,{recursive:true,mode:0o700});
 const directory=await lstat(root);if(!directory.isDirectory()||directory.isSymbolicLink())throw failure('PATH','Pasta de sessão inválida.');
 const lock=join(root,'.cota-profile.lock'),prior=await entry(lock);if(prior&&(!prior.isFile()||prior.isSymbolicLink()))throw failure('PATH','Bloqueio de instância inválido.');
 const child=spawn('flock',['--exclusive','--nonblock','--conflict-exit-code','73',lock,process.execPath,'-e',"process.stdout.write('owned\\n');process.stdin.resume();"],{stdio:['pipe','pipe','pipe']});
 child.stdin.on('error',()=>{});child.stderr.resume();
 await new Promise((resolve,reject)=>{let done=false,text='';const finish=error=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve();},timer=setTimeout(()=>{child.stdin.end();finish(failure('PROCESS_CHECK','A reserva do perfil não respondeu.'));},5000);child.once('error',()=>finish(failure('PROCESS_CHECK','Não foi possível iniciar flock.')));child.once('exit',code=>finish(failure(code===73?'ACTIVE':'PROCESS_CHECK','Outra instância usa esta sessão ou o bloqueio não pôde ser verificado.')));child.stdout.on('data',value=>{text+=value;if(text.includes('owned\n'))finish();});});
 let closed=false;return{async release(){if(closed)return;closed=true;await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>{child.kill('SIGTERM');resolve();},2000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.stdin.end();});}};
}
export async function prepareManagedProfile(dataDir,{lease,processCheck}={}){
 if(!lease)return;
 const marker=join(resolve(dataDir),'whatsapp','session',markerName),info=await entry(marker);
 const managed=info?.isFile()&&!info.isSymbolicLink()&&await readFile(marker,'utf8')==='cota-kernel-lease-v1\n';
 const state=await recoverProfile(dataDir);
 // Legacy/foreign locks require the existing explicit recovery action once.
 // Thereafter only our kernel-locked profile is cleaned automatically.
 if(state.state==='locked'&&!managed)return{legacy:true,removed:[]};
 const result=managed?await recoverProfile(dataDir,{clear:true,offlineConfirmed:true,...(processCheck?{processCheck}:{})}):state;
 if(state.state==='absent')await mkdir(join(resolve(dataDir),'whatsapp','session'),{mode:0o700});
 await markManagedProfile(dataDir);return result;
}
