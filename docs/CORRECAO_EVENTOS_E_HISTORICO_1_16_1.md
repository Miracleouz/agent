# Cota 1.16.1 — eventos e histórico

Esta versão trata falhas que permitem ao painel mostrar o WhatsApp como conectado enquanto o recebimento deixa de acompanhar a sessão. Reutiliza o banco, o estoque e o perfil vinculado.

## Correções

- O observador acompanha a coleção global e as coleções das conversas. Continua exigindo evento de mensagem nova, identidade válida e data posterior à conexão para acionar ROBINHO.
- Uma verificação independente a cada cinco segundos reinstala observadores quando a coleção muda ou os callbacks são removidos. As mensagens chegam por eventos, sem esperar a sincronização de cinco minutos.
- Instala também o observador quando o SDK sinaliza conexão pronta com suas funções de integração já existentes. Notificações repetidas de autenticação/conexão não reiniciam o atendimento nem cancelam seu prazo de silêncio.
- Salva e mostra as mensagens disponíveis antes da busca de páginas antigas. Uma página pendente tem prazo e não produz várias requisições simultâneas para o mesmo chat.
- A importação preserva mensagens disponíveis na janela de 30 dias, inclusive após o login, sem executar o agente ou aumentar Não lidas. Se o evento novo legítimo chegar depois da cópia de consulta, a mesma mensagem é confirmada como recebida uma única vez. Histórico sozinho continua sem autorizar respostas.
- O painel mantém atualizações por eventos do servidor, sem recarregar a página. Respostas pelo celular/Web são espelhadas; os próprios envios do Cota não são duplicados.

## Validação

Resultados finais desta versão, sem falhas, testes ignorados ou cancelados:

| Verificação | Resultado |
| --- | --- |
| `npm test` | 3.698 testes passaram |
| `npm run test:ui` | 52 testes de navegador passaram |
| `npm run build` | Build concluído |
| Imagem Docker, mesmo Dockerfile com CA do ambiente no build | Construída com TLS verificado |
| `node tests/docker-realtime.mjs cota-qr-repro:1.16.1` | 325 testes passaram novamente dentro da imagem |
| `node tests/docker-profile-recovery.mjs cota-qr-repro:1.16.1` | 23 verificações passaram |

A imagem validada foi `sha256:d182c636f5c88f71ef8f29f5835844e91e0113a36cfd44e1ba8b5a4823284bee`. O certificado do ambiente foi fornecido como segredo do BuildKit, sem desativar TLS ou incluí-lo na imagem. As tentativas interrompidas por falta de disco foram repetidas após liberar o cache de builds; os resultados acima correspondem às execuções completas finais.

Os testes usam Express, SQLite, o SDK instalado, Chromium e o painel reais com modelos/eventos de WhatsApp simulados. Não acessam a sessão do computador do usuário, não pareiam números e não enviam mensagens reais a clientes.

Os casos cobrem cotação com o agente ativado; recebimento sem resposta quando desativado; mensagens do cliente, do painel e do celular; troca de coleção; callbacks removidos; autenticação pelo SDK; histórico disponível durante uma página pendente; importação sem spam; evento novo após importação; janela de 30 dias; duplicação; grupos; reconexão e desconexão.

O teste do painel clica em **Sincronizar WhatsApp**, consulta o histórico da coleção vinculada, verifica a mensagem de 29 dias e a exclusão da mensagem de 31 dias, envia cotação ao agente ativado e confirma ausência de resposta automática após desativá-lo. Outros testes verificam SSE sem depender da consulta periódica de quinze segundos.

## Atualização no Windows/Docker

Extraia o ZIP em uma pasta temporária. Na pasta da instalação atual, execute:

```powershell
docker compose stop -t 30 cota
```

Copie o código extraído para **essa mesma pasta**, substituindo os arquivos. Preserve `.env`, dados e ajustes próprios do Compose. Mantenha o mesmo nome de projeto/volume; não execute pela pasta temporária do ZIP. Depois execute:

```powershell
docker compose up -d --build --force-recreate cota
docker compose exec cota node -p "require('./package.json').version"
```

Deve mostrar **1.16.1**. Atualize o painel com **Ctrl+F5**. A sessão existente será reutilizada. O histórico está na aba **Histórico**; Admin também pode consultar **Todos os atendimentos**. A importação não cria Não lidas nem respostas do bot.

## Diagnóstico da instalação conectada

Em **WhatsApp → Ver diagnóstico de mensagens**, consulte os observadores e contadores desta conexão. **Baixar diagnóstico** gera um JSON apenas com estados, datas e contagens, sem números, nomes, textos, QR Code, senhas ou chaves da sessão.

- `realtime.status=active` confirma observadores nas coleções atuais; não confirma recebimento de um cliente.
- `browser.counters.events/fresh/delivered` mostram os eventos observados no navegador.
- `received/accepted/duplicates/rejected` mostram o caminho desses eventos no servidor.
- `history` mostra quantos chats têm histórico disponível, completo ou pendente.

Depois de uma mensagem nova de outro número, os contadores e o chat permitem verificar o recebimento efetivo. Com ROBINHO ativado e a conversa em modo automático, uma cotação gera resposta. Em modo manual ou com o agente desativado, a entrada continua visível sem resposta automática.

O aparelho pode não disponibilizar todo o histórico de 30 dias imediatamente. A versão mostra o conteúdo disponível e repete a consulta de páginas pendentes. Os testes automatizados não permitem garantir a disponibilidade de dados nem validar a sessão específica do usuário antes de executar esta versão nela.
