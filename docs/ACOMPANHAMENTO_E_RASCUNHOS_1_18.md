# Acompanhamento da equipe e rascunhos — Cota 1.18.0

Esta versão inclui as atualizações anteriores de atendimento, estoque, mídia, edição/exclusão, Ctrl+V e transferência. A atualização pelo Docker está em [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md).

## Acompanhamento

Um Admin abre **Acompanhamento** no menu lateral para consultar:

- Conversas com cada responsável e fila sem responsável.
- Atendimento manual, ROBINHO ativo e conversas encerradas ainda atribuídas.
- Pedidos para fechar, solicitações de atendente e tempo de espera do cliente.
- Quem está digitando pelo painel, sem confundir esse indicador com presença online.
- Média de resposta individual e da equipe, com quantidade de respostas medidas.

Clique no cartão de um usuário ou use o filtro **Responsável**; busque também pelo nome do cliente. **Abrir** um chat ocupado mantém seu responsável. Um Admin pode transferi-lo pela conversa, sem liberação prévia. Chats livres são assumidos normalmente ao abrir. A fila do acompanhamento mostra atendimentos novos dos últimos 30 dias ainda abertos; conversas atribuídas permanecem visíveis. Histórico importado sozinho não cria fila de atendimento.

A tela usa os eventos em tempo real já existentes. Mudanças de responsável, mensagens e digitação atualizam os dados automaticamente. A consulta a cada 15 segundos recupera atualizações se o fluxo de eventos cair. O horário exibido registra a última consulta bem-sucedida; falhas mostram **Atualização pendente**. Tempos de espera avançam a cada segundo. Ao desconectar o WhatsApp, conversas e indicadores ficam ocultos; os registros são preservados. Comercial não tem acesso à aba nem ao endpoint, inclusive por requisição direta.

### Como é calculada a média

O período é uma janela móvel de **24 horas, 7 dias ou 30 dias**. Não há desconto de noites ou finais de semana: é tempo corrido, não duração total do atendimento.

Uma amostra começa na primeira mensagem nova validada de um turno do cliente e termina na primeira resposta humana com envio confirmado. Mensagens seguidas do cliente contam como um único turno. Mensagens humanas adicionais sem outra mensagem do cliente não aumentam a contagem. O tempo usa o horário de confirmação do envio, não a hora em que o usuário começou a escrever ou criou a mensagem pendente.

Uma confirmação do ROBINHO, por exemplo ao chamar atendente, não elimina a medição humana. Se o cliente escrever novamente depois de uma resposta do bot, começa outro turno. O bot não entra na média de nenhum usuário. No quadro de espera, uma resposta do bot encerra a espera de um chat automático; chats em atendimento manual ou com solicitação humana continuam aguardando a equipe.

Uma resposta pelo celular encerra o turno sem atribuição a um atendente, pois o WhatsApp não identifica qual usuário do Cota a escreveu. Histórico importado, simulador, grupos, envios com falha, envios incertos e registros antigos sem horário confirmado não geram amostras. O início e o fim da espera precisam estar dentro do período selecionado. Sem amostras aparece **—**, nunca zero fictício.

A resposta conta para o **autor que a enviou**, independentemente do responsável atual após uma transferência. A média da equipe é ponderada por todas as respostas medidas; não é a média simples das médias dos usuários. Edições e exclusões de mensagens não apagam os horários registrados. Usuários desativados com amostras ou conversas ainda atribuídas continuam aparecendo identificados. O seletor de período altera as médias, não a atribuição atual das conversas.

## Rascunhos

No atendimento manual de uma conversa sua ou livre, digite normalmente. Salvar o rascunho de um chat livre não assume o atendimento; enviá-lo assume o chat. O painel mostra **Rascunho** na prévia do chat e **Rascunho salvo** abaixo do campo após salvar no servidor.

- O texto é privado por usuário e conversa. Nem o Admin vê o rascunho de outro atendente.
- Voltar a um chat, mudar de aba, recarregar ou sair da conta preserva o texto. Após o aviso de salvamento, ele também é restaurado em outro navegador ou computador na mesma instalação.
- Cada alteração cria uma cópia de emergência neste navegador, e o salvamento no servidor ocorre após uma breve pausa de aproximadamente 400 ms. Se fechar antes disso, reabra no mesmo navegador para recuperar as últimas letras. Limpar os dados do navegador remove somente essa cópia local; rascunhos confirmados no servidor permanecem no volume.
- Transferir ou liberar um chat não envia nem compartilha o texto. Se o autor voltar a assumir a conversa, seu rascunho retorna.
- Duas abas não sobrescrevem silenciosamente versões diferentes: aparece uma escolha entre **Usar rascunho salvo** e **Manter meu texto**.
- **Enviar mensagem** aguarda salvar a versão atual e envia uma única vez. Um envio confirmado limpa somente a versão correspondente. Falha ou envio não confirmado mantém o rascunho. Confira o WhatsApp antes de reenviar um envio incerto.
- Para descartar um rascunho, apague seu texto e aguarde o salvamento.

Os rascunhos guardam texto de até 4.000 caracteres. Prévia de foto/vídeo/áudio e seleção de mensagem citada não são persistidas como rascunho. Salvar texto não envia mensagens, não cria mensagens não lidas, não altera o responsável e não inicia o bot.

## Verificação

Resultados na versão 1.18.0:

| Verificação | Resultado |
|---|---|
| `npm test` | 4.096 testes passaram; zero falhas, cancelamentos ou testes ignorados |
| `npm run test:ui` | 73 testes passaram no Chromium, incluindo tempo real sem depender da consulta periódica |
| `npx playwright test tests/browser/monitoring-drafts.spec.js tests/browser/send-confirmation.spec.js` | Verificação final de rascunhos e envio: 15 testes passaram, incluindo desfazer alterações |
| `npm run test:monitoring` | Verificação final de métricas e rascunhos: 35 testes passaram, incluindo respostas do celular com horário arredondado |
| `npm run build` | Painel de produção compilado |
| `node tests/docker-realtime.mjs cota-qr-repro:1.18.0` | 640 testes passaram no Docker, incluindo servidor HTTP e SSE de acompanhamento/rascunhos |

A imagem de validação reaproveitou as dependências de produção da base 1.17.0 já verificada, com o servidor, o painel compilado e os manifests exatos da 1.18.0. Não foram acrescentadas dependências. O processo habitual de instalação do usuário continua sendo o `Dockerfile` do repositório, reconstruído pelo Compose. A imagem foi executada como usuário `node`, com `init` e rede externa desativada. O teste HTTP de inicialização e do bundle confirmou a presença de acompanhamento, rascunhos, Ctrl+V e transferência.

A suíte do servidor cobre também respostas automáticas, antispam, mensagens novas versus importadas, histórico de 30 dias, cotações com variações de escrita, estoque, permissões, QR, desconexão e transferência. Os testes novos exercitam períodos e limites de data, média ponderada, atribuição ao autor após transferência, reconhecimento de envio, exclusão de histórico/simulador, privacidade, conflitos de rascunhos, falhas/incertezas e persistência após reabrir o banco.

A validação usa bancos descartáveis, APIs reais do aplicativo, eventos SSE e Chromium. O transporte WhatsApp nos testes é controlado: nenhum cliente real recebe mensagens. Pareamento com um telefone real e disponibilidade integral dos 30 dias de histórico na instalação do usuário continuam dependendo do WhatsApp vinculado; os testes locais não provam essas condições externas. Os limites anteriores de transcrição local e botões nativos por QR continuam descritos no [guia de atendimento](ATENDIMENTO_E_ESTOQUE_1_17.md).
