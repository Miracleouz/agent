# Reativação silenciosa — 1.19.1

Reativar o agente, liberar uma conversa ou expirar uma pausa apenas deixa o agente pronto para a próxima mensagem do cliente. Nenhuma dessas ações envia aviso de retorno, saudação, cotação ou lembrete. O encerramento automático de cinco minutos mantém somente o aviso de encerramento já solicitado; não há aviso de reativação.

## Correção

Na versão anterior, reativar apagava a marca de encerramento. Se uma sincronização encontrasse uma cotação antiga ainda marcada como não lida, ela podia ser promovida a solicitação pendente e gerar outra saudação e resposta. O defeito foi reproduzido: o teste esperava zero envios, mas registrou um.

Agora cada conversa guarda um limite persistente de encerramento/reativação. Mensagens anteriores a esse limite permanecem no histórico e não autorizam o atendimento automático, mesmo após sincronizar, reconectar ou reiniciar. A liberação e a expiração de pausa também removem a autorização antiga de lembretes. Áudios pendentes são invalidados pelas versões de atendimento existentes; áudios antigos não são baixados ou transcritos para iniciar outro atendimento.

Uma nova mensagem recebida continua podendo iniciar a cotação e os fluxos autorizados. Uma solicitação recebida durante uma desconexão, após o limite, também pode ser atendida na sincronização. O limite impede que o texto da conversa encerrada seja incluído junto com o novo pedido. O desligamento global do agente continua prevalecendo.

Na atualização, conversas anteriormente controladas por atendentes ou encerradas recebem esse limite uma vez. As mensagens anteriores à atualização ficam somente no histórico dessas conversas. Conversas nunca controladas ou encerradas continuam com a regra autorizada de responder às cotações antigas realmente não lidas.

## Validação

Resultados finais: **4.344 testes do servidor passaram**, **15 testes do painel passaram** e **849 testes da imagem Docker passaram**, sem falhas, cancelamentos ou testes ignorados nessas rodadas. O arquivo de regressão desta correção contém 133 casos. A compilação do painel também passou.

- Regressão que reproduz o envio indevido na versão anterior.
- 120 combinações de reativação, liberação, encerramento, pausa expirada, estoque carregado/vazio e variações de cotações, compra e atendente. Cada combinação verifica sincronizações repetidas sem envio e atendimento somente após uma nova mensagem.
- Corrida entre sincronização e encerramento; áudio atrasado; áudio histórico; separação entre cotações antes/depois do limite; encerramento por inatividade; persistência e migração sem apagar histórico.
- Clique real em **Reativar agente** pelo Chromium, seguido de repetição de uma cotação importada e de uma nova cotação.
- Mensagem nova registrada primeiro pelo histórico no mesmo segundo da reativação: o evento novo atende uma vez. Uma mensagem que já estava registrada antes da reativação continua bloqueada mesmo nesse segundo. As duas situações têm testes separados porque o WhatsApp usa horários com precisão de segundos.

Os testes usam dados fictícios, o SDK instalado e modelos controlados do WhatsApp. Não foi pareada uma conta real e nenhuma mensagem foi enviada a clientes.

O painel foi compilado com `npm run build`. Para os testes Docker, foi usada a imagem 1.19.0 já validada, atualizada com o servidor, painel compilado e versão 1.19.1. Não há mudanças de dependências ou do Dockerfile entregue. Os testes executam sem rede, com usuário `node` e Chromium real.

Na primeira rodada completa, um teste antigo de histórico gerou uma data em outro segundo e esperou 29 mensagens quando havia 30 dentro do intervalo calculado. A referência das páginas fictícias foi ancorada no instante da própria sincronização, preservando as mesmas verificações de quantidade e limite mensal. A suíte completa foi repetida e passou; o teste corrigido também passou isoladamente. Não houve alteração da janela de histórico da aplicação.

## Atualização

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), usando a mesma pasta/projeto e volume existentes. Não é necessário recriar a sessão ou apagar dados. Após atualizar, a versão deve mostrar `1.19.1`. A notificação ao clicar em reativar passa a dizer: **Agente pronto. Aguardando nova mensagem do cliente.** Essa notificação aparece apenas no painel.
