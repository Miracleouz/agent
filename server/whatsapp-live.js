import {randomUUID} from 'node:crypto';

// Runs in Chromium. Capture only actual new model events, never enumerate old
// messages and never infer a customer request from an unread count or a clock.
export function installLiveBridge({binding,token}){
 const collections=window.require('WAWebCollections')||window.Store,Msg=collections?.Msg,Chat=collections?.Chat;
 if(typeof Msg?.on!=='function')throw new Error('COTA_LIVE_COLLECTION_UNAVAILABLE');
 const previous=window.__cotaLiveV1;
 if(previous?.token===token&&previous.Msg===Msg&&previous.Chat===Chat){previous.refresh();return true;}
 previous?.close();
 const id=value=>typeof value==='string'?value:value?._serialized;
 const pending=new Set(),seen=previous?.seen||new Set(),watched=new Map();let active=true;
 const stats=previous?.stats||{events:0,fresh:0,history:0,invalid:0,duplicates:0,delivered:0,bindingErrors:0,ciphertext:0,lastEventAt:null,lastDeliveryAt:null,repairs:0};if(previous)stats.repairs++;
 const invalid=reason=>{stats.invalid++;stats.rejected??={};stats.rejected[reason]=(stats.rejected[reason]||0)+1;return null;};
 const emit=(event,attempt=0)=>{if(!active)return;Promise.resolve().then(()=>window[binding](event)).catch(()=>{stats.bindingErrors++;if(active&&attempt<2)setTimeout(()=>emit(event,attempt+1),250);});};
 function snapshot(row){
  const providerId=id(row.id),own=row.id?.fromMe,remote=id(row.id?.remote),from=id(row.from)||(!own?remote:undefined),to=id(row.to)||(own?remote:undefined);
  if(!providerId)return invalid('identifier');if(typeof own!=='boolean')return invalid('direction');if(row.isNotification||row.isStatusV3)return invalid('notification');
  const target=own?to:from;if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(target||'')&&!/^\d+(?:-\d+)?@g\.us$/.test(target||''))return invalid('destination');
  const cotaOrigin=own&&[...(window.__cotaSendReceiptV1?.attempts.values()||[])].some(receipt=>receipt.id===providerId);
  return{id:{_serialized:providerId,fromMe:own},fromMe:own,from,to,author:id(row.author),type:row.type,body:String(row.body||row.caption||''),timestamp:Number(row.t),ack:Number.isInteger(row.ack)?row.ack:undefined,cotaOrigin,_data:{isNewMsg:true,notifyName:row.notifyName||''}};
 }
 const deliver=row=>{try{const message=snapshot(row);if(!message)return;if(seen.has(message.id._serialized)){stats.duplicates++;return;}stats.delivered++;stats.lastDeliveryAt=Date.now();seen.add(message.id._serialized);if(seen.size>5000)seen.delete(seen.values().next().value);emit({kind:'message',message});}catch{emit({kind:'error'});}};
 const added=row=>{try{
  stats.events++;stats.lastEventAt=Date.now();if(row.isNewMsg!==true){stats.history++;return;}stats.fresh++;
  if(row.type==='ciphertext'){
   if(pending.has(row))return;pending.add(row);stats.ciphertext++;
   row.once?.('change:type',()=>{pending.delete(row);if(active&&row.type!=='revoked'&&row.type!=='ciphertext')deliver(row);});return;
  }
  deliver(row);
 }catch{emit({kind:'error'});}};
 const ack=(row,value)=>{try{const message=snapshot(row);if(message?.fromMe&&Number.isInteger(value)&&value>=0&&value<=4)emit({kind:'ack',message,ack:value});}catch{}};
 const unread=chat=>{try{const remote=id(chat.id);if(remote&&Number.isInteger(chat.unreadCount))emit({kind:'unread',chat:{id:{_serialized:remote},unreadCount:chat.unreadCount}});}catch{}};
 function watchChats(){
  const current=new Set();for(const chat of Chat?.getModelsArray?.()||Chat?.models||[]){const msgs=chat.msgs;if(msgs===Msg||typeof msgs?.on!=='function')continue;current.add(msgs);msgs.off?.('add',added);msgs.on('add',added);watched.set(msgs,added);}
  for(const[msgs,handler]of watched)if(!current.has(msgs)){msgs.off?.('add',handler);watched.delete(msgs);}
 }
 function refresh(){Msg.off?.('add',added);Msg.on('add',added);Msg.off?.('change:ack',ack);Msg.on('change:ack',ack);Chat?.off?.('change:unreadCount',unread);Chat?.on?.('change:unreadCount',unread);Chat?.off?.('add',watchChats);Chat?.on?.('add',watchChats);watchChats();}
 refresh();
 window.__cotaLiveV1={token,Msg,Chat,seen,stats,refresh,close(){active=false;Msg.off?.('add',added);Msg.off?.('change:ack',ack);Chat?.off?.('change:unreadCount',unread);Chat?.off?.('add',watchChats);for(const[msgs,handler]of watched)msgs.off?.('add',handler);watched.clear();pending.clear();}};
 return true;
}

export async function attachLiveBridge(client){
 const page=client.pupPage;
 client.liveBindings??=new WeakMap();
 let binding=client.liveBindings.get(page);
 if(!binding){binding='cotaLive'+randomUUID().replaceAll('-','');await page.exposeFunction(binding,event=>{
  if(client.stopping||client.pupPage!==page)return;
  if(event?.kind==='message')client.emit('cota_live_message',event.message);
  else if(event?.kind==='ack')client.emit('message_ack',event.message,event.ack);
  else if(event?.kind==='unread')client.emit('unread_count',event.chat);
  else if(event?.kind==='error')client.emit('cota_live_error');
 });client.liveBindings.set(page,binding);}
 if(await page.evaluate(installLiveBridge,{binding,token:binding})!==true)throw new Error('COTA_LIVE_BRIDGE_UNAVAILABLE');
 client.cotaLiveEvents=true;
}

// Metadata only. Never return identifiers, text, names, QR codes or session keys.
export function liveBridgeHealth(){
 const collections=window.require('WAWebCollections')||window.Store,bridge=window.__cotaLiveV1;
 return{attached:Boolean(bridge&&bridge.Msg===collections?.Msg&&bridge.Chat===collections?.Chat),browserTime:Date.now(),cachedChats:(collections?.Chat?.getModelsArray?.()||collections?.Chat?.models||[]).length,cachedMessages:(collections?.Msg?.getModelsArray?.()||collections?.Msg?.models||[]).length,...(bridge?.stats?{counters:JSON.parse(JSON.stringify(bridge.stats))}:{})};
}
