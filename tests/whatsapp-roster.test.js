import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {createRequire} from 'node:module';
import wa from 'whatsapp-web.js';
import {Store} from '../server/db.js';
import {WhatsAppSync} from '../server/whatsapp-sync.js';
import {Agent} from '../server/agent.js';
import {cachedRoster,readCachedRoster} from '../server/whatsapp-roster.js';
import {seedBrokenRoster} from './fixtures/broken-whatsapp-roster.js';
const require=createRequire(import.meta.url),{LoadUtils}=require('whatsapp-web.js/src/util/Injected/Utils.js');
function fixture(t){
 const context=createContext({window:{}});runInContext('('+seedBrokenRoster.toString()+')()',context);runInContext('('+LoadUtils.toString()+')()',context);
 const page={evaluate:async(fn,...args)=>{context.fixtureArgs=args;return structuredClone(await runInContext('('+fn.toString()+')(...fixtureArgs)',context));}};
 const client=new wa.Client();client.pupPage=page;client.info={wid:{_serialized:'5511888888888@c.us'}};client.getContactLidAndPhone=async()=>[];let sent=0;client.sendMessage=async()=>{sent++;throw new Error('Must never send while syncing');};
 const store=new Store(':memory:'),logs=[],owner={client,generation:1,status:'ready',readyAt:Math.floor(Date.now()/1000),store,logger:{error:message=>logs.push(message)}},sync=new WhatsAppSync(owner),agent=new Agent(store,async()=>{sent++;return'forbidden';});
 t.after(()=>{sync.reset();agent.followups.close();store.close();});return{client,store,owner,sync,agent,context,page,logs,sent:()=>sent,mutate:code=>runInContext(code,context)};
}
test('installed SDK reproduces r from one group; fallback recovers chats, groups, 30 contacts and history without sends',async t=>{
 const f=fixture(t);await assert.rejects(f.client.getChats(),/r/);const state=await f.sync.run();assert.equal(state.chats,2);assert.equal(state.groups,1);assert.equal(state.contacts,30);assert.equal(state.status,'ready');assert.equal(state.chatsSource,'cache');assert.equal(f.store.chats().length,2);assert.equal(f.store.groupList().length,1);assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,30);
 for(const chat of f.store.chats()){assert.equal(f.store.messages(chat.id).length,1);assert.equal(chat.unread,0);assert.equal(chat.service_origin_id,null);assert.equal(chat.last_inbound,0);assert.equal(f.store.messages(chat.id)[0].inbound_verified,0);}
 for(let i=0;i<10;i++)await f.agent.followups.check();assert.equal(f.sent(),0);assert(f.logs.some(line=>line.includes('stage=chats:')&&line.includes('Error: r')));
});
test('fallback reads no group metadata and never fetches group history',async t=>{
 const f=fixture(t);const before=f.mutate('window.rosterFixture.groupUpdates');const roster=await readCachedRoster(f.client,'chats');assert.equal(roster.items.length,3);assert.equal(f.mutate('window.rosterFixture.groupUpdates'),before);assert.equal(f.mutate('window.rosterFixture.historyCalls'),0);assert.equal(f.sent(),0);
});
test('one broken raw chat cannot hide other available private chats and groups',async t=>{
 const f=fixture(t);f.mutate("window.rosterFixture.chats.unshift({get id(){throw new Error('broken id')}})");const result=await readCachedRoster(f.client,'chats');assert.equal(result.skipped,1);assert.equal(result.items.length,3);await f.sync.run();assert.equal(f.store.chats().length,2);assert.equal(f.sync.snapshot().status,'partial');assert(f.sync.snapshot().issues.some(issue=>issue.code==='items_skipped'));
});
test('saved contacts can be read without optional SDK contact-model getters',async t=>{
 const f=fixture(t);f.mutate("window.require('WAWebContactGetters').getVerifiedName=()=>{throw new Error('r')}");await assert.rejects(f.client.getContacts(),/r/);const result=await f.sync.run();assert.equal(result.contacts,30);assert.equal(result.contactsSource,'cache');assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,30);assert.equal(f.sent(),0);
});
test('fallback contacts do not guess whether an unsaved contact belongs in the agenda',async t=>{
 const f=fixture(t);f.mutate("window.rosterFixture.contacts[0].isMyContact=false;window.rosterFixture.contacts[1].isMe=true;window.rosterFixture.contacts[2].isWAContact=false");f.client.getContacts=async()=>{throw new Error('r');};await f.sync.run();assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,27);
});
test('an empty primary query still recovers cached lists without pretending incoming unread messages',async t=>{
 const f=fixture(t);f.client.getChats=async()=>[];await f.sync.run();assert.equal(f.store.chats().length,2);assert(f.store.chats().every(chat=>chat.unread===0));assert.equal(f.sent(),0);
});
test('unavailable browser collections report the failing list stage and preserve stored contacts',async t=>{
 const f=fixture(t);await f.sync.run();const before=f.store.chats().length;f.mutate("window.require=()=>{throw new Error('module unavailable')}");const result=await f.sync.run();assert.equal(result.status,'partial');assert(result.issues.some(issue=>issue.stage==='chats'&&issue.code==='list_unavailable'));assert(result.issues.some(issue=>issue.stage==='contacts'&&issue.code==='list_unavailable'));assert.equal(f.store.chats().length,before);assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,30);assert.equal(f.sent(),0);
});
test('empty browser lists remain explicitly incomplete rather than claiming a successful history import',async t=>{
 const f=fixture(t);f.mutate('window.rosterFixture.chats=[]');const result=await f.sync.run();assert.equal(result.status,'partial');assert(result.issues.some(issue=>issue.code==='empty_list'));assert.equal(result.contacts,30);assert.equal(f.sent(),0);
});
test('a timed out SDK promise can recover from the cached list while its late result is ignored',async t=>{
 const f=fixture(t);f.sync.timeout=15;let finish;f.client.getChats=()=>new Promise(resolve=>{finish=resolve;});await f.sync.run();const before=f.store.chats().length;assert.equal(before,2);finish([]);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.store.chats().length,before);assert.equal(f.sent(),0);
});
test('disconnection during fallback prevents late roster writes into another session',async t=>{
 const f=fixture(t),original=f.page.evaluate;let finish,entered;const started=new Promise(resolve=>{entered=resolve;});f.client.getChats=async()=>{throw new Error('r');};f.page.evaluate=async(fn,...args)=>{if(fn===cachedRoster&&args[0]==='chats'){entered();await new Promise(resolve=>{finish=resolve;});}return original(fn,...args);};const pending=f.sync.run();await started;f.owner.status='disconnected';f.owner.generation++;f.sync.reset();finish();await pending;assert.equal(f.store.chats().length,0);assert.equal(f.store.get('SELECT count(*) n FROM contacts').n,0);assert.equal(f.sent(),0);
});
