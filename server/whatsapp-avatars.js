import {createHash} from 'node:crypto';
import {photoInfo} from './images.js';
export const avatarMaxBytes=1024*1024;
export async function cachedProfilePicture(id){
 try{const chat=await window.WWebJS.getChat(id,{getAsModel:false});if(!chat)return;const photo=await window.require('WAWebContactProfilePicThumbBridge').requestProfilePicFromServer(chat);return photo?.eurl;}
 catch(error){if(error?.name==='ServerStatusCodeError')return;throw error;}
}
export async function profilePicture(client,id){
 try{return await client.getProfilePicUrl(id);}catch(error){if(typeof client.pupPage?.evaluate!=='function')throw error;return client.pupPage.evaluate(cachedProfilePicture,id);}
}
export function avatarUrl(value){
 const url=new URL(value);const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!['whatsapp.net','fbcdn.net'].some(domain=>host===domain||host.endsWith('.'+domain)))throw new Error('Invalid WhatsApp photo host');return url.href;
}
export async function downloadAvatar(url,{signal,fetcher=fetch}={}){
 const response=await fetcher(avatarUrl(url),{signal,redirect:'error'});if(!response.ok)throw new Error('Profile photo unavailable');
 if(Number(response.headers.get('content-length'))>avatarMaxBytes)throw new Error('Profile photo too large');
 const reader=response.body?.getReader();if(!reader)throw new Error('Profile photo empty');const parts=[];let size=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>avatarMaxBytes)throw new Error('Profile photo too large');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 const data=Buffer.concat(parts),{type}=photoInfo(data);return{data,type};
}
export class WhatsAppAvatars{
 constructor(wa,{download=downloadAvatar,ttl=1800000,negativeTtl=300000,timeout=10000}={}){this.wa=wa;this.store=wa.store;this.download=download;this.ttl=ttl;this.negativeTtl=negativeTtl;this.timeout=timeout;this.reset();}
 reset(){for(const job of this.jobs||[])job.finish();this.controller?.abort();this.controller=new AbortController();this.jobs=[];this.pending=new Map();this.running=0;}
 refresh(ids){if(this.wa.status!=='ready'||typeof this.wa.client?.getProfilePicUrl!=='function')return Promise.resolve();return Promise.all([...new Set(ids)].filter(id=>/^\d+@(c\.us|lid|s\.whatsapp\.net)$|^\d+(?:-\d+)?@g\.us$/.test(id||'')).map(id=>this.ensure(id)));}
 ensure(id){if(this.pending.has(id))return this.pending.get(id);const cached=this.store.get('SELECT status,checked FROM whatsapp_avatars WHERE remote_id=?',id);if(cached&&Date.now()-cached.checked<(cached.status==='ready'?this.ttl:this.negativeTtl))return Promise.resolve();const signal=this.controller.signal,client=this.wa.client,generation=this.wa.generation;let finish;const task=new Promise(resolve=>{finish=resolve;});this.pending.set(id,task);this.jobs.push({id,signal,client,generation,finish,task});this.pump();return task;}
 pump(){while(this.running<3&&this.jobs.length){const job=this.jobs.shift();if(job.signal.aborted){job.finish();continue;}this.running++;this.load(job).catch(()=>{}).finally(()=>{if(!job.signal.aborted)this.running--;if(this.pending.get(job.id)===job.task)this.pending.delete(job.id);job.finish();this.pump();});}}
 async load({id,signal,client,generation}){
  const active=()=>!signal.aborted&&!request.signal.aborted&&client===this.wa.client&&generation===this.wa.generation&&this.wa.status==='ready';
  const request=new AbortController(),cancel=()=>request.abort();signal.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,this.timeout);
  try{
   const url=await Promise.race([profilePicture(client,id),new Promise((_,reject)=>request.signal.addEventListener('abort',()=>reject(new Error('Photo timeout')),{once:true}))]);if(!active())return;
   if(!url){this.save(id,'unavailable');return;}
   const{data,type}=await this.download(avatarUrl(url),{signal:request.signal});if(!active())return;
   this.store.run("INSERT INTO whatsapp_avatars VALUES(?,'ready',?,?,?,?) ON CONFLICT(remote_id) DO UPDATE SET status='ready',data=excluded.data,media_type=excluded.media_type,version=excluded.version,checked=excluded.checked",id,data,type,createHash('sha256').update(data).digest('hex').slice(0,20),Date.now());this.store.changed();
  }catch{if(active())this.store.run("INSERT INTO whatsapp_avatars VALUES(?,'failed',NULL,NULL,NULL,?) ON CONFLICT(remote_id) DO UPDATE SET checked=excluded.checked",id,Date.now());}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
 }
 save(id,status){this.store.run('INSERT INTO whatsapp_avatars VALUES(?,?,NULL,NULL,NULL,?) ON CONFLICT(remote_id) DO UPDATE SET status=excluded.status,data=NULL,media_type=NULL,version=NULL,checked=excluded.checked',id,status,Date.now());this.store.changed();}
}
