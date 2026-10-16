import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'cota-browser-'));
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3101',HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'production',WHATSAPP_AUTO_CONNECT:'false'},stdio:'inherit'});
function stop(){child.kill('SIGTERM');}
process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',code=>{rmSync(dir,{recursive:true,force:true});process.exit(code||0);});
