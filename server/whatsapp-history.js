import wa from 'whatsapp-web.js';

// Read the linked browser's message collection without the SDK's full serializer.
export async function cachedHistory({chatId,limit,cutoff}){
 const collections=window.require('WAWebCollections')||window.Store,Chat=collections?.Chat;
 let chat;try{chat=window.__cotaFindChatV1?.(chatId)||Chat?.get?.(chatId);}catch{}
 if(!chat){const rows=Chat?.getModelsArray?.()||Chat?.models||[];chat=rows.find(row=>(typeof row.id==='string'?row.id:row.id?._serialized)===chatId);}
 if(!chat)throw new Error('COTA_HISTORY_CHAT_UNAVAILABLE');
 const same=row=>{const value=row.id?.remote;return(typeof value==='string'?value:value?._serialized)===chatId||[row.from,row.to].some(value=>(typeof value==='string'?value:value?._serialized)===chatId);};
 const read=()=>{const local=chat.msgs?.getModelsArray?.()||chat.msgs?.models||[],global=collections?.Msg?.getModelsArray?.()||collections?.Msg?.models||[];return[...new Map([...global.filter(same),...local].map(row=>[row.id?._serialized,row])).values()];};
 let rows=read(),previous=new Set(rows.map(m=>m.id?._serialized));
 let incomplete=false;
 while(rows.length<limit&&!(Number.isFinite(cutoff)&&rows.some(row=>Number(row.t)*1000<=cutoff))){
  let loaded;try{loaded=await window.require('WAWebChatLoadMessages').loadEarlierMsgs({chat});}catch{incomplete=true;break;}
  const all=new Map([...rows,...(Array.isArray(loaded)?loaded:[]),...read()].map(m=>[m.id?._serialized,m]));
  rows=[...all.values()];const next=new Set(rows.map(m=>m.id?._serialized));
  if(next.size===previous.size&&[...next].every(id=>previous.has(id)))break;previous=next;
 }
 rows.sort((a,b)=>(a.t||0)-(b.t||0));const messages=[];let skipped=0;
 const id=value=>typeof value==='string'?value:value?._serialized;
 for(const row of rows.slice(-limit)){try{
  const providerId=id(row.id);if(!providerId||row.isNotification)continue;
  const own=row.id?.fromMe===true,remote=id(row.id?.remote);
  messages.push({id:{_serialized:providerId,fromMe:own},fromMe:own,type:row.type,body:String(row.body||row.caption||''),timestamp:row.t,from:id(row.from)||(!own?remote:undefined),to:id(row.to)||(own?remote:undefined),author:id(row.author),isStatus:row.isStatusV3===true});
 }catch{skipped++;}}
 return{messages,skipped,incomplete};
}
export const basicChat=(client,id)=>new wa.Chat(client,{id:{_serialized:id},formattedTitle:id,t:0,isGroup:false});
export async function readCachedHistory(client,id,limit,cutoff){
 if(typeof client.pupPage?.evaluate!=='function')throw new Error('COTA_HISTORY_BROWSER_UNAVAILABLE');
 const result=await client.pupPage.evaluate(cachedHistory,{chatId:id,limit,cutoff});
 if(!Array.isArray(result?.messages))throw new Error('COTA_HISTORY_INVALID_RESPONSE');return result;
}
export async function requestCachedHistory(chatId){
 const Chat=(window.require('WAWebCollections')||window.Store)?.Chat;
 let chat;try{chat=window.__cotaFindChatV1?.(chatId)||Chat?.get?.(chatId);}catch{}
 if(!chat)chat=(Chat?.getModelsArray?.()||Chat?.models||[]).find(row=>(typeof row.id==='string'?row.id:row.id?._serialized)===chatId);
 if(!chat)throw new Error('COTA_HISTORY_CHAT_UNAVAILABLE');
 if(chat.endOfHistoryTransferType!==0)return false;
 await window.require('WAWebSendNonMessageDataRequest').sendPeerDataOperationRequest(3,{chatId:chat.id});return true;
}
