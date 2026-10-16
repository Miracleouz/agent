// Fake WhatsApp Web collections for the installed SDK, run in a VM or Chromium.
// No real account, network or customer messages are used.
export function seedBrokenRoster(){
 const own='5511888888888@c.us',now=Math.floor(Date.now()/1000)-600;
 const state=window.rosterFixture={failGroup:true,failContact:false,groupUpdates:0,historyCalls:0,sends:0};
 function message(from,id){const data={id:{_serialized:id,id,remote:from,fromMe:false},from,to:own,body:'quero fechar B72',type:'chat',t:now};return{...data,serialize:()=>({...data})};}
 function chat(id,name){const old=message(id,'old-'+id);return{id:{_serialized:id},formattedTitle:name,t:now,unreadCount:7,msgs:{getModelsArray:()=>[old]},serialize:()=>({id:{_serialized:id},formattedTitle:name,t:now,unreadCount:7,msgs:[]})};}
 state.chats=[chat('5511999999999@c.us','Cliente Particular'),chat('991122334455@lid','Cliente LID'),chat('12345-678@g.us','Grupo com erro'),chat('status@broadcast','Status'),chat('123@newsletter','Canal')];
 state.chats[2].groupMetadata={serialize:()=>({participants:[]})};
 state.contacts=Array.from({length:30},(_,i)=>({id:{_serialized:'55119'+String(i).padStart(8,'0')+'@c.us'},name:'Contato importado '+String(i).padStart(2,'0'),isMyContact:true,isWAContact:true,serialize(){return{id:this.id};}}));
 const byId=id=>state.chats.find(chat=>chat.id._serialized===(id?._serialized||id));
 const getters={getIsMe:m=>m.isMe===true,getIsUser:()=>true,getIsGroup:()=>false,getIsWAContact:m=>m.isWAContact!==false,getUserid:m=>m.id._serialized.split('@')[0],getVerifiedName:()=>undefined,getVerifiedLevel:()=>undefined,getStatusMute:()=>undefined,getName:m=>m.name,getShortName:m=>m.name,getPushname:m=>m.name,getIsEnterprise:()=>false};
 const modules={
  WAWebCollections:{Chat:{getModelsArray:()=>state.chats,get:byId},Contact:{getModelsArray:()=>state.contacts},GroupMetadata:{update:async()=>{state.groupUpdates++;if(state.failGroup)throw new Error('r');}},Msg:{get:()=>null},Blocklist:{get:()=>null}},
  WAWebWidFactory:{createWid:id=>({_serialized:id}),createWidFromWidLike:id=>({...id,isLid:()=>id._serialized.endsWith('@lid')})},
  WAWebLidMigrationUtils:{toPn:id=>id},WAWebApiContact:{getAlternateUserWid:()=>null},WAWebContactGetters:getters,
  WAWebFrontendContactGetters:{getIsMyContact:model=>{if(state.failContact)throw new Error('contact getter incompatible');return model.isMyContact;}},
  WAWebChatLoadMessages:{loadEarlierMsgs:async()=>{state.historyCalls++;return[];}},WALinkify:{findLinks:()=>[]},
 };
 window.require=name=>{if(!modules[name])throw new Error('Fixture module unavailable: '+name);return modules[name];};
}
