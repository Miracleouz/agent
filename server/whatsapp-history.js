import wa from 'whatsapp-web.js';

// Read the linked browser's message collection without the SDK's full serializer.
export async function cachedHistory({chatId,limit}){
 const chat=await window.WWebJS.getChat(chatId,{getAsModel:false});
 if(!chat)throw new Error('COTA_HISTORY_CHAT_UNAVAILABLE');
 const read=()=>typeof chat.msgs?.getModelsArray==='function'?chat.msgs.getModelsArray():chat.msgs?.models||[];
 let rows=read(),previous=new Set(rows.map(m=>m.id?._serialized));
 while(rows.length<limit){
  const loaded=await window.require('WAWebChatLoadMessages').loadEarlierMsgs({chat});
  const all=new Map([...rows,...(Array.isArray(loaded)?loaded:[]),...read()].map(m=>[m.id?._serialized,m]));
  rows=[...all.values()];const next=new Set(rows.map(m=>m.id?._serialized));
  if(next.size===previous.size&&[...next].every(id=>previous.has(id)))break;previous=next;
 }
 rows.sort((a,b)=>(a.t||0)-(b.t||0));const messages=[];let skipped=0;
 const id=value=>typeof value==='string'?value:value?._serialized;
 for(const row of rows.slice(-limit)){try{
  const providerId=id(row.id);if(!providerId||row.isNotification)continue;
  const own=row.id?.fromMe===true,remote=id(row.id?.remote);
  messages.push({id:{_serialized:providerId,fromMe:own},fromMe:own,type:row.type,body:String(row.body||row.caption||''),timestamp:row.t,from:id(row.from)||(!own?remote:undefined),to:id(row.to)||(own?remote:undefined),isStatus:row.isStatusV3===true});
 }catch{skipped++;}}
 return{messages,skipped};
}
export const basicChat=(client,id)=>new wa.Chat(client,{id:{_serialized:id},formattedTitle:id,t:0,isGroup:false});
export async function readCachedHistory(client,id,limit){
 if(typeof client.pupPage?.evaluate!=='function')throw new Error('COTA_HISTORY_BROWSER_UNAVAILABLE');
 const result=await client.pupPage.evaluate(cachedHistory,{chatId:id,limit});
 if(!Array.isArray(result?.messages))throw new Error('COTA_HISTORY_INVALID_RESPONSE');return result;
}
