import {normalize} from './catalog.js';
import {parseBeltRequest} from './belts.js';

// Corrections apply to conversation words only, never fuzzy-match a belt reference.
const corrections={corr:'correia',cor:'correia',coreia:'correia',qro:'quero',kero:'quero',keru:'quero',qero:'quero',qria:'queria',vc:'voce',vcs:'voces',pfv:'por favor',pf:'por favor',pfr:'por favor',qto:'quanto',qnto:'quanto',qtos:'quantos',vlr:'valor',vlrs:'valores',orc:'orcamento',orcament:'orcamento',orcamentu:'orcamento',orsamento:'orcamento',orcamente:'orcamento',cotac:'cotacao',cotassao:'cotacao',cotacaoo:'cotacao',cotacaum:'cotacao',cot:'cotacao',precu:'preco',presco:'preco',precoo:'preco',comprr:'comprar',compraar:'comprar',conprar:'comprar',comrpar:'comprar',conpra:'compra',fexar:'fechar',fexado:'fechado',fexou:'fechou',fexa:'fecha',fecharrr:'fechar',fexamos:'fechamos',pedidu:'pedido',pedio:'pedido',pdd:'pedido',atendnete:'atendente',atendende:'atendente',atend:'atendente',correa:'correia',correiaa:'correia',frizo:'friso',frizos:'frisos',blz:'beleza',obg:'obrigado',obgd:'obrigado',obgdo:'obrigado',obgda:'obrigada',brigado:'obrigado',brigada:'obrigada',obrigadu:'obrigado',vlw:'valeu',mto:'muito'};
export function conversationText(text){return normalize(text).replace(/\b[a-z]+\b/g,word=>corrections[word]||word).replace(/\s+/g,' ').trim();}

const ordinals=['primeir','segund','terceir','quart','quint'];
function optionIndex(text){
 text=text.replace(/\b(?:primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|quint[ao])(?:[ -]+)(?:feira|vez|compra|pedido|cotacao|orcamento|via)\b/g,' ');
 const numeric=text.match(/\b(?:opcao|numero|n[º°.]?)\s*([0-9]+)\b/)
  ||text.match(/^([1-9][0-9]?)[.!? ]*$/)
  ||text.match(/^(?:a |o )([1-5])[.!? ]*$/)
  ||text.match(/\b(?:a|com a|levar a|separar a)\s+([1-5])(?![0-9])\b(?!\s*(?:frisos?|canais|mm|metros?|correias?|pecas?))/);
 if(numeric)return Number(numeric[1])-1;
 const words='(?:primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|quint[ao])';
 const ordinal=text.match(new RegExp(`\\b(?:a|o|da|do|na|no|opcao|quero|levar|separa|gostei|com)\\s+(${words})\\b`))
  ||text.match(new RegExp(`^(${words})(?:\\s+opcao)?[.!? ]*$`));
 return ordinal?ordinals.findIndex(word=>ordinal[1].startsWith(word)):null;
}

export function classifyMessage(body,{options=[],pendingMeasure=null,pendingSelection=null}={}){
 const text=conversationText(body),hasQuote=options.length>0;
 let selectionIndex=pendingMeasure?null:optionIndex(text);
 let allowFollowup=true;
 const result=type=>({type,selectionIndex,text,allowFollowup});
 if(/^(?:quero |pode |vamos )?(?:encerrar|encerra|finalizar|terminar|fechar) (?:a )?(?:conversa|atendimento)[!.? ]*$/.test(text)||/^(?:encerrar|tchau|ate mais)[!.? ]*$/.test(text))return result('end_conversation');
 if(/^(?:quero |vou |vamos |pode )?(?:adicionar|acrescentar|incluir) (?:mais )?(?:itens|items|item|produtos|produto|correias|correia)[!.? ]*$/.test(text)||/^(?:adicionar|mais itens)[!.? ]*$/.test(text))return result('add_items');
 const withoutNegatedHuman=text.replace(/\bnao (?:quero |preciso |desejo )?(?:falar com (?:um |uma |o |a )?)?(?:atendente|humano|pessoa|vendedor|vendedora|comercial|suporte)\b/g,'');
 if(text==='human'||/\b(?:atendente|humano|vendedor|vendedora|comercial|suporte)\b|falar com (?:uma? )?(?:pessoa|alguem)|nao (?:quero|queria) (?:um )?(?:bot|robo)/.test(withoutNegatedHuman))return result('human');
 if(/\b(?:cancelar|cancela|cancelamento|rastrear|rastreio|trocar|devolver|reembolso)\b|\b(?:status|andamento) d[oa] (?:meu |minha )?(?:pedido|compra)|\b(?:pedido|compra) (?:ja )?confirmad[oa]\s*\?/.test(text))return result('human');
 if(/^(?:(?:tem|quero|me mostra|pode mostrar) )?(?:em |de )?(?:outra|outras) marcas?[?!. ]*$/.test(text)||text==='more'||/^(?:ver |quero |manda |me manda |mostrar |tem |pode mandar )?(?:mais|outras?)(?: (?:opcoes|marcas|produtos))?[!.? ]*$/.test(text))return result('more');
 if(/^(?:oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|hello)[!.? ]*$/.test(text)||/^(?:(?:oi+|ola|opa|bom dia|boa tarde|boa noite)[!, .]*)?(?:vim|cheguei) (?:pelo|do|da|atraves do) (?:site|anuncio|instagram|google)[!.? ]*$/.test(text))return result('greeting');
 const gratitude=text.replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 if(/\b(?:obrigad[oa]|valeu|agradeco|ok|certo|beleza|joia)\b/.test(gratitude)&&gratitude.split(' ').every(word=>['obrigado','obrigada','valeu','agradeco','ok','certo','beleza','joia','muito','demais','pela','pelo','pelos','por','a','o','os','as','e','cotacao','valores','precos','atencao','atendimento','informacoes','tudo','ta','bom'].includes(word)))return result('thanks');

 const noPurchase=/\b(?:nao|nem) (?:\w+ ){0,3}(?:comprar|compro|compra|fechar|fecho|fechando|levar|separar|separe|manda|mande|envia|envie|confirmar|pedido)\b|\b(?:so|somente|apenas) (?:\w+ ){0,2}(?:cotando|pesquisando|orcando|consultando|cotacao|orcamento|pesquisa)\b|\b(?:ainda|so) (?:estou )?(?:vendo|pesquisando|comparando)\b|\b(?:talvez|quem sabe|se der|se ficar|se for|se tiver|caso)\b|\b(?:mes que vem|semana que vem|mais pra frente|outro dia|vou pensar|vou ver|nao agora|comprar depois|fechar depois)\b/.test(text);
 const decisionText=text.replace(/\bnao (?:quero|preciso|desejo|precisa) (?:\w+ ){0,2}(?:cotacao|orcamento|cotar|orcar)\b/g,'');
 const priceQuestion=/\bquanto\b|\bqual (?:e |seria |fica )?(?:o |esse |o seu )?(?:preco|valor|custo)\b|\b(?:manda|mande|passa|passe|envia|enviar|informa|saber|consultar|consulta|ver|vejo|teria|tem|confirmar|confirma|conferir) (?:\w+ ){0,3}(?:preco|precos|valor|valores|cotacao|orcamento)\b|\b(?:faz|faca|fazer|preciso|quero|queria|gostaria|solicito|solicitar|pedido de) (?:\w+ ){0,3}(?:cotacao|orcamento|cotar|orcar)\b|\b(?:pode|consegue|conseguem|poderia) (?:\w+ ){0,2}(?:cotar|orcar)\b|\b(?:custa|custam|sairia)\b|\b(?:confirmar|confirma|conferir) (?:se|o estoque|a disponibilidade)\b/.test(decisionText);
 const purchase=/\b(?:quero|queria|gostaria de|preciso|decidi|vou|vamos|bora|vamo|vms|podemos|pode|posso) (?:\w+ ){0,2}(?:comprar|fechar|finalizar|confirmar|levar|separar|reservar|faturar|pagar|efetivar)\b|\b(?:fecha|feche|fechamos|fechado|fechou|confirmo|aprovo|aprovado|autorizo|separa|separe|reserva|reserve|fatura|fature)\b|\b(?:fico com|vou ficar com|quero ficar com|pode emitir|emitir (?:o )?pedido|pode gerar (?:o )?(?:pedido|pix|boleto)|manda (?:a )?chave pix|passa (?:a )?chave pix|como (?:eu )?(?:faco para|faco pra|posso) pagar)\b|\b(?:quero|vou levar|manda|mande|envia|envie) (?:a |o )?(?:opcao|primeira|primeiro|segunda|segundo|terceira|terceiro|quarta|quarto|quinta|quinto)\b|\b(?:fechar|finalizar|confirmar) (?:a |o |meu |minha )?(?:pedido|compra|orcamento)\b|\b(?:manda|mande|envia|envie) (?:\w+ ){0,2}\d+ (?:correias?|pecas?|unidades?)\b/.test(text)
  ||hasQuote&&/\bquero [ao] [1-5]\b/.test(text)
  ||hasQuote&&/^(?:comprar|fechar|finalizar|confirmar|levar|separar|pagar|quero essa|quero esta|quero esse|quero este|pode mandar|manda pra mim)[.!? ]*$/.test(text);
 allowFollowup=!noPurchase&&!/\b(?:separa|separe|reserva|reserve|(?:pode|quero|preciso|vou|vamos) (?:me )?(?:separar|reservar))\b/.test(text);
 if(noPurchase||priceQuestion)return result('quote');
 if(purchase){
  const hasNewReference=/\d/.test(parseBeltRequest(quoteSearchText(body)).reference);
  if(selectionIndex===null&&pendingSelection!==null&&!hasNewReference)selectionIndex=pendingSelection;
  if(selectionIndex===null&&!hasNewReference){const brands=options.map((option,index)=>({index,brand:normalize(option.brand)})).filter(option=>new RegExp(`\\b${option.brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`).test(text));if(brands.length===1)selectionIndex=brands[0].index;}
  if(selectionIndex!==null&&!options[selectionIndex])return result('clarify');
  return result('purchase');
 }
 if(selectionIndex!==null||hasQuote&&/^(?:sim|pode ser|essa|esse|esta|este|gostei|gostei d[ao] .+|a mais barata|a gates)[.!? ]*$/.test(text)||/\b(?:aceita|aceitam|faz|fazem|tem)\b.*\b(?:pix|cartao|boleto|desconto|entrega|frete|parcelamento)\b/.test(text))return result('clarify');
 return result('quote');
}

// Remove conversational filler for catalog lookup while preserving numbers, brands and measurements.
export function quoteSearchText(body){
 return conversationText(body)
  .replace(/\b(?:vim|cheguei) (?:pelo|do|da|atraves do) (?:site|anuncio|instagram|google)\b/g,' ')
  .replace(/\bnao (?:quero |preciso |desejo )?(?:falar com (?:um |uma |o |a )?)?(?:atendente|humano|pessoa|vendedor|vendedora|comercial|suporte)\b/g,' ')
  .replace(/\b(?:nao|nem) (?:\w+ ){0,3}(?:comprar|fechar|levar|confirmar|separar|separe|manda|mande|envia|envie|pedido)\b/g,' ')
  .replace(/\b(?:segund[ao]|terc[ao]|quart[ao]|quint[ao]|sext[ao])[ -]feira\b/g,' ')
  .replace(/\b(?:opcao|numero|n[º°.]?)\s*\d+\b|\b(?:primeir[ao]|segund[ao]|terceir[ao]|quart[ao]|quint[ao])\b/g,' ')
  .replace(/\b(?:mes que vem|semana que vem|mais pra frente|outro dia|vou pensar|vou ver|nao agora|se der|se ficar|se for|se tiver|sem compromisso)\b/g,' ')
  .replace(/\b(?:passa|passar|informar|antes|mas|eu|vou|vem|barato|desconto|hoje|compre|decida|confirma|conferir|separar|separa|separe|reservar|reserva|reserve)\b/g,' ')
  .replace(/\b(?:quanto|qual|quais|cotacao|orcamento|cotar|orcar|cotando|orcando|pesquisando|pesquisa|comparando|consultando|consulta|consultar|solicito|solicitar|cotacoes|orcamentos|preco|precos|valor|valores|custa|custam|custo|sairia|comprar|compro|compra|fechar|fecho|fechando|levar|finalizar|confirmar|pedido|pedidos|apenas|somente|ainda|so|depois|talvez|quem|sabe|caso|ja|agora|estou|estamos|fazer|faca|faz|envie|mande|passe|informa|saber|consultando|vendo|precisando|interessado|interesse|compraria|desejo|desejaria|seria|fica|ficaria|sai|sair|ficam|consegue|conseguem|mostra|mostrar|gostei|mesmo|tambem|poderia|solicitar|por gentileza|favor|porfavor)\b/g,' ')
  .replace(/\s+/g,' ').trim();
}
