// Layered over seedAuthBrowser + seedSendBrowser. Uses the installed SDK's
// real event listeners, serializers and send function, without a WA account.
export function seedLiveBrowser(){
 const sendRequire=window.require,authRequire=window.authRequire,send=window.sendFixture;
 const state=window.liveFixture={failSerialize:false,requests:0,earlier:[],listeners:new Map()};
 const events=target=>{const listeners=new Map();target.on=(event,fn)=>{for(const name of event.split(' ')){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);}};target.off=(event,fn)=>listeners.set(event,(listeners.get(event)||[]).filter(value=>value!==fn));target.emit=(event,...args)=>{for(const fn of [...(listeners.get(event)||[])])fn(...args);};return target;};
 const collections=sendRequire('WAWebCollections'),Msg=events(collections.Msg),Chat=events(collections.Chat),pn='5511999999999@c.us',lid='991122334455@lid',own='5511888888888@c.us';
 const createChat=id=>{const model={id:sendRequire('WAWebWidFactory').createWid(id),formattedTitle:id===pn?'Cliente MP':id,t:Math.floor(Date.now()/1000)-3600,unreadCount:0,endOfHistoryTransferType:0,msgs:{getModelsArray:()=>[...send.records.values()].filter(row=>row.id.remote?._serialized===id||row.from===id||row.to===id)},serialize(){return{id:{_serialized:id},formattedTitle:this.formattedTitle,t:this.t,unreadCount:this.unreadCount,msgs:[]};}};send.chats.set(id,model);return model;};
 createChat(pn);const group=createChat('12345-678@g.us');group.groupMetadata={serialize:()=>({participants:[]})};
 Chat.get=()=>undefined;Chat.find=async()=>{throw new TypeError('this.findImpl is not a function');};Chat.getModelsArray=()=>[...send.chats.values()];Msg.getModelsArray=()=>[...send.records.values()];
 collections.Contact={getModelsArray:()=>[{id:{_serialized:lid},phoneNumber:{_serialized:pn},name:'Cliente MP',isMyContact:true,isWAContact:true}]};collections.GroupMetadata={update:async()=>{throw new Error('r');}};
 state.make=({id='in-'+Math.random(),from=pn,to=own,body='cotar corr B 72',type='chat',fresh=true,age=0,fromMe=false,serializer=true}={})=>{
  const target=fromMe?to:from,row=events({id:{_serialized:id,id,remote:{_serialized:target},fromMe},from,to,type,body,t:Math.floor(Date.now()/1000)-age,isNewMsg:fresh,notifyName:'Cliente MP',ack:1});
  row.serialize=()=>{if(state.failSerialize||!serializer)throw new Error('r');return{id:{...row.id,remote:target},from,to,body:row.body,type:row.type,t:row.t,isNewMsg:row.isNewMsg,notifyName:'Cliente MP',ack:row.ack};};
  row.once=(event,fn)=>{const once=(...args)=>{row.off(event,once);fn(...args);};row.on(event,once);};return row;
 };
 state.add=options=>{const row=state.make(options),target=row.id.remote._serialized;if(!send.chats.has(target))createChat(target);send.records.set(row.id._serialized,row);Msg.emit('add',row);return row.id._serialized;};
 const action=sendRequire('WAWebSendMsgChatAction'),original=action.addAndSendMsgToChat;
 action.addAndSendMsgToChat=function(chat,message){const result=original.call(this,chat,message);const row=send.records.get(message.id._serialized);if(row){row.isNewMsg=true;row.t=Math.floor(Date.now()/1000);row.type=message.type||'chat';Msg.emit('add',row);}return result;};
 const extras={WAWebCollections:collections,WAWebSyncGatingUtils:{},WAWebCallCollection:{},WAWebFrontendContactGetters:{getIsMyContact:model=>model.isMyContact},WAWebStreamModel:{Stream:{markAvailable(){},markUnavailable(){}}},WAWebUpdateUnreadChatAction:{sendSeen:async({chat})=>{chat.unreadCount=0;Chat.emit('change:unreadCount',chat);}},WAWebChatLoadMessages:{loadEarlierMsgs:async()=>state.earlier.splice(0)},WAWebSendNonMessageDataRequest:{sendPeerDataOperationRequest:async()=>{state.requests++;}}};
 window.require=name=>{if(extras[name])return extras[name];try{return sendRequire(name);}catch{return authRequire(name);}};
 state.pn=pn;state.lid=lid;state.own=own;state.createChat=createChat;
}
