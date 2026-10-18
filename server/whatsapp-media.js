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
 if(Number(row.size)>maxBytes)throw new Error('COTA_MEDIA_TOO_LARGE');
 if(row.mediaData?.mediaStage==='REUPLOADING')throw new Error('COTA_MEDIA_REUPLOADING');
 // RESOLVED does not prove the blob is still cached. Ask WA to populate its
 // cache even after eviction, as upstream resolveMediaBlob now does.
 if(typeof row.downloadMedia==='function')await row.downloadMedia({downloadEvenIfExpensive:true,rmrReason:1,isUserInitiated:true});
 const stage=row.mediaData?.mediaStage;
 if(typeof stage==='string'&&(stage.includes('ERROR')||stage==='FETCHING'))throw new Error('COTA_MEDIA_DOWNLOAD_PENDING');
 let blob,source;
 const hash=row.mediaObject?.filehash||row.filehash;
 if(hash)try{blob=await window.require('WAWebMediaInMemoryBlobCache').InMemoryMediaBlobCache.get(hash);if(blob)source='cache';}catch{}
 if(!blob&&typeof row.mediaObject?.mediaBlob?.forceToBlob==='function'){blob=await row.mediaObject.mediaBlob.forceToBlob();source='media_object';}
 if(blob&&typeof blob.arrayBuffer==='function'){
  if(blob.size>maxBytes)throw new Error('COTA_MEDIA_TOO_LARGE');
  const bytes=await blob.arrayBuffer();if(bytes.byteLength>maxBytes)throw new Error('COTA_MEDIA_TOO_LARGE');
  return{data:await window.WWebJS.arrayBufferToBase64Async(bytes),mimetype:row.mimetype||blob.type,source};
 }
 // Older linked Web versions can still provide the decrypt API. The current
 // cache path above does not require it or expose media keys to Node.
 let manager;try{manager=window.require('WAWebDownloadManager')?.downloadManager;}catch{}
 if(typeof manager?.downloadAndMaybeDecrypt!=='function')throw new Error('COTA_MEDIA_CACHE_EMPTY');
 if(!row.directPath||!row.mediaKey||!row.filehash||!row.encFilehash)throw new Error('COTA_MEDIA_NOT_AVAILABLE');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const bytes=await manager.downloadAndMaybeDecrypt({directPath:row.directPath,encFilehash:row.encFilehash,filehash:row.filehash,mediaKey:row.mediaKey,mediaKeyTimestamp:row.mediaKeyTimestamp,type:row.type,signal:controller.signal,downloadQpl:{addAnnotations(){return this;},addPoint(){return this;}}});
  if(bytes.byteLength>maxBytes)throw new Error('COTA_MEDIA_TOO_LARGE');
  return{data:await window.WWebJS.arrayBufferToBase64Async(bytes),mimetype:row.mimetype,source:'legacy_decrypt'};
 }finally{clearTimeout(timer);}
}
