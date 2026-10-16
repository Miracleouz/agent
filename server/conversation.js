import {conversationText} from './intents.js';
export const helpActions=[{id:'help_yes',label:'Sim',command:'SIM'},{id:'help_no',label:'Não',command:'NÃO'}];
export const deliveryActions=[{id:'delivery_pickup',label:'RETIRA',command:'RETIRA'},{id:'delivery_post',label:'CORREIOS',command:'CORREIOS'},{id:'delivery_other',label:'Consultar outros',command:'CONSULTAR OUTROS'}];
export const deliveryLabels={retira:'RETIRA',correios:'CORREIOS',consultar_outros:'Consultar outros'};
export function helpChoice(body){
 const text=conversationText(body).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().replace(/\bporfavor\b/g,'por favor').replace(/\s+(?:obrigad[oa]|valeu)$/,'');
 if(/^(?:1|s|ss|sim(?: por favor)?|claro|preciso sim|quero sim|sim preciso|pode perguntar)$/.test(text))return 'yes';
 if(/^(?:2|n|nao(?: obrigado| obrigada| precisa| preciso| por enquanto| valeu)?|nao preciso de mais nada|por enquanto nao(?: obrigado)?|so isso(?: obrigado)?|era so isso(?: obrigado)?|somente isso|nada mais|nao mais nada)$/.test(text))return 'no';
 return null;
}
export function deliveryMethod(body,{menu=false}={}){
 const text=conversationText(body).replace(/correio(?:s)?\b/g,'correios');
 if(menu&&/^[123][.!? ]*$/.test(text))return ['retira','correios','consultar_outros'][Number(text.trim()[0])-1];
 if(/\b(?:nao sei|a decidir|decidir depois|ainda nao decidi)\b/.test(text))return null;
 const found=new Set();
 const patterns={retira:/\b(?:retira(?:r|da|do|mos)?|retiro|pegar (?:ai|na loja)|buscar (?:ai|na loja|no balcao)|busco (?:ai|na loja)|balcao)\b/,correios:/\b(?:correios|sedex|pac)\b/,consultar_outros:/\b(?:consultar? outr[oa]s?|outra forma de envio|transportadora|motoboy|uber|entregador)\b/};
 for(const clause of text.split(/[,;.!?]|\bmas\b|\be sim\b/))for(const [method,pattern] of Object.entries(patterns)){
  const match=pattern.exec(clause);if(!match)continue;const before=clause.slice(0,match.index);if(/\b(?:nao|nem|sem)\b(?:\s+\w+){0,5}\s*$/.test(before))continue;found.add(method);
 }
 if(found.size!==1)return null;
 if(/\?/.test(text)&&!menu&&!/\b(?:vou|pode|quero|manda|envia|prefiro|vamos)\b/.test(text))return null;
 return [...found][0];
}
