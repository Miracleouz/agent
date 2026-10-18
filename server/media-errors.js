// Diagnostics contain categories only, never file paths, keys, message text or IDs.
export function mediaFailureCode(error){
 for(let depth=0;error&&depth<4;depth++,error=error.cause){
  const text=String(error.message||error);
  const known=text.match(/\bCOTA_(?:MEDIA|SEND)_[A-Z_]+\b/);
  if(known&&known[0]!=='COTA_MEDIA_DOWNLOAD_TIMEOUT')return known[0];
  if(/getValidatedSender/.test(text))return 'sender_key_collision';
  if(/downloadAndMaybeDecrypt/.test(text))return 'legacy_decrypt_unavailable';
  const module=text.match(/\bWAWeb[A-Za-z0-9]{1,70}\b/);if(module)return module[0];
 }
 return 'provider_media_unavailable';
}
