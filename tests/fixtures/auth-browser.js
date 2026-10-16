// Browser modules for the installed SDK's actual inject()/QR path. No account.
export function seedAuthBrowser(){
 const state=window.authFixture={ready:false,evaluations:0,registrations:0,refs:[],listeners:new Map(),socket:{state:'UNPAIRED',on(event,listener){const list=state.listeners.get(event)||[];list.push(listener);state.listeners.set(event,list);},off(){}}};
 const modules={
  WAWebCmd:{Cmd:{on(){},refreshQR(){state.refreshes=(state.refreshes||0)+1;}}},WAWebConnModel:{Conn:{ref:'test-reference',on(event,listener){state.refs.push(listener);}}},
  WAWebOfflineHandler:{OfflineMessageHandler:{getOfflineDeliveryProgress:()=>100}},WAWebAltDeviceLinkingApi:{},WABase64:{encodeB64:()=> 'test-key'},
  WAWebCompanionRegClientUtils:{DEVICE_PLATFORM:'test',waSignalStore:{getRegistrationInfo:async()=>({identityKeyPair:{pubKey:new Uint8Array([1])}})},waNoiseInfo:{get:async()=>({staticKeyPair:{pubKey:new Uint8Array([2])}})}},
  WAWebAdvSignatureApi:{},WAWebUserPrefsInfoStore:{},WAWebSignalStoreApi:{},WAWebUserPrefsMultiDevice:{getADVSecretKey:()=> 'test-secret'},
 };
 window.Debug={VERSION:'test-auth-version'};
 window.require=name=>name==='WAWebSocketModel'?(state.ready?{Socket:state.socket}:null):modules[name]??null;
}
