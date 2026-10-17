# Cota 1.16.2 — identificadores atuais do WhatsApp e bloqueio do perfil

## Causa comprovada pelo diagnóstico

A instalação 1.16.1 observou 57 eventos novos e rejeitou todos com `identifier`; nenhum chegou ao agente. A versão publicada de whatsapp-web.js (1.34.7) e as adaptações do Cota dependiam de `id._serialized`. O código atual do WhatsApp usa `id.$1` em parte desses modelos. O [código atual do SDK](https://github.com/pedroslopez/whatsapp-web.js/blob/main/src/util/Injected/Utils.js) também documenta e adapta essa mudança; a correção ainda não estava na versão publicada consultada.

Isso afetava três caminhos: recepção, deduplicação/importação do histórico e comprovante dos envios. No histórico, várias mensagens eram agrupadas sob a mesma chave `undefined` e depois ignoradas. Os testes anteriores forneciam somente `_serialized`, portanto não reproduziam o formato desta instalação.

A versão 1.16.2 aceita os dois campos sem inventar identificadores. Normaliza a saída do SDK, preserva os IDs distintos do histórico e confirma a fila do envio usando o identificador original. Mantém as restrições de mensagens novas, privadas, posteriores à conexão e sem repetição. Mensagens antigas não acionam o bot nem criam Não lidas.

O diagnóstico separa `identifier`, `invalid_timestamp`, `before_connection` e `history_event`. Os contadores do navegador mostram também quantas chaves foram lidas em cada formato, sem expor números, textos ou IDs.

## QR sem depender de recriar a conexão

O perfil persistente passa a ter uma reserva exclusiva pelo kernel Linux (`flock`, incluído explicitamente na imagem). Ela protege o mesmo volume entre processos e contêineres; é liberada quando o processo encerra, inclusive após um encerramento abrupto. A aplicação fecha o Chromium antes de liberar a reserva.

Nos perfis gerenciados por esta versão, o próximo clique em **Gerar QR Code** recupera links de bloqueio antigos após verificar os processos, preservando autenticação, estoque e histórico. **Recriar conexão** não faz parte desse procedimento.

Um bloqueio herdado de uma versão antiga, cujo proprietário não pode ser comprovado, exige **Recuperar conexão** uma vez, com as outras instalações paradas. Essa ação remove apenas os links antigos e registra o perfil como gerenciado. Depois disso, bloqueios abandonados pelos reinícios seguintes são recuperados automaticamente. A aplicação continua recusando a remoção quando há um navegador ativo ou um formato de bloqueio inesperado.

## Atualizar

Use a pasta e o projeto Compose da instalação atual. Antes de copiar os arquivos:

```powershell
docker compose stop -t 30 cota
```

Copie o conteúdo do ZIP para essa pasta, substituindo o código e preservando `.env`, dados e configurações próprias do Compose. Depois:

```powershell
docker compose up -d --build --force-recreate cota
docker compose exec cota node -p "require('./package.json').version"
```

A versão deve ser **1.16.2**. O `--force-recreate` atualiza o contêiner e reutiliza o volume; não é o botão **Recriar conexão**. Atualize o navegador com **Ctrl+F5**. A sessão salva será reutilizada.

Com a conexão pronta, a sincronização começa automaticamente. Consulte **Histórico** ou **Todos os atendimentos** como Admin; use **Sincronizar WhatsApp** para outra consulta. Para receber resposta de ROBINHO, mantenha o agente ativado e a conversa em modo automático. Abrir um chat para assumir o atendimento coloca essa conversa no modo manual.

O histórico consulta somente os últimos 30 dias que o WhatsApp disponibilizar nessa sessão, preservando registros mais antigos no banco. Importar uma conversa não envia mensagens.

## Validação

Resultados finais, sem falhas, testes ignorados ou cancelados:

| Verificação | Resultado |
| --- | --- |
| `npm test` | 4.008 testes passaram |
| `npm run test:ui` | 52 testes de navegador passaram |
| `npm run build` | Concluído |
| Construção da imagem Docker | Concluída com TLS verificado |
| `node tests/docker-realtime.mjs cota-qr-repro:1.16.2` | 628 testes passaram na imagem |
| `node tests/docker-profile-recovery.mjs cota-qr-repro:1.16.2 --automatic-recovery` | 24 verificações passaram |

A imagem testada foi `sha256:b7d0e2421da85c3e4ef0fb7cb37fb8e1f5dffde536f271f9b995d73d842d0335`. O certificado do ambiente foi fornecido somente como segredo do BuildKit; a validação TLS permaneceu ativa.

O teste Docker encerrou o contêiner abruptamente, abriu outro com o mesmo volume e confirmou outro QR sem clicar em recuperar ou recriar. Também confirmou que um segundo contêiner não consegue remover bloqueios enquanto o primeiro reserva o perfil. Autenticação, usuários e histórico de teste foram preservados.

A validação usa SDK, Chromium, Express, SQLite e painel reais com modelos e eventos de WhatsApp simulados. Não acessa a sessão do computador do usuário nem envia mensagens reais a clientes.

Os casos novos incluem 300 conversas com chaves `$1`, a reprodução dos 41 eventos históricos mais 57 novos do diagnóstico, um histórico de 600 mensagens com IDs distintos, confirmação dos envios, bot ativado/desativado, duplicação, grupos, bloqueio entre processos, encerramento abrupto e recuperação sem substituir a autenticação. O teste de navegador verifica o histórico e a resposta do agente com o formato `$1`.
