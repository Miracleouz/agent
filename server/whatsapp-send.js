import {randomUUID} from 'node:crypto';

// Runs in the linked browser. Track the exact SDK send, before its final
// collection lookup / full serializer. Never infer delivery from matching text.
export async function prepareSendReceipt({token,chatId}){
 const chat=await window.WWebJS.getChat(chatId,{getAsModel:false}),remoteId=(chat?.id?._serialized||chat?.id?.$1);
 if(!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(remoteId||''))throw new Error('COTA_SEND_TARGET_UNAVAILABLE');
 const action=window.require('WAWebSendMsgChatAction'),key='__cotaSendReceiptV1';
 let bridge=window[key];
 if(!bridge){
  const original=action.addAndSendMsgToChat;
  if(typeof original!=='function')throw new Error('COTA_SEND_BRIDGE_UNAVAILABLE');
  bridge={attempts:new Map()};
  bridge.send=function(chat,message,...args){
   const token=message?.__cotaSendToken;
   if(!token)return original.call(this,chat,message,...args);
   delete message.__cotaSendToken;
   const receipt=bridge.attempts.get(token),remote=value=>typeof value==='string'?value:(value?._serialized||value?.$1);
   const id=(message.id?._serialized||message.id?.$1);
   if(!receipt||receipt.state!=='prepared'||remote(chat.id)!==receipt.remoteId||remote(message.to)!==receipt.remoteId||remote(message.id?.remote)!==receipt.remoteId||message.id?.fromMe!==true||typeof id!=='string'||!id.startsWith('true_'+receipt.remoteId+'_'))throw new Error('COTA_SEND_RECEIPT_MISMATCH');
   receipt.state='started';receipt.id=id;
   const result=original.call(this,chat,message,...args);
   if(!Array.isArray(result)||typeof result[0]?.then!=='function')throw new Error('COTA_SEND_QUEUE_UNCONFIRMED');
   // The SDK awaits this promise before looking up / serializing its result.
   // It proves acceptance by the WhatsApp send queue, not delivery or reading.
   return [Promise.resolve(result[0]).then(value=>{receipt.state='accepted';return value;}),result[1]];
  };
  action.addAndSendMsgToChat=bridge.send;
  if(action.addAndSendMsgToChat!==bridge.send)throw new Error('COTA_SEND_BRIDGE_UNAVAILABLE');
  window[key]=bridge;
 }
 if(action.addAndSendMsgToChat!==bridge.send)throw new Error('COTA_SEND_BRIDGE_CHANGED');
 bridge.attempts.set(token,{chatId,remoteId,state:'prepared',id:null});
 return true;
}
export function consumeSendReceipt({token}){
 const bridge=window.__cotaSendReceiptV1,receipt=bridge?.attempts.get(token);
 bridge?.attempts.delete(token);
 return receipt?{...receipt}:null;
}

export async function sendConfirmed(wa,chat,content,options={}){
 const client=wa.client,token=randomUUID(),browser=typeof client.pupPage?.evaluate==='function';
 if(browser){
  try{if(await client.pupPage.evaluate(prepareSendReceipt,{token,chatId:chat.phone})!==true)throw new Error();}
  catch{wa.logger.error('[WhatsApp send] receipt_preflight_unavailable');throw new Error('Não foi possível preparar o envio. Nenhuma mensagem foi enviada. Reconecte o WhatsApp e tente novamente.');}
  if(wa.client!==client||wa.status!=='ready'){
   await client.pupPage.evaluate(consumeSendReceipt,{token}).catch(()=>{});
   throw new Error('O WhatsApp desconectou antes do envio. Conecte novamente.');
  }
 }
 let result,error,receipt;
 try{result=await client.sendMessage(chat.phone,content,{...options,sendSeen:false,...(browser?{extra:{__cotaSendToken:token}}:{})});}
 catch(cause){error=cause;}
 finally{if(browser)receipt=await client.pupPage.evaluate(consumeSendReceipt,{token}).catch(()=>null);}
 const recovered=receipt?.state==='accepted'&&receipt.chatId===chat.phone&&/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(receipt.remoteId||'')&&typeof receipt.id==='string'&&receipt.id.startsWith('true_'+receipt.remoteId+'_');
 const id=browser?(recovered?receipt.id:null):(result?.id?._serialized||result?.id?.$1);
 if(typeof id!=='string'||!id){
  if(browser&&receipt?.state==='prepared'&&error){
   const module=String(error.message||'').match(/\bWAWeb[A-Za-z0-9]+\b/)?.[0];
   wa.lastSendFailure={stage:'before_queue',kind:typeof content==='string'?'text':'media',code:module||'provider_preparation_failed',at:Date.now()};
   wa.logger.error(`[WhatsApp send] before_queue kind=${wa.lastSendFailure.kind} code=${wa.lastSendFailure.code}`);
   throw Object.assign(new Error(typeof content==='string'?'O WhatsApp recusou a preparação da mensagem. Nenhuma mensagem foi enviada.':'O WhatsApp não conseguiu preparar ou carregar o arquivo para envio. Nenhuma mídia foi enviada. Confira o arquivo e tente novamente.'),{definite:true,cause:error});
  }
  wa.logger.error('[WhatsApp send] unconfirmed');
  throw Object.assign(new Error('Envio não confirmado. Confira no WhatsApp antes de reenviar; a mensagem pode já ter sido enviada.'),{uncertain:true,cause:error});
 }
 if(!(result?.id?._serialized||result?.id?.$1)&&recovered)wa.logger.error('[WhatsApp send] receipt_recovered');
 // Reading is a separate operation: its failure cannot undo an accepted send.
 if(wa.client===client&&wa.status==='ready')try{await wa.markRead(chat);}catch{wa.logger.error('[WhatsApp read] failed_after_send');}
 return id;
}
