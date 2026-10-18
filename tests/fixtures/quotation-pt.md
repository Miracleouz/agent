`quotation-pt.ogg` é uma fala sintética pública de teste, sem dados de cliente.

Gerada com `espeak-ng -v pt-br -s 135` a partir de:
“Olá, preciso de uma correia B setenta e dois. Qual o valor?”

Convertida para Ogg/Opus com `ffmpeg -c:a libopus -b:a 24k`.
O teste opcional `tests/real-audio.mjs` usa o motor Whisper real e verifica a
referência B72, a solicitação de confirmação quando a fala é imprecisa e a
ausência de resposta no modo manual. Nessa voz sintética o modelo reconhece
B72, mas transcreve outras palavras incorretamente; o agente pede confirmação
e não inventa um preço. As cotações com transcrição clara são verificadas nos
testes controlados de conversas e áudio.
Não mede precisão em áudios reais de clientes, ruído ou outros sotaques.
