import {attachLiveBridge,liveBridgeHealth} from './whatsapp-live.js';
import {installExistingChatLookup,installMessageSerializerGuard} from './whatsapp-models.js';

// A ready socket can outlive the collections/listeners installed at login.
// Repair only event observers; never treat cached messages as new requests.
export class WhatsAppMonitor{
 constructor(wa,{interval=5000,timeout=5000}={}){this.wa=wa;this.interval=interval;this.timeout=timeout;this.reset();}
 reset(){clearTimeout(this.timer);this.epoch=(this.epoch||0)+1;this.state={status:'idle',checkedAt:null,received:0,accepted:0,duplicates:0,rejected:{},lastReceivedAt:null};this.pending=null;}
 received(){this.state.received++;this.state.lastReceivedAt=Date.now();}
 reject(reason){this.state.rejected[reason]=(this.state.rejected[reason]||0)+1;}
 snapshot(){return structuredClone(this.state);}
 check(){
  if(this.pending)return this.pending;
  const wa=this.wa,client=wa.client,epoch=this.epoch,generation=wa.generation,page=client?.pupPage;
  if(wa.status!=='ready'||!(client?.cotaManaged||client?.cotaLiveEvents)||typeof page?.evaluate!=='function')return Promise.resolve(this.snapshot());
  const active=()=>this.epoch===epoch&&wa.client===client&&wa.generation===generation&&wa.status==='ready';
  // Keep a single in-flight browser evaluation, including after the deadline.
  const timer=setTimeout(()=>{if(active()){this.state.status='stalled';this.state.checkedAt=Date.now();wa.store.changed();}},this.timeout);timer.unref?.();
  const task=(async()=>{try{
   await page.evaluate(installExistingChatLookup);await page.evaluate(installMessageSerializerGuard);await attachLiveBridge(client);
   const health=await page.evaluate(liveBridgeHealth);if(!active())return this.snapshot();
   const previous=this.state.status;this.state={...this.state,status:health.attached?'active':'unavailable',checkedAt:Date.now(),browser:health};
   if(previous!==this.state.status)wa.logger.info?.(`[WhatsApp live] observer=${this.state.status} repairs=${health.counters?.repairs||0}`);
  }catch{if(active()){if(this.state.status!=='unavailable')wa.logger.error('[WhatsApp live] observer=unavailable');this.state.status='unavailable';this.state.checkedAt=Date.now();}}
  finally{clearTimeout(timer);if(active()){if(this.pending===task)this.pending=null;wa.store.changed();this.timer=setTimeout(()=>this.check(),this.interval);this.timer.unref?.();}}
  return this.snapshot();})();this.pending=task;return task;
 }
}
