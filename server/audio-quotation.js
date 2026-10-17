import {conversationText} from './intents.js';
// Interpret spoken measurements; retain the untouched transcript in history.
// Do not transform names, pickup details or messages outside belt quotations.
const values={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100,cento:100,duzentos:200,trezentos:300,quatrocentos:400,quinhentos:500,seiscentos:600,setecentos:700,oitocentos:800,novecentos:900};
const ones='(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)',small='(?:zero|'+ones+'|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa)(?: e '+ones+')?)',hundred='(?:cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)(?: e '+small+')?',number='(?:'+hundred+'|'+small+')';
const pattern=new RegExp('\\b(?:(?:'+number+' )?mil(?: e? ?'+number+')?|'+number+')\\b','g');
function numeric(phrase){let total=0,group=0;for(const word of phrase.split(' ')){if(word==='mil'){total+=(group||1)*1000;group=0;}else if(values[word]!==undefined)group+=values[word];}return String(total+group);}
export function audioQuotationText(body){
 let text=conversationText(body).replace(/\bp(?:e)? (?:jota|j)\b/g,'pj').replace(/\bp(?:e)? (?:ka|ca|k)\b/g,'pk').replace(/\b(v|ve) (?:xis|x)\b/g,'vx').replace(/\ba (?:te|t)\b/g,'at');
 if(!/\b(?:correias?|sincronizadoras?|dentadas?|[abcdezh]|pj|pk|pl|pm|ph|at|t|\d+\s*(?:vx?|m)|sp[azbc]|xp[azbc])\b/.test(text))return body;
 text=text.replace(pattern,numeric).replace(/\b(\d+) (?:virgula|ponto) (\d+)\b/g,'$1,$2');
 return text.replace(/\bmilimetros?\b/g,'mm').replace(/\b([358])\s+vx\b/g,'$1vx').replace(/\bat (\d+)\b/g,'at$1');
}
