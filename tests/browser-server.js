import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {Store} from '../server/db.js';
const dir=mkdtempSync(join(tmpdir(),'cota-browser-'));
const seed=new Store(join(dir,'cota.sqlite'));seed.addGroupMessage({id:'123456@g.us',name:'Grupo simulado de teste',providerId:'browser-group-fixture',author:'Participante de teste',body:'Mensagem de grupo para consulta',created:Date.now()});seed.close();
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3101',HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'production',WHATSAPP_AUTO_CONNECT:'false'},stdio:'inherit'});
function stop(){child.kill('SIGTERM');}
process.on('SIGTERM',stop);process.on('SIGINT',stop);child.on('exit',code=>{rmSync(dir,{recursive:true,force:true});process.exit(code||0);});
