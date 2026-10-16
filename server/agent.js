import {randomUUID} from 'node:crypto';
import {normalize,demoProducts} from './catalog.js';
import {parseBeltRequest,productBeltSpec,calculateBeltQuote,formatBeltCalculation,mergeBeltRequest} from './belts.js';
import {classifyMessage,quoteSearchText} from './intents.js';
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
export function intent(text,context){return classifyMessage(text,context).type;}
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
 return {body,actions:[...(remaining.length>5?[actionMore]:[]),actionHuman],ids:page.map(p=>p.id),quotedOptions:page.map(p=>({id:p.id,brand:p.brand,...formatBeltCalculation(p,request,calculateBeltQuote(p,request,options),options)}))};
}
export class Agent {
 constructor(store,send){this.store=store;this.send=send;this.queues=new Map();}
 enqueue(key,fn){const next=(this.queues.get(key)||Promise.resolve()).catch(()=>{}).then(fn);this.queues.set(key,next);next.finally(()=>{if(this.queues.get(key)===next)this.queues.delete(key);}).catch(()=>{});return next;}
 receive(input){return this.enqueue(`${input.provider||'qr'}:${input.channel}:${input.phone}`,()=>this.process(input));}
 async process({phone,name,body,providerId,channel='whatsapp',provider='qr',isGroup=false,fromMe=false,isStatus=false,forceHuman=false}){
  if(isGroup||fromMe||isStatus||/@g\.us$|@broadcast$|@newsletter$/.test(phone))return{ignored:true};if(!body?.trim())return{ignored:true};if(providerId&&this.store.get('SELECT id FROM messages WHERE provider_id=?',providerId))return{duplicate:true};this.store.resumeExpired();
  let chat=this.store.get('SELECT * FROM chats WHERE phone=? AND channel=? AND provider=?',phone,channel,provider);const now=Date.now();if(!chat){const id=randomUUID();this.store.run('INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES(?,?,?,?,?,?,?)',id,phone,name||phone.replace(/@.*$/,''),channel,provider,now,now);chat=this.store.chat(id);}
  this.store.run('UPDATE chats SET unread=unread+1,last_inbound=? WHERE id=?',now,chat.id);this.store.addMessage({chatId:chat.id,providerId,direction:'in',body:body.trim()});
  const quotedOptions=JSON.parse(chat.quoted_options||'[]');
  const analysis=classifyMessage(body,{options:quotedOptions,pendingMeasure:chat.pending_measure,pendingSelection:chat.pending_selection});
  const type=forceHuman?'human':analysis.type;
  if(type==='human'||type==='purchase'){
   const already=!!chat.needs_human,purchase=type==='purchase',selected=quotedOptions[analysis.selectionIndex];
   const samePurchase=purchase&&!selected&&chat.handoff_reason==='purchase'&&!/\d/.test(parseBeltRequest(quoteSearchText(body)).reference);
   const summary=purchase?(selected?`Opção ${analysis.selectionIndex+1}: ${selected.brand} · ${selected.description}\nCotação de referência: ${selected.line}\nSolicitação do cliente: ${body.trim()}`:samePurchase?chat.purchase_summary:`Mensagem do cliente: ${body.trim()}${chat.query?`\nÚltima cotação (referência): ${chat.query}`:''}`):chat.purchase_summary;
   this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1,handoff_reason=?,purchase_summary=?,pending_selection=NULL WHERE id=?",purchase?'purchase':chat.handoff_reason||'human',summary||null,chat.id);this.store.changed();
   if(!already&&chat.mode!=='manual'&&this.store.settings().agentEnabled){
    const reply=purchase?`Entendi que você quer fechar uma compra.${selected?`\nInteresse na opção ${analysis.selectionIndex+1}: *${selected.brand}* · ${selected.description}.`:''}\nAvisei nossa equipe para confirmar os itens, as medidas, a disponibilidade e as condições de pagamento com você. O pedido ainda não está confirmado e o estoque não foi reservado.`:'Claro! Avisei um atendente. A partir de agora, esta conversa fica com a nossa equipe. Assim que possível, alguém responde por aqui.';
    await this.reply(chat,reply,[]);
   }
   return{chatId:chat.id,handoff:true,intent:type};
  }
  if(chat.mode==='manual'||!this.store.settings().agentEnabled)return{chatId:chat.id,paused:true};let response;
  if(type==='clarify'){
   const valid=analysis.selectionIndex!==null&&quotedOptions[analysis.selectionIndex];
   this.store.run('UPDATE chats SET pending_selection=? WHERE id=?',valid?analysis.selectionIndex:null,chat.id);
   response={body:analysis.selectionIndex!==null&&!valid?'Essa opção não está na última cotação. Informe a referência da correia ou escolha uma das opções que acabei de mostrar.':`Você quer apenas cotar ou consultar mais detalhes${valid?` da opção ${analysis.selectionIndex+1} (${valid.brand})`:''}, ou já quer fechar o pedido? Responda *COTAR* ou *FECHAR PEDIDO*.`,actions:[actionHuman]};
  }
  else if(type==='greeting')response={body:`Olá! Bem-vindo à ${this.store.settings().businessName}. 👋\nMe diga o produto, modelo ou medida que você procura. Vou consultar o estoque e te mostrar até 5 opções de marcas e valores por vez.`,actions:[actionHuman]};
  else if(type==='thanks')response={body:'Por nada! Se precisar de outra cotação, é só me dizer o produto ou a medida. 😊',actions:[actionHuman]};
  else{const pricing=this.store.settings();
   if(channel==='whatsapp'&&pricing.priceMode==='unconfirmed'){this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);await this.reply(chat,'Vou chamar um atendente para confirmar os valores e preparar sua cotação.',[]);return{chatId:chat.id,handoff:true};}
   const baseProducts=channel==='simulator'&&!this.store.get('SELECT id FROM products LIMIT 1')?demoProducts:this.store.all('SELECT * FROM products');const products=baseProducts.map(p=>({...p,price:p.price===null?null:Math.round(p.price*(1+(pricing.priceMode==='cost'?pricing.markupPercent||0:0)/100)*100)/100}));let detail=quoteSearchText(body);if(chat.pending_measure&&/^\s*\d+(?:[.,]\d+)?\s*[.!?]?\s*$/.test(body)){const units={ribs:'frisos',mm:'mm',meters:'metros',fixedWidth:'mm'};if(units[chat.pending_measure])detail=body.replace(/[.!?]$/,'')+' '+units[chat.pending_measure];}let query=type==='more'?chat.query:detail;
   const selectedIndex=analysis.selectionIndex??(type==='quote'&&!/\d/.test(parseBeltRequest(detail).reference)?chat.pending_selection:null);
   const selected=type==='quote'&&selectedIndex!==null?quotedOptions[selectedIndex]:null;
   if(type==='quote'&&chat.query){
    const request=parseBeltRequest(detail);
    const hasDetails=request.ribs!==null||request.mm!==null||request.meters!==null||request.hasPieces||request.budget!==null;
    const hasReference=meaningful(request.reference).some(word=>!['correia','industrial'].includes(word));
    query=hasDetails||hasReference?mergeBeltRequest(chat.query,detail,[...new Set(products.map(p=>p.brand))]):chat.query;
   }
   if(type==='quote'&&analysis.selectionIndex!==null&&!selected){response={body:'Essa opção não está na última cotação. Confirme a referência ou escolha uma das opções disponíveis.',actions:[actionHuman]};}
   else if(selected&&!products.some(p=>p.id===selected.id))response={body:'O estoque mudou desde essa cotação. Vou chamar um atendente para conferir a opção escolhida e o preço atual.',actions:[],needsHuman:true};
   else if(type==='more'&&!query)response={body:'Qual produto, modelo ou medida você quer cotar? Assim eu encontro as opções certas para você.',actions:[actionHuman]};
   else if(channel==='whatsapp'&&!products.length){response={body:'Nosso estoque está sendo atualizado. Vou chamar um atendente para confirmar os preços e a disponibilidade para você.',actions:[]};this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);}
   else{response=quoteReply(selected?products.filter(p=>p.id===selected.id):products,query,type==='more'?JSON.parse(chat.shown||'[]'):[],{mmDimension:'width',openBeltPriceBasis:pricing.openBeltPriceBasis||'unconfirmed'});const shown=type==='more'?[...JSON.parse(chat.shown||'[]'),...response.ids]:response.ids;this.store.run('UPDATE chats SET query=?,shown=?,pending_measure=?,quoted_options=?,pending_selection=NULL WHERE id=?',query,JSON.stringify(shown),response.awaiting||null,JSON.stringify(response.quotedOptions||[]),chat.id);}
  }
  if(response.needsHuman)this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);
  if(this.store.chat(chat.id).mode==='manual'&&!response.needsHuman&&!response?.body?.includes('estoque está sendo atualizado'))return{chatId:chat.id,paused:true};await this.reply(chat,response.body,response.actions);return{chatId:chat.id,intent:type};
 }
 async reply(chat,body,actions=[],direction='bot'){
  const message=this.store.addMessage({chatId:chat.id,direction,body,actions,status:'pending'});
  try{const providerId=chat.channel==='simulator'?null:await this.send(chat,body,actions);this.store.run("UPDATE messages SET status='sent',provider_id=? WHERE id=?",providerId||null,message.id);}catch(e){this.store.run("UPDATE messages SET status='failed',error=? WHERE id=?",String(e.message).slice(0,400),message.id);this.store.event('send_error','Uma mensagem não foi enviada. Verifique a conexão e o chat.');}this.store.changed();return this.store.get('SELECT * FROM messages WHERE id=?',message.id);
 }
}
