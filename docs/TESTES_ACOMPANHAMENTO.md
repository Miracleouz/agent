# Comprimento de abertas e acompanhamento — versão 1.2.0

Verificação em 16/10/2026: **312 testes automatizados aprovados, 5 testes de navegador aprovados e build de produção aprovado**. A bateria inclui as 180 variações de escrita da versão anterior. Os cenários usam estoque fictício, bancos temporários e transporte simulado; nenhuma mensagem foi enviada a clientes reais. Os prazos e a concorrência usam relógio controlado, sem esperar cinco minutos reais.

## Comprimento e preço

| Entrada | Resultado verificado |
| --- | --- |
| AT10 33000 | Comprimento de 33 m; pergunta a largura |
| AT10 33.000 | Comprimento de 33 m; pergunta a largura |
| AT 10 33000, AT10-33000 | Mantém o perfil AT10 e converte para 33 m |
| AT10 33000mm, AT10 33000 milímetros | Converte 33000 mm para 33 m |
| AT10 33m, AT10 33 metros | Comprimento de 33 m |
| AT10 33000 x 25mm, AT10 33000x25 | Cotação de 33 m × 25 mm |
| AT10 33000 / 25mm, AT10 33000, 25mm | Separa comprimento e largura |
| AT10 33000, seguido de resposta 25 à pergunta de largura | Preserva os 33 m e usa largura de 25 mm |
| AT10 50mm | Largura de 50 mm; não interpreta como comprimento |
| AT10 3300, AT10 33000 fechada, 1200 8M 20mm, PJ350 5 frisos, 5V2240 4 canais | Não converte códigos comuns de fechadas, frisos ou canais em metros |
| Comprimentos conflitantes | Pede esclarecimento; não informa preço calculado |
| Comprimento contínuo insuficiente | Não oferece o corte nem soma retalhos |

Com estoque fictício de uma faixa de 50 mm a R$ 114/m, o corte de 33 m × 25 mm resulta em **R$ 1.881,00**: 114 ÷ 50 × 33 × 25. Esse valor é um exemplo de teste, não um preço fornecido ao catálogo da instalação.

## Regras do acompanhamento

Após uma cotação com opções e preço enviada com sucesso, o prazo padrão é **5 minutos**. A verificação periódica pode acrescentar alguns segundos ao prazo. Não é agendado para saudações, produtos não encontrados, medidas faltantes, preços não confirmados ou envios que falharam.

O cliente recebe uma única mensagem:

> Como você prefere continuar?
>
> 1 — Quer fechar o pedido?
>
> 2 — Adicionar mais itens
>
> 3 — Encerrar conversa
>
> Responda 1, 2 ou 3.

Na conexão por QR, as opções são texto, sem botões nativos do WhatsApp. O simulador oferece botões com os mesmos comandos. A escolha 1 informa intenção de compra ao dono, sem confirmar venda, pagamento ou reserva. A escolha 2 pergunta os dados do próximo item e mantém o histórico anterior. A escolha 3 encerra o atendimento, sem apagar as mensagens; uma nova mensagem real do cliente pode iniciar outro atendimento.

## Prevenção de envios indevidos verificada

| Cenário | Resultado |
| --- | --- |
| Antes de completar 5 minutos | Nenhum acompanhamento |
| Cinco minutos completos sem resposta | Uma mensagem com exatamente três opções |
| Mais 100 verificações e sete dias sem nova mensagem | Nenhuma repetição |
| 100 verificações simultâneas e outro agente usando o mesmo banco | Uma única tentativa de envio |
| Cliente responde no momento da verificação | Cancela o acompanhamento que ainda aguarda processamento |
| Cliente agradece, cumprimenta, pede atendente, pede para separar, fecha, adiciona itens ou encerra | Cancela o agendamento anterior |
| Cliente declara estar apenas pesquisando | A cotação não agenda o convite de fechamento |
| Pedido para separar junto de uma pergunta de preço | A cotação não agenda o convite de fechamento |
| Um cliente responde e outro permanece em silêncio | Cancela somente o acompanhamento do primeiro |
| Cliente pede nova cotação antes do primeiro acompanhamento | Conta o prazo a partir da nova cotação |
| Nova cotação no mesmo chat depois de um acompanhamento | Não permite outra tentativa nas 24 horas seguintes |
| Passam 24 horas sem cliente escrever | Não agenda nada espontaneamente |
| Nova cotação solicitada pelo cliente depois do limite de 24 horas | Pode agendar um novo acompanhamento |
| Atendimento manual ou pausa temporária que depois expira | Cancela; não recupera o agendamento antigo |
| Agente desligado, acompanhamento desativado ou mudança de prazo | Cancela os agendamentos anteriores |
| Reconexão ou reinício | Descarta agendamentos e menus antigos; não faz envios retroativos |
| Conexão indisponível ou execução atrasada mais de dois minutos além do prazo | Descarta o acompanhamento |
| Falha de envio, envio incerto ou reinício durante envio | Não tenta automaticamente outra vez; mantém o limite de 24 horas |
| Mensagem recebida em duplicidade | Não gera outra cotação, prazo ou acompanhamento |
| Grupos, status, canais, mensagens próprias e notificações internas | Não iniciam atendimentos nem acompanhamentos |
| Dono envia mensagem ou aplicação é encerrada | Nenhum acompanhamento posterior daquela cotação |
| Respostas 1, 2, 3 com o menu ativo | Acionam fechar, adicionar e encerrar, respectivamente |
| Cliente deixa o menu e depois responde 2 a uma cotação | Volta a tratar o número como escolha da cotação, pedindo confirmação |
| Cliente encerra e repete o comando | Não repete a confirmação de encerramento |

O estado e a tentativa são gravados antes de chamar o transporte. O acompanhamento não tem retentativa automática. Esse comportamento prioriza evitar mensagens repetidas quando não é possível saber se um envio chegou ao WhatsApp. Uma vez que um envio já começou no transporte, a aplicação não consegue retirá-lo; o cancelamento protege os envios que ainda não começaram.

## Reprodução

```bash
npm test
npm run test:followups
npm run build
npm run test:ui
```

Fontes: [followups.test.js](../tests/followups.test.js), [open-length.test.js](../tests/open-length.test.js), [whatsapp.test.js](../tests/whatsapp.test.js), [api.test.js](../tests/api.test.js) e [panel.spec.js](../tests/browser/panel.spec.js).

Os testes do navegador cobrem o prazo de acompanhamento configurável e persistente, a cotação AT10 33000 com resposta posterior de largura, além dos fluxos existentes de importação, compra, atendimento manual, reativação e uso em tela pequena. As regras locais cobrem os exemplos documentados; medidas e intenções ambíguas continuam exigindo confirmação.
