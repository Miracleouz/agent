import {normalize} from './catalog.js';

const VALUE='(\\d+(?:[.,]\\d+)?)';
const ribsPattern=new RegExp(`\\b${VALUE}\\s*(frisos?|canais|canal|ribs?)\\b`,'g');
const mmPattern=new RegExp(`\\b${VALUE}\\s*(?:mm|milimetros?)\\b`,'g');
const meterPattern=new RegExp(`\\b${VALUE}\\s*(?:metros?)\\b`,'g');
const piecesPattern=/\b(\d+(?:[.,]\d+)?|uma?|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s*(correias?|pecas?|unidades?|un\b|pcs?\b)\b/g;
const words={um:1,uma:1,duas:2,dois:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10};
const numeric=s=>Number(s.replace(',','.'));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
const amount=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:6}).format(v);
const nearEqual=(a,b)=>Math.abs(a-b)<1e-8;

export function billingUnit(unit){
 const value=normalize(unit);
 if(/friso|canal|^fri$/.test(value))return 'ribs';
 if(/milimetro|^mm$/.test(value))return 'mm';
 if(/metro|^m$/.test(value))return 'meter';
 if(/peca|unidade|^pc$|^un$/.test(value))return 'piece';
 return 'other';
}

// Explicit purchase dimensions are kept apart from profile, pitch and length codes.
// A 5PJ350 belt has five ribs. The 5 in 5V2240 is part of the profile.
export function parseBeltRequest(query){
 let reference=normalize(query);
 const request={reference,ribs:null,mm:null,meters:null,pieces:1,hasPieces:false,budget:null,ribWord:'friso',error:null};
 if(/(?:^|\s)-\d+(?:[.,]\d+)?\s*(?:frisos?|canais|canal|mm|milimetros?|metros?|correias?|pecas?)\b/.test(reference))request.error='Informe apenas medidas e quantidades positivas.';
 const put=(key,value)=>{
  if(!Number.isFinite(value)||value<=0||value>1000000||(['ribs','pieces'].includes(key)&&!Number.isInteger(value))){request.error='Informe uma quantidade positiva válida; peças, canais e frisos precisam ser inteiros.';return;}
  if(request[key]!==null&&key!=='pieces'&&!nearEqual(request[key],value))request.error='Recebi medidas diferentes na mesma mensagem. Confirme uma referência e uma medida de corte por vez.';
  request[key]=value;
 };
 // Long linear AT/T belt requests commonly omit the length unit: AT10 33000 = 33 m.
 // Keep ordinary closed-belt length codes and small stock widths out of this conversion.
 if(!/\bfechad[ao]s?\b/.test(reference)){
  reference=reference.replace(/\b((?:at|t)\s*(?:2[.,]5|5|10|20))[\s/-]+(\d+(?:[.,]\d+)*)(?:\s*(milimetros?|metros?|mm|m)\b)?(?:\s*(?:x|×|por|\/)\s*(\d+(?:[.,]\d+)?)(?:\s*mm\b)?)?(?=\s|$|[,;!?])/g,(all,profile,raw,unit,width)=>{
   const value=numeric(raw.replace(/\.(?=\d{3}(?:[.,]|$))/g,''));
   const inMeters=unit==='m'||unit?.startsWith('metro');
   const explicitOpen=/\babertas?\b/.test(query.toLowerCase());
   if(!inMeters&&value<(explicitOpen||unit?1000:10000))return all;
   put('meters',inMeters?value:value/1000);
   if(width)put('mm',numeric(width));
   return `${profile.replace(/\s/g,'')} aberta `;
  });
 }
 reference=reference.replace(/\b(\d{1,3})\s*(dpj|dpk|pj|pk|pl|pm|ph)[ -]*(\d{2,6})\b/g,(_all,ribs,profile,length)=>{put('ribs',Number(ribs));return `${profile} ${length}`;});
 const lengthToMeters=(n,unit)=>numeric(n)/(unit==='mm'||unit.startsWith('milimetro')?1000:unit==='cm'||unit.startsWith('centimetro')?100:1);
 reference=reference.replace(/\b(?:comprimento|comprido)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(milimetros?|centimetros?|metros?|mm|cm|m)\b/g,(_all,n,unit)=>{put('meters',lengthToMeters(n,unit));return ' ';});
 reference=reference.replace(/\b(\d+(?:[.,]\d+)?)\s*(milimetros?|centimetros?|metros?|mm|cm|m)\s*(?:de\s+)?(?:comprimento|comprido)\b/g,(_all,n,unit)=>{put('meters',lengthToMeters(n,unit));return ' ';});
 reference=reference.replace(/\b(\d+(?:[.,]\d+)?)\s*(?:metros?|m)\s*(?:x|×|por)\s*(\d+(?:[.,]\d+)?)\s*mm\b/g,(_all,length,width)=>{put('meters',numeric(length));put('mm',numeric(width));return ' ';});
 reference=reference.replace(/\b(\d+(?:[.,]\d+)?)\s*mm\s*(?:x|×|por)\s*(\d+(?:[.,]\d+)?)\s*(?:metros?|m)\b/g,(_all,width,length)=>{put('mm',numeric(width));put('meters',numeric(length));return ' ';});
 reference=reference.replace(ribsPattern,(_all,n,word)=>{put('ribs',numeric(n));request.ribWord=word.startsWith('cana')?'canal':'friso';return ' ';});
 reference=reference.replace(mmPattern,(_all,n)=>{put('mm',numeric(n));return ' ';});
 reference=reference.replace(meterPattern,(_all,n)=>{put('meters',numeric(n));return ' ';});
 reference=reference.replace(piecesPattern,(_all,n)=>{const count=words[n]??numeric(n);if(request.hasPieces&&!nearEqual(request.pieces,count))request.error='Confirme quantas correias você deseja.';put('pieces',count);request.hasPieces=true;return ' correia ';});
 // Common synchronous notation: length-pitch-width, e.g. 1200-8M-20.
 reference=reference.replace(/\b(\d{3,6})[\s/x-]+((?:s|d)?\d+m|[a-z]{1,3}\d+|[a-z]{1,3})[\s/x-]+(\d{1,4})(?=\s|$|[?!.])/g,(_all,length,pitch,width)=>{put('mm',Number(width));return `${length} ${pitch}`;});
 reference=reference.replace(/\b(?:ate|menos de|no maximo|limite de)\s*(?:r\$\s*)?(\d+(?:[.,]\d+)?)/g,(_all,n)=>{request.budget=numeric(n);return ' ';});
 request.reference=reference.replace(/\b(?:largura|largo|corte|cortar|frisada|comprimento|cada)\b/g,' ').replace(/\s+/g,' ').trim();
 return request;
}

export function productBeltSpec(product){
 const source=`${product.name} ${product.variant||''}`.trim();
 let reference=normalize(source);
 const unit=billingUnit(product.unit);
 const ribs=[...reference.matchAll(ribsPattern)].map(m=>numeric(m[1]));
 const widths=[...reference.matchAll(mmPattern)].map(m=>numeric(m[1]));
 const compact=reference.match(/\b(\d{1,3})\s*(dpj|dpk|pj|pk|pl|pm|ph)[ -]*(\d{2,6})\b/);
 if(compact){ribs.push(Number(compact[1]));reference=reference.replace(compact[0],`${compact[2]} ${compact[3]}`);}
 const shorthand=reference.match(/\b(\d{3,6})[\s/x-]+((?:s|d)?\d+m|[a-z]{1,3}\d+|[a-z]{1,3})[\s/x-]+(\d{1,4})(?=\s|$)/);
 if(shorthand){widths.push(Number(shorthand[3]));reference=reference.replace(shorthand[0],`${shorthand[1]} ${shorthand[2]}`);}
 reference=reference.replace(ribsPattern,' ').replace(mmPattern,' ');
 // Imported suffixes identify lots, not requested widths or reference numbers.
 if(ribs.length||widths.length)reference=reference.replace(/-\s*\d+\s*$/,'');
 reference=reference.replace(/\s+/g,' ').trim();
 const ribCapacity=ribs.length?Math.min(...ribs):null;
 const mmCapacity=widths.length?Math.min(...widths):null;
 let displayName=source.replace(new RegExp(ribsPattern.source,'gi'),' ').replace(new RegExp(mmPattern.source,'gi'),' ');
 if(ribs.length||widths.length)displayName=displayName.replace(/-\s*\d+\s*$/,'');
 displayName=displayName.replace(/\s+/g,' ').trim();
 return {unit,reference,ribs:ribCapacity,mm:mmCapacity,displayName,open:/\babertas?\b/.test(normalize(source))};
}

// Never join two narrow remnants to promise one wider belt.
function cutPiecesAvailable(stock,capacity,factor){
 if(capacity===null)return Math.floor((stock+1e-8)/factor);
 if(factor>capacity+1e-8)return 0;
 const lots=Math.floor((stock+1e-8)/capacity);
 const remainder=Math.max(0,stock-lots*capacity);
 return lots*Math.floor((capacity+1e-8)/factor)+Math.floor((remainder+1e-8)/factor);
}

export function calculateBeltQuote(product,request,{openBeltPriceBasis='unconfirmed'}={}){
 const spec=productBeltSpec(product);
 if(request.error)return {ok:false,error:request.error};
 let factor=1,missing=null;
 if(spec.open){
  if(request.ribs!==null)return {ok:false};
  if(request.mm===null)return {ok:false,missing:'fixedWidth',spec};
  if(request.meters===null)return {ok:false,missing:'meters',spec};
  if(spec.unit!=='meter'||spec.mm===null)return {ok:false,review:'openStockUnit',spec};
  if(request.mm>spec.mm+1e-8)return {ok:false,insufficient:true};
  const available=Math.floor((spec.mm+1e-8)/request.mm)*Math.floor((product.quantity+1e-8)/request.meters);
  if(available<request.pieces)return {ok:false,insufficient:true};
  if(product.price===null)return {ok:true,unpriced:true,spec,factor:null,available};
  if(!['per_meter_mm','per_meter_full_width'].includes(openBeltPriceBasis))return {ok:false,review:'openPriceBasis',spec};
  const widthDivisor=openBeltPriceBasis==='per_meter_full_width'?spec.mm:1;
  factor=request.meters*request.mm/widthDivisor;
  const eachCents=Math.round(Math.round(product.price*100)*factor+1e-8),totalCents=eachCents*request.pieces;
  if(!Number.isSafeInteger(eachCents)||!Number.isSafeInteger(totalCents)||eachCents<=0)return {ok:false};
  return {ok:true,spec,factor,available,widthDivisor,openBeltPriceBasis,each:eachCents/100,total:totalCents/100};
 }
 if(spec.unit==='ribs'){
  if(request.mm!==null||request.meters!==null)return {ok:false};
  factor=request.ribs;if(factor===null)missing='ribs';
 }else if(spec.unit==='mm'){
  if(request.ribs!==null||request.meters!==null)return {ok:false};
  factor=request.mm;if(factor===null)missing='mm';
 }else if(spec.unit==='meter'){
  if(request.ribs!==null)return {ok:false};
  if(request.mm!==null&&(spec.mm===null||!nearEqual(request.mm,spec.mm)))return {ok:false};
  factor=request.meters;if(spec.mm!==null&&request.mm===null)missing='fixedWidth';else if(factor===null)missing='meters';
 }else{
  if(request.ribs!==null&&(spec.ribs===null||!nearEqual(request.ribs,spec.ribs)))return {ok:false};
  if(request.mm!==null&&(spec.mm===null||!nearEqual(request.mm,spec.mm)))return {ok:false};
  if(request.meters!==null)return {ok:false};
 }
 if(missing)return {ok:false,missing,spec};
 const capacity=spec.unit==='ribs'?spec.ribs:spec.unit==='mm'?spec.mm:null;
 const available=spec.unit==='ribs'||spec.unit==='mm'?cutPiecesAvailable(product.quantity,capacity,factor):Math.floor((product.quantity+1e-8)/factor);
 if(available<request.pieces)return {ok:false,insufficient:true};
 if(product.price===null)return {ok:true,unpriced:true,spec,factor,available};
 const cents=Math.round(product.price*100);
 const eachCents=Math.round(cents*factor+1e-8),totalCents=eachCents*request.pieces;
 if(!Number.isSafeInteger(eachCents)||!Number.isSafeInteger(totalCents)||eachCents<=0)return {ok:false};
 return {ok:true,spec,factor,available,each:eachCents/100,total:totalCents/100};
}

export function formatBeltCalculation(product,request,quote,{mmDimension='width'}={}){
 const {spec,factor,each,total}=quote;
 const quantity=request.pieces;
 let description=spec.reference.toUpperCase();
 let line;
 if(spec.open){
  description+=` · ${amount(request.meters)} m × ${amount(request.mm)} mm de largura`;
  const rate=quote.openBeltPriceBasis==='per_meter_full_width'?`${money(product.price)}/m na faixa de ${amount(spec.mm)} mm ÷ ${amount(spec.mm)} mm`:`${money(product.price)}/(m × mm)`;
  line=`${rate} × ${amount(request.meters)} m × ${amount(request.mm)} mm = *${money(each)} por corte*`;
 }else if(spec.unit==='ribs'){
  const plural=request.ribWord==='canal'?'canais':'frisos';
  description+=` · ${amount(factor)} ${plural}`;
  line=`${money(product.price)} por ${request.ribWord} × ${amount(factor)} ${plural} = *${money(each)} por correia*`;
 }else if(spec.unit==='mm'){
  const measure='de largura';
  description+=` · ${amount(factor)} mm ${measure}`;
  line=`${money(product.price)}/mm × ${amount(factor)} mm = *${money(each)} por correia*`;
 }else if(spec.unit==='meter'){
  description=product.name+(product.variant?' '+product.variant:'');
  line=`${money(product.price)}/m × ${amount(factor)} m = *${money(each)} por corte*`;
 }else{
  description=product.name+(product.variant?' '+product.variant:'');
  line=`*${money(each)}* por ${product.unit||'unidade'}`;
 }
 if(quantity>1)line+=`\n   ${amount(quantity)} ${spec.unit==='piece'?'peças':'correias'}: *${money(total)} no total*`;
 return {description,line};
}

export function mergeBeltRequest(previous,next,brands=[]){
 const prior=parseBeltRequest(previous),current=parseBeltRequest(next);
 let remaining=current.reference;
 for(const brand of brands)remaining=remaining.replaceAll(normalize(brand),' ');
 const detailOnly=!/\d/.test(remaining)&&remaining.split(/[^a-z0-9]+/).every(t=>!t||['e','da','do','de','a','o','com','quero','sao','seriam','para','pra','por','favor','correia','correias','sim','na','verdade','em','vez','dessa','desta','agora'].includes(t));
 const changed=current.ribs!==null||current.mm!==null||current.meters!==null||current.hasPieces||current.budget!==null||brands.some(b=>normalize(next).includes(normalize(b)));
 if(!detailOnly||!changed)return next;
 let reference=prior.reference;
 const requestedBrands=brands.filter(b=>normalize(next).includes(normalize(b)));
 if(requestedBrands.length){for(const b of brands)reference=reference.replaceAll(normalize(b),' ');reference+=' '+requestedBrands.join(' ');}
 const pieces=current.hasPieces?current.pieces:prior.pieces;
 const ribs=current.ribs??prior.ribs,mm=current.mm??prior.mm,meters=current.meters??prior.meters,budget=current.budget??prior.budget;
 return `${reference} ${pieces} correias${ribs!==null?` ${ribs} ${current.ribWord==='canal'?'canais':'frisos'}`:''}${mm!==null?` ${mm} mm`:''}${meters!==null?` ${meters} metros`:''}${budget!==null?` ate ${budget}`:''}`.trim();
}
