# Fotos, sincronização automática e histórico — 1.15.0

## Comportamento

- Fotos de contatos e grupos aparecem nas listas e nos cabeçalhos; a agenda também mostra a foto do contato. Se o WhatsApp não disponibilizar a foto ou a pessoa restringir sua visibilidade, aparecem as iniciais ou o ícone do grupo.
- As fotos ficam no banco do servidor e são entregues por rotas autenticadas do Cota. A foto de um chat segue as permissões do histórico. Os links temporários do WhatsApp não são enviados ao navegador da equipe. O cache evita consultas repetidas, é revisto após 30 minutos e mantém a foto entre reinícios. Falhas transitórias preservam a imagem anterior; uma foto removida ou indisponível limpa o cache.
- A sincronização inicia ao conectar, repete após cinco minutos e tenta novamente após 30 segundos quando há pendências. O botão **Sincronizar WhatsApp** permanece disponível. Execuções simultâneas compartilham a mesma operação. Desconectar ou encerrar o servidor cancela os trabalhos pendentes.
- O histórico privado continua buscando os últimos 30 dias por paginação. Se o serializador da biblioteca falhar, lê as mensagens disponíveis sem depender dele. Também recupera vínculos PN/LID conhecidos pelo navegador quando a consulta normal desses vínculos falha.
- Se faltarem mensagens anteriores, solicita o histórico ao telefone vinculado pela função de sincronização do WhatsApp. Isso é uma solicitação de dados entre aparelhos, sem mensagem ao cliente. Quando os dados ainda estiverem sendo preparados, o chat mostra **Aguardando o WhatsApp disponibilizar o histórico** e tenta novamente automaticamente.
- **Carregar histórico** permite nova tentativa no chat ou na consulta de Contatos, sem assumir o atendimento ou reenviar mensagens. Ao consultar um contato que ainda não tem chat em cache, verifica sua identidade e carrega uma conversa para consulta, sem responsável, sem não lidos artificiais e sem autorizar o bot a iniciar contato.
- A consulta do histórico por Contatos não é mais cancelada continuamente pelos eventos de progresso do painel.

O período completo depende dos dados disponibilizados pelo WhatsApp Web e pelo telefone vinculado. O painel diferencia um mês carregado, o histórico disponível na sessão, uma espera pelo telefone e uma falha. Ele não afirma que importou um mês quando não recebeu mensagens. Grupos continuam em modo de consulta, sem respostas do agente e sem importação retroativa de mensagens do grupo nesta versão.

## Atualização

Atualize na mesma pasta e no mesmo projeto Compose, preservando `.env`, ajustes próprios e o volume. O guia detalhado está em [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md).

```powershell
docker compose up -d --build --force-recreate cota
docker compose exec cota node -p "require('./package.json').version"
```

A versão deve ser **1.15.0**. Pressione **Ctrl+F5**, mantenha o WhatsApp conectado e confira **Histórico**, **Contatos** e **Grupos**. A importação inicia automaticamente. Se um chat ainda estiver vazio, use **Carregar histórico**. Não apague a sessão ou o volume para instalar a atualização.

## Verificação

Passaram **3.166 testes de servidor**, **32 testes de navegador** e o build de produção. Foram acrescentados 20 casos de servidor e cinco de navegador, incluindo:

- Fotos decodificadas no navegador, rotas autenticadas, permissões por chat, cache, remoção, persistência e cancelamento.
- Restrição do download de fotos a HTTPS nos domínios do WhatsApp, limite de tamanho, validação do formato e bloqueio de redirecionamentos.
- Sincronização automática sem sobreposição, parada ao desconectar e manutenção do botão manual.
- Histórico disponibilizado depois da conexão, leitura por data, nova tentativa manual, consulta de contato fora da lista inicial e ausência de respostas a solicitações antigas.
- Falha `r` no serializador da biblioteca instalada e recuperação em VM e Chromium.
- Consulta por Contatos enquanto eventos chegam mais rápido que a resposta do histórico.

Os testes usam contas, fotos e conversas fictícias. Não houve pareamento com a conta real do usuário nem envio a clientes. A imagem Docker deve ser construída na instalação de destino.
