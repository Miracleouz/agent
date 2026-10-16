# Testes de cotação e intenção de compra — versão 1.1.0

Verificação em 16/10/2026: **180 mensagens diferentes aprovadas**, dentro de uma bateria de **256 testes automatizados aprovados**. Os **4 testes de navegador** e o build de produção também passaram. Os testes usam estoque fictício e bancos SQLite temporários; não enviam mensagens a clientes.

| Grupo | Mensagens | Aprovadas |
| --- | ---: | ---: |
| cotação | 64 | 64 |
| compra | 65 | 65 |
| negação, condição ou pesquisa | 31 | 31 |
| ambígua | 20 | 20 |
| **Total de variações** | **180** | **180** |

Cada variação tem uma intenção esperada definida no corpus antes da execução. O teste verifica tanto a classificação quanto o comportamento de Agent.receive: resposta com preço para cotação, alerta de compra e pausa do chat para fechamento, pergunta de confirmação para mensagens ambíguas, e estoque sem baixa ou reserva. Pedidos de cotação também são executados como primeira mensagem de outro cliente, sem aproveitar a referência de uma conversa anterior.

As regressões adicionais cobrem escolha por número ou marca, opção da página atual após MAIS, mudança de referência, pedido direto sem cotação anterior, atualização do estoque, quantidade, medidas de corte, mensagens repetidas, atendimento manual, agente desativado, reativação e migração de bancos antigos. A referência e a opção pendente sobrevivem à reabertura do banco. As regras industriais para canais/frisos, sincronizadoras por largura e abertas por comprimento × largura continuam cobertas pela bateria completa.

No navegador, foram verificados cadastro, importação de estoque, cotação, paginação, atendimento manual, medidas de corte, alerta de compra, resumo da opção escolhida e reativação.

A compra gera o aviso **Quer fechar pedido** e um resumo para o dono. O atendente confirma os detalhes, a disponibilidade e o pagamento; o agente não conclui a venda. A interpretação usa regras locais e correções de escrita comuns. Os resultados se referem aos casos abaixo, não a uma garantia de entender qualquer frase possível.

Para repetir, execute os comandos **npm test**, **npm run test:intents**, **npm run build** e **npm run test:ui**.

Corpus: [commercial-messages.js](../tests/fixtures/commercial-messages.js). Verificações de fluxo: [intents.test.js](../tests/intents.test.js).

## Variações verificadas

| # | Mensagem do cliente | Comportamento esperado | Resultado |
| ---: | --- | --- | --- |
| 1 | Quero uma cotação de correia A42 | Cotação | Passou |
| 2 | Pode cotar a A-42 pra mim? | Cotação | Passou |
| 3 | Quanto custa uma A42? | Cotação | Passou |
| 4 | Qual o preço da correia A 42? | Cotação | Passou |
| 5 | Me passa o valor da A42 | Cotação | Passou |
| 6 | Preciso de orçamento para A42 | Cotação | Passou |
| 7 | Gostaria de cotar A42 | Cotação | Passou |
| 8 | Bom dia, vocês têm A42? Quanto custa? | Cotação | Passou |
| 9 | Boa tarde! Cotação A42 por favor | Cotação | Passou |
| 10 | A42, qual seria o valor? | Cotação | Passou |
| 11 | Qto custa a A42? | Cotação | Passou |
| 12 | qnto sai uma A42? | Cotação | Passou |
| 13 | qro cotacao da A42 pfv | Cotação | Passou |
| 14 | kero orçamento de A42 | Cotação | Passou |
| 15 | keru cotar A42 | Cotação | Passou |
| 16 | qria saber o vlr da A42 | Cotação | Passou |
| 17 | Me manda os vlrs da A42 | Cotação | Passou |
| 18 | preciso de um orc da A42 | Cotação | Passou |
| 19 | Faz um orsamento A42 | Cotação | Passou |
| 20 | cotassao A42 | Cotação | Passou |
| 21 | cotacaoo A42 | Cotação | Passou |
| 22 | cotacaum da A42 | Cotação | Passou |
| 23 | Qual o presco da A42? | Cotação | Passou |
| 24 | Me passa o precu da A42 | Cotação | Passou |
| 25 | cot A42 pf | Cotação | Passou |
| 26 | A42 | Cotação | Passou |
| 27 | a-42 | Cotação | Passou |
| 28 | correia A 42 | Cotação | Passou |
| 29 | Quero comprar A42, mas quanto custa? | Cotação | Passou |
| 30 | Vou levar uma A42, qual o preço? | Cotação | Passou |
| 31 | Antes de fechar, quanto sai a A42? | Cotação | Passou |
| 32 | Para comprar A42 preciso de orçamento | Cotação | Passou |
| 33 | Quero fazer um pedido de cotação A42 | Cotação | Passou |
| 34 | Pode me enviar um orçamento de A42? | Cotação | Passou |
| 35 | Qual seria o custo da A42? | Cotação | Passou |
| 36 | Quanto ficaria uma correia A42? | Cotação | Passou |
| 37 | Quanto sairia a A42? | Cotação | Passou |
| 38 | Preciso consultar o preço A42 | Cotação | Passou |
| 39 | Estou precisando de uma correia A42 | Cotação | Passou |
| 40 | Vocês conseguem cotar A42? | Cotação | Passou |
| 41 | Poderia orçar a A42? | Cotação | Passou |
| 42 | Me mostra o preço da A42 | Cotação | Passou |
| 43 | Solicito orçamento de A42 | Cotação | Passou |
| 44 | Gostaria de saber o preço da A42 | Cotação | Passou |
| 45 | QRO   COTACAO   A42  PFV | Cotação | Passou |
| 46 | COTAÇÃO: A42!!! | Cotação | Passou |
| 47 | Qual o precoo da A42? | Cotação | Passou |
| 48 | Gostaria de um orcamentu da A42 | Cotação | Passou |
| 49 | Preciso de orcament da A42 | Cotação | Passou |
| 50 | Faz uma cotac da A42 | Cotação | Passou |
| 51 | Desejo cotar correia A42 | Cotação | Passou |
| 52 | Pode informar o preço A42? | Cotação | Passou |
| 53 | Me envia a cotação da A42 | Cotação | Passou |
| 54 | Quero valores de A42 | Cotação | Passou |
| 55 | Orçamento para comprar uma A42 | Cotação | Passou |
| 56 | Queria cotar A42 antes de comprar | Cotação | Passou |
| 57 | Tem A42? preciso do preço | Cotação | Passou |
| 58 | Preço da A42 por favor | Cotação | Passou |
| 59 | Qual valor A42? | Cotação | Passou |
| 60 | Me passa uma cotação de A42 sem compromisso | Cotação | Passou |
| 61 | Quero confirmar o preço da A42 | Cotação | Passou |
| 62 | Pode confirmar o valor da A42? | Cotação | Passou |
| 63 | Pode me enviar 2 correias A42, quanto custa? | Cotação | Passou |
| 64 | É minha primeira compra, quero cotar A42 | Cotação | Passou |
| 65 | Quero fechar o pedido | Intenção de compra | Passou |
| 66 | Quero comprar | Intenção de compra | Passou |
| 67 | Vou levar a primeira | Intenção de compra | Passou |
| 68 | Fico com a segunda | Intenção de compra | Passou |
| 69 | Pode separar a terceira | Intenção de compra | Passou |
| 70 | Pode reservar a quarta | Intenção de compra | Passou |
| 71 | Quero a quinta opção | Intenção de compra | Passou |
| 72 | Quero a opção 1 | Intenção de compra | Passou |
| 73 | Vou levar a opção 2 | Intenção de compra | Passou |
| 74 | Separa a opção 3 pra mim | Intenção de compra | Passou |
| 75 | Fechado, pode separar | Intenção de compra | Passou |
| 76 | Fechou! | Intenção de compra | Passou |
| 77 | Fechamos | Intenção de compra | Passou |
| 78 | Fecha o pedido pra mim | Intenção de compra | Passou |
| 79 | Pode fechar | Intenção de compra | Passou |
| 80 | Vamos fechar a compra | Intenção de compra | Passou |
| 81 | Bora fechar | Intenção de compra | Passou |
| 82 | Vamo fechar o pedido | Intenção de compra | Passou |
| 83 | vms fechar | Intenção de compra | Passou |
| 84 | qro fechar o pedido | Intenção de compra | Passou |
| 85 | kero comprar | Intenção de compra | Passou |
| 86 | qro conprar | Intenção de compra | Passou |
| 87 | Quero comrpar | Intenção de compra | Passou |
| 88 | Quero compraar | Intenção de compra | Passou |
| 89 | Quero fexar o pedidu | Intenção de compra | Passou |
| 90 | Pode fexar | Intenção de compra | Passou |
| 91 | fexado! | Intenção de compra | Passou |
| 92 | fexou | Intenção de compra | Passou |
| 93 | fexa o pedido | Intenção de compra | Passou |
| 94 | Quero fecharrr | Intenção de compra | Passou |
| 95 | Pode faturar | Intenção de compra | Passou |
| 96 | Fatura pra mim | Intenção de compra | Passou |
| 97 | Pode emitir o pedido | Intenção de compra | Passou |
| 98 | Pode gerar o pedido | Intenção de compra | Passou |
| 99 | Confirmo a compra | Intenção de compra | Passou |
| 100 | Aprovo o orçamento | Intenção de compra | Passou |
| 101 | Orçamento aprovado | Intenção de compra | Passou |
| 102 | Autorizo a compra | Intenção de compra | Passou |
| 103 | Quero finalizar a compra | Intenção de compra | Passou |
| 104 | Gostaria de fechar o pedido | Intenção de compra | Passou |
| 105 | Preciso fechar a compra | Intenção de compra | Passou |
| 106 | Decidi comprar | Intenção de compra | Passou |
| 107 | Vou comprar agora | Intenção de compra | Passou |
| 108 | Pode confirmar meu pedido | Intenção de compra | Passou |
| 109 | Manda a chave pix | Intenção de compra | Passou |
| 110 | Me passa a chave pix | Intenção de compra | Passou |
| 111 | Como faço pra pagar? | Intenção de compra | Passou |
| 112 | Como eu posso pagar? | Intenção de compra | Passou |
| 113 | Pode gerar o boleto | Intenção de compra | Passou |
| 114 | Pode gerar o pix | Intenção de compra | Passou |
| 115 | Pode mandar | Intenção de compra | Passou |
| 116 | Manda pra mim | Intenção de compra | Passou |
| 117 | Quero essa | Intenção de compra | Passou |
| 118 | Quero esta | Intenção de compra | Passou |
| 119 | Comprar | Intenção de compra | Passou |
| 120 | Fechar | Intenção de compra | Passou |
| 121 | Finalizar | Intenção de compra | Passou |
| 122 | Quero a 2 | Intenção de compra | Passou |
| 123 | Fico com a Gates | Intenção de compra | Passou |
| 124 | Não precisa cotar, quero fechar | Intenção de compra | Passou |
| 125 | Não quero orçamento, quero comprar | Intenção de compra | Passou |
| 126 | Não quero cotar. Quero fechar. | Intenção de compra | Passou |
| 127 | Posso fechar o pedido? | Intenção de compra | Passou |
| 128 | Me manda 2 correias A42 | Intenção de compra | Passou |
| 129 | Envie 3 peças A42 | Intenção de compra | Passou |
| 130 | Não quero comprar, só cotar A42 | Cotação | Passou |
| 131 | Nao quero fechar, só orçamento A42 | Cotação | Passou |
| 132 | Só estou pesquisando A42 | Cotação | Passou |
| 133 | Apenas cotando A42 | Cotação | Passou |
| 134 | Somente orçamento A42 | Cotação | Passou |
| 135 | Ainda estou comparando A42 | Cotação | Passou |
| 136 | Estou vendo A42, não vou comprar agora | Cotação | Passou |
| 137 | Talvez eu compre A42 | Cotação | Passou |
| 138 | Vou comprar A42 mês que vem | Cotação | Passou |
| 139 | Vou fechar A42 semana que vem | Cotação | Passou |
| 140 | Se ficar barato eu fecho A42 | Cotação | Passou |
| 141 | Se for barato vou levar A42 | Cotação | Passou |
| 142 | Se tiver desconto vou comprar A42 | Cotação | Passou |
| 143 | Quero fechar depois, hoje cotação A42 | Cotação | Passou |
| 144 | Quero comprar depois a A42 | Cotação | Passou |
| 145 | Não precisa separar, quero cotar A42 | Cotação | Passou |
| 146 | Não confirma o pedido, só cotação A42 | Cotação | Passou |
| 147 | Nem quero comprar, quero saber o preço A42 | Cotação | Passou |
| 148 | Vou pensar, me passa o valor A42 | Cotação | Passou |
| 149 | Não agora, só cotação A42 | Cotação | Passou |
| 150 | Quem sabe eu compre A42 | Cotação | Passou |
| 151 | Caso eu decida comprar A42, quanto custa? | Cotação | Passou |
| 152 | Vou ver o orçamento A42 | Cotação | Passou |
| 153 | Estou só pesquisando A42 | Cotação | Passou |
| 154 | Apenas consultando a A42 | Cotação | Passou |
| 155 | Só cotação A42, não quero atendente | Cotação | Passou |
| 156 | Não quero falar com atendente, quero cotar A42 | Cotação | Passou |
| 157 | Antes de comprar quero saber o valor A42 | Cotação | Passou |
| 158 | Quero fechar mas quanto custa A42? | Cotação | Passou |
| 159 | Vou levar, mas me passa o preço da A42 primeiro | Cotação | Passou |
| 160 | Não mande 2 correias A42, só cotação | Cotação | Passou |
| 161 | 1 | Pedir confirmação | Passou |
| 162 | 2 | Pedir confirmação | Passou |
| 163 | 3 | Pedir confirmação | Passou |
| 164 | 4 | Pedir confirmação | Passou |
| 165 | 5 | Pedir confirmação | Passou |
| 166 | a primeira | Pedir confirmação | Passou |
| 167 | a segunda | Pedir confirmação | Passou |
| 168 | opção 3 | Pedir confirmação | Passou |
| 169 | opcao 4 | Pedir confirmação | Passou |
| 170 | número 5 | Pedir confirmação | Passou |
| 171 | Pode ser | Pedir confirmação | Passou |
| 172 | Sim | Pedir confirmação | Passou |
| 173 | Gostei da primeira | Pedir confirmação | Passou |
| 174 | Gostei da segunda | Pedir confirmação | Passou |
| 175 | Gostei | Pedir confirmação | Passou |
| 176 | Essa | Pedir confirmação | Passou |
| 177 | Esse | Pedir confirmação | Passou |
| 178 | A mais barata | Pedir confirmação | Passou |
| 179 | Aceita pix? | Pedir confirmação | Passou |
| 180 | Tem desconto? | Pedir confirmação | Passou |
