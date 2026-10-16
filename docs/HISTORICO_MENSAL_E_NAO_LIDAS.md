# Histórico de 30 dias e mensagens novas — versão 1.13.0

Ao conectar ou restaurar o WhatsApp, o Cota busca automaticamente o histórico disponível dos **últimos 30 dias das conversas privadas**. A busca não termina mais em 50 mensagens: começa com 200, aumenta progressivamente a quantidade solicitada e continua até alcançar a data inicial do período ou esgotar o histórico disponibilizado pelo WhatsApp Web. Mensagens mais antigas já salvas no Cota permanecem no banco.

O painel mostra o andamento da importação. Duas conversas são carregadas por vez para limitar o trabalho do navegador. A lista já pode ser usada durante o carregamento; abrir uma conversa pode antecipar a consulta daquele chat. Respostas automáticas a mensagens novas continuam dependendo de uma entrada privada válida.

O WhatsApp Web pode disponibilizar menos histórico que o celular. O Cota guarda o que recebeu e identifica esse resultado como histórico disponível, sem inventar mensagens ou afirmar que importou um backup completo. Falhas de página preservam o que já foi importado e mostram um aviso de importação incompleta; **Sincronizar WhatsApp** inicia uma nova tentativa. A importação não apaga a sessão.

## Onde encontrar cada conversa

- **Não lidas:** conversas sem responsável que receberam uma mensagem nova no Cota e ainda não foram abertas para atendimento. O contador antigo do celular não é copiado para essa aba.
- **Histórico:** conversas sem responsável e sem mensagens novas pendentes. Inclui chats importados e atendimentos liberados depois de lidos. Todos os usuários autorizados podem abrir e assumir esses chats.
- **Conversas · nome:** os atendimentos daquele usuário, inclusive quando recebem novas mensagens. Ao assumir, a conversa sai das abas compartilhadas e o agente permanece pausado naquele atendimento.
- **Todos os atendimentos:** visão do Admin, com chats livres ou atribuídos.
- **Grupos:** continuam somente para consulta da lista e de mensagens novas, sem automação, envio ou importação de mensagens antigas.

**Liberar conversa** e desativar um responsável não fabricam mais uma mensagem não lida. Se houver mensagem nova real ainda pendente, seu contador é preservado; caso contrário, o chat liberado aparece em **Histórico**. Liberar continua sem enviar mensagem ou reativar o agente.

Na primeira atualização para esta política, os contadores antigos de conversas WhatsApp são zerados uma única vez, pois representavam a antiga fila e podiam incluir histórico importado ou liberação. As conversas continuam acessíveis em Histórico/Todos os atendimentos; mensagens, fotos, responsáveis, pedidos e alertas permanecem intactos. Novas mensagens não lidas são preservadas nos reinícios seguintes.

## Consultar pela agenda

Em **Contatos**, clique no **nome do contato** para abrir seu histórico. Essa consulta não assume a conversa, não limpa o contador de atendimento de outra pessoa e não envia mensagens. As mesmas permissões continuam valendo: Comercial não consulta o histórico de outro responsável; Admin pode observar sem transferir.

**Conversar** continua sendo uma ação diferente: abre o atendimento manual e assume um chat livre, reutilizando o mesmo histórico. Consultas já gravadas continuam disponíveis mesmo sem o WhatsApp conectado. Um contato sem conversa mostra que não há mensagens disponíveis, sem criar um chat ou enviar uma primeira mensagem.

## Proteções e persistência

O importador não chama o agente para interpretar mensagens antigas. Todos esses registros continuam `status='imported'` e `inbound_verified=0`. Pedidos antigos como “pode separar”, “quero comprar” e “ATENDENTE” não geram respostas, alertas ou encerramento de cinco minutos. A busca também não consome o identificador de uma mensagem recebida após a conexão, preservando o atendimento a solicitações novas.

Mensagens e metadados da importação ficam no banco do volume existente. Reconectar não duplica registros; o importador não sobrescreve autores, edições ou fotos já salvos. Textos enviados pelo celular mantêm o rótulo Enviado pelo WhatsApp. Mídias antigas ficam como aviso; fotos já recebidas e guardadas pelo Cota continuam disponíveis.

## Verificação

Em 16/10/2026, passaram **2.801 testes de servidor**, **20 testes de navegador** e o build de produção. Esta versão acrescenta **305 testes de servidor** e um cenário de navegador, além de atualizar os testes anteriores para a nova regra de Não lidas.

O novo conjunto combina **5 perfis × 10 posições de data × 6 fluxos = 300 cenários**. Cada cenário busca mais de 500 mensagens usando limites 200, 400 e 800, e verifica datas, ausência de respostas ao histórico e contador de novas mensagens. Os seis fluxos cobrem importação automática, entrada nova, consulta por contato sem assumir, permissões, liberação sem contador artificial e reconexão sem duplicação.

Outros cinco testes verificam o milissegundo anterior/exato/posterior ao limite de 30 dias, histórico disponível menor que um mês, recuperação após falha numa página, migração e persistência dos contadores e consultas anônimas/contatos sem conversa. O novo cenário de navegador consulta o histórico pelo nome, confirma que não assumiu ou enviou, recebe uma mensagem nova em Não lidas e libera o atendimento lido somente para Histórico.

Os testes usam contas e transporte simulados. Não houve leitura da conta real do usuário nem envio a clientes. A imagem Docker deve ser construída no host de instalação; o acesso ao mês completo depende do histórico disponibilizado pelo WhatsApp Web.

Para atualizar, use [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md). Preserve `.env`, a pasta/projeto Compose e o volume `cota-data`. Depois de recriar o serviço, pressione Ctrl+F5 e use **WhatsApp → Sincronizar WhatsApp** para iniciar ou repetir o carregamento.
