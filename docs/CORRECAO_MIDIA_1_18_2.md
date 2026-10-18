# Fotos e transcrição de áudio · 1.18.2

A atualização corrige três incompatibilidades reproduzidas em testes:

1. O modelo de mídia do WhatsApp contém um campo privado `__x_id`. Ao preparar uma foto, o SDK publicado copiava esse campo sobre a chave interna da mensagem, quebrando a inicialização (`getValidatedSender`). O Cota remove o campo conflitante somente em envios próprios identificados e validados. Mantém a exigência de confirmação do envio e não repete um envio incerto.
2. O download antigo dependia de `downloadAndMaybeDecrypt`. Agora o Cota solicita o download interno e lê o Blob atual do cache do WhatsApp ou do objeto de mídia. Isso funciona também quando o cache anterior foi esvaziado, sem exigir os metadados antigos de descriptografia. Conversa, direção e identificador precisam corresponder antes de ler o arquivo. A rotina antiga continua como alternativa para versões anteriores do Web.
3. O `faster-whisper 1.2.1` aceita versões recentes de PyAV na instalação, mas chama um argumento removido por elas (`metadata_errors`). Isso impedia abrir até um WAV válido. A dependência foi fixada em `av==16.1.0` e verificada com áudio WAV e Ogg/Opus no motor real.

As duas primeiras adaptações seguem as correções oficiais do SDK, verificadas no commit [064a3d5](https://github.com/pedroslopez/whatsapp-web.js/commit/064a3d5a5a3dce1281a6a12740b5a7051339d154), em `Injected/Utils.js` e `structures/Message.js`. A dependência npm permanece no lockfile; a instalação não busca uma branch Git variável.

## Atualizar

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), substituindo o código na instalação existente e mantendo seu volume e `.env`. Depois do build, execute separadamente:

```powershell
docker compose exec cota node -p "require('./package.json').version"
docker compose exec cota npm run audio:prepare
docker compose exec cota npm run audio:diagnose
```

A versão deve ser **1.18.2**. O preparo baixa o modelo `base` para `/app/data/models` no primeiro uso (aproximadamente 150 MB). Precisa de acesso a `huggingface.co`, seus subdomínios e `*.hf.co`. A transcrição é local, em CPU; não requer chave de API. O diagnóstico verifica motor/modelo sem baixar arquivos nem acessar o WhatsApp. Não é necessário recriar a conexão para aplicar estas correções.

Recarregue o painel com Ctrl+F5. Em um chat manual, selecione uma foto e envie uma única vez. No áudio recebido, use **Carregar áudio** ou **Transcrever áudio**; o botão de transcrição também carrega o arquivo pendente. Um arquivo que o WhatsApp já não disponibiliza pode continuar indisponível.

Se aparecer **Envio não confirmado**, confira no WhatsApp antes de enviar novamente. Mensagens antigas com esse estado não são marcadas como enviadas sem prova. Os novos logs e o diagnóstico passam a identificar a etapa e uma categoria segura do erro, sem número, texto, caminho de arquivo ou chave de mídia.

## Validação

- A reprodução anterior às correções falhou em sete dos oito testes de mídia nativa: o campo privado impedia a foto, e os arquivos atuais não eram encontrados pela rotina antiga.
- Suíte final Node: **4.166 passaram**, sem falhas ou testes ignorados.
- Painel em Chromium: **78 passaram**, incluindo colar print, envio de foto, reprodução de áudio/vídeo, transcrição manual, conexão/desconexão e histórico.
- Imagem Docker final: **703 passaram**, sem rede, com o usuário `node`, as dependências de produção e Chromium. Para a rede desta nuvem, o build de teste confiou na CA de proxy fornecida por um segredo temporário; as cópias de código foram agrupadas para caber no driver VFS. Essas adaptações do build de teste não mudam os arquivos de aplicação nem o Dockerfile entregue.
- Novos testes exercitam o preparo/upload do SDK instalado, cache Blob atual, objeto de mídia, cache esvaziado, limites de tamanho e recusa de outro chat. Não substituem a função de preparo de mídia do SDK.
- O teste opcional `tests/real-audio.mjs` usa Chromium, um arquivo Ogg/Opus sintético e o modelo Whisper real. Verifica download dos bytes, transcrição, referência B72, tratamento da fala imprecisa e ausência de envio ao transcrever em modo manual. A fala sintética foi transcrita com palavras incorretas; o agente pediu confirmação e não apresentou um preço. Isso não comprova precisão com ruído, todos os sotaques ou todas as medidas. Transcrições devem ser conferidas.
- A mesma integração com Whisper real **passou na imagem Docker final**, sem rede e com o cache do modelo montado somente para leitura. O erro de abertura de áudio com PyAV recente deixou de ocorrer.

Os modelos de WhatsApp nos testes são controlados. Nenhum número real foi vinculado e nenhuma mensagem foi enviada a clientes. A confirmação ponta a ponta na conta do usuário depende da instalação atualizada e da sessão vinculada. O histórico segue restrito aos últimos 30 dias disponibilizados pelo WhatsApp; esta correção de mídia não garante a transferência de arquivos ou mensagens que o serviço não fornece.

Para repetir a integração real de áudio fora do Docker, prepare o modelo em `DATA_DIR/models`, configure `TRANSCRIPTION_PYTHON` para o Python com as dependências fixadas e execute `node tests/real-audio.mjs`. A execução não faz pareamento.

Para repetir na imagem Docker, execute `node tests/docker-real-audio.mjs cota:1.18.2 /caminho/do/diretorio-com-models`. O modelo é montado somente para leitura; o contêiner não tem rede e é removido no fim.
