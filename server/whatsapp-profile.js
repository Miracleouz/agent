import {lstat,readdir,readFile,realpath,unlink,rename,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {basename,join,resolve} from 'node:path';

export const profileLocks=['SingletonLock','SingletonCookie','SingletonSocket'];
const absent=error=>error.code==='ENOENT';
const profileFailure=(code,message,stage,fsCode)=>Object.assign(new Error(`COTA_PROFILE_${code}: ${message}`),{code:`COTA_PROFILE_${code}`,stage,fsCode});
async function stat(path){try{return await lstat(path);}catch(error){if(absent(error))return null;throw error;}}
export function profileRecoveryError(error,stage='recovery'){
 if(/^COTA_PROFILE_/.test(error?.code||''))return error;
 const fsCode=['EACCES','EPERM','EROFS','ENOENT','ENOSPC','ESRCH'].includes(error?.code)?error.code:undefined;
 if(stage==='process_scan')return profileFailure('PROCESS_CHECK','Não foi possível verificar os processos. Nenhum bloqueio foi removido.',stage,fsCode);
 if(['EACCES','EPERM','EROFS'].includes(fsCode))return profileFailure('PERMISSIONS','Sem permissão para recuperar os links de bloqueio. Confira as permissões do volume; os dados da sessão foram preservados.',stage,fsCode);
 if(fsCode==='ENOENT')return profileFailure('PATH','Pasta de dados não encontrada. Confira DATA_DIR e o volume.',stage,fsCode);
 return profileFailure('RECOVERY_FAILED','Não foi possível concluir a recuperação. Consulte a etapa no log; a autenticação e o histórico foram preservados.',stage,fsCode);
}

// /proc covers only this PID namespace. Explicit confirmation also covers
// other containers using the volume, which cannot be inspected from here.
export async function visibleProfileUsers(profile,{procDir='/proc',self=process.pid}={}){
 try{
  const entries=await readdir(procDir);
  for(const pid of entries.filter(value=>/^\d+$/.test(value)&&Number(value)!==self)){
   let command;
   try{command=await readFile(join(procDir,pid,'cmdline'),'utf8');}
   catch(error){if(absent(error)||error.code==='ESRCH')continue;throw error;}
   const args=command.split('\0').filter(Boolean);
   // docker-init/tini contain their child's complete command line. They do not
   // run the Node application or own its profile. Only inspect actual Node argv.
   const node=/^(?:node|nodejs)$/.test(basename(args[0]||''));
   if(node&&args.some(arg=>arg==='server/index.js'||arg.endsWith('/server/index.js'))){
    try{
     // Inspect only DATA_DIR in memory; never log process environment.
     const environment=await readFile(join(procDir,pid,'environ'),'utf8');
     const dataDir=environment.split('\0').find(value=>value.startsWith('DATA_DIR='))?.slice(9);
     const cwd=await realpath(join(procDir,pid,'cwd'));
     const root=await realpath(resolve(cwd,dataDir||'./data'));
     if(join(root,'whatsapp','session')===profile)return true;
    }catch(error){if(absent(error)||error.code==='ESRCH'){
      // A live application whose data path is unavailable is still unsafe;
      // a process that has already exited cannot own the profile.
      if(!await stat(join(procDir,pid)))continue;
     }
     throw profileFailure('PROCESS_CHECK','Não foi possível verificar o diretório de outra instância do Cota. Nenhum bloqueio foi removido.','process_scan',error?.code==='EACCES'?'EACCES':undefined);
    }
   }
   if(args.some((arg,index)=>arg.startsWith('--user-data-dir=')?resolve(arg.slice('--user-data-dir='.length))===profile:arg==='--user-data-dir'&&args[index+1]&&resolve(args[index+1])===profile))return true;
  }
  return false;
 }catch(error){throw profileRecoveryError(error,'process_scan');}
}
export async function recoverProfile(dataDir,{clear=false,offlineConfirmed=false,processCheck=visibleProfileUsers}={}){
 let stage='profile_path';
 try{
  const root=await realpath(resolve(dataDir)),profile=join(root,'whatsapp','session');
  for(const directory of [join(root,'whatsapp'),profile]){
   const entry=await stat(directory);if(!entry)return{state:'absent',locks:[],removed:[]};
   if(!entry.isDirectory()||entry.isSymbolicLink())throw profileFailure('PATH','A pasta do perfil não é um diretório regular. Nenhum bloqueio foi removido.',stage);
  }
  stage='lock_scan';const found=[];
  for(const name of profileLocks){const entry=await stat(join(profile,name));if(entry)found.push({name,entry});}
  const locks=found.map(({name,entry})=>({name,kind:entry.isSymbolicLink()?'symlink':entry.isFile()?'file':'other'}));
  if(!clear)return{state:found.length?'locked':'clean',locks,removed:[]};
  if(!offlineConfirmed)throw profileFailure('CONFIRMATION','Pare todas as instâncias que usam este volume e confirme com --confirm-all-instances-stopped. Nenhum bloqueio foi removido.',stage);
  stage='process_scan';if(await processCheck(profile))throw profileFailure('ACTIVE','Existe um processo do Cota ou Chromium usando o perfil. Pare o serviço antes de recuperar. Nenhum bloqueio foi removido.',stage);
  stage='lock_validate';if(found.some(({entry})=>!entry.isSymbolicLink()))throw profileFailure('LOCK_FORMAT','Um bloqueio tem formato inesperado. Nenhum arquivo foi removido. Consulte os logs.',stage);
  // Validate every entry before mutating; never follow links or recursively
  // delete directories. Authentication and SQLite are untouched.
  for(const {name,entry} of found){const current=await stat(join(profile,name));if(!current||!current.isSymbolicLink()||current.dev!==entry.dev||current.ino!==entry.ino||current.ctimeMs!==entry.ctimeMs)throw profileFailure('CHANGED','O perfil mudou durante a verificação. Nenhum bloqueio foi removido.',stage);}
  stage='lock_remove';const removed=[];
  for(const {name} of found){await unlink(join(profile,name));removed.push(name);}
  return{state:'clean',locks,removed};
 }catch(error){throw profileRecoveryError(error,stage);}
}
// Explicit replacement only. Keep the old authentication in a private sibling
// directory; never delete it or open the application's database during repair.
export async function recreateProfile(dataDir,{offlineConfirmed=false,processCheck=visibleProfileUsers}={}){
 let stage='profile_path';
 try{
  const result=await recoverProfile(dataDir,{clear:true,offlineConfirmed,processCheck});
  if(result.state==='absent')return{backup:null};
  const root=await realpath(resolve(dataDir)),profile=join(root,'whatsapp','session');
  const before=await stat(profile);
  stage='process_scan';
  if(await processCheck(profile))throw profileFailure('ACTIVE','Existe um processo usando o perfil. A recriação foi interrompida.',stage);
  stage='profile_backup';
  const current=await stat(profile);
  if(!before||!current?.isDirectory()||current.isSymbolicLink()||before.dev!==current.dev||before.ino!==current.ino)throw profileFailure('CHANGED','O perfil mudou durante a verificação. A recriação foi interrompida.',stage);
  const backup='session-backup-'+randomUUID(),target=join(root,'whatsapp',backup);
  await rename(profile,target);
  try{await mkdir(profile,{mode:0o700});}
  catch(error){await rename(target,profile);throw error;}
  return{backup};
 }catch(error){throw profileRecoveryError(error,stage);}
}
