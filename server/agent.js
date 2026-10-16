import {randomUUID} from 'node:crypto';
import {normalize,demoProducts} from './catalog.js';
import {parseBeltRequest,productBeltSpec,calculateBeltQuote,formatBeltCalculation,mergeBeltRequest} from './belts.js';
const stopwords=new Set('a o os as de da do das dos em no na nos nas e um uma uns umas para por com sem quero queria preciso tem teria gostaria cotacao cotacoes cota cotar mim voce favor poderia poderiam orcamento orcar preco valor quanto custa sai manda enviar envia me pra pro favor bom boa dia tarde noite ola oi voces vc voce pode podem qual quais sao esta estao esse essa este aqui ai ver mais opcoes opcao modelo modelos comprar saber consegue conseguem arruma procura procurando estou buscando ve porfavor pfv jogo jogos unidade unidades aro medida medidas marca marcas meu minha carro'.split(' '));
const synonyms={correias:'correia',sincronizadoras:'sincronizadora',sincronizadas:'sincronizadora',sincronizada:'sincronizadora',dentadas:'sincronizadora',dentada:'sincronizadora',abertas:'aberta',industriais:'industrial',trapezoidais:'trapezoidal',pneus:'pneu',celulares:'celular',smartphones:'celular',smartphone:'celular',baterias:'bateria',pecas:'peca',rodas:'roda',pneuzinho:'pneu'};
function tokens(text){return normalize(text).match(/[a-z]+|\d+/g)||[];}
function near(a,b){if(a.length<5||b.length<5||Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(i<a.length||j<b.length?1:0)<=1;}
function meaningful(text){return tokens(text).map(t=>synonyms[t]||t).filter(t=>!stopwords.has(t)&&!['reais','real'].includes(t));}
export function searchProducts(products,query,{includeUnpriced=false,...pricingOptions}={}){
 const request=parseBeltRequest(query),s=request.reference;
 if(request.error)return [];
 let wanted=meaningful(s);
 const numbers=wanted.filter(t=>/^\d+$/.test(t));
 const brands=[...new Set(products.map(p=>normalize(p.brand)))];
 const requestedBrands=brands.filter(b=>s.includes(b));
 if(requestedBrands.length)wanted=wanted.filter(t=>!requestedBrands.some(b=>b.split(' ').includes(t)));
 const numericProfiles=[...s.matchAll(/(?:^|[^a-z0-9])(\d{1,2})[ -]*(vx?|l|p[jklm]|m)(?=[^a-z]|$)/g)];
 const codes=wanted.filter(t=>/^[a-z]{1,3}$/.test(t));
 const profiles=[...s.matchAll(/(?:^|\s)([a-z]{1,3})[\s-]*(\d{2,})(?=\D|$)/g)].filter(m=>!['r','ate','de'].includes(m[1]));
 const ranked=[];
 for(const product of products){
  if(!(product.quantity>0)||(includeUnpriced?product.price!==null:!(product.price>0)))continue;
  const calculation=calculateBeltQuote(product,request,pricingOptions);
  if(!calculation.ok&&!calculation.missing&&!calculation.review)continue;
  if(request.budget!==null&&calculation.ok&&!calculation.unpriced&&calculation.total>request.budget)continue;
  const spec=calculation.spec||productBeltSpec(product);
  const reference=spec.reference+' '+(product.sku?.startsWith('AUTO-')?'':normalize(product.sku));
  const words=tokens(reference+' '+product.brand).map(t=>synonyms[t]||t);
  const score=wanted.filter(t=>words.includes(t)||(t.length>3&&words.some(w=>w.startsWith(t)||t.startsWith(w)||near(t,w)))).length;
  const valid=numericProfiles.every(m=>new RegExp('(?:^|[^a-z0-9])'+m[1]+'[ -]*'+m[2]+'(?=[^a-z]|$)').test(reference))
   &&profiles.every(m=>new RegExp('(?:^|[^a-z])'+m[1]+'[ -]*'+m[2]+'(?:[^0-9]|$)').test(reference))
   &&codes.every(t=>words.includes(t))&&numbers.every(t=>words.includes(t))
   &&(!requestedBrands.length||requestedBrands.includes(normalize(product.brand)))
   &&(wanted.length?score>=Math.max(numbers.length,Math.ceil(wanted.length*.6)):requestedBrands.length>0);
  if(valid)ranked.push({product,score,price:calculation.total??product.price});
 }
 ranked.sort((a,b)=>b.score-a.score||a.price-b.price);
 const first=[],rest=[],seen=new Set();
 for(const {product} of ranked){const brand=normalize(product.brand);if(!seen.has(brand)){first.push(product);seen.add(brand);}else rest.push(product);}
 return [...first,...rest];
}
export const actionMore={id:'more',label:'Ver mais'},actionHuman={id:'human',label:'Falar com atendente'};
export function intent(text){const s=normalize(text);if(s==='human'||/\b(atendente|humano|pessoa|vendedor|vendedora|comercial|suporte)\b|nao (quero|queria) (um )?(bot|robo)|falar com alguem/.test(s))return'human';if(/^(?:tem |quero |me mostra |pode mostrar )?(?:em |de )?(?:outra|outras) marcas?[?!. ]*$/.test(s))return'more';if(s==='more'||/^(ver |quero |manda |me manda |mostrar |tem |pode mandar )?(mais|outras?)( (opcoes|marcas|produtos))?[!.? ]*$/.test(s))return'more';if(/^(oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|hello)[!.? ]*$/.test(s))return'greeting';if(/^(obrigad[oa]|valeu|vlw|agradeco|ok|certo|beleza|blz)[!.? ]*$/.test(s))return'thanks';return'quote';}
export function quoteReply(products,query,shown=[],options={}){
 const request=parseBeltRequest(query);
 if(request.error)return {body:request.error,actions:[actionHuman],ids:[]};
 if(!/\d/.test(request.reference))return {body:'Qual é o perfil e a referência da correia? Por exemplo: PJ 350, 5 frisos; A42 por peça; ou 1200 8M com a medida de corte em mm.',actions:[actionHuman],ids:[]};
 let matches=searchProducts(products,query,options);
 const missing=[...new Set(matches.map(p=>calculateBeltQuote(p,request,options).missing).filter(Boolean))];
 if(missing.length){
  const questions={ribs:'Quantos frisos ou canais você precisa em cada correia?',mm:'Qual é a largura de corte, em milímetros, para cada correia?',fixedWidth:'Qual é a largura da correia aberta em milímetros?',meters:'Qual é o comprimento desejado em metros para cada corte da correia aberta?'};
  return {body:questions[missing[0]]+' Assim calculo o valor usando a unidade correta do estoque.',actions:[actionHuman],ids:[],awaiting:missing[0]};
 }
 const review=matches.filter(p=>calculateBeltQuote(p,request,options).review);matches=matches.filter(p=>!calculateBeltQuote(p,request,options).review);
 if(!matches.length&&review.length)return {body:'Vou chamar um atendente para confirmar a base de preço e as medidas do estoque desta correia aberta antes de informar o valor.',actions:[],ids:[],needsHuman:true};
 const unique=[],seen=new Set();
 for(const p of matches){const q=calculateBeltQuote(p,request,options);const spec=q.spec;const key=JSON.stringify([normalize(p.brand),(spec.reference.match(/[a-z]+|\d+/g)||[]).join(' '),q.each,spec.unit]);if(!seen.has(key)){seen.add(key);unique.push(p);}}
 const remaining=unique.filter(p=>!shown.includes(p.id)),page=remaining.slice(0,5);
 if(!page.length&&!unique.length&&searchProducts(products,query,{...options,includeUnpriced:true}).length)return {body:'Encontrei essa referência em estoque, mas o preço está sob consulta. Vou chamar um atendente para confirmar o valor para você.',actions:[],ids:[],needsHuman:true};
 if(!page.length)return {body:unique.length?'Você já viu todas as opções disponíveis para essa busca. Quer cotar outra medida ou produto?':'Não encontrei opções com essa referência, medida e quantidade disponíveis para atender ao pedido. Pode confirmar os dados? Se preferir, chame um atendente.',actions:[actionHuman],ids:[]};
 let body=`${shown.length?'Aqui vão mais':'Encontrei'} ${page.length} ${page.length===1?'opção disponível':'opções disponíveis'} para você:\n\n`;
 body+=page.map((p,i)=>{const detail=formatBeltCalculation(p,request,calculateBeltQuote(p,request,options),options);return `${i+1}. *${p.brand}* · ${detail.description}\n   ${detail.line}`;}).join('\n\n');
 if(page.length<5)body+='\n\nEstas são todas as opções restantes em estoque para essa busca.';
 body+='\n\nQual opção te interessou? Preços, disponibilidade e possibilidade de corte sujeitos à confirmação; esta cotação não reserva estoque.';
 return {body,actions:[...(remaining.length>5?[actionMore]:[]),actionHuman],ids:page.map(p=>p.id)};
}
export class Agent {
 constructor(store,send){this.store=store;this.send=send;this.queues=new Map();}
 enqueue(key,fn){const next=(this.queues.get(key)||Promise.resolve()).catch(()=>{}).then(fn);this.queues.set(key,next);next.finally(()=>{if(this.queues.get(key)===next)this.queues.delete(key);}).catch(()=>{});return next;}
 receive(input){return this.enqueue(`${input.provider||'qr'}:${input.channel}:${input.phone}`,()=>this.process(input));}
 async process({phone,name,body,providerId,channel='whatsapp',provider='qr',isGroup=false,fromMe=false,isStatus=false,forceHuman=false}){
  if(isGroup||fromMe||isStatus||/@g\.us$|@broadcast$|@newsletter$/.test(phone))return{ignored:true};if(!body?.trim())return{ignored:true};if(providerId&&this.store.get('SELECT id FROM messages WHERE provider_id=?',providerId))return{duplicate:true};this.store.resumeExpired();
  let chat=this.store.get('SELECT * FROM chats WHERE phone=? AND channel=? AND provider=?',phone,channel,provider);const now=Date.now();if(!chat){const id=randomUUID();this.store.run('INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES(?,?,?,?,?,?,?)',id,phone,name||phone.replace(/@.*$/,''),channel,provider,now,now);chat=this.store.chat(id);}
  this.store.run('UPDATE chats SET unread=unread+1,last_inbound=? WHERE id=?',now,chat.id);this.store.addMessage({chatId:chat.id,providerId,direction:'in',body:body.trim()});const numberedSelection=!chat.pending_measure&&/^[1-5]$/.test(body.trim())&&(Array.isArray(chat.shown)?chat.shown:JSON.parse(chat.shown||'[]')).length>0;const selection=numberedSelection||chat.query&&/\b(quero|fico com|gostei|pode ser|vou levar)\b/.test(normalize(body))&&/\b(primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|quint[ao]|opcao [1-5])\b/.test(normalize(body));const type=forceHuman||selection?'human':intent(body);
  if(type==='human'){const already=!!chat.needs_human;this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);this.store.changed();if(!already&&chat.mode!=='manual'&&this.store.settings().agentEnabled)await this.reply(chat,'Claro! Avisei um atendente. A partir de agora, esta conversa fica com a nossa equipe. Assim que possível, alguém responde por aqui.',[]);return{chatId:chat.id,handoff:true};}
  if(chat.mode==='manual'||!this.store.settings().agentEnabled)return{chatId:chat.id,paused:true};let response;
  if(type==='greeting')response={body:`Olá! Bem-vindo à ${this.store.settings().businessName}. 👋\nMe diga o produto, modelo ou medida que você procura. Vou consultar o estoque e te mostrar até 5 opções de marcas e valores por vez.`,actions:[actionHuman]};
  else if(type==='thanks')response={body:'Por nada! Se precisar de outra cotação, é só me dizer o produto ou a medida. 😊',actions:[actionHuman]};
  else{const pricing=this.store.settings();
   if(channel==='whatsapp'&&pricing.priceMode==='unconfirmed'){this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);await this.reply(chat,'Vou chamar um atendente para confirmar os valores e preparar sua cotação.',[]);return{chatId:chat.id,handoff:true};}
   const baseProducts=channel==='simulator'&&!this.store.get('SELECT id FROM products LIMIT 1')?demoProducts:this.store.all('SELECT * FROM products');const products=baseProducts.map(p=>({...p,price:p.price===null?null:Math.round(p.price*(1+(pricing.priceMode==='cost'?pricing.markupPercent||0:0)/100)*100)/100}));let detail=body;if(chat.pending_measure&&/^\s*\d+(?:[.,]\d+)?\s*[.!?]?\s*$/.test(body)){const units={ribs:'frisos',mm:'mm',meters:'metros',fixedWidth:'mm'};if(units[chat.pending_measure])detail=body.replace(/[.!?]$/,'')+' '+units[chat.pending_measure];}let query=type==='more'?chat.query:detail;
   if(type==='quote'&&chat.query)query=mergeBeltRequest(chat.query,detail,[...new Set(products.map(p=>p.brand))]);
   if(type==='more'&&!query)response={body:'Qual produto, modelo ou medida você quer cotar? Assim eu encontro as opções certas para você.',actions:[actionHuman]};
   else if(channel==='whatsapp'&&!products.length){response={body:'Nosso estoque está sendo atualizado. Vou chamar um atendente para confirmar os preços e a disponibilidade para você.',actions:[]};this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);}
   else{response=quoteReply(products,query,type==='more'?JSON.parse(chat.shown||'[]'):[],{mmDimension:'width',openBeltPriceBasis:pricing.openBeltPriceBasis||'unconfirmed'});const shown=type==='more'?[...JSON.parse(chat.shown||'[]'),...response.ids]:response.ids;this.store.run('UPDATE chats SET query=?,shown=?,pending_measure=? WHERE id=?',query,JSON.stringify(shown),response.awaiting||null,chat.id);}
  }
  if(response.needsHuman)this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);
  if(this.store.chat(chat.id).mode==='manual'&&!response.needsHuman&&!response?.body?.includes('estoque está sendo atualizado'))return{chatId:chat.id,paused:true};await this.reply(chat,response.body,response.actions);return{chatId:chat.id};
 }
 async reply(chat,body,actions=[],direction='bot'){
  const message=this.store.addMessage({chatId:chat.id,direction,body,actions,status:'pending'});
  try{const providerId=chat.channel==='simulator'?null:await this.send(chat,body,actions);this.store.run("UPDATE messages SET status='sent',provider_id=? WHERE id=?",providerId||null,message.id);}catch(e){this.store.run("UPDATE messages SET status='failed',error=? WHERE id=?",String(e.message).slice(0,400),message.id);this.store.event('send_error','Uma mensagem não foi enviada. Verifique a conexão e o chat.');}this.store.changed();return this.store.get('SELECT * FROM messages WHERE id=?',message.id);
 }
}
