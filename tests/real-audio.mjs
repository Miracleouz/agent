// Opt-in integration: a cached real Whisper model, real Ogg/Opus decoding and
// Chromium with controlled WhatsApp models. Never pairs or messages a number.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import puppeteer from 'puppeteer';
import {liveRuntime} from './fixtures/live-runtime.js';
assert(process.env.DATA_DIR,'DATA_DIR must point to the directory containing a prepared models/ cache');
const bytes=await readFile(new URL('./fixtures/quotation-pt.ogg',import.meta.url));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let f;
try{
 f=await liveRuntime({page:await browser.newPage()});f.wa.transcription.dataDir=process.env.DATA_DIR;
 await f.page.evaluate(base64=>{const blob=new Blob([Uint8Array.from(atob(base64),v=>v.charCodeAt(0))],{type:'audio/ogg'}),original=window.require,make=window.liveFixture.make;window.require=name=>name==='WAWebMediaInMemoryBlobCache'?{InMemoryMediaBlobCache:{get:()=>blob}}:original(name);window.liveFixture.make=options=>{const row=make(options);row.mimetype='audio/ogg';row.mediaData={mediaStage:'RESOLVED'};row.mediaObject={filehash:'real-audio-hash'};row.downloadMedia=async()=>{};return row;};},bytes.toString('base64'));
 await f.add({id:'real-speech-auto',type:'ptt',body:'',format:'dollar1'});
 const row=f.store.get("SELECT * FROM messages WHERE provider_id='real-speech-auto'");
 assert.equal(row.transcription_state,'done',row.transcription_error);assert.match(row.transcript,/B\s*72/i);assert.equal(row.audio_agent_state,'interpreted');assert.deepEqual(Buffer.from(row.media_data),bytes);
 // This synthetic voice is imperfect: Whisper recognizes B72 but renders the
 // noun/question imprecisely. The safe response requests confirmation instead
 // of inventing a price for an uncertain catalog match.
 const sent=await f.sent();assert.equal(sent.length,1);assert.match(sent[0].body,/Pode confirmar os dados/);assert.doesNotMatch(sent[0].body,/R\$/);
 const chat=f.store.chat(row.chat_id);f.store.run("UPDATE chats SET mode='manual',pause_until=NULL WHERE id=?",chat.id);
 await f.add({id:'real-speech-manual',type:'ptt',body:'',format:'dollar1'});const manual=f.store.get("SELECT * FROM messages WHERE provider_id='real-speech-manual'");await f.wa.transcription.request(manual.id);assert.equal(f.store.message(manual.id).transcription_state,'done');assert.equal((await f.sent()).length,1);
 console.log('PASS: actual Ogg/Opus → Whisper base → B72 recognized; uncertain wording requests confirmation; manual transcription adds no reply. Controlled browser only; no real WhatsApp account.');
}finally{if(f)await f.close();await browser.close();}
