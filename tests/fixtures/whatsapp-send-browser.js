// Minimal WhatsApp Web modules used by the installed SDK. No real account.
export function seedSendBrowser(){
 const state=window.sendFixture={mode:'ok',sent:[],sequence:0,records:new Map(),chats:new Map(),readCalls:0};
 const wid=id=>({_serialized:id,isLid:()=>id.endsWith('@lid'),isGroup:()=>false,isStatus:()=>false});
 class Key{
  static async newId(){return 'COTA_TEST_'+(++state.sequence);}
  constructor({to,id}){this.id=id;this.remote=to;this.fromMe=true;this._serialized='true_'+to._serialized+'_'+id;}
 }
 const action={addAndSendMsgToChat(chat,message){
  if(state.mode==='reject')return [Promise.reject(new Error('send rejected')),Promise.resolve()];
  const data={...message,id:{...message.id},from:message.from._serialized,to:message.to._serialized};
  state.sent.push(data);state.records.set(message.id._serialized,{...message,serialize(){if(state.mode==='serializer')throw new Error('r');return {...data};}});
  if(state.mode==='partial_reject')return [Promise.reject(new Error('uncertain after enqueue')),Promise.resolve()];
  if(state.mode==='changed_queue')return [];
  return [Promise.resolve(message),Promise.resolve({ack:1})];
 }};
 const modules={
  WAWebCollections:{Chat:{get(value){const id=value._serialized,target=state.aliases?.[id]||id;if(!state.chats.has(target))state.chats.set(target,{id:wid(target)});return state.chats.get(target);}},Msg:{get(id){if(state.mode==='undefined')return undefined;if(state.mode==='lookup_throw')throw new Error('lookup failed after send');return state.records.get(id);}}},
  WAWebWidFactory:{createWid:wid},WAWebChatGetters:{getIsNewsletter:()=>false,getIsBroadcast:()=>false},WALinkify:{findLink:()=>null,findLinks:()=>[]},
  WAWebUserPrefsMeUser:{getMaybeMeLidUser:()=>wid('9911888888888@lid'),getMaybeMePnUser:()=>wid('5511888888888@c.us')},WAWebMsgKey:Key,
  WAWebGetEphemeralFieldsMsgActionsUtils:{getEphemeralFields:()=>({})},WAWebSendMsgChatAction:action,
 };
 window.require=name=>{if(!modules[name])throw new Error('Fixture module unavailable: '+name);return modules[name];};
 state.installMedia=()=>{window.WWebJS.processMediaData=async media=>({type:'image',preview:'preview',directPath:'/test-media',testData:media.data});};
}
