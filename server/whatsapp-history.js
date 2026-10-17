import wa from 'whatsapp-web.js';

// Read the linked browser's message collection without the SDK's full serializer.
export async function cachedHistory({chatId,limit,cutoff,loadEarlier=true,pageTimeout=5000}){
 const collections=window.require('WAWebCollections')||window.Store,Chat=collections?.Chat;
 const valueId=value=>typeof value==='string'?value:(value?._serialized||value?.$1);
 const aliases=new Set([chatId]);
 const phones=()=>{for(const alias of [...aliases])if(/^\d+@(c\.us|s\.whatsapp\.net)$/.test(alias)){aliases.add(alias.split('@')[0]+'@c.us');aliases.add(alias.split('@')[0]+'@s.whatsapp.net');}};
 phones();
 for(const person of collections?.Contact?.getModelsArray?.()||collections?.Contact?.models||[]){const lid=valueId(person.id),pn=valueId(person.phoneNumber);if(/^\d+@lid$/.test(lid||'')&&/^\d+@(c\.us|s\.whatsapp\.net)$/.test(pn||'')&&(aliases.has(lid)||aliases.has(pn))){aliases.add(lid);aliases.add(pn);phones();}}
 let chat;try{chat=window.__cotaFindChatV1?.(chatId)||Chat?.get?.(chatId);}catch{}
 if(!chat){const rows=Chat?.getModelsArray?.()||Chat?.models||[];chat=rows.find(row=>aliases.has(valueId(row.id)));}
 if(!chat)throw new Error('COTA_HISTORY_CHAT_UNAVAILABLE');
 const same=row=>aliases.has(valueId(row.id?.remote))||aliases.has(valueId(row.id?.fromMe?row.to:row.from));
 const read=()=>{const local=chat.msgs?.getModelsArray?.()||chat.msgs?.models||[],global=collections?.Msg?.getModelsArray?.()||collections?.Msg?.models||[];return[...new Map([...global.filter(same),...local].map(row=>[(row.id?._serialized||row.id?.$1),row])).values()];};
 let rows=read(),previous=new Set(rows.map(m=>(m.id?._serialized||m.id?.$1)));
 let incomplete=false,pages=0;const deadline=Date.now()+8000;
 window.__cotaHistoryLoadsV1??=new WeakMap();
 while(loadEarlier&&rows.length<limit&&!(Number.isFinite(cutoff)&&rows.some(row=>Number(row.t)*1000<=cutoff))){
  if(pages++>=8||Date.now()>=deadline){incomplete=true;break;}
  let request=window.__cotaHistoryLoadsV1.get(chat);if(!request){request=Promise.resolve().then(()=>window.require('WAWebChatLoadMessages').loadEarlierMsgs({chat}));window.__cotaHistoryLoadsV1.set(chat,request);const clear=()=>{if(window.__cotaHistoryLoadsV1.get(chat)===request)window.__cotaHistoryLoadsV1.delete(chat);};request.then(clear,clear);}
  let loaded,timer;try{loaded=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('COTA_HISTORY_PAGE_TIMEOUT')),pageTimeout);})]);}catch{incomplete=true;break;}finally{clearTimeout(timer);}
  const all=new Map([...rows,...(Array.isArray(loaded)?loaded:[]),...read()].map(m=>[(m.id?._serialized||m.id?.$1),m]));
  rows=[...all.values()];const next=new Set(rows.map(m=>(m.id?._serialized||m.id?.$1)));
  if(next.size===previous.size&&[...next].every(id=>previous.has(id)))break;previous=next;
 }
 rows.sort((a,b)=>(a.t||0)-(b.t||0));const messages=[];let skipped=0;
 const id=value=>typeof value==='string'?value:(value?._serialized||value?.$1);
 for(const row of rows.slice(-limit)){try{
  const providerId=id(row.id);if(!providerId||row.isNotification)continue;
  const own=row.id?.fromMe===true,remote=id(row.id?.remote);
  messages.push({id:{_serialized:providerId,fromMe:own},fromMe:own,type:row.type,body:String(row.body||row.caption||''),timestamp:Number(row.t),from:own?id(row.from):chatId,to:own?chatId:id(row.to),author:id(row.author),isStatus:row.isStatusV3===true});
 }catch{skipped++;}}
 const count=Number.isSafeInteger(chat.unreadCount)&&chat.unreadCount>0?chat.unreadCount:0;
 const unreadIds=count?rows.filter(row=>row.id?.fromMe===false&&!row.isNotification&&!row.isStatusV3).slice(-count).filter(row=>row.isUnread!==false&&['chat','buttons_response','list_response','template_button_reply','audio','ptt'].includes(row.type)).map(row=>id(row.id)):[];
 return{messages,skipped,incomplete,unreadIds};
}
export const basicChat=(client,id)=>new wa.Chat(client,{id:{_serialized:id},formattedTitle:id,t:0,isGroup:false});
export async function readCachedHistory(client,id,limit,cutoff,options={}){
 if(typeof client.pupPage?.evaluate!=='function')throw new Error('COTA_HISTORY_BROWSER_UNAVAILABLE');
 const result=await client.pupPage.evaluate(cachedHistory,{chatId:id,limit,cutoff,...options});
 if(!Array.isArray(result?.messages))throw new Error('COTA_HISTORY_INVALID_RESPONSE');return result;
}
export async function requestCachedHistory(chatId){
 const Chat=(window.require('WAWebCollections')||window.Store)?.Chat;
 let chat;try{chat=window.__cotaFindChatV1?.(chatId)||Chat?.get?.(chatId);}catch{}
 if(!chat)chat=(Chat?.getModelsArray?.()||Chat?.models||[]).find(row=>(typeof row.id==='string'?row.id:(row.id?._serialized||row.id?.$1))===chatId);
 if(!chat)throw new Error('COTA_HISTORY_CHAT_UNAVAILABLE');
 if(chat.endOfHistoryTransferType!==0)return false;
 await window.require('WAWebSendNonMessageDataRequest').sendPeerDataOperationRequest(3,{chatId:chat.id});return true;
}
