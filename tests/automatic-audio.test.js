import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/db.js';
import {WhatsApp} from '../server/whatsapp.js';
import {createApp} from '../server/app.js';
import {replaceCatalog} from '../server/catalog.js';
import {testAudio} from './fixtures/media.js';
const phone='5511999999999@c.us';
async function fixture(t,transcript,{enabled=true,manual=false}={}){
 const store=new Store(':memory:'),sent=[];let transcriptions=0;
 replaceCatalog(store,['GATES','CONTINENTAL','OPTIBELT','MEGADYNE','BANDO','DAYCO'].map((brand,i)=>({id:'b30-'+i,sku:'B30-'+i,name:'CORREIA EM V',variant:'B30',brand,price:50+i*10,quantity:50,unit:'Peça (PC)'})),'audio test');
 class Client extends EventEmitter{constructor(){super();this.info={wid:{_serialized:'5511888888888@c.us'}};}async initialize(){}async destroy(){}async sendMessage(to,body){sent.push({to,body});return{id:{_serialized:randomUUID()}};}}
 const client=new Client(),wa=new WhatsApp(store,'/tmp/cota-audio-automatic-test',{clientFactory:()=>client,logger:{info(){},error(){}}}),app=createApp({store,whatsapp:wa});
 t.after(async()=>{app.locals.close();await wa.close();store.close();});
 wa.transcription.transcribe=async()=>{transcriptions++;return transcript;};store.setSettings({agentEnabled:enabled});
 if(manual){store.run("INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES('manual-audio',?,'Cliente de áudio','whatsapp','qr',?,0)",phone,Date.now());store.pause('manual-audio',30);}
 await wa.connect();client.emit('ready');
 const drain=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));await Promise.all([...app.locals.agent.queues.values()]);await wa.drainMedia();};await drain();
 const emit=(options={})=>client.emit('message',{id:{_serialized:'audio-b30'},from:phone,fromMe:false,type:'ptt',body:'',timestamp:Math.floor(Date.now()/1000),_data:{isNewMsg:true},downloadMedia:async()=>({data:testAudio().toString('base64'),mimetype:'audio/wav'}),...options});
 return{store,sent,wa,emit,drain,count:()=>transcriptions};
}
for(const transcript of ['vocês têm correia B 30?','vocês tem correia B30','tem correia bê trinta?','preciso de duas correias bê trinta','quero cotar B30','cotação correia b trinta'])test('received voice note is automatically transcribed and quoted without a panel click: '+transcript,async t=>{const f=await fixture(t,transcript);f.emit();await f.drain();const row=f.store.get("SELECT * FROM messages WHERE provider_id='audio-b30'");assert.equal(f.count(),1);assert.equal(row.transcript,transcript);assert.equal(row.audio_agent_state,'interpreted');assert.equal(f.sent.length,1);assert.match(f.sent[0].body,/R\$/);assert.match(f.sent[0].body,/B\s*30/);f.emit();await f.drain();assert.equal(f.count(),1);assert.equal(f.sent.length,1);});
for(const state of ['manual','disabled','group','own','history','off-topic'])test('automatic voice respects '+state+' without an unsolicited bot reply',async t=>{const f=await fixture(t,state==='off-topic'?'me conte uma piada':'vocês têm correia B30?',{manual:state==='manual',enabled:state!=='disabled'});f.emit(state==='group'?{from:'12345-678@g.us'}:state==='own'?{fromMe:true}:state==='history'?{timestamp:Math.floor(Date.now()/1000)-86400,_data:{isNewMsg:false}}:{});await f.drain();assert.equal(f.sent.length,0);if(state!=='off-topic')assert.equal(f.count(),0);});
