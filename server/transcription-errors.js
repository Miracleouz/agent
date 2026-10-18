const messages={
 engine_missing:'Transcrição local indisponível. Atualize a imagem Docker com o serviço de áudio.',
 model_missing:'O modelo de voz ainda não foi instalado. Execute: docker compose exec cota npm run audio:prepare',
 model_download_blocked:'Não foi possível baixar o modelo de voz. Libere huggingface.co e *.hf.co na rede e execute npm run audio:prepare no contêiner.',
 model_unavailable:'O modelo local de voz não está disponível. Execute npm run audio:prepare no contêiner e confira o diagnóstico.',
 audio_too_long:'O áudio ultrapassa o limite de 10 minutos.',
 audio_decode:'Não foi possível abrir este áudio para transcrição. Confira se o arquivo toca no WhatsApp.',
 no_speech:'Não foi possível reconhecer fala neste áudio.',
 speech_uncertain:'O reconhecimento deste áudio ficou impreciso. Tente outro áudio mais claro ou informe a referência por escrito.'
};
export function transcriptionError(output){let code;for(const line of String(output).split('\n')){try{const data=JSON.parse(line);if(Object.hasOwn(messages,data.error))code=data.error;}catch{}}return messages[code]||'Não foi possível transcrever. Execute npm run audio:diagnose no contêiner.';}
