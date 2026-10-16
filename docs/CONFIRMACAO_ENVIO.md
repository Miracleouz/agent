# Confirmação de envio — versão 1.15.1

## Problema reproduzido

Um texto ou foto aparecia enviado no WhatsApp, mas o Cota mostrava **Falha no envio — Não foi possível confirmar o envio da mensagem**.

Na biblioteca instalada, `whatsapp-web.js` 1.34.7, o envio para a fila do WhatsApp e a consulta do resultado são etapas distintas. Depois de aceitar o envio, a biblioteca consulta a coleção de mensagens e converte o registro completo. Uma consulta vazia ou um erro nessa conversão pode perder o retorno de um envio já aceito. Também havia uma confirmação de leitura depois do envio; uma exceção inesperada nessa etapa podia alterar o resultado do envio.

## Correção

Cada tentativa pelo Cota recebe uma identificação interna aleatória. O adaptador captura o identificador exato gerado pelo SDK e confirma a aceitação da promessa da fila do WhatsApp **antes** da consulta e da conversão do resultado. A identificação interna é removida antes de chamar a fila; ela não faz parte da mensagem enviada ao cliente.

Se a consulta posterior falhar, essa confirmação permite registrar o mesmo envio e seu identificador no Cota. Não se procura uma mensagem por texto, nome ou horário, nem se repete a chamada de envio. São verificados o destinatário, o identificador, a direção de saída e a tentativa. A resolução do número de telefone para um identificador LID pelo próprio SDK é respeitada.

Texto, menus, fotos, legendas e assinatura do atendente usam o mesmo fluxo. A leitura continua sendo sincronizada, mas sua falha não altera um envio já confirmado. Os checks de entrega e leitura dependem das confirmações recebidas do WhatsApp; a aceitação pela fila não cria checks duplos ou azuis.

Quando falta prova suficiente, a mensagem fica como **Envio não confirmado**, com a orientação **Confira no WhatsApp antes de reenviar; a mensagem pode já ter sido enviada**. A API retorna HTTP 202 e o painel limpa o campo de composição, mantendo o aviso no histórico. Não há reenvio automático. A repetição da mesma solicitação de foto reutiliza o registro persistido, inclusive se o envio estiver incerto.

Se a preparação da confirmação não estiver disponível, o envio é interrompido antes da chamada ao SDK, com orientação para reconectar. As marcações antigas de falha permanecem no histórico: não são alteradas para enviadas sem confirmação e não são reenviadas pela atualização.

## Validação

- **35 testes novos** em `tests/whatsapp-send.test.js`, usando o método `Client.sendMessage` e os utilitários reais da biblioteca instalada com módulos do WhatsApp Web simulados em memória.
- Reprodução do envio com retorno vazio, erro na conversão e erro na consulta posterior; textos e fotos com destinatários PN e LID.
- Confirmação independente da leitura, assinaturas, menus, envio simultâneo de textos idênticos, troca de conexão, destinatário incorreto e reutilização de identificação.
- Resultados de fila rejeitados ou incompatíveis permanecem incertos; não são promovidos a sucesso. Histórico com o mesmo identificador não duplica uma mensagem confirmada.
- O agente continua exigindo uma mensagem recebida válida para responder; eventos próprios, grupos e mensagens repetidas não autorizam novos envios.
- **Quatro cenários novos no Chromium** com o SDK instalado: envio de texto com retorno vazio, erro de conversão, envio de foto e envio incerto. Conferem o histórico após recarregar, o aviso, o campo de composição, a assinatura, o check e a ausência de reenvio.

A bateria completa desta versão passou com **3.201 testes automatizados**, **36 testes de navegador** e o build de produção. Não foi conectado um WhatsApp real nem foi enviado conteúdo a clientes. Os testes reproduzem a biblioteca e o navegador com dados isolados; a entrega e as permissões do serviço devem ser conferidas na instalação após atualizar. Não foi executado build Docker neste ambiente.

## Atualizar

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), mantendo a pasta, o projeto Compose e o volume já usados. Confira a versão `1.15.1` no contêiner e recarregue o painel com Ctrl+F5. Não reenvie mensagens antigas apenas porque o registro anterior indicava falha; confira primeiro no WhatsApp.

Os logs novos usam códigos sem incluir o conteúdo da mensagem ou a identificação da tentativa:

- `[WhatsApp send] receipt_recovered`: a confirmação do envio foi recuperada.
- `[WhatsApp send] unconfirmed`: não houve prova suficiente para confirmar o envio.
- `[WhatsApp send] receipt_preflight_unavailable`: o envio foi impedido antes de chamar o SDK.
- `[WhatsApp read] failed_after_send`: a leitura falhou depois de um envio confirmado.
