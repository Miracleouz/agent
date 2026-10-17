import {useEffect,useRef,useState} from 'react';
const storageKey=(userId,chatId)=>`cota:draft:${userId}:${chatId}`;
// Keep a separate emergency copy for each tab. Two panels of the same user
// share localStorage, but must not overwrite each other's unsaved characters.
const {writer,previousWriter}=(()=>{const writer=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;try{const previousWriter=sessionStorage.getItem('cota:draft-writer');sessionStorage.setItem('cota:draft-writer',writer);return{writer,previousWriter};}catch{return{writer,previousWriter:null};}})();
function entries(key){try{const values=JSON.parse(localStorage.getItem(key))?.entries;return values&&typeof values==='object'?values:{};}catch{return {};}}
function valid(value){return value&&typeof value.body==='string'&&value.body.length<=4000&&Number.isInteger(value.revision);}
function read(key){const values=entries(key);return valid(values[writer])?values[writer]:valid(values[previousWriter])?values[previousWriter]:Object.values(values).filter(valid).sort((a,b)=>(b.updated||0)-(a.updated||0))[0]||null;}
function write(key,value,expected=null){try{const values=entries(key);if(value!==null)values[writer]={...value,updated:Date.now()};else if(expected){for(const[id,item]of Object.entries(values))if(item.body===expected.body&&item.revision===expected.revision)delete values[id];}else delete values[writer];if(Object.keys(values).length)localStorage.setItem(key,JSON.stringify({entries:values}));else localStorage.removeItem(key);return true;}catch{return false;}}
export function localDraftBody(userId,chatId){return read(storageKey(userId,chatId))?.body??null;}
export function useChatDraft({api,userId,chat,enabled}){
 const[state,setState]=useState({key:null,body:'',loading:false,status:'',conflict:false}),controller=useRef(null);
 const key=enabled&&chat?storageKey(userId,chat.id):null,routeVersion=useRef(chat?.routing_version);routeVersion.current=chat?.routing_version;
 useEffect(()=>{
  if(!key){controller.current=null;setState({key:null,body:'',loading:false,status:'',conflict:false});return;}
  let active=true,timer=null,running=null,conflict=false,loaded=false,body='',revision=0,savedBody='',edit=0;
  const backup=read(key);body=backup?.body||'';
  const path=`/chats/${encodeURIComponent(chat.id)}/draft`,version=routeVersion.current;
  const publish=(status,loading=false)=>{if(active)setState({key,body,loading,status,conflict});};
  function backupNow(){return write(key,{body,revision});}
  async function flush(){
   clearTimeout(timer);if(running){await running;if(body===savedBody)return revision;return flush();}
   if(!loaded)throw new Error('Aguarde o carregamento do rascunho.');
   if(conflict)throw new Error('Escolha qual rascunho manter antes de enviar.');
   if(body===savedBody){write(key,null,{body,revision});publish(body?'Rascunho salvo':'');return revision;}
   const text=body,change=edit,baseRevision=revision;publish('Salvando rascunho…');
   running=api(path,{method:'PUT',body:{body:text,revision,version},keepalive:true}).then(result=>{revision=result.revision;savedBody=text;if(active){if(change===edit){write(key,null,{body:text,revision:baseRevision});publish(text?'Rascunho salvo':'');}else{backupNow();publish('Salvando rascunho…');}}return revision;}).catch(error=>{if(error.status===409)conflict=true;publish('Texto preservado neste navegador. '+error.message);throw error;}).finally(()=>{running=null;});
   await running;if(body!==savedBody)return flush();return revision;
  }
  const control={setBody(text){body=text;edit++;const cached=backupNow();publish(cached?'Rascunho neste navegador · salvando…':'Não foi possível salvar neste navegador. Aguarde o salvamento no servidor.');clearTimeout(timer);if(loaded&&!conflict)timer=setTimeout(()=>flush().catch(()=>{}),400);},flush,
   sent(serverDraft){write(key,null);body=serverDraft?.body??'';savedBody=body;revision=serverDraft?.revision??revision+1;edit++;clearTimeout(timer);publish(body?'Rascunho salvo':'');},
   async resolve(keepLocal){try{const result=await api(path);revision=result.revision;savedBody=result.body;loaded=true;conflict=false;if(!keepLocal){body=result.body;edit++;write(key,null);publish(body?'Rascunho salvo':'');}else{backupNow();await flush();}}catch(error){publish(error.message);}}
  };
  controller.current=control;publish('Carregando rascunho…',true);
  api(path).then(result=>{if(!active)return;revision=result.revision;savedBody=result.body;loaded=true;
   if(backup&&backup.body!==result.body){body=backup.body;conflict=backup.revision!==result.revision;backupNow();publish(conflict?'Há outro rascunho salvo. Escolha qual texto manter.':'Recuperado deste navegador · salvando…');if(!conflict)timer=setTimeout(()=>flush().catch(()=>{}),0);}
   else{body=result.body;write(key,null,backup);publish(body?'Rascunho salvo':'');}
  }).catch(error=>{publish('Não foi possível carregar o rascunho. '+error.message);});
  return()=>{active=false;clearTimeout(timer);if(controller.current===control)controller.current=null;};
 },[key,api,chat?.routing_version]);
 // Ownership changes hide the composer immediately. Local backup survives a
 // fast reload or transfer before the debounced server save completes.
 const current=state.key===key&&key?state:{body:'',loading:!!key,status:'',conflict:false};
 const control=state.key===key?controller.current:null;
 return{...current,setBody:text=>control?.setBody(text),prepare:()=>control?.flush(),sent:serverDraft=>control?.sent(serverDraft),resolve:keep=>control?.resolve(keep)};
}
