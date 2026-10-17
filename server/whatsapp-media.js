// Runs in the linked browser. Use the exact provider ID and a verified chat
// alias, without depending on the SDK's optional full message serializer.
export async function downloadCachedMedia({providerId,aliases,fromMe,maxBytes}){
 const id=value=>typeof value==='string'?value:(value?._serialized||value?.$1);
 const Msg=(window.require('WAWebCollections')||window.Store)?.Msg;
 let row;try{row=Msg?.get?.(providerId);}catch{}
 if(!row)row=(Msg?.getModelsArray?.()||Msg?.models||[]).find(row=>id(row.id)===providerId);
 if(!row&&typeof Msg?.getMessagesById==='function'){const found=await Msg.getMessagesById([providerId]);row=found?.messages?.find(row=>id(row.id)===providerId);}
 if(!row||id(row.id)!==providerId)throw new Error('COTA_MEDIA_NOT_AVAILABLE');
 const own=row.id?.fromMe===true,target=id(own?row.to:row.from)||id(row.id?.remote);
 if(own!==fromMe||!aliases.includes(target))throw new Error('COTA_MEDIA_TARGET_MISMATCH');
 if(row.mediaData?.mediaStage!=='RESOLVED'&&typeof row.downloadMedia==='function')await row.downloadMedia({downloadEvenIfExpensive:true,rmrReason:1});
 if(!row.directPath||!row.mediaKey||!row.filehash||!row.encFilehash)throw new Error('COTA_MEDIA_NOT_AVAILABLE');
 if(Number(row.size)>maxBytes)throw new Error('COTA_MEDIA_TOO_LARGE');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const bytes=await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({directPath:row.directPath,encFilehash:row.encFilehash,filehash:row.filehash,mediaKey:row.mediaKey,mediaKeyTimestamp:row.mediaKeyTimestamp,type:row.type,signal:controller.signal,downloadQpl:{addAnnotations(){return this;},addPoint(){return this;}}});
  if(bytes.byteLength>maxBytes)throw new Error('COTA_MEDIA_TOO_LARGE');
  return{data:await window.WWebJS.arrayBufferToBase64Async(bytes),mimetype:row.mimetype};
 }finally{clearTimeout(timer);}
}
