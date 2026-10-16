# Listas e histórico do WhatsApp — versão 1.12.0

As versões anteriores criavam conversas privadas somente a partir de mensagens novas e usavam uma agenda cadastrada no painel. Por isso, conectar por QR não preenchia essas listas com os dados já existentes no WhatsApp. A versão 1.12.0 acrescenta essa sincronização.

## Como usar

1. Atualize o código e recrie o serviço Docker na mesma instalação, preservando `.env`, o volume de dados e ajustes próprios. Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md).
2. Abra o painel e confirme que a conexão mostra **Conectado**. Após conectar ou restaurar a sessão, o Cota consulta conversas, grupos e contatos salvos disponíveis no WhatsApp Web.
3. As conversas livres aparecem em **Não lidas**, que é a fila compartilhada de atendimento. **Todos os atendimentos** permite ao Admin ver também os chats atribuídos. Abrir uma conversa livre continua assumindo o atendimento e pausando o agente naquele chat.
4. A aba **Grupos** recebe a lista de grupos. Continua sendo apenas para consulta: não há envio ou respostas automáticas, download de anexos nem busca de mensagens antigas de grupos.
5. A aba **Contatos** recebe contatos salvos que o WhatsApp disponibiliza com número válido. A sincronização acrescenta contatos sem sobrescrever nomes ou empresas ajustados no Cota. Editar/excluir na agenda do Cota não altera a agenda do celular; uma sincronização posterior pode trazer novamente um contato que continua salvo no WhatsApp.
6. Ao abrir uma conversa privada, o Cota busca **até 50 mensagens recentes disponíveis**. Não se trata de importar todo o backup do celular. Mídias anteriores ficam como aviso, sem download; fotos já registradas no Cota permanecem preservadas.

O cartão de sincronização informa quantidade de conversas, grupos e contatos encontrados e se houve falha parcial. Um Admin pode usar **Sincronizar WhatsApp**, na aba WhatsApp ou Contatos, para tentar novamente sem desconectar a sessão. Se faltar algum dado, confira o cartão e `docker compose logs --tail=100 cota`; erros técnicos aparecem com o prefixo `[WhatsApp sync]`.

## Histórico não aciona o agente

Mensagens importadas são identificadas como **Histórico do WhatsApp · somente consulta**, guardam o horário original e têm status `imported` e `inbound_verified=0`. Não passam pela interpretação do bot, não criam alertas de compra/atendente e não autorizam apresentação, cotação ou encerramento por inatividade. Abrir a lista, sincronizar, reconectar e reativar um chat importado não enviam mensagens.

Só uma nova mensagem privada válida pode autorizar uma resposta automática, respeitando a pausa e o responsável pelo chat. O importador deixa mensagens recebidas no instante da conexão ou depois dele para o receptor de mensagens novas, evitando consumir o identificador de uma solicitação antes de ela chegar ao agente. Mensagens próprias, grupos, canais e status continuam sem autorizar resposta automática.

Textos enviados anteriormente pelo celular aparecem com o rótulo **Enviado pelo WhatsApp**, sem inventar o nome de um usuário do painel. O recurso de edição do Cota não edita mensagens importadas. Mensagens já presentes no banco não são sobrescritas, preservando autores, edições e imagens existentes.

## Responsáveis, permissões e identidades

Sincronizar não transfere chats, não remove responsáveis, não reativa pausas e não altera pedidos ou alertas existentes. Admin e Comercial continuam com as mesmas permissões. Sincronizar manualmente é uma ação de Admin; todos consultam os dados permitidos pelas suas contas.

Os identificadores PN/LID disponibilizados pelo WhatsApp são associados ao mesmo chat. Se já existirem dois históricos distintos para identificadores relacionados, o Cota não os une nem transfere responsáveis automaticamente: mantém os registros e sinaliza sincronização incompleta. Contatos com identificador LID sem telefone confirmado não recebem um número inventado.

Falhas de uma consulta não apagam dados locais. Chamadas têm limite de espera; resultados atrasados de uma sessão desconectada não são aplicados. Pedidos simultâneos compartilham a mesma sincronização. O histórico privado é buscado uma vez por chat durante aquela conexão; uma nova sincronização permite tentar novamente.

## Verificação

Em 16/10/2026, passaram **2.496 testes de servidor**, incluindo **310 novos testes de sincronização**, **19 testes de navegador** e o build de produção. Dois testes novos de navegador conferem as listas depois de conectar, consulta do histórico, grupos sem envio, nova sincronização da agenda e preservação do responsável numa transferência. A matriz nova de servidor combina **cinco perfis × dez nomes com variações de escrita × seis fluxos = 300 cenários**:

- Listas e histórico sem envio de mensagens.
- Preservação de responsável, pausa, alertas, nome ajustado e mensagem já corrigida.
- Histórico antigo ignorado pelo agente e mensagem nova chegando por LID sem perder sua resposta.
- Permissões entre usuários, consulta por Admin e bloqueio de edição de textos importados.
- Falha parcial de contatos e recuperação sem duplicar chats ou mensagens.
- Cancelamento durante desconexão e nova sincronização na reconexão.

Outros dez casos verificam identidades próprias/inválidas, preservação de autores e imagens, limite e ordem do histórico, autorização da API, chamadas simultâneas, históricos conflitantes, falha na consulta de chats, timeout, reativação sem primeiro contato e desconexão durante busca de histórico.

Os testes usam contas, contatos, mensagens, grupos e transporte simulados. A leitura da agenda e do histórico de um número real depende do pareamento no host do usuário e dos dados disponibilizados pelo WhatsApp Web. Não foi feita validação com a conta real do usuário nem build da imagem Docker neste ambiente.

Comandos: `npm run test:sync`, `npm test`, `npm run build` e `npm run test:ui`.
