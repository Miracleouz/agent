# Retirada pelo cliente — versão 1.8.0

Verificação em 16/10/2026: **1.123 testes automatizados**, **11 testes de navegador** e **build de produção** aprovados. Os testes usam estoque, bancos, contatos e transporte fictícios. Nenhuma mensagem foi enviada a um WhatsApp real.

## Atendimento

O cliente pode informar `vou mandar o motorista`, `vou mandar motoboy`, `vou mandar o uber`, `vou mandar o 99`, `vou mandar retirar`, `vou retirar`, `vou buscar aí` e variações. O agente registra **RETIRA** e pergunta:

> Para agilizar na hora da retirada informe nome de quem vai retirar e nome da empresa

A pergunta é reativa, após uma mensagem válida recebida. Não existe temporizador de cobrança dos dados de retirada. Há no máximo uma tentativa dessa pergunta por conversa a cada 24 horas; a marcação é persistida antes do envio. Repetição, concorrência, falha incerta, reconexão e reinício não autorizam tentar novamente. Depois de 24 horas, outra mensagem de retirada pode iniciar uma nova pergunta; o tempo sozinho não envia nada.

Se o cliente mandar uma cotação junto com a retirada, os preços e a pergunta saem na mesma resposta. Se faltarem medidas, a pergunta da medida continua sendo processada: um número de frisos ou largura não é salvo como nome. A apresentação do ROBINHO continua aparecendo no primeiro atendimento de cada período de 24 horas.

Os textos recebidos em seguida ficam no histórico e na seção **Retirada · identificação**, literalmente como enviados, inclusive nomes e empresa em mensagens separadas. Não há extração ou validação automática de cadastro; a equipe confere os dados. Agradecimentos e confirmações curtas nesse preenchimento não geram novas mensagens. Um novo pedido de cotação, compra, atendente ou encerramento segue o fluxo correspondente.

O agente distingue `vou mandar um Uber` (cliente envia alguém buscar) de `pode mandar por motoboy` (cliente solicita entrega à loja). A referência `A99`, o número `99` sozinho, negações, condições e escolhas ambíguas não viram retirada por aplicativo.

Atendimento assumido, pausa manual e agente desligado impedem a pergunta automática. A exceção da espera de compra continua limitada ao chat sem responsável, antes de um atendente assumir, enquanto a coleta da forma de envio está autorizada. A opção explícita **Reativar agente** permite novas respostas, mesmo mantendo o responsável registrado. A retirada informada cancela as perguntas agendadas de envio e de acompanhamento da cotação anterior. Informar retirada não confirma venda nem reserva estoque.

## Casos executados

Os **233 testes** de [pickup.test.js](../tests/pickup.test.js) incluem:

| Cobertura | Casos |
| --- | ---: |
| 32 variações de retirada em cinco momentos: primeiro contato, após cotação, junto da compra, durante espera de envio e após menu de envio | 160 |
| Entrega pedida à loja, Correios, códigos/números, negações, condições, perguntas e ambiguidades | 30 |
| Pausa, desligamento, responsável, conversa liberada, atendente e pedido confirmado | 6 |
| Grupos, mensagens próprias, status, broadcast e canais | 6 |
| Ausência de mensagem inicial, falha, duplicidade, concorrência, silêncio, prazo de 24 horas, nova cotação, prioridade de atendente, reabertura e persistência | 11 |
| Cotação e retirada na mesma mensagem | 6 |
| Confirmações curtas após a pergunta | 5 |
| Reativação explícita e medidas numéricas | 2 |
| Identificação com nome, empresa, motorista e quem vai retirar, incluindo empresa com a palavra Correias e números | 7 |
| **Total novo** | **233** |

As 160 conversas da matriz também conferem repetição da frase, repetição por outra forma de retirada, agradecimento, dados em mensagens separadas e 30 verificações posteriores de relógio sem novos envios.

O novo teste do navegador confere a compra com `vou mandar o 99`, **RETIRA** no resumo, a pergunta exata, nome/empresa visíveis no painel, frase repetida sem nova pergunta e agradecimento sem resposta adicional. As dez verificações anteriores do painel permanecem aprovadas.

Comandos: `npm test`, `npm run build` e `npm run test:ui`. Não houve pareamento ou teste de entrega em número real nesta atualização.
