# Cota 1.17.0 — compras, conversa ampliada e mídia

## Concluir uma compra e baixar o estoque

O cliente dizer “vou comprar” ou “pode separar” gera o alerta de compra. Como uma cotação pode oferecer várias marcas e cortes, a baixa ocorre quando o atendente confirma os itens escolhidos no painel:

1. Assuma o chat e clique em **Confirmar compra**.
2. Busque o produto e adicione somente a marca que o cliente escolheu. Confira peças, frisos/canais, largura em mm e comprimento em metros, conforme o produto. Não some as cinco alternativas da cotação como se fossem cinco itens comprados.
3. Clique em **Revisar valores e estoque**. O painel calcula preços atuais, consumo e saldo.
4. Confira e clique em **Confirmar compra e baixar estoque**.

Peças são baixadas por unidade. Frisos/canais e sincronizadoras são baixados pela largura consumida × quantidade de peças. Nas abertas, o saldo usa metros equivalentes na largura inteira cadastrada: um corte de 33 m × 25 mm de uma faixa de 50 mm baixa 16,5 m equivalentes. O preço segue a base configurada da planilha.

Nas abertas, o corte separa primeiro o comprimento solicitado e depois a largura, preservando a faixa inteira no restante do rolo. Os cortes registram retalhos retangulares e não permitem juntar sobras para fabricar uma peça maior. O cadastro inicial de abertas considera uma faixa contínua na largura cadastrada; confira a disponibilidade física antes de confirmar. Uma importação que substitui o estoque redefine os saldos e lotes pelo novo arquivo. O registro das vendas anteriores permanece preservado.

A confirmação é atômica e protege contra cliques repetidos, saldo insuficiente e alteração do preço, catálogo, cliente ou responsável durante a revisão. Uma mesma compra não pode ser confirmada novamente com outra chave. Depois de uma nova mensagem do cliente, outra compra pode ser registrada. O simulador registra uma confirmação de teste sem alterar o estoque real. A confirmação no painel não envia outra mensagem ao cliente.

O histórico do chat mostra as compras anteriores ao abrir **Confirmar compra**. O banco mantém os itens, valores, usuário que confirmou e movimentos do estoque. Fechar o navegador ou transferir o chat preserva esses registros. A antiga rota de confirmação sem itens é recusada: atualize o navegador para usar o novo fluxo.

## Liberar a conversa

**Liberar conversa** remove o responsável e reativa o agente para as próximas mensagens recebidas. A ação não responde às mensagens antigas, não envia aviso ao cliente e cancela lembretes pendentes. O histórico e o registro das compras continuam disponíveis. A proteção geral **Agente desativado** continua valendo.

## Área de atendimento

**Conversas** ocupa a altura disponível da tela, com a lista à esquerda e o atendimento à direita. A aba **WhatsApp** reúne as conversas do número conectado; as abas por usuário, Não lidas, Histórico e Grupos continuam disponíveis e respeitam as permissões. No celular, a seleção abre o chat e a seta retorna à lista.

## Fotos, vídeos, áudios, citação e reações

- **Enviar foto** mantém JPEG/PNG/WebP de até 8 MB. O botão de anexo permite também MP4/WebM e OGG/MP3/WAV/M4A de até 32 MB.
- Fotos aparecem no chat. Vídeos e áudios têm controles de reprodução. O servidor suporta leitura parcial para avançar a reprodução.
- Arquivos recebidos ao vivo são carregados quando o WhatsApp disponibiliza a mídia. Em mensagens do histórico, use **Carregar foto/vídeo/áudio**; o WhatsApp pode não disponibilizar arquivos antigos ou expirados.
- **Responder** abaixo de uma mensagem seleciona a citação para a próxima resposta ou anexo. **Cancelar resposta** remove a seleção. A citação é enviada ao WhatsApp com o identificador da mensagem original.
- **Reagir** envia uma das seis reações disponíveis. Clicar novamente na reação selecionada remove a reação da loja. A reação da conta WhatsApp é compartilhada pela equipe; o envio usa a mesma conta da loja. Reações recebidas também aparecem.
- O responsável precisa assumir o atendimento manual para responder, reagir ou anexar. Transferir o chat invalida rascunhos antigos. Envios sem confirmação não são repetidos automaticamente.

Os recursos de envio ficam nas conversas privadas. Grupos continuam em consulta e o bot não responde neles. Conteúdo importado e transcrições não iniciam atendimento automático.

## Transcrição local

Clique em **Transcrever áudio** na mensagem. O áudio é processado no servidor com faster-whisper/Whisper base, em português; não é enviado a um serviço de transcrição externo. O resultado fica junto à mensagem no banco e continua visível após sair, entrar ou transferir a conversa. Revise o áudio original: medidas, marcas e números podem ser reconhecidos incorretamente. A transcrição não confirma um pedido, não altera o estoque e não envia mensagens.

A imagem Docker inclui o motor Python e os codecs. No primeiro uso, o servidor precisa baixar o modelo público (~150 MB) de `huggingface.co` e dos servidores de arquivos indicados por esse serviço. Os arquivos ficam em `/app/data/models`, no volume persistente. O download inicial pode demorar; se houver bloqueio ou timeout, o painel mostra a falha e permite tentar novamente. O limite é de 10 minutos por áudio e 3 minutos por tentativa. Uma fila processa um áudio por vez. Reiniciar cancela a transcrição pendente, com opção de tentar novamente.

Recomendação para Chromium + transcrição: VPS com 2 CPUs e 4 GB de RAM. Sem Docker, instale as dependências de `scripts/transcription-requirements.txt` em um ambiente Python e defina `TRANSCRIPTION_PYTHON` com o caminho do executável.

Para transcrever automaticamente os novos áudios recebidos, defina `AUTO_TRANSCRIBE=true` no `.env` usado pelo Compose e recrie o serviço. O padrão é manual. Mesmo na opção automática, o áudio é encaminhado ao atendimento humano e o texto não dispara respostas do bot.

## Validação e limites

Os testes usam bancos temporários, clientes simulados e o SDK real com Chromium, sem conectar o WhatsApp de um cliente. Verificam baixa única e por medida, cortes, preços e permissões, retorno do bot somente após nova mensagem, mídia, citação, reação, transcrição em fila e persistência. Não representam um pareamento real com o número da loja.

Neste ambiente, o download do modelo público foi bloqueado por HTTP 403. O fluxo da transcrição e suas falhas são testados com um transcritor controlado; o reconhecimento de fala com o modelo completo não pôde ser validado aqui. Na sua instalação, confirme o primeiro download e compare uma transcrição com o áudio original antes de usar seus números em cotações.
