# Envio e agradecimentos — versão 1.7.0

Verificação em 16/10/2026: **890 testes automatizados**, **10 testes de navegador** e **build de produção** aprovados. Inclui 168 novos testes de conversa/temporização e dois novos testes de menus no transporte QR. Os testes usam banco, estoque, números e transporte fictícios. Nenhuma mensagem foi enviada a um contato real.

## Fluxos

| Entrada ou situação | Comportamento |
| --- | --- |
| Cliente pede apenas valores | Cotação normal, sem registrar compra |
| Após os valores: ok, obgd, obrigado, valeu ou variação | Uma pergunta **te ajudo em algo mais?**, com Sim/Não |
| Sim ou 1 nesse menu | **Oque mais precisa?**; limpa a busca anterior e aceita o próximo item |
| Não ou 2 nesse menu | Encerra sem mensagem de confirmação e cancela acompanhamentos |
| Agradecimentos repetidos no mesmo menu | Sem nova pergunta |
| Agradecimento ou clique repetido depois de Não | Continua encerrado, sem resposta |
| Nova solicitação de produto depois do encerramento | Reabre apenas em resposta à solicitação e faz a nova cotação |
| Pode separar/quero fechar sem forma de envio | Registra interesse e avisa a equipe; agenda a pergunta de entrega para três minutos de silêncio |
| Forma informada no próprio pedido | Registra no painel; não agenda a pergunta |
| Cliente fala durante a espera, ainda sem indicar envio | Reinicia o prazo de silêncio, sem repetir a confirmação de interesse |
| Atendente assume, libera ou transfere | Cancela a pergunta de envio |
| Cliente informa RETIRA, CORREIOS ou Consultar outros | Registra no resumo, cancela a espera e confirma a escolha uma vez se o bot ainda estiver autorizado |

O prazo de envio só é autorizado por uma solicitação de compra recebida e uma confirmação do bot enviada com sucesso. A pergunta usa uma exceção restrita à pausa automática de interesse de compra: o chat deve continuar sem responsável, com interesse pendente, sem pedido adicional de atendente, sem envio informado e com o agente ligado. Não interrompe atendimento humano.

A pergunta tem **uma tentativa por chat a cada 24 horas**. É marcada no banco antes do envio. Falha ou resultado incerto não geram repetição. Reinício, reconexão, cancelamento e prazo perdido descartam a pergunta antiga. Mensagens recebidas cancelam imediatamente a espera anterior, inclusive enquanto a entrega aguarda a fila de processamento. Cadastro local sem mensagem recebida não autoriza primeiro contato.

O acompanhamento de cotação de cinco minutos continua separado: desativá-lo não desativa a pergunta autorizada de envio. Após agradecimento, os menus de ajuda são reativos, sem temporizador de insistência. A forma de envio não calcula frete, não confirma pagamento e não reserva estoque; a equipe confirma esses detalhes.

## Casos novos

Os 168 testes de [checkout.test.js](../tests/checkout.test.js) incluem:

- **100 conversas:** 20 agradecimentos × cinco respostas (Sim, 1, Não, 2 ou pedido direto de outro item). Conferem ausência de compra indevida, pergunta única, novo item com preço real, encerramento silencioso, cliques/agradecimentos repetidos e ausência de envios mesmo após 30 dias de relógio simulado.
- **18 conversas de envio:** seis formas de pedir compra × três escolhas numéricas. Conferem nenhum envio antes dos três minutos, uma pergunta no prazo, registro da escolha e nenhuma repetição em 200 verificações subsequentes.
- **20 formas de envio junto ao pedido:** retirada, buscar/pegar na loja ou balcão, Correios, Sedex, PAC, consulta de outros, transportadora, motoboy, Uber e entregador. A indicação já fornecida impede a pergunta posterior.
- **30 verificações adicionais:** reinício do prazo após mensagem, resposta antecipada, cancelamento manual, pedido de atendente, agente desligado, pedido confirmado, mensagem humana, desconexão, prazo perdido, encerramento da aplicação, concorrência de 100 verificações e de dois agendadores, falha incerta sem repetição, duplicidade, corrida entre resposta e envio, medidas numéricas após o menu, negação/ambiguidade, persistência e compatibilidade com cotação anterior à atualização.

Os novos testes do [transporte QR](../tests/whatsapp.test.js) conferem que Sim/Não e as três formas de envio aparecem como menus numerados corretos, sem serem substituídos por comandos de atendente. **A conexão por QR usa opções de texto/número, sem botões nativos.** O simulador tem as opções clicáveis.

O décimo teste de [navegador](../tests/browser/panel.spec.js) cotou A89, recebeu ok,obgd, clicou Sim, cotou B72, clicou Não e conferiu que nenhuma confirmação adicional foi enviada. Depois repetiu um agradecimento sem reabrir e iniciou uma nova cotação; ao pedir para separar por Correios, verificou a forma no resumo do pedido e a ausência de agendamento de entrega.

## Reproduzir

```bash
npm test
npm run test:checkout
npm run build
npm run test:ui
```

O relógio dos testes de temporização é simulado; não é necessário esperar três minutos reais. O temporizador do servidor verifica os agendamentos periodicamente. Não houve pareamento real de WhatsApp nem build Docker nesta verificação. Os resultados cobrem os casos descritos, sem garantir interpretação de qualquer frase possível.
