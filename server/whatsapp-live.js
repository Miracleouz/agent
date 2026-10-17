import {randomUUID} from 'node:crypto';

// Runs in Chromium. Capture only actual new model events, never enumerate old
// messages and never infer a customer request from an unread count or a clock.
export function installLiveBridge({binding,token}){
 const collections=window.require('WAWebCollections')||window.Store,Msg=collections?.Msg,Chat=collections?.Chat;
 if(typeof Msg?.on!=='function')throw new Error('COTA_LIVE_COLLECTION_UNAVAILABLE');
 const previous=window.__cotaLiveV1;
 if(previous?.token===token&&previous.Msg===Msg)return true;
 previous?.close();
 const id=value=>typeof value==='string'?value:value?._serialized;
 const pending=new Set(),seen=new Set();let active=true;
 const emit=(event,attempt=0)=>{if(!active)return;Promise.resolve().then(()=>window[binding](event)).catch(()=>{if(active&&attempt<2)setTimeout(()=>emit(event,attempt+1),250);});};
 function snapshot(row){
  const providerId=id(row.id),own=row.id?.fromMe,remote=id(row.id?.remote),from=id(row.from)||(!own?remote:undefined),to=id(row.to)||(own?remote:undefined);
  if(!providerId||typeof own!=='boolean'||row.isNotification||row.isStatusV3)return null;
  const target=own?to:from;if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(target||'')&&!/^\d+(?:-\d+)?@g\.us$/.test(target||''))return null;
  const cotaOrigin=own&&[...(window.__cotaSendReceiptV1?.attempts.values()||[])].some(receipt=>receipt.id===providerId);
  return{id:{_serialized:providerId,fromMe:own},fromMe:own,from,to,author:id(row.author),type:row.type,body:String(row.body||row.caption||''),timestamp:Number(row.t),ack:Number.isInteger(row.ack)?row.ack:undefined,cotaOrigin,_data:{isNewMsg:true,notifyName:row.notifyName||''}};
 }
 const deliver=row=>{try{const message=snapshot(row);if(!message||seen.has(message.id._serialized))return;seen.add(message.id._serialized);if(seen.size>5000)seen.delete(seen.values().next().value);emit({kind:'message',message});}catch{emit({kind:'error'});}};
 const added=row=>{try{
  if(row.isNewMsg!==true)return;
  if(row.type==='ciphertext'){
   if(pending.has(row))return;pending.add(row);
   row.once?.('change:type',()=>{pending.delete(row);if(active&&row.type!=='revoked'&&row.type!=='ciphertext')deliver(row);});return;
  }
  deliver(row);
 }catch{emit({kind:'error'});}};
 const ack=(row,value)=>{try{const message=snapshot(row);if(message?.fromMe&&Number.isInteger(value)&&value>=0&&value<=4)emit({kind:'ack',message,ack:value});}catch{}};
 const unread=chat=>{try{const remote=id(chat.id);if(remote&&Number.isInteger(chat.unreadCount))emit({kind:'unread',chat:{id:{_serialized:remote},unreadCount:chat.unreadCount}});}catch{}};
 Msg.on('add',added);Msg.on('change:ack',ack);Chat?.on?.('change:unreadCount',unread);
 window.__cotaLiveV1={token,Msg,close(){active=false;Msg.off?.('add',added);Msg.off?.('change:ack',ack);Chat?.off?.('change:unreadCount',unread);pending.clear();}};
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
