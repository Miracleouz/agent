import wa from 'whatsapp-web.js';

// Runs in the linked browser. Read only: no metadata updates, chat creation or sends.
// getChats() in the SDK uses Promise.all(getChatModel); one broken group can reject it all.
export function cachedRoster(kind){
 let collections;try{collections=window.require('WAWebCollections');}catch{collections=window.Store;}
 const collection=collections?.[kind==='chats'?'Chat':'Contact'];
 const models=typeof collection?.getModelsArray==='function'?collection.getModelsArray():collection?.models;
 if(!Array.isArray(models))throw new Error('COTA_ROSTER_STORE_UNAVAILABLE');
 const items=[];let skipped=0;
 for(const model of models){try{
  const id=model.id?._serialized;if(typeof id!=='string')continue;
  if(kind==='chats'){
   if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(id)&&!/^\d+(?:-\d+)?@g\.us$/.test(id))continue;
   // Avoid serialize()/getChatModel(): both can touch incompatible getters or group metadata.
   const item={id:{_serialized:id},name:String(model.formattedTitle||model.name||id.split('@')[0]).slice(0,150),isGroup:id.endsWith('@g.us'),timestamp:Number(model.t)||0};
   if(Number.isInteger(model.unreadCount))item.unreadCount=model.unreadCount;
   items.push(item);
  }else{
   if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(id))continue;
   let getters={},frontend={};try{getters=window.require('WAWebContactGetters');}catch{}try{frontend=window.require('WAWebFrontendContactGetters');}catch{}
   const saved=typeof frontend.getIsMyContact==='function'?frontend.getIsMyContact(model):model.isMyContact;
   if(saved!==true)continue;
   const pn=model.phoneNumber?._serialized,contactId=/^\d+@(c\.us|s\.whatsapp\.net)$/.test(pn||'')?pn:id;
   const isMe=typeof getters.getIsMe==='function'?getters.getIsMe(model):model.isMe;
   const isWAContact=typeof getters.getIsWAContact==='function'?getters.getIsWAContact(model):model.isWAContact;
   const name=typeof getters.getName==='function'?getters.getName(model):model.name;
   items.push({id:{_serialized:contactId},name:String(name||model.pushname||contactId.split('@')[0]).slice(0,100),isMyContact:true,isMe:isMe===true,isWAContact:isWAContact!==false});
  }
 }catch{skipped++;}}
 return{items,skipped};
}

export async function readCachedRoster(client,kind){
 if(typeof client.pupPage?.evaluate!=='function')throw new Error('COTA_ROSTER_BROWSER_UNAVAILABLE');
 const result=await client.pupPage.evaluate(cachedRoster,kind);
 if(!Array.isArray(result?.items)||!Number.isInteger(result.skipped))throw new Error('COTA_ROSTER_INVALID_RESPONSE');
 if(kind==='chats')result.items=result.items.map(item=>new wa.Chat(client,{id:item.id,formattedTitle:item.name,t:item.timestamp,unreadCount:item.unreadCount,isGroup:item.isGroup}));
 return result;
}
