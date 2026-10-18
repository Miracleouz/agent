import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const[image,cache]=process.argv.slice(2);assert(image&&cache,'Usage: node tests/docker-real-audio.mjs IMAGE DATA_DIR_WITH_MODELS');
const source=await realpath(cache),name='cota-audio-test-'+randomUUID().slice(0,8),exec=promisify(execFile);
const docker=async(...args)=>{try{return(await exec('docker',args,{maxBuffer:1024*1024,timeout:180000})).stdout;}catch(error){if(args[0]==='start'&&typeof error.code==='number')return(error.stdout||'')+'\n'+(error.stderr||'');throw error;}};
let created=false;
try{
 await docker('create','--init','--network','none','--name',name,'--label','cota.disposable-audio-test=true','--shm-size=512m','--mount',`type=bind,source=${source},target=/voice-model,readonly`,'--env','DATA_DIR=/voice-model','--env','HF_HUB_OFFLINE=1','--entrypoint','node',image,'tests/real-audio.mjs');created=true;
 await docker('cp','tests',name+':/app/tests');
 console.log(await docker('start','--attach',name));assert.equal(Number((await docker('inspect','--format','{{.State.ExitCode}}',name)).trim()),0);
 console.log('PASS: production image audio integration, user node, read-only model and no network.');
}finally{if(created)await docker('rm','--force','--volumes',name).catch(()=>{});}
