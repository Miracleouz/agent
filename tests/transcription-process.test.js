import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {transcribeAudio} from '../server/audio-transcription.js';
import {transcriptionError} from '../server/transcription-errors.js';

// Exercise the actual Node/Python transport with a controlled model. These do
// not claim recognition accuracy or download a speech model during npm test.
async function model(t,body){const dir=await mkdtemp(join(tmpdir(),'cota-model-test-'));await writeFile(join(dir,'faster_whisper.py'),body);const previous={python:process.env.TRANSCRIPTION_PYTHON,path:process.env.PYTHONPATH};process.env.TRANSCRIPTION_PYTHON='python3';process.env.PYTHONPATH=dir;t.after(async()=>{for(const[key,value]of [['TRANSCRIPTION_PYTHON',previous.python],['PYTHONPATH',previous.path]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(dir,{recursive:true,force:true});});return dir;}
test('actual Python protocol returns a transcript to Node from audio bytes',async t=>{const dir=await model(t,`from types import SimpleNamespace
class WhisperModel:
 def __init__(self,*args,**kwargs):
  assert args[0]=='large-v3-turbo'
  assert kwargs['device']=='cpu' and kwargs['compute_type']=='int8'
  assert kwargs['local_files_only'] is True
 def transcribe(self,path,**kwargs):
  assert open(path,'rb').read()==b'fixture-audio'
  assert kwargs['language']=='pt' and kwargs['vad_filter'] is True
  assert kwargs['beam_size']==5 and kwargs['condition_on_previous_text'] is False
  assert kwargs['word_timestamps'] is True and kwargs['max_new_tokens']==256
  return iter([SimpleNamespace(text=' Cotar correia B72 ')]),SimpleNamespace(duration=12)
`);assert.deepEqual(await transcribeAudio(Buffer.from('fixture-audio'),{dataDir:dir}),{text:'Cotar correia B72',uncertain:false});});
test('model download errors are actionable and never expose signed URLs or paths',async t=>{const dir=await model(t,`class ProxyError(Exception): pass
class WhisperModel:
 def __init__(self,*args,**kwargs): raise ProxyError('https://private.test/?token=secret')
`);await assert.rejects(transcribeAudio(Buffer.from('audio'),{dataDir:dir}),error=>/audio:prepare/.test(error.message)&&!/secret|private/.test(error.message));});
test('audio decoding errors and silence have distinct safe messages',async t=>{const dir=await model(t,`from types import SimpleNamespace
class WhisperModel:
 def __init__(self,*args,**kwargs): pass
 def transcribe(self,path,**kwargs):
  if open(path,'rb').read()==b'broken': raise ValueError('/private/audio')
  return iter([]),SimpleNamespace(duration=1)
`);await assert.rejects(transcribeAudio(Buffer.from('broken'),{dataDir:dir}),/abrir este áudio/);await assert.rejects(transcribeAudio(Buffer.from('silence'),{dataDir:dir}),/reconhecer fala/);});
test('offline diagnose sets local_files_only and prepare explicitly allows model download',async t=>{await model(t,`class WhisperModel:
 def __init__(self,*args,**kwargs):
  import sys
  assert kwargs['local_files_only']==('--check' in sys.argv)
`);for(const mode of ['--check','--prepare']){const result=spawnSync(process.execPath,['server/prepare-audio.js',mode],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/OK: motor local/);}});
test('unknown transcription stderr is never copied into owner-facing messages',()=>{assert.doesNotMatch(transcriptionError('private-path bearer-token\n{"error":"unknown-secret"}'),/private|bearer|unknown-secret/);assert.match(transcriptionError('{"error":"model_missing"}'),/audio:prepare/);});
