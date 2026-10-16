# Equipe, pedidos e unidades — versão 1.4.0

Verificação em 16/10/2026: **500 testes automatizados aprovados**, **7 testes de navegador aprovados** e **build de produção aprovado**. A bateria inclui as **100 conversas completas** e os **20 cenários sem início pelo cliente** documentados na versão anterior. Os testes usam bancos temporários, estoque fictício e transporte de WhatsApp simulado. Nenhuma mensagem foi enviada a um contato real.

## Contas e atendimento compartilhado

Uma instalação tem um dono, contas de atendentes e um WhatsApp da loja. O QR é conectado pelo dono. Todos acessam a mesma URL e o mesmo histórico; as contas não representam números de WhatsApp separados.

Os 11 testes de equipe verificam:

| Fluxo | Resultado verificado |
| --- | --- |
| Logins separados | Nome, e-mail e papel corretos; histórico compartilhado; senhas com hash; hashes ausentes das respostas da API |
| Permissões | Atendente não administra usuários, estoque, configurações ou QR; não consegue criar uma conta de dono |
| Disputa por chat | Duas tentativas simultâneas deixam apenas um responsável; o outro não envia nem reativa o agente naquele chat |
| Transferência | O dono assume explicitamente; o responsável anterior perde permissão para responder |
| Digitação | Nome vem da sessão; identidade e texto forjados são recusados; presença pode ser encerrada |
| Desativação | Sessões revogadas; responsabilidade liberada; agente permanece pausado; nenhuma mensagem automática |
| Troca de senha | Encerra somente as outras sessões da pessoa, preservando os demais acessos |
| Redefinição pelo dono | Senha anterior deixa de funcionar; novo login funciona; e-mail duplicado é rejeitado sem distinguir maiúsculas |
| Alertas | Compra, solicitação de atendente e pedido fechado coexistem; confirmação interna é idempotente, não envia e não baixa estoque |
| Assinatura e histórico | Nome autenticado assina a mensagem enviada; nome original permanece no histórico após alteração cadastral; preferência de assinatura é aplicada no servidor |
| Migração | E-mail, senha e sessão antigos do dono permanecem válidos; chats e alertas existentes são preservados e permitem marcar o pedido fechado |

O teste de alertas também verifica que repetir **vou comprar** enquanto um pedido fechado aguarda atendimento não apaga esse estado nem envia outra confirmação. Após a reativação, uma nova solicitação de compra volta ao estado de interesse.

No navegador, duas sessões independentes verificam: cadastro de Rafael pelo dono, login de Rafael como atendente, acesso às mesmas conversas, ausência dos controles administrativos, responsabilidade por chat, **Rafael Costa está digitando…** no painel do dono e mensagem assinada como `*Rafael Costa*: Olá! Vou conferir seu pedido.`. Depois, marcam o pedido fechado, verificam o aviso adicional de atendente e desativam a conta, encerrando seu acesso.

O painel guarda o corpo da resposta, o nome e identificador do autor, e o texto preparado para entrega com a assinatura. A digitação envia somente um indicador temporário, sem compartilhar o rascunho. Os indicadores expiram quando a pessoa para de digitar ou perde o acesso. As respostas antigas sem identificação continuam disponíveis como mensagens do dono.

## Compra e comprimento

Os 34 testes adicionais de linguagem e unidade verificam:

- **27 combinações** de comprimento com `MT`, `MTS`, `METRO`, `METROS`, minúsculas e pontos finais; formas com e sem espaço, `x` e nomes de dimensões. Para uma aberta de 50 mm a R$ 114 por metro, **2 MT × 25 mm** resulta em **R$ 114 por corte**.
- Unidades de estoque `MT`, `MTS`, `METROS` e `M` como metros; `MM` continua milímetro. Referências **1200 8M**, **1304-8M-20**, **3VX500**, **5V2240** e **4 PK 650** não se transformam em comprimentos.
- As frases **pode separar**, **quero fechar**, **vou comprar**, **Pode separar pra mim**, **QRO FEXAR** e **vou conprar** como intenção de compra. A bateria anterior mantém os testes de negação, consulta, pesquisa e ambiguidade.

Os alertas distinguem **Quer fechar pedido** de **Pedido fechado**, marcado por uma pessoa. A marcação interna não equivale a confirmação de pagamento, reserva ou baixa de estoque. O agente permanece pausado até reativação. Uma solicitação adicional de atendente permanece visível junto ao pedido.

## Proteção contra mensagens indevidas

A bateria completa preserva as verificações de grupos, status, notificações internas, histórico, mensagens próprias, duplicidade, reconexão, reinício, agente desligado e atendimento manual. O acompanhamento permitido é uma tentativa por chat em 24 horas, após cotação enviada e cinco minutos de silêncio, com as três opções solicitadas. Não inicia conversas sem mensagem recebida válida.

Criação de contas, digitação no painel, desativação de acessos e marcação de pedido fechado não geram mensagens automáticas para o cliente. Respostas manuais exigem sessão ativa e permissão de atendimento; o servidor confere essas condições novamente ao executar o envio na fila do chat.

## Reproduzir

```bash
npm test
npm run test:team
npm run build
npm run test:ui
```

Fontes: [team.test.js](../tests/team.test.js), [meter-units.test.js](../tests/meter-units.test.js) e [panel.spec.js](../tests/browser/panel.spec.js). O [relatório de conversas do ROBINHO](TESTES_CONVERSAS_ROBINHO.md) descreve os 120 cenários de conversa mantidos nesta bateria.

Os resultados cobrem esses casos; regras locais não garantem entender qualquer frase possível. O transporte foi simulado, sem pareamento ou entrega real nesta verificação. A imagem Docker não foi construída neste ambiente; a validação foi feita com Node.js e Chromium locais.
