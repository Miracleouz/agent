// Opt-in: validate the image's production server code with synthetic WA models.
// Only disposable containers and their anonymous volumes are created/removed.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const image=process.argv[2];assert(image,'Usage: node tests/docker-realtime.mjs IMAGE');
const exec=promisify(execFile),name='cota-live-test-'+randomUUID().slice(0,8);
const docker=async(...args)=>(await exec('docker',args,{maxBuffer:4*1024*1024,timeout:180000})).stdout;
let created=false;
try{
 await docker('create','--init','--network','none','--name',name,'--label','cota.disposable-live-test=true','--shm-size=512m','--entrypoint','node',image,'--test','tests/realtime.test.js','tests/whatsapp-conversation-media.test.js','tests/production-features.mjs');created=true;
 // The server code and production dependencies remain those of the image.
 await docker('cp','tests',name+':/app/tests');await docker('cp','src',name+':/app/src');
 const output=await docker('start','--attach',name),code=Number((await docker('inspect','--format','{{.State.ExitCode}}',name)).trim());
 console.log(output.split('\n').slice(-13).join('\n'));
 assert.equal(code,0,'Container tests failed');const count=Number(output.match(/(?:#|ℹ) tests (\d+)/)?.[1]);assert(count>=300,'Expected at least 300 executed tests');
 console.log(`PASS: ${count} realtime tests against image server code, production dependencies, init, user node and actual Chromium; no network, pairing or real messages.`);
}finally{if(created)await docker('rm','--force','--volumes',name).catch(()=>{});}
