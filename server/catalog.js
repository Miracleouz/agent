import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { randomUUID,createHash } from 'node:crypto';
export const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const aliases={sku:['sku','codigo','cod','referencia','ref','id'],name:['produto','nome','descricao','descricao padronizada','item','product','product name','modelo'],brand:['marca','fabricante','brand'],variant:['medida','variacao','variante','tamanho','especificacao','dimensao','size'],price:['preco','valor','preco venda','preco de venda','valor venda','venda','price','valor unitario','preco unitario','valor unitario original r'],quantity:['quantidade','qtd','qtde','estoque','saldo','disponivel','stock','quantidade total'],unit:['unidade','unidade de medida','un','unit']};
const header=s=>normalize(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function number(value){if(typeof value==='number')return value;let s=String(value??'').replace(/R\$|\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');if(s.endsWith('.'))s+='0';return /^\d+(\.\d+)?$/.test(s)?Number(s):NaN;}
const cell=value=>value&&typeof value==='object'?(value.result??value.text??value.richText?.map(t=>t.text).join('')??''):(value??'');
export async function readRows(buffer,filename='stock.csv'){
 if(buffer.length>8*1024*1024)throw new Error('O arquivo deve ter até 8 MB.');
 if(/\.xlsx$/i.test(filename)){const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);if(!workbook.worksheets.length)throw new Error('A planilha não contém abas.');const rows=[];workbook.worksheets[0].eachRow({includeEmpty:true},row=>{rows.push(Array.from({length:Math.max(row.cellCount,1)},(_,i)=>cell(row.getCell(i+1).value)));});return rows;}
 if(!/\.csv$/i.test(filename))throw new Error('Use um arquivo CSV ou Excel (.xlsx).');
 const text=buffer.toString('utf8').replace(/^\uFEFF/,'');if(/<html|<!doctype/i.test(text.slice(0,300)))throw new Error('O Google retornou uma página de acesso, não uma planilha pública.');
 const first=text.split(/\r?\n/)[0],delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 return parse(text,{delimiter,skip_empty_lines:true,relax_column_count:true,trim:true,bom:true});
}
export function validateRows(rows){
 const headerIndex=rows.findIndex(row=>row.some(v=>aliases.name.includes(header(v)))&&row.some(v=>aliases.price.includes(header(v))));
 if(headerIndex<0)throw new Error('Cabeçalhos não reconhecidos. Use: produto, marca, preço e quantidade. Opcionais: sku, medida.');
 const columns={};for(const[key,names]of Object.entries(aliases))columns[key]=rows[headerIndex].findIndex(v=>names.includes(header(v)));
 if(['name','brand','price','quantity'].some(key=>columns[key]<0))throw new Error('Colunas obrigatórias: produto, marca, preço e quantidade. Baixe o modelo no painel.');
 const items=[],errors=[],skus=new Set(),generated=new Map();
 for(let i=headerIndex+1;i<rows.length;i++){
  const row=rows[i];if(!row.some(v=>String(v??'').trim()))continue;const get=key=>String(row[columns[key]]??'').trim();
  const p={sku:get('sku'),name:get('name'),brand:get('brand'),variant:get('variant'),price:get('price')===''||number(row[columns.price])===0?null:number(row[columns.price]),quantity:number(row[columns.quantity]),unit:get('unit')||'unidade'};
  if(!p.name||!p.brand||(p.price!==null&&(!Number.isFinite(p.price)||p.price<0))||!Number.isFinite(p.quantity)||p.quantity<0||p.quantity>1e12){errors.push(`Linha ${i+1}: produto/marca obrigatórios, preço válido e quantidade a partir de zero.`);continue;}
  if([p.name,p.brand,p.variant,p.sku,p.unit].some(s=>s.length>250)){errors.push(`Linha ${i+1}: texto maior que 250 caracteres.`);continue;}
  if(!p.sku){const key=JSON.stringify([normalize(p.name),normalize(p.brand),normalize(p.variant),normalize(p.unit),p.price]);if(generated.has(key)){generated.get(key).quantity=Math.round((generated.get(key).quantity+p.quantity)*1e6)/1e6;continue;}p.sku='AUTO-'+createHash('sha256').update(key).digest('hex').slice(0,14).toUpperCase();generated.set(key,p);}
  if(skus.has(normalize(p.sku))){errors.push(`Linha ${i+1}: código repetido (${p.sku}).`);continue;}skus.add(normalize(p.sku));items.push(p);
 }
 if(errors.length)throw new Error(errors.slice(0,8).join('\n')+(errors.length>8?`\nMais ${errors.length-8} erros.`:''));
 if(!items.length)throw new Error('Nenhum produto válido. O estoque atual foi preservado.');if(items.length>100000)throw new Error('O limite por importação é de 100.000 produtos.');return items;
}
export function replaceCatalog(store,items,source){
 const now=Date.now();store.transaction(()=>{store.run('DELETE FROM products');for(const p of items)store.run('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),p.sku,p.name,p.brand,p.variant,p.price,p.quantity,p.unit||'unidade',now);store.run('INSERT INTO imports VALUES(?,?,?,?)',randomUUID(),source,items.length,now);store.run("UPDATE chats SET shown='[]'");});store.event('stock',`${items.length} produtos importados de ${source}`);return items.length;
}
export function sheetExport(url){
 let u;try{u=new URL(url);}catch{throw new Error('Informe um link válido do Google Sheets.');}if(u.protocol!=='https:'||u.hostname!=='docs.google.com')throw new Error('Use um link HTTPS de docs.google.com/spreadsheets.');
 const match=u.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)\//);if(!match)throw new Error('Link de planilha inválido.');const gid=u.searchParams.get('gid')||new URLSearchParams(u.hash.slice(1)).get('gid');if(gid!==null&&!/^\d+$/.test(gid))throw new Error('A aba da planilha é inválida.');return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid===null?'':'&gid='+gid}`;
}
export async function fetchSheet(url){
 const response=await fetch(sheetExport(url),{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error(`Não foi possível ler a planilha (HTTP ${response.status}). Compartilhe como "Qualquer pessoa com o link — Leitor" ou importe CSV/Excel.`);
 const reader=response.body.getReader();let size=0;const chunks=[];while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw new Error('A planilha excede 8 MB.');}chunks.push(value);}return validateRows(await readRows(Buffer.concat(chunks),'stock.csv'));
}
export const demoProducts=['Gates','Continental','Optibelt','Megadyne','Bando','Mitsuboshi','Dunlop','Dayco'].map((brand,i)=>({id:`demo-${i}`,sku:`EX-${i}`,name:'Correia industrial em V',brand,variant:'A-42',price:39.9+i*7,quantity:12-i,unit:'Peça (PC)'}));
