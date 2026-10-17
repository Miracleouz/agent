# Verificação da versão 1.17.0

Validação realizada em 17/10/2026, com dados de teste e recursos descartáveis.

| Verificação | Resultado |
| --- | --- |
| Build Vite | Concluído |
| `npm test` | 4.039 passaram; zero falhas, ignorados ou cancelados |
| `npm run test:ui` | 54 passaram no Chromium |
| `node tests/docker-realtime.mjs cota-qr-repro:1.17.0` | 637 testes na imagem de produção |
| `node tests/docker-profile-recovery.mjs cota-qr-repro:1.17.0 --automatic-recovery` | 24 verificações de perfil/QR |
| Motor de transcrição no Docker | faster-whisper e PyAV importados sem rede |
| Reconhecimento de fala com modelo completo | Não validado: download do modelo bloqueado por HTTP 403 neste ambiente |

A imagem usa Node 24, Chromium, ffmpeg, Python e faster-whisper 1.2.1, com usuário `node` e init do Docker. Os ajustes finais do servidor foram aplicados sobre a imagem construída com o Dockerfile do projeto, reutilizando as mesmas dependências. Identificador da imagem validada: `sha256:baa5ec3fa724243821ce9f276a7d2fe8e2d9e01a097aa96ee18663d40e245e22`.

## Novos cenários exercitados

- Compra com marca, peças, frisos/canais, corte em milímetros e correia aberta por comprimento × largura.
- Revisão de preço/saldo, baixa atômica, solicitações repetidas e compras concorrentes em chats diferentes.
- Falha no registro do movimento desfaz toda a compra, sem saldo parcialmente descontado.
- Retalhos não se somam para prometer uma largura maior. Abertas preservam o restante do rolo em largura inteira.
- O simulador preserva o estoque real. A confirmação e a revisão de compra não enviam mensagens ao cliente.
- Liberar reativa o bot somente para entradas novas; mensagens antigas e lembretes cancelados não são reenviados.
- Fotos, áudios e vídeos recebidos via eventos nativos, deduplicação, mídia do celular e download de mídia importada sem autorizar o bot.
- Arquivos servidos com autenticação e leitura parcial; WAV e MP4 válidos carregam no navegador, com vídeo avançando na reprodução.
- Resposta citada por identificador, bloqueio de citação entre chats e citação visível de foto sem legenda.
- Reações enviadas/recebidas, remoção e falha sem confirmação falsa ou reenvio automático.
- Transcrição em fila com transcritor controlado; texto persistente no histórico, sem enviar mensagem ou debitar estoque.
- Interface ampliada, layout móvel, transferência, assinatura, histórico, fotos, QR, desconexão e sincronização mantidos pelas suítes existentes.

## Limites da validação

Os testes de tempo real e QR usam o SDK real e Chromium com modelos controlados do WhatsApp. Nenhum número foi pareado e nenhuma mensagem foi enviada a contatos reais. Eles verificam o comportamento do código, não garantem a disponibilidade do histórico ou de arquivos antigos no aparelho da loja.

O teste de transcrição valida instalação, fila, integração com o painel e falhas. O download do modelo foi tentado e recusado pela rede deste ambiente; portanto não há resultado validado de reconhecimento de fala com o modelo completo. O primeiro uso na instalação exige acesso aos servidores do modelo. Confira a transcrição contra o áudio antes de usar medidas ou preços.

As instruções de atualização preservando o volume estão em [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md); o uso dos recursos está em [ATENDIMENTO_E_ESTOQUE_1_17.md](ATENDIMENTO_E_ESTOQUE_1_17.md).
