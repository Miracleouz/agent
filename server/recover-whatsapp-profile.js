import {acquireProfileLease,markManagedProfile} from './whatsapp-profile-lease.js';
import {recoverProfile} from './whatsapp-profile.js';
const options=new Set(process.argv.slice(2));
let lease;
try{
 if([...options].some(option=>!['--clear-stale-locks','--confirm-all-instances-stopped'].includes(option)))throw new Error('Opção inválida. Use sem opções para consultar ou --clear-stale-locks --confirm-all-instances-stopped para recuperar com o serviço parado.');
 if(options.has('--clear-stale-locks')&&options.has('--confirm-all-instances-stopped'))lease=await acquireProfileLease(process.env.DATA_DIR||'./data');
 const result=await recoverProfile(process.env.DATA_DIR||'./data',{clear:options.has('--clear-stale-locks'),offlineConfirmed:options.has('--confirm-all-instances-stopped')});
 if(options.has('--clear-stale-locks')&&lease)await markManagedProfile(process.env.DATA_DIR||'./data');
 console.log('Perfil do WhatsApp: '+({absent:'não encontrado',locked:'arquivos de bloqueio presentes',clean:'sem bloqueios'}[result.state]));
 for(const lock of result.locks)console.log(`${lock.name}: ${lock.kind}`);
 if(result.removed.length)console.log(`Recuperação concluída: ${result.removed.length} links de bloqueio removidos. Autenticação, estoque e histórico preservados. Inicie apenas uma instância do Cota.`);
 else console.log('Nenhum arquivo foi alterado.');
}catch(error){console.error(/^COTA_PROFILE_/.test(error.code||'')?error.message:error.message?.startsWith('ENOENT')?'Pasta de dados não encontrada. Confira o volume e DATA_DIR.':error.code?'Não foi possível acessar o perfil. Confira as permissões e os logs do serviço.':error.message);process.exitCode=1;}

finally{await lease?.release();}
