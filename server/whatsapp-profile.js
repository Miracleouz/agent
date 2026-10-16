import {lstat,readdir,readFile,realpath,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';

export const profileLocks=['SingletonLock','SingletonCookie','SingletonSocket'];
const absent=error=>error.code==='ENOENT';
async function stat(path){try{return await lstat(path);}catch(error){if(absent(error))return null;throw error;}}

// The maintenance command runs with the service stopped, in a one-off container.
// /proc only covers this PID namespace; the explicit offline confirmation also
// covers other containers using the volume, which cannot be checked from here.
export async function visibleProfileUsers(profile,{procDir='/proc',self=process.pid}={}){
 const entries=await readdir(procDir);
 for(const pid of entries.filter(value=>/^\d+$/.test(value)&&Number(value)!==self)){
  let command;
  try{command=await readFile(join(procDir,pid,'cmdline'),'utf8');}
  catch(error){if(absent(error)||error.code==='ESRCH')continue;throw new Error('Não foi possível verificar os processos. Nenhum bloqueio foi removido.');}
  const args=command.split('\0').filter(Boolean);
  if(args.some(arg=>arg==='server/index.js'||arg.endsWith('/server/index.js')))return true;
  if(args.some((arg,index)=>arg.startsWith('--user-data-dir=')?resolve(arg.slice('--user-data-dir='.length))===profile:arg==='--user-data-dir'&&args[index+1]&&resolve(args[index+1])===profile))return true;
 }
 return false;
}
export async function recoverProfile(dataDir,{clear=false,offlineConfirmed=false,processCheck=visibleProfileUsers}={}){
 const root=await realpath(resolve(dataDir)),profile=join(root,'whatsapp','session');
 for(const directory of [join(root,'whatsapp'),profile]){
  const entry=await stat(directory);if(!entry)return{state:'absent',locks:[],removed:[]};
  if(!entry.isDirectory()||entry.isSymbolicLink())throw new Error('A pasta do perfil não é um diretório regular. Nenhum bloqueio foi removido.');
 }
 const found=[];
 for(const name of profileLocks){const entry=await stat(join(profile,name));if(entry)found.push({name,entry});}
 const locks=found.map(({name,entry})=>({name,kind:entry.isSymbolicLink()?'symlink':entry.isFile()?'file':'other'}));
 if(!clear)return{state:found.length?'locked':'clean',locks,removed:[]};
 if(!offlineConfirmed)throw new Error('Pare todas as instâncias que usam este volume e confirme com --confirm-all-instances-stopped. Nenhum bloqueio foi removido.');
 if(await processCheck(profile))throw new Error('Existe um processo do Cota ou Chromium usando o perfil. Pare o serviço antes de recuperar. Nenhum bloqueio foi removido.');
 if(found.some(({entry})=>!entry.isSymbolicLink()))throw new Error('Um bloqueio tem formato inesperado. Nenhum arquivo foi removido. Consulte os logs.');
 // Validate every entry before the first mutation; never follow a link or
 // recursively delete a directory. Authentication and SQLite are untouched.
 for(const {name,entry} of found){const current=await stat(join(profile,name));if(!current||!current.isSymbolicLink()||current.dev!==entry.dev||current.ino!==entry.ino||current.ctimeMs!==entry.ctimeMs)throw new Error('O perfil mudou durante a verificação. Nenhum bloqueio foi removido.');}
 const removed=[];
 for(const {name} of found){await unlink(join(profile,name));removed.push(name);}
 return{state:'clean',locks,removed};
}
