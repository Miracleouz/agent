import {audioQuotationAnalysis} from './audio-quotation.js';
import {randomUUID} from 'node:crypto';
import {normalize,demoProducts,mentionsBrand} from './catalog.js';
import {parseBeltRequest,productBeltSpec,calculateBeltQuote,formatBeltCalculation,mergeBeltRequest} from './belts.js';
import {classifyMessage,quoteSearchText,conversationText} from './intents.js';
import {Followups} from './followups.js';
import {splitBeltRequests} from './requests.js';
import {helpActions,helpChoice,deliveryMethod,deliveryLabels,pickupQuestion,isPickupDetails,pickupQuoteText} from './conversation.js';
export const introduction='Olá, sou o agente ROBINHO, vou te ajudar no atendimento nesse momento';
const stopwords=new Set('a o os as de da do das dos em no na nos nas e um uma uns umas para por com sem quero queria preciso tem teria gostaria cotacao cotacoes cota cotar mim voce favor poderia poderiam orcamento orcar preco valor quanto custa sai manda enviar envia me pra pro favor bom boa dia tarde noite ola oi voces vc voce pode podem qual quais sao esta estao esse essa este aqui ai ver mais opcoes opcao modelo modelos comprar saber consegue conseguem arruma procura procurando estou buscando ve porfavor pfv jogo jogos unidade unidades aro medida medidas marca marcas meu minha carro'.split(' '));
const synonyms={sincr:'sincronizadora',sinc:'sincronizadora',sincron:'sincronizadora',sincrona:'sincronizadora',sincronas:'sincronizadora',correias:'correia',sincronizadoras:'sincronizadora',sincronizadas:'sincronizadora',sincronizada:'sincronizadora',dentadas:'sincronizadora',dentada:'sincronizadora',abertas:'aberta',industriais:'industrial',trapezoidais:'trapezoidal',pneus:'pneu',celulares:'celular',smartphones:'celular',smartphone:'celular',baterias:'bateria',pecas:'peca',rodas:'roda',pneuzinho:'pneu'};
function tokens(text){return normalize(text).match(/[a-z]+|\d+/g)||[];}
function near(a,b){if(a.length<5||b.length<5||Math.abs(a.length-b.length)>1)return false;let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(i<a.length||j<b.length?1:0)<=1;}
function meaningful(text){return tokens(text).map(t=>synonyms[t]||t).filter(t=>!stopwords.has(t)&&!['reais','real'].includes(t));}
export function searchProducts(products,query,{includeUnpriced=false,...pricingOptions}={}){
 const request=parseBeltRequest(query),s=request.reference;
 if(request.error)return [];
 let wanted=meaningful(s);
 const numbers=wanted.filter(t=>/^\d+$/.test(t));
 const brands=[...new Set(products.map(p=>normalize(p.brand)))];
 const requestedBrands=brands.filter(b=>mentionsBrand(s,b));
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
  const reference=spec.reference;
  const words=tokens(reference+' '+product.brand+' '+(product.sku?.startsWith('AUTO-')?'':normalize(product.sku))).map(t=>synonyms[t]||t);
  const score=wanted.filter(t=>words.includes(t)||(t.length>3&&words.some(w=>w.startsWith(t)||t.startsWith(w)||near(t,w)))).length;
  const valid=numericProfiles.every(m=>new RegExp('(?:^|[^a-z0-9])'+m[1]+'[ -]*'+m[2]+'(?=[^a-z]|$)').test(reference))
   &&profiles.every(m=>new RegExp('(?:^|[^a-z])'+m[1]+'[ -]*'+m[2]+'(?:[^0-9]|$)').test(reference))
   &&codes.every(t=>words.includes(t))&&numbers.every(t=>words.includes(t))
   &&(!requestedBrands.length||requestedBrands.includes(normalize(product.brand)))
   &&(wanted.length?score>=Math.max(numbers.length,Math.ceil(wanted.length*.6)):requestedBrands.length>0);
  if(valid)ranked.push({product,score,price:calculation.total??product.price});
 }
 ranked.sort((a,b)=>b.score-a.score||a.price-b.price);
 if(request.ribs!==null&&/\b(?:dpk|pk)[ -]*\d/.test(s)){
  const ordered=[],remaining=[...ranked],seenBrands=new Set(),seenUnits=new Set();
  while(remaining.length){
   const fresh=remaining.filter(item=>!seenBrands.has(normalize(item.product.brand)));
   const candidates=fresh.length?fresh:remaining;
   const pick=candidates.find(item=>!seenUnits.has(productBeltSpec(item.product).unit))||candidates[0];
   ordered.push(pick.product);seenBrands.add(normalize(pick.product.brand));seenUnits.add(productBeltSpec(pick.product).unit);remaining.splice(remaining.indexOf(pick),1);
  }
  return ordered;
 }
 const first=[],rest=[],seen=new Set();
 for(const {product} of ranked){const brand=normalize(product.brand);if(!seen.has(brand)){first.push(product);seen.add(brand);}else rest.push(product);}
 return [...first,...rest];
}
export function isBeltQuotation(body,chat={}){
 const text=conversationText(body);
 if(/^(?:ainda )?(?:estou )?aguardando(?: (?:a |o )?(?:cotacao|orcamento|valores|precos))?[.!? ]*$/.test(text))return true;
 if(/\b(?:correias?|corr|coreias?|sincronizadoras?|sincron|sincr|dentadas?|trapezoidais|frisos?|canais)\b/.test(text))return true;
 if(/\b(?:\d{0,2}\s*(?:dp[jklm]|p[jklmh]|sp[azbc]|xp[azbc]|[azbcde]|[358]v[x]?|[245]l|at|t|htd|std|rpp|xl|xxl|l|h|xh|xxh))[- /]*\d+\b|\b\d{2,6}[- /]+(?:[sd]?\d+m|xl|xxl|xh|xxh|l|h)\b/.test(text))return true;
 if(chat.query&&(chat.pending_measure||chat.quoted_options!=='[]')&&/^(?:\d+(?:[.,]\d+)?\s*(?:mm|milimetros?|m|mt|mts|metros?|frisos?|canais|pecas?|unidades?)?\s*)[.!?]*$/.test(text))return true;
 if(chat.query&&/\b(?:gates|continental|optibelt|dayco|megadyne|goodyear|continental|pix|desconto|pagamento|largura|comprimento|marca)\b/.test(text)&&text.split(/\s+/).length<=12)return true;
 return /^(?:(?:oi|ola|bom dia|boa tarde|boa noite|quero|queria|preciso|pode|podem|consegue|me|por|favor|gentileza|uma|um|a|o|de|fazer|manda|passa|saber|ver|cotar|cotacao|orcamento|orcar|preco|valor|valores|precos|quanto|custa|fica|sai)[ ,.!?]*)+$/.test(text);
}
export const actionMore={id:'more',label:'Ver mais'},actionHuman={id:'human',label:'Falar com atendente'};
export function intent(text,context){return classifyMessage(text,context).type;}
export function quoteReply(products,query,shown=[],options={}){
 const items=splitBeltRequests(query);
 if(items.length>1)return quoteBatchReply(products,items,shown,options);
 const request=parseBeltRequest(query);
 if(request.error)return {body:request.error,actions:[actionHuman],ids:[]};
 if(!/\d/.test(request.reference))return {body:'Qual é o perfil e a referência da correia? Por exemplo: PJ 350, 5 frisos; A42 por peça; ou 1200 8M com a medida de corte em mm.',actions:[actionHuman],ids:[]};
 let matches=searchProducts(products,query,options);
 const missing=[...new Set(matches.map(p=>calculateBeltQuote(p,request,options).missing).filter(Boolean))];
 const questions={ribs:'Quantos frisos ou canais você precisa em cada correia?',mm:'Qual é a largura de corte, em milímetros, para cada correia?',fixedWidth:'Qual é a largura da correia aberta em milímetros?',meters:'Qual é o comprimento desejado em metros para cada corte da correia aberta?'};
 if(missing.length&&!matches.some(p=>calculateBeltQuote(p,request,options).ok)){
  return {body:questions[missing[0]]+' Assim calculo o valor usando a unidade correta do estoque.',actions:[actionHuman],ids:[],awaiting:missing[0]};
 }
 matches=matches.filter(p=>!calculateBeltQuote(p,request,options).missing);
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
 if(missing.length)body+='\n\nTambém há opções por corte que precisam de medidas. Para cotar essas opções: '+questions[missing[0]];
 body+='\n\nQual opção te interessou? Preços, disponibilidade e possibilidade de corte sujeitos à confirmação; esta cotação não reserva estoque.';
 return {body,actions:[...(remaining.length>5?[actionMore]:[]),actionHuman],ids:page.map(p=>p.id),quotedOptions:page.map(p=>({id:p.id,brand:p.brand,...formatBeltCalculation(p,request,calculateBeltQuote(p,request,options),options)}))};
}
function quoteBatchReply(products,items,shown,options){
 if(items.length>10)return {body:`Recebi ${items.length} referências. Envie até 10 itens por mensagem para eu conferir todas as medidas e opções sem deixar itens de fora.`,actions:[actionHuman],ids:[],batchQueries:[]};
 const results=items.map(item=>quoteReply(products,item,shown,options));
 const quotedOptions=[],ids=[],sections=[];
 for(const [itemIndex,result] of results.entries()){
  const offset=quotedOptions.length;
  const text=result.body.replace(/^([1-5])\. \*/gm,(_all,n)=>`${offset+Number(n)}. *`).replace(/\n\nQual opção te interessou\?[\s\S]*$/,'');
  sections.push(`*Item ${itemIndex+1} · ${parseBeltRequest(items[itemIndex]).reference.toUpperCase()}*\n${text}`);
  quotedOptions.push(...(result.quotedOptions||[]).map(option=>({...option,itemIndex,itemQuery:items[itemIndex]})));
  ids.push(...result.ids);
 }
 const pendingItemIndex=results.findIndex(result=>result.awaiting),needsHuman=results.some(result=>result.needsHuman);
 return {body:`Cotação dos ${items.length} itens solicitados:\n\n${sections.join('\n\n──────────\n\n')}\n\n${pendingItemIndex>=0?`Para completar o item ${pendingItemIndex+1}, responda à pergunta de medida acima.`:'Qual opção de cada item te interessou? Esta cotação não reserva estoque; a equipe confirma disponibilidade e cortes.'}`,actions:[...(results.some(result=>result.actions?.some(action=>action.id==='more'))?[actionMore]:[]),actionHuman],ids:[...new Set(ids)],quotedOptions,batchQueries:items,pendingItemIndex:pendingItemIndex>=0?pendingItemIndex:null,awaiting:pendingItemIndex>=0?results[pendingItemIndex].awaiting:null,needsHuman};
}
export class Agent {
 constructor(store,send,options={}){this.store=store;this.send=send;this.now=options.now||Date.now;this.queues=new Map();this.followups=new Followups(this,options);}
 enqueue(key,fn){const next=(this.queues.get(key)||Promise.resolve()).catch(()=>{}).then(fn);this.queues.set(key,next);next.finally(()=>{if(this.queues.get(key)===next)this.queues.delete(key);}).catch(()=>{});return next;}
 receive(input){
  input={...input,channel:input.channel||'whatsapp',provider:input.provider||'qr'};
  if(input.channel==='whatsapp'&&!/^\d+@(c\.us|lid|s\.whatsapp\.net)$/.test(input.phone)||input.channel==='simulator'&&!/^demo-[a-zA-Z0-9-]{1,50}$/.test(input.phone)||!['whatsapp','simulator'].includes(input.channel))return Promise.resolve({ignored:true});
  // Cancel a pending reminder as soon as a valid inbound message enters the queue.
  if(input.body?.trim()&&!input.isGroup&&!input.fromMe&&!input.isStatus&&!/@g\.us$|@broadcast$|@newsletter$/.test(input.phone)&&!(input.providerId&&this.store.get('SELECT id FROM messages WHERE provider_id=?',input.providerId))){
   const chat=this.store.get('SELECT id FROM chats WHERE phone=? AND channel=? AND provider=?',input.phone,input.channel||'whatsapp',input.provider||'qr');
   if(chat)this.store.cancelFollowups(chat.id,{keepMenu:true,keepDelivery:true});
  }
  return this.enqueue(`${input.provider||'qr'}:${input.channel}:${input.phone}`,async()=>{const result=await this.process(input);if(result.chatId&&!result.closed&&!result.duplicate&&!result.ignored&&!result.deferred&&!result.read&&result.intent!=='out_of_scope')this.followups.schedule(result.chatId);return result;});
 }
 async process({phone,name,body,providerId,channel='whatsapp',provider='qr',isGroup=false,fromMe=false,isStatus=false,forceHuman=false,liveVerified=false,deferAudio=false,alreadyRead=false,canRespond=null,contextBody=null,unreadBatchIds=null,receivedTimestamp=null}){
  if(isGroup||fromMe||isStatus||/@g\.us$|@broadcast$|@newsletter$/.test(phone))return{ignored:true};if(!body?.trim())return{ignored:true};if(canRespond&&await canRespond()!==true)return{ignored:true};const imported=providerId&&this.store.get('SELECT *,rowid sequence FROM messages WHERE provider_id=?',providerId);
  if(imported&&!(liveVerified===true&&channel==='whatsapp'&&provider==='qr'&&imported.status==='imported'&&imported.direction==='in'&&imported.inbound_verified===0&&this.store.get('SELECT id FROM chats WHERE id=? AND phone=? AND channel=? AND provider=?',imported.chat_id,phone,channel,provider)))return{duplicate:true};this.store.resumeExpired();
  let chat=this.store.get('SELECT * FROM chats WHERE phone=? AND channel=? AND provider=?',phone,channel,provider);const now=this.now();if(!chat){const id=randomUUID();this.store.run('INSERT INTO chats(id,phone,name,channel,provider,updated,last_inbound) VALUES(?,?,?,?,?,?,?)',id,phone,name||phone.replace(/@.*$/,''),channel,provider,now,now);chat=this.store.chat(id);}
  // A resume/release is permission for the NEXT request, never for an old row
  // promoted by synchronization. Keep suppressed events visible as history.
  // Same-second timestamps alone cannot distinguish new traffic. A new row
  // PLUS the verified live event can; rows already known at resume stay blocked.
  const newLiveSnapshot=imported&&!canRespond&&liveVerified&&Number.isFinite(receivedTimestamp)&&receivedTimestamp>=Math.floor(chat.auto_reply_after/1000)&&imported.sequence>chat.auto_reply_sequence;
  if(chat.auto_reply_after>0&&(imported&&imported.created<=chat.auto_reply_after&&!newLiveSnapshot||Number.isFinite(receivedTimestamp)&&receivedTimestamp<Math.floor(chat.auto_reply_after/1000))){
   if(!imported){const row=this.store.addMessage({chatId:chat.id,providerId,direction:'in',body:body.trim(),status:'imported'});this.store.run('UPDATE messages SET created=? WHERE id=?',receivedTimestamp*1000,row.id);}
   return{chatId:chat.id,ignored:true};
  }
  this.store.run('UPDATE chats SET unread=unread+?,last_inbound=? WHERE id=?',alreadyRead?0:1,now,chat.id);const inbound=imported||this.store.addMessage({chatId:chat.id,providerId,direction:'in',body:body.trim()});
  if(imported){this.store.run("UPDATE messages SET body=?,status='received',created=? WHERE id=?",body.trim(),canRespond?imported.created:now,inbound.id);this.store.run('UPDATE chats SET updated=? WHERE id=?',now,chat.id);}
  this.store.run('UPDATE messages SET inbound_verified=1 WHERE id=?',inbound.id);if(imported)this.store.changed();
  this.store.cancelFollowups(chat.id,{keepDelivery:true});
  if(unreadBatchIds)for(const id of unreadBatchIds)this.store.run("UPDATE messages SET inbound_verified=1 WHERE id=? AND chat_id=? AND direction='in' AND status='imported'",id,chat.id);
  if(alreadyRead){this.store.changed();return{chatId:chat.id,read:true};}
  if(deferAudio){this.store.run('UPDATE chats SET audio_pending_quote=NULL WHERE id=?',chat.id);this.store.run('UPDATE messages SET audio_agent_state=?,audio_routing_version=? WHERE id=?',chat.mode==='auto'&&this.store.settings().agentEnabled?'pending':'skipped',chat.routing_version,inbound.id);this.store.changed();return{chatId:chat.id,deferred:true};}
  return this.respondToMessage(chat,inbound,contextBody||body,forceHuman,channel,now);
 }
 finishAudio(id){
  const row=this.store.get('SELECT * FROM messages WHERE id=?',id);if(!row)return Promise.resolve({ignored:true});const chat=this.store.chat(row.chat_id);if(!chat)return Promise.resolve({ignored:true});
  return this.enqueue(`${chat.provider||'qr'}:${chat.channel}:${chat.phone}`,async()=>{
   const live=this.store.chat(chat.id),message=this.store.get('SELECT * FROM messages WHERE id=?',id),latest=this.store.get("SELECT id FROM messages WHERE chat_id=? AND direction='in' AND inbound_verified=1 ORDER BY rowid DESC LIMIT 1",chat.id);
   if(message?.audio_agent_state!=='pending')return{ignored:true};
   const eligible=!message.deleted_at&&message.inbound_verified===1&&live.mode==='auto'&&live.routing_version===message.audio_routing_version&&this.store.settings().agentEnabled&&latest?.id===id&&!(live.closed_at>message.created);
   this.store.run('UPDATE messages SET audio_agent_state=? WHERE id=?',eligible?'interpreted':'skipped',id);this.store.changed();if(!eligible)return{ignored:true};
   if(!message.transcript?.trim()){this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1,handoff_reason='human' WHERE id=?",chat.id);this.store.changed();return{chatId:chat.id,paused:true};}
   const original=message.transcript.trim(),kind=classifyMessage(original).type;
   const analysis=kind==='quote'&&!live.pickup_pending_details&&!deliveryMethod(original)?audioQuotationAnalysis(original,{uncertain:message.transcription_uncertain===1}):{body:original};
   if(kind==='quote'&&message.transcription_uncertain===1&&!live.pickup_pending_details&&!deliveryMethod(original)&&!isBeltQuotation(analysis.body,live)){
    this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1,handoff_reason='audio_unclear' WHERE id=?",live.id);this.store.changed();return{chatId:live.id,paused:true};
   }
   const result=await this.respondToMessage(live,message,analysis.body,!message.transcript,live.channel,this.now(),{audioConfirmation:analysis.confirmation});if(!result.closed&&!result.paused&&result.intent!=='out_of_scope')this.followups.schedule(chat.id);return result;
  });
 }
 async respondToMessage(chat,inbound,body,forceHuman,channel,now,{audioConfirmation=false}={}){
  let rejectedAudio=false;
  if(chat.audio_pending_quote){
   const pending=JSON.parse(chat.audio_pending_quote),answer=conversationText(body).replace(/[.!?]+$/,'').trim();
   this.store.run('UPDATE chats SET audio_pending_quote=NULL WHERE id=?',chat.id);
   if(pending.version===chat.routing_version&&chat.mode==='auto'&&this.store.settings().agentEnabled){
    if(/^(?:sim|isso|isso mesmo|correto|correta|exato|exatamente|confirmo|pode cotar)$/.test(answer))body=pending.query;
    else if(/^(?:nao|nao e isso|errado|errada)$/.test(answer)){rejectedAudio=true;body='cotar correia';}
   }
  }
  const quotedOptions=JSON.parse(chat.quoted_options||'[]');
  const analysis=classifyMessage(body,{options:quotedOptions,pendingMeasure:chat.pending_measure,pendingSelection:chat.pending_selection});
  const type=forceHuman?'human':analysis.type;
  if(type==='quote'&&analysis.selectionIndex===null&&!isBeltQuotation(body,chat)&&!deliveryMethod(body,{menu:chat.delivery_menu===1})&&!(chat.help_state==='asked'&&helpChoice(body)!==null)&&!chat.pickup_pending_details){this.store.changed();return{chatId:chat.id,intent:'out_of_scope'};}
  const help=chat.help_state==='asked'?helpChoice(body):null;
  if(chat.closed_at&&(type==='thanks'||helpChoice(body)!==null||/^[123][.!? ]*$/.test(body)))return{chatId:chat.id,closed:true,intent:type};
  if(!chat.service_origin_id||chat.closed_at)this.store.run('UPDATE chats SET service_origin_id=? WHERE id=?',inbound.id,chat.id);
  function clearQuote(store,id){store.run("UPDATE chats SET query=NULL,shown='[]',quoted_options='[]',batch_queries='[]',pending_item_index=NULL,pending_measure=NULL,pending_selection=NULL WHERE id=?",id);}
  let introductionSent=false;
  const respond=async(text,actions=[])=>{
   const shouldIntroduce=!introductionSent&&chat.mode==='auto'&&this.store.settings().agentEnabled&&(chat.introduced_at===null||now-chat.introduced_at>=86400000);
   if(shouldIntroduce){
    const claim=this.store.run('UPDATE chats SET introduced_at=? WHERE id=? AND (introduced_at IS NULL OR introduced_at<=?)',now,chat.id,now-86400000);
    if(claim.changes){text=type==='greeting'?introduction:introduction+'\n\n'+text;if(type==='greeting')actions=[];introductionSent=true;}
   }
   return this.reply(chat,text,actions,'bot',{allowClosed:type==='end_conversation'});
  };
  if(audioConfirmation||rejectedAudio){
   if(chat.mode!=='auto'||!this.store.settings().agentEnabled)return{chatId:chat.id,paused:true};
   if(chat.closed_at)this.store.run('UPDATE chats SET closed_at=NULL,help_state=NULL WHERE id=?',chat.id);
   if(audioConfirmation)this.store.run('UPDATE chats SET audio_pending_quote=? WHERE id=?',JSON.stringify({query:body,version:chat.routing_version}),chat.id);
   await respond(rejectedAudio?'Qual é a referência correta da correia? Pode escrever ou enviar outro áudio.':`Entendi *${body}*. Está correto? Responda *SIM* para eu cotar ou informe a referência correta.`,[]);
   return{chatId:chat.id,intent:'audio_confirmation'};
  }
  if(help==='no'){
   this.store.closeChat(chat.id,now);return{chatId:chat.id,closed:true,intent:'end_conversation'};
  }
  if(help==='yes'){
   this.store.cancelFollowups(chat.id);clearQuote(this.store,chat.id);this.store.run("UPDATE chats SET help_state='awaiting_item' WHERE id=?",chat.id);this.store.changed();
   if(chat.mode==='auto'&&this.store.settings().agentEnabled)await respond('Oque mais precisa?',[]);
   return{chatId:chat.id,intent:'add_items',paused:chat.mode==='manual'};
  }
  const delivery=deliveryMethod(body,{menu:chat.delivery_menu===1});
  const quoteWithPickup=delivery==='retira'&&type==='quote'?pickupQuoteText(body):null;
  const pickupAllowed=!chat.human_requested&&this.store.settings().agentEnabled&&(chat.mode==='auto'||!chat.assigned_user_id&&chat.delivery_allowed===1);
  const claimPickupQuestion=()=>{
   if(delivery!=='retira'||!pickupAllowed)return '';
   // Claim before transport: repeated inbound, failures and restarts cannot spam this question.
   const claimed=this.store.run('UPDATE chats SET pickup_prompted_at=?,pickup_pending_details=1,pickup_details=NULL,help_state=NULL,closed_at=NULL WHERE id=? AND (pickup_prompted_at IS NULL OR pickup_prompted_at<=?)',now,chat.id,now-86400000);
   return claimed.changes?pickupQuestion:'';
  };
  if(chat.pickup_pending_details&&isPickupDetails(body,type)&&(!delivery||/\b(?:nome|empresa|retirante|quem vai retirar)\b/.test(analysis.text))){
   if(type!=='thanks'&&helpChoice(body)===null&&!/\b(?:nao sei|ainda nao sei|vou ver|nao decidi)\b/.test(analysis.text))this.store.run('UPDATE chats SET pickup_details=CASE WHEN pickup_details IS NULL THEN ? ELSE pickup_details||char(10)||? END WHERE id=?',body.trim(),body.trim(),chat.id);
   this.store.changed();return{chatId:chat.id,intent:'pickup_details',paused:chat.mode==='manual'};
  }
  if(delivery&&(delivery==='retira'||chat.purchase_requested||type==='purchase')){
   this.store.run('UPDATE chats SET delivery_method=?,delivery_detail=?,delivery_due_at=NULL,delivery_menu=0,delivery_allowed=0 WHERE id=?',delivery,body.trim(),chat.id);this.store.changed();
   if(!['purchase','human','end_conversation'].includes(type)&&!quoteWithPickup){
    if(delivery==='retira'){const question=claimPickupQuestion();if(question)await respond(question,[]);}
    else if(chat.delivery_allowed&&!chat.assigned_user_id&&!chat.closed_at&&this.store.settings().agentEnabled&&delivery!==chat.delivery_method)await respond(`Forma de envio registrada: *${deliveryLabels[delivery]}*. Nossa equipe vai confirmar os detalhes com você.`,[]);
    return{chatId:chat.id,intent:'delivery',delivery};
   }
  }
  if(chat.pickup_pending_details)this.store.run('UPDATE chats SET pickup_pending_details=0 WHERE id=?',chat.id);
  if(type!=='thanks'&&chat.help_state)this.store.run('UPDATE chats SET help_state=NULL WHERE id=?',chat.id);
  if(type==='end_conversation'){
   this.store.closeChat(chat.id,now,{keepOrigin:true});
   if(!chat.closed_at&&chat.mode==='auto'&&this.store.settings().agentEnabled)await respond('Conversa encerrada. Quando precisar de outra cotação, é só mandar uma nova mensagem. Obrigado!',[]);
   return{chatId:chat.id,closed:true,intent:type};
  }
  if(chat.closed_at)this.store.run('UPDATE chats SET closed_at=NULL,help_state=NULL WHERE id=?',chat.id);
  if(type==='human'||type==='purchase'){
   const already=!!chat.needs_human,purchase=type==='purchase',selected=quotedOptions[analysis.selectionIndex];
   const samePurchase=purchase&&!selected&&chat.handoff_reason==='purchase'&&!/\d/.test(parseBeltRequest(quoteSearchText(body)).reference);
   const summary=purchase?(selected?`Opção ${analysis.selectionIndex+1}: ${selected.brand} · ${selected.description}\nCotação de referência: ${selected.line}\nSolicitação do cliente: ${body.trim()}`:samePurchase?chat.purchase_summary:`Mensagem do cliente: ${body.trim()}${chat.query?`\nÚltima cotação (referência): ${chat.query}`:''}`):chat.purchase_summary;
   const reason=already&&chat.order_state==='confirmed'?'order_closed':purchase?'purchase':chat.handoff_reason||'human';
   this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1,handoff_reason=?,purchase_summary=?,pending_selection=NULL WHERE id=?",reason,summary||null,chat.id);
   if(purchase){
    this.store.run("UPDATE chats SET purchase_requested=1,order_state=CASE WHEN order_state='confirmed' AND needs_human=1 AND ? THEN order_state ELSE 'interest' END WHERE id=?",already?1:0,chat.id);
    if(!chat.purchase_requested)this.store.run('UPDATE chats SET delivery_method=?,delivery_detail=?,help_state=NULL WHERE id=?',delivery,delivery?body.trim():null,chat.id);
   }else{this.store.run('UPDATE chats SET human_requested=1 WHERE id=?',chat.id);this.store.cancelFollowups(chat.id);}
   this.store.changed();
   const pickupPrompt=purchase?claimPickupQuestion():'';
   if(!already&&chat.mode!=='manual'&&this.store.settings().agentEnabled){
    const reply=purchase?`Entendi que você quer fechar uma compra.${selected?`\nInteresse na opção ${analysis.selectionIndex+1}: *${selected.brand}* · ${selected.description}.`:''}\nAvisei nossa equipe para confirmar os itens, as medidas, a disponibilidade e as condições de pagamento com você. O pedido ainda não está confirmado e o estoque não foi reservado.`:'Claro! Avisei um atendente. A partir de agora, esta conversa fica com a nossa equipe. Assim que possível, alguém responde por aqui.';
    const acknowledged=await respond(reply+(delivery?`\nForma de envio: *${deliveryLabels[delivery]}*.`:'')+(pickupPrompt?'\n\n'+pickupPrompt:''),[]);
    if(purchase&&!delivery&&!chat.assigned_user_id&&acknowledged.status==='sent')this.store.run('UPDATE chats SET delivery_allowed=1,delivery_origin_id=? WHERE id=?',inbound.id,chat.id);
   }else if(pickupPrompt)await respond(pickupPrompt,[]);
   if(purchase)this.followups.delivery.schedule(chat.id);
   return{chatId:chat.id,handoff:true,intent:type};
  }
  if(chat.mode==='manual'||!this.store.settings().agentEnabled){this.followups.delivery.schedule(chat.id);return{chatId:chat.id,paused:true};}let response;
  if(type==='add_items'){
   this.store.run("UPDATE chats SET query=NULL,shown='[]',quoted_options='[]',batch_queries='[]',pending_item_index=NULL,pending_measure=NULL,pending_selection=NULL WHERE id=?",chat.id);
   response={body:'Claro! Qual correia você quer adicionar? Informe o perfil, a referência e as medidas do próximo item.',actions:[actionHuman]};
  }
  else if(type==='clarify'){
   const valid=analysis.selectionIndex!==null&&quotedOptions[analysis.selectionIndex];
   this.store.run('UPDATE chats SET pending_selection=? WHERE id=?',valid?analysis.selectionIndex:null,chat.id);
   response={body:analysis.selectionIndex!==null&&!valid?'Essa opção não está na última cotação. Informe a referência da correia ou escolha uma das opções que acabei de mostrar.':`Você quer apenas cotar ou consultar mais detalhes${valid?` da opção ${analysis.selectionIndex+1} (${valid.brand})`:''}, ou já quer fechar o pedido? Responda *COTAR* ou *FECHAR PEDIDO*.`,actions:[actionHuman]};
  }
  else if(type==='greeting')response={body:'Me diga o perfil, a referência e as medidas das correias que você quer cotar. Vou consultar as marcas e os valores em estoque.',actions:[actionHuman]};
  else if(type==='thanks'){
   const quoteId=chat.last_quote_message_id||(quotedOptions.length&&!chat.pending_measure?this.store.get("SELECT id FROM messages WHERE chat_id=? AND direction='bot' AND status='sent' AND body LIKE '%R$%' ORDER BY created DESC,rowid DESC LIMIT 1",chat.id)?.id:null);
   if(quoteId&&quoteId===chat.help_offered_quote_id)return{chatId:chat.id,intent:type};
   if(quoteId&&quotedOptions.length&&!chat.pending_measure&&!chat.purchase_requested){this.store.run("UPDATE chats SET last_quote_message_id=?,help_state='asked',help_offered_quote_id=? WHERE id=?",quoteId,quoteId,chat.id);response={body:'te ajudo em algo mais?',actions:helpActions};}
   else response={body:'Por nada! Se precisar de outra cotação, é só me dizer o produto ou a medida. 😊',actions:[actionHuman]};
  }
  else{const pricing=this.store.settings();
   if(channel==='whatsapp'&&pricing.priceMode==='unconfirmed'){this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);await respond('Vou chamar um atendente para confirmar os valores e preparar sua cotação.',[]);return{chatId:chat.id,handoff:true};}
   const baseProducts=channel==='simulator'&&!this.store.get('SELECT id FROM products LIMIT 1')?demoProducts:this.store.all('SELECT p.*,l.lots stock_lots FROM products p LEFT JOIN product_stock_lots l ON l.product_id=p.id');const products=baseProducts.map(p=>({...p,price:p.price===null?null:Math.round(p.price*(1+(pricing.priceMode==='cost'?pricing.markupPercent||0:0)/100)*100)/100}));let detail=quoteSearchText(quoteWithPickup||body);if(chat.pending_measure&&/^\s*\d+(?:[.,]\d+)?\s*[.!?]?\s*$/.test(body)){const units={ribs:'frisos',mm:'mm',meters:'metros',fixedWidth:'mm'};if(units[chat.pending_measure])detail=body.replace(/[.!?]$/,'')+' '+units[chat.pending_measure];}let query=type==='more'?chat.query:detail;
   const selectedIndex=analysis.selectionIndex??(type==='quote'&&!/\d/.test(parseBeltRequest(detail).reference)?chat.pending_selection:null);
   const selected=type==='quote'&&selectedIndex!==null?quotedOptions[selectedIndex]:null;
   if(type==='quote'&&chat.query&&splitBeltRequests(detail).length===1){
    const request=parseBeltRequest(detail);
    const hasDetails=request.ribs!==null||request.mm!==null||request.meters!==null||request.hasPieces||request.budget!==null;
    const hasReference=meaningful(request.reference).some(word=>!['correia','industrial'].includes(word));
    const batch=JSON.parse(chat.batch_queries||'[]');
    if(batch.length>1&&chat.pending_item_index!==null&&!hasReference){batch[chat.pending_item_index]=mergeBeltRequest(batch[chat.pending_item_index],detail,[...new Set(products.map(p=>p.brand))]);query=batch.join('\n');}
    else{const base=selected?.itemQuery||chat.query;query=hasDetails||hasReference?mergeBeltRequest(base,detail,[...new Set(products.map(p=>p.brand))]):base;}
   }
   if(type==='quote'&&analysis.selectionIndex!==null&&!selected){response={body:'Essa opção não está na última cotação. Confirme a referência ou escolha uma das opções disponíveis.',actions:[actionHuman]};}
   else if(selected&&!products.some(p=>p.id===selected.id))response={body:'O estoque mudou desde essa cotação. Vou chamar um atendente para conferir a opção escolhida e o preço atual.',actions:[],needsHuman:true};
   else if(type==='more'&&!query)response={body:'Qual produto, modelo ou medida você quer cotar? Assim eu encontro as opções certas para você.',actions:[actionHuman]};
   else if(channel==='whatsapp'&&!products.length){response={body:'Nosso estoque está sendo atualizado. Vou chamar um atendente para confirmar os preços e a disponibilidade para você.',actions:[]};this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);}
   else{response=quoteReply(selected?products.filter(p=>p.id===selected.id):products,query,type==='more'?JSON.parse(chat.shown||'[]'):[],{mmDimension:'width',openBeltPriceBasis:pricing.openBeltPriceBasis||'unconfirmed'});const shown=type==='more'?[...JSON.parse(chat.shown||'[]'),...response.ids]:response.ids;this.store.run('UPDATE chats SET query=?,shown=?,pending_measure=?,quoted_options=?,batch_queries=?,pending_item_index=?,pending_selection=NULL WHERE id=?',query,JSON.stringify(shown),response.awaiting||null,JSON.stringify(response.quotedOptions||[]),JSON.stringify(response.batchQueries||[]),response.pendingItemIndex??null,chat.id);}
  }
  const pickupPrompt=quoteWithPickup&&!response.needsHuman?claimPickupQuestion():'';if(pickupPrompt)response.body+='\n\n'+pickupPrompt;
  if(response.needsHuman)this.store.run("UPDATE chats SET mode='manual',pause_until=NULL,needs_human=1 WHERE id=?",chat.id);
  if(this.store.chat(chat.id).mode==='manual'&&!response.needsHuman&&!response?.body?.includes('estoque está sendo atualizado'))return{chatId:chat.id,paused:true};const reply=await respond(response.body,response.actions);if(reply.status==='sent'&&response.ids?.length&&!response.awaiting){this.store.run('UPDATE chats SET last_quote_message_id=?,help_state=NULL WHERE id=?',reply.id,chat.id);}return{chatId:chat.id,intent:type};
 }
 async reply(chat,body,actions=[],direction='bot',{author=null,transportBody=body,allowClosed=false,quoted=null}={}){
  if(direction==='bot'){
   const live=this.store.chat(chat.id),origin=live?.service_origin_id&&this.store.get("SELECT id FROM messages WHERE id=? AND chat_id=? AND direction='in' AND inbound_verified=1",live.service_origin_id,live.id);
   if(!origin||live.phone!==chat.phone||live.channel!==chat.channel||live.provider!==chat.provider||live.closed_at&&!allowClosed)return{status:'blocked',error:'Sem mensagem recebida válida para autorizar resposta automática.'};
  }
  const message=this.store.addMessage({chatId:chat.id,direction,body,actions,status:'pending',author,deliveryBody:direction==='owner'?transportBody:null});
  if(quoted)this.store.run('UPDATE messages SET quoted_message_id=?,quoted_provider_id=?,quoted_body=?,quoted_author=? WHERE id=?',quoted.id,quoted.provider_id,quoted.body,quoted.author_name||(quoted.direction==='in'?chat.name:'ROBINHO'),message.id);
  try{const providerId=chat.channel==='simulator'?null:await this.send(chat,transportBody,actions,{quotedMessageId:quoted?.provider_id});this.store.run("UPDATE messages SET status='sent',provider_id=?,sent_at=? WHERE id=?",providerId||null,this.now(),message.id);}catch(e){this.store.run('UPDATE messages SET status=?,error=? WHERE id=?',e.uncertain?'uncertain':'failed',String(e.message).slice(0,400),message.id);this.store.event('send_error',e.uncertain?'O envio de uma mensagem não foi confirmado. Confira no WhatsApp antes de reenviar.':'Uma mensagem não foi enviada. Verifique a conexão e o chat.');}this.store.changed();return this.store.get('SELECT * FROM messages WHERE id=?',message.id);
 }
}
