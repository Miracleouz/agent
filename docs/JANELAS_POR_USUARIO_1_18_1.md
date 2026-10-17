# Atualização 1.18.1 — acompanhamento, histórico, não lidas e áudio

## Painéis por usuário

A aba **Acompanhamento**, exclusiva de Admin, mostra uma janela para cada usuário cadastrado e outra para a fila sem responsável. Cada janela contém os contatos atribuídos, a espera individual com relógio atualizado a cada segundo e a média de resposta humana no período escolhido. Transferências, liberação e digitação chegam por eventos ao painel. Abrir um chat ocupado como Admin mantém o responsável atual.

Os filtros por usuário e cliente continuam disponíveis. A lista geral fica recolhida abaixo das janelas. Não é necessário cadastrar nomes no código: as janelas usam os usuários da instalação.

## Reativar uma conversa encerrada

**Reativar agente** aparece também em conversas encerradas pelo bot ou pelo cliente. O botão limpa o encerramento, cancela acompanhamentos antigos e retira a autorização da mensagem anterior. Não envia uma mensagem ao cliente. O responsável, as mensagens e as compras confirmadas são preservados.

## Mensagens não lidas na sincronização

Esta versão incorpora a regra solicitada: o agente ativo pode responder também a **cotações antigas ainda não lidas**, disponíveis dentro dos últimos 30 dias. Mensagens lidas permanecem somente no histórico.

O Cota verifica o contador de leitura e os identificadores das mensagens na sessão vinculada, consulta a leitura novamente antes de processar e impede o reaproveitamento de uma entrada já tratada. Linhas consecutivas de cotações não lidas podem formar uma única resposta, preservando o texto e o horário originais no histórico. A sincronização seguinte não repete a resposta, inclusive quando o envio anterior ficou incerto.

Não responde nesse fluxo em grupos, conversas manuais, encerradas ou com o agente desligado. Abrir apenas o histórico por Contatos não inicia esse processamento. Áudios marcados como lidos durante a transcrição também não geram resposta automática atrasada.

Essas regras substituem as descrições das versões anteriores que ignoravam todas as mensagens anteriores à conexão. O bot continua sem iniciar contato com pessoas que não enviaram mensagens à loja.

## Histórico e agenda

A consulta reconhece os identificadores por telefone e LID de um mesmo contato, inclusive quando as mensagens estão somente na coleção global do WhatsApp e usam a chave `$1`. Páginas que avançam para mensagens mais antigas continuam na mesma carga até chegar ao início da janela de 30 dias, com limites de tempo para não travar indefinidamente.

O painel exibe somente os últimos 30 dias e preserva os registros anteriores no banco. A importação não inventa mensagens nem trata um contador não lido como prova suficiente de contato sem verificar as mensagens correspondentes.

Se os contatos foram carregados e só resta uma pendência de histórico, a agenda mostra **Contatos carregados**, com os detalhes do histórico recolhidos. Erros reais na lista de contatos continuam visíveis. O botão **Sincronizar WhatsApp** permanece disponível.

O WhatsApp precisa disponibilizar os dados e os arquivos à sessão vinculada. Quando ainda aguarda o telefone ou não fornece uma página, o painel informa a pendência; não declara um mês completo sem tê-lo alcançado.

## Fotos, vídeos e áudios

O download pode usar a mensagem nativa ou localizar o identificador exato na coleção vinculada, conferindo a conversa e seus aliases antes de baixar. Não depende exclusivamente do serializador completo do SDK. Downloads simultâneos do mesmo arquivo são compartilhados. Uma falha ao obter um arquivo é diferenciada de WhatsApp desconectado.

**Transcrever áudio** aparece mesmo antes de baixar o áudio. O clique carrega o arquivo e solicita a transcrição. A transcrição feita pelo atendente fica no histórico e não envia respostas do bot.

O envio de fotos continua com confirmação por identificador da fila de envio. Quando o WhatsApp falha antes de entrar nessa fila, o painel informa que nenhuma mídia foi enviada. Falhas depois desse ponto continuam como envio não confirmado quando não há prova suficiente. Nenhuma dessas situações inicia reenvio automático. O diagnóstico inclui a etapa e o módulo da falha de preparação, sem o conteúdo da mensagem.

## O bot entende áudio?

Com `BOT_AUDIO_ENABLED=true` (padrão no Compose), áudios novos de clientes e áudios não lidos autorizados pela sincronização são baixados e transcritos localmente. Uma transcrição reconhecida como cotação usa o mesmo estoque, preços, marcas e cálculos das mensagens de texto. Números falados em referências e medidas são interpretados, como **B setenta e dois**, **pê jota trezentos e cinquenta cinco frisos** e **três vê xis quinhentos**. A transcrição original fica preservada.

O bot atende cotações de correias e mantém a saudação do ROBINHO, o fechamento de pedido, a retirada e o encaminhamento ao atendente. Mensagens fora desse assunto ficam sem resposta automática. A transcrição não confirma uma compra nem desconta estoque.

Antes de responder, verifica novamente o modo do chat, o responsável, a ativação global, a exclusão da mensagem e se existe uma entrada mais recente. Transferir, assumir ou ler o chat enquanto o áudio está em processamento impede uma resposta atrasada. Duplicatas e repetição da transcrição não geram duas respostas. Reiniciar não reprocessa os áudios pendentes automaticamente.

Se o modelo de voz não estiver disponível ou a fala não puder ser reconhecida, o painel registra a falha e sinaliza atendimento humano; não inventa uma cotação nem envia mensagens repetidas. Confira medidas e referências reconhecidas no áudio original.

O Docker inclui faster-whisper e codecs. No primeiro uso, é necessário baixar o modelo Whisper base (~150 MB) dos servidores do Hugging Face; o cache fica no volume `/app/data/models`. A fila processa um áudio por vez, com limite de três minutos por tentativa e dez minutos de duração. `BOT_AUDIO_ENABLED=false` desativa a interpretação automática; `AUTO_TRANSCRIBE=true` permite transcrição de áudios novos durante atendimento manual, sem responder automaticamente.

**Limite verificado nesta nuvem:** a tentativa de baixar o modelo recebeu HTTP 403 do proxy. Os testes validam a fila, a integração e as regras do bot com transcrições controladas; não comprovam reconhecimento real de fala com o modelo completo neste ambiente.

## Atualização e testes

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), mantendo a mesma pasta/projeto Compose e o volume. O código não inclui estoque, sessão, histórico ou senhas de sua instalação.

Os testes usam bancos descartáveis, SDK instalado, modelos controlados do WhatsApp e Chromium. Não houve pareamento de um número real, envio para clientes ou acesso ao seu Docker local. Disponibilidade de todo o histórico, downloads e upload real de mídia na instalação vinculada continuam dependendo do WhatsApp. Não é correto afirmar que esses testes provam funcionamento integral com o número da loja.

### Resultados desta entrega

- **4.151 testes de servidor:** regressão de 4.149 casos e dois testes adicionais de mídia com Chromium/SDK. Os 51 cenários novos de revisão cobrem não lidas, leitura antes do processamento, repetição de sincronização, envio incerto, identificação PN/LID, paginação até 30 dias, reativação, assunto da conversa, referências faladas e áudio durante transferência, exclusão ou leitura.
- **78 testes de interface aprovados**, incluindo agenda móvel, janelas por usuário, relógios, transcrição antes do download e reativação de chat encerrado.
- **693 testes aprovados dentro da imagem Docker**, com código/dependências de produção, usuário `node`, `init`, Chromium e rede externa desligada. São repetições de cenários na imagem, não 693 conversas com clientes reais.
- Build de produção e verificação HTTP da imagem, versão e bundle do painel.

A preparação de fotos percorre o código real do SDK nos testes, com os módulos de upload controlados. Os downloads conferem o identificador e a conversa, com conversão de bytes no Chromium. A voz usa transcrições controladas, pois o modelo não pôde ser baixado. Esses resultados não substituem a conferência de uma mensagem, foto e áudio com o número realmente vinculado à sua instalação.
