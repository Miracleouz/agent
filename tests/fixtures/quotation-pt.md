`quotation-pt.ogg` é uma fala sintética pública de teste, sem dados de cliente.

Gerada com `espeak-ng -v pt-br -s 135` a partir de:
“Olá, preciso de uma correia B setenta e dois. Qual o valor?”

Convertida para Ogg/Opus com `ffmpeg -c:a libopus -b:a 24k`.
O teste opcional `tests/real-audio.mjs` usa o motor Whisper large-v3-turbo real e verifica a referência B72, a cotação com valores e a ausência de resposta adicional em modo manual. O reconhecimento local é testado com Ogg/Opus e Chromium controlado, sem pareamento com uma conta real.

O modelo base anterior reconhecia B72 mas errava outras palavras nessa voz sintética. Nos ensaios da versão 1.19.2, o modelo maior reconheceu a frase completa. Isso não mede precisão em todos os áudios reais de clientes, ruídos ou sotaques; outras amostras curtas sintetizadas ainda apresentaram erros e exigem confirmação/atendimento humano.
