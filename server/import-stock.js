import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {EnvHttpProxyAgent,setGlobalDispatcher} from 'undici';
import {Store} from './db.js';
import {fetchSheet,readRows,validateRows,replaceCatalog} from './catalog.js';
setGlobalDispatcher(new EnvHttpProxyAgent());
const store=new Store(join(resolve(process.env.DATA_DIR||'./data'),'cota.sqlite'));
try{
 const file=process.argv[2];
 const items=file?validateRows(await readRows(await readFile(file),file)):await fetchSheet(store.settings().sheetUrl);
 const count=replaceCatalog(store,items,file?'Arquivo local':'Google Sheets');
 if(!file)store.setSettings({lastSync:Date.now()});
 console.log(`${count} produtos importados; ${items.filter(p=>p.price===null).length} sem preço (sob consulta).`);
}finally{store.close();}
