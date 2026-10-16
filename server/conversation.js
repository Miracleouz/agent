import {conversationText} from './intents.js';
export const helpActions=[{id:'help_yes',label:'Sim',command:'SIM'},{id:'help_no',label:'Não',command:'NÃO'}];
export const deliveryActions=[{id:'delivery_pickup',label:'RETIRA',command:'RETIRA'},{id:'delivery_post',label:'CORREIOS',command:'CORREIOS'},{id:'delivery_other',label:'Consultar outros',command:'CONSULTAR OUTROS'}];
export const deliveryLabels={retira:'RETIRA',correios:'CORREIOS',consultar_outros:'Consultar outros'};
export const pickupQuestion='Para agilizar na hora da retirada informe nome de quem vai retirar e nome da empresa';
const courierPickup=/\b(?:(?:vou|vamos|irei|iremos)\s+(?:mandar|enviar|chamar|pedir)|mando|envio|chamo)\s+(?:(?:o|um|meu|nosso|uma|a)\s+)?(?:motorista|motoboy|uber|99|entregador)\b/;
export function helpChoice(body){
 const text=conversationText(body).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().replace(/\bporfavor\b/g,'por favor').replace(/\s+(?:obrigad[oa]|valeu)$/,'');
 if(/^(?:1|s|ss|sim(?: por favor)?|claro|preciso sim|quero sim|sim preciso|pode perguntar)$/.test(text))return 'yes';
 if(/^(?:2|n|nao(?: obrigado| obrigada| precisa| preciso| por enquanto| valeu)?|nao preciso de mais nada|por enquanto nao(?: obrigado)?|so isso(?: obrigado)?|era so isso(?: obrigado)?|somente isso|nada mais|nao mais nada)$/.test(text))return 'no';
 return null;
}
export function deliveryMethod(body,{menu=false}={}){
 const text=conversationText(body).replace(/correio(?:s)?\b/g,'correios').replace(/\bmoto[ -]+boy\b/g,'motoboy');
 if(menu&&/^[123][.!? ]*$/.test(text))return ['retira','correios','consultar_outros'][Number(text.trim()[0])-1];
 if(/\b(?:nao sei|a decidir|decidir depois|ainda nao decidi)\b/.test(text))return null;
 const found=new Set();
 const patterns={retira:/\b(?:retira(?:r|da|do|mos)?|retiro|pegar (?:ai|na loja)|buscar (?:ai|na loja|no balcao)|busco (?:ai|na loja)|balcao)\b/,correios:/\b(?:correios|sedex|pac)\b/,consultar_outros:/\b(?:consultar? outr[oa]s?|outra forma de envio|transportadora|motoboy|uber|entregador)\b/};
 for(const clause of text.split(/[,;.!?]|\bmas\b|\be sim\b/)){
  // A courier sent by the customer is pickup, not delivery arranged by the store.
  const courier=courierPickup.exec(clause);
  const uncertain=/\b(?:se|caso|talvez|ou|ainda estou vendo|vou ver)\b/.test(clause);
  const negated=before=>/\b(?:nao|nem|sem)\b(?:\s+\w+){0,5}\s*$/.test(before);
  const pickupCourier=courier&&!uncertain&&!negated(clause.slice(0,courier.index));
  const pickup=patterns.retira.exec(clause),explicitPickup=pickup&&!negated(clause.slice(0,pickup.index));
  if(pickupCourier)found.add('retira');
  for(const [method,pattern] of Object.entries(patterns)){
   const match=pattern.exec(clause);if(!match||uncertain)continue;
   if(negated(clause.slice(0,match.index)))continue;
   if(method==='consultar_outros'&&(pickupCourier||explicitPickup)&&!/\b(?:transportadora|consultar? outr[oa]s?)\b/.test(clause))continue;
   found.add(method);
  }
 }
 if(found.size!==1)return null;
 if(/\?/.test(text)&&!menu&&!/\b(?:vou|pode|quero|manda|envia|prefiro|vamos)\b/.test(text))return null;
 return [...found][0];
}

// Free text immediately after the pickup question is kept verbatim for the team.
// An actual new quotation, choice or support command must still follow its normal flow.
export function isPickupDetails(body,type){
 if(!['quote','thanks','clarify'].includes(type))return false;
 if(/^\s*\d+(?:[.,]\d+)?[.!? ]*$/.test(body))return false;
 if(helpChoice(body)!==null)return true;
 if(type==='clarify')return false;
 const text=conversationText(body);
 if(/^(?:nome(?: de quem vai retirar)?|empresa|retirante|motorista|quem vai retirar)\s*[:=-]|^quem vai retirar (?:e|sera)\b/.test(text)&&!/\b(?:cotar|cotacao|orcamento|preco|valor|quanto)\b/.test(text))return true;
 return !/\?|\b(?:cotar|cotacao|orcamento|preco|valor|quanto|correia|correias|adicionar|comprar|fechar|separar)\b|\b[a-z]{1,5}[ -]*\d+\b|\b\d+\s*(?:mm|mts?|metros?|frisos?|canais)\b/.test(text);
}

export function pickupQuoteText(body){
 const text=conversationText(body).replace(/\bmoto[ -]+boy\b/g,'motoboy');
 if(!/\b(?:cotar|cotacao|orcamento|preco|valor|quanto|correias?)\b|\b(?:[abcdez]|xp[azbc]|[235]vx?|[245]l|d?p[jklm]|at|t)[ -]*\d+\b/.test(text))return null;
 return text.replace(courierPickup,' ').replace(/\b(?:(?:eu )?(?:vou|vamos|irei|quero) (?:mandar )?)?(?:retira(?:r|da|do|mos)?|retiro|pegar (?:ai|na loja)|buscar (?:ai|na loja|no balcao)|busco (?:ai|na loja))\b(?: (?:na loja|no balcao|ai))?/g,' ').replace(/\s+/g,' ').trim();
}
