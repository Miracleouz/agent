// Keep the SDK for chats that truly need creating. Existing conversations must
// not go through Chat.find()/findImpl when their model is already in memory.
export function installExistingChatLookup(){
 const api=window.WWebJS;if(typeof api?.getChat!=='function')throw new Error('COTA_CHAT_LOOKUP_UNAVAILABLE');
 if(api.getChat.__cotaLookupV1)return true;
 const original=api.getChat;
 const find=value=>{
  const chatId=typeof value==='string'?value:(value?._serialized||value?.$1);
  const id=value=>typeof value==='string'?value:(value?._serialized||value?.$1);
  const collections=window.require('WAWebCollections')||window.Store,Chat=collections?.Chat,aliases=new Set([chatId]);
  const people=collections?.Contact?.getModelsArray?.()||collections?.Contact?.models||[];
  for(const person of people){try{const lid=id(person.id),pn=id(person.phoneNumber);if((lid===chatId||pn===chatId)&&/^\d+@lid$/.test(lid||'')&&/^\d+@(c\.us|s\.whatsapp\.net)$/.test(pn||'')){aliases.add(lid);aliases.add(pn);}}catch{}}
  for(const alias of aliases){try{const model=Chat?.get?.(alias);if(model&&aliases.has(id(model.id)))return model;}catch{}}
  return(Chat?.getModelsArray?.()||Chat?.models||[]).find(model=>{try{return aliases.has(id(model.id));}catch{return false;}});
 };
 const lookup=async(chatId,{getAsModel=true}={})=>{const model=find(chatId);return model?(getAsModel?api.getChatModel(model):model):original.call(api,typeof chatId==='string'?chatId:(chatId?._serialized||chatId?.$1),{getAsModel});};
 lookup.__cotaLookupV1=true;api.getChat=lookup;window.__cotaFindChatV1=find;return true;
}

// A failing optional serializer must not throw through WhatsApp's own Msg.add
// dispatch or send queue. Preserve the full SDK result whenever it works.
export function installMessageSerializerGuard(){
 const api=window.WWebJS,original=api?.getMessageModel;
 if(typeof original!=='function')throw new Error('COTA_LIVE_BRIDGE_UNAVAILABLE');
 if(original.__cotaSerializerV1)return true;
 const serialize=row=>{try{const result=original.call(api,row);const id=value=>typeof value==='string'?value:(value?._serialized||value?.$1);if(result?.id){result.id={...result.id,_serialized:id(result.id)||id(row.id),remote:id(result.id.remote)||id(row.id?.remote)};}for(const field of ['from','to','author'])if(result?.[field]&&typeof result[field]==='object')result[field]=id(result[field]);return result;}catch(error){
  const id=value=>typeof value==='string'?value:(value?._serialized||value?.$1),remote=id(row.id?.remote),own=row.id?.fromMe;
  if(!id(row.id)||typeof own!=='boolean'||row.isNotification||!['chat','image','audio','ptt','video','document','sticker','location','vcard','multi_vcard','buttons_response','list_response','template_button_reply','ciphertext'].includes(row.type))throw error;
  return{id:{_serialized:id(row.id),id:row.id.id,remote,fromMe:own},from:id(row.from)||(!own?remote:undefined),to:id(row.to)||(own?remote:undefined),author:id(row.author),body:String(row.body||row.caption||''),type:row.type,t:Number(row.t),ack:row.ack,isNewMsg:row.isNewMsg,isUnread:row.isUnread,isStatusV3:row.isStatusV3===true,notifyName:row.notifyName,selectedButtonId:row.selectedButtonId,selectedRowId:row.selectedRowId,directPath:typeof row.directPath==='string'?row.directPath:undefined,mediaKey:typeof row.mediaKey==='string'?row.mediaKey:undefined};
 }};
 serialize.__cotaSerializerV1=true;api.getMessageModel=serialize;return true;
}
