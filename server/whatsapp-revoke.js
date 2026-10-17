// Runs in the linked WhatsApp browser. Never fall back to local-only deletion.
export async function revokeForEveryone({providerId,targets}){
 const collections=window.require('WAWebCollections');
 const serialized=value=>typeof value==='string'?value:value?._serialized||value?.$1;
 const lookup=()=>collections.Msg.get(providerId);
 const message=lookup()||(await collections.Msg.getMessagesById([providerId]))?.messages?.[0];
 if(!message||serialized(message.id)!==providerId||message.id.fromMe!==true||!targets.includes(serialized(message.id.remote)))return{state:'denied'};
 if(message.type==='revoked'||message.isRevoked===true)return{state:'confirmed',id:providerId};
 const capability=window.require('WAWebMsgActionCapability');
 if(!capability.canSenderRevokeMsg(message))return{state:'denied'};
 const chat=collections.Chat.get(message.id.remote)||await window.WWebJS.getChat(serialized(message.id.remote),{getAsModel:false});
 if(!chat||!targets.includes(serialized(chat.id)))return{state:'denied'};
 const {Cmd}=window.require('WAWebCmd');
 if(window.WWebJS.compareWwebVersions(window.Debug.VERSION,'>=','2.3000.0'))await Cmd.sendRevokeMsgs(chat,{list:[message],type:'message'},{clearMedia:true});
 else await Cmd.sendRevokeMsgs(chat,[message],{clearMedia:true,type:'Sender'});
 for(let i=0;i<20;i++){const current=lookup();if(current&&(current.type==='revoked'||current.isRevoked===true))return{state:'confirmed',id:providerId};await new Promise(resolve=>setTimeout(resolve,100));}
 return{state:'uncertain'};
}
