# Versão 1.16.0 — mensagens e histórico do WhatsApp

O log fornecido mostrava a conexão pronta seguida de `getChats(): r`, páginas de histórico repetidas e `syncHistory(): this.findImpl is not a function`. O Cota também não acompanhava mensagens enviadas pelo celular/Web. A atualização trata esses caminhos sem substituir o banco ou a sessão conectada.

## O que mudou

- A recepção observa os eventos novos da coleção de mensagens antes dos listeners da biblioteca. Uma falha na conversão completa de um modelo não pode esconder a mensagem recebida. A conversão original continua sendo usada quando funciona; nos tipos de mensagem suportados, uma conversão mínima protege também a fila de envio do WhatsApp quando a original falha.
- Conversas já carregadas são localizadas diretamente, inclusive pelos vínculos entre telefone e LID disponíveis no WhatsApp. Isso evita depender de `Chat.find/findImpl` para ler, marcar como lida ou responder a uma conversa existente.
- Mensagens enviadas pelo celular ou pelo WhatsApp Web aparecem no painel como **Enviado pelo WhatsApp**. Elas não iniciam uma resposta do bot, não assumem o atendimento e não alteram o responsável. O atendimento manual continua sendo controlado pelo painel. Um lembrete pendente é cancelado quando há uma resposta externa da equipe.
- As próprias respostas do Cota são identificadas pelo recibo do envio e pelo ID da mensagem. O espelhamento não cria uma segunda mensagem nem faz o bot responder a si mesmo. Envios sem confirmação não são repetidos automaticamente.
- A interface recebe notificações por SSE e busca a atualização sem recarregar a página. Uma importação contínua não adia indefinidamente essa atualização, e as atualizações por eventos não se sobrepõem. A verificação periódica permanece como alternativa de recuperação.
- A consulta de mensagens em Conversas e Contatos exibe apenas os **últimos 30 dias**. Registros mais antigos já guardados no banco são preservados, mas ficam fora dessa janela de consulta.
- O histórico lê as mensagens disponíveis diretamente das coleções do navegador, percorre páginas até o limite de data e pode pedir ao celular a transferência de histórico sem passar por `findImpl`. Páginas repetidas passam para espera de dados, preservando o que foi carregado e permitindo nova tentativa automática.
- Ao abrir um grupo, o painel também consulta as mensagens disponíveis dos últimos 30 dias, sem transformá-las em Não lidas. Mensagens novas recebidas e enviadas pelo celular aparecem nessa consulta; o bot continua sem responder ou enviar para grupos.

O histórico que o WhatsApp ainda não transferiu não é inventado. O painel distingue histórico carregado, disponível, aguardando transferência e incompleto. A janela é de 30 dias corridos; a disponibilidade depende do que o aparelho vinculado disponibilizar nessa sessão.

## Atualizar a instalação conectada

Use a mesma pasta e o mesmo projeto Compose. Pare o serviço, substitua os arquivos de código do ZIP preservando `.env`, dados e configurações próprias, e execute:

```powershell
docker compose up -d --build --force-recreate cota
docker compose exec cota node -p "require('./package.json').version"
```

A versão deve ser **1.16.0**. Atualize o painel com Ctrl+F5. A atualização reutiliza a sessão salva; a sincronização começa quando ela fica Conectada. Use **Sincronizar WhatsApp** para pedir outra consulta. No chat, **Carregar histórico** repete a consulta daquele contato.

Para conferir o funcionamento, envie uma cotação de outro número para a loja e acompanhe a resposta no painel. Depois assuma o chat e envie uma mensagem pelo painel; confira-a no celular. Uma resposta enviada pelo celular/Web também deve aparecer, mantendo o responsável. O histórico importado não deve gerar respostas ou novos contadores de Não lidas.

## Testes

Os cenários novos usam o SDK instalado com coleções sintéticas, sem parear um número ou enviar a clientes reais. Reproduzem erros `r` e `findImpl`, usam os listeners e a função de envio da biblioteca e verificam a recepção mesmo com falha na conversão dos modelos. Há 300 combinações de escritas, identificadores e eventos: entradas novas, duplicadas, antigas, enviadas pelo celular, grupos e eventos após desconectar. Outros cenários verificam anexos, confirmações, histórico, transferência de mensagens criptografadas para texto e preservação do banco.

Os testes de navegador usam Chromium real. Um desativa a atualização periódica de 15 segundos e verifica mensagem recebida, cotação do bot, resposta assinada do painel e mensagem do celular via atualização por eventos. Outro mantém eventos durante respostas HTTP lentas e verifica que a tela continua sendo atualizada, além da janela de 30 dias em Contatos.

Passaram **3.684 testes de servidor**, sem falhas, cancelamentos ou testes ignorados, **51 testes de navegador** e o **build de produção**. São **312 testes novos de tempo real**, também executados com sucesso dentro da imagem Docker de produção, com init, usuário node e Chromium, sem rede. Eles usam o código de servidor e as dependências da imagem; apenas os modelos do WhatsApp e os dados são simulados.

A imagem também passou as **23 verificações de conexão/recuperação** em Docker: QR, desconexões repetidas, recriação do contêiner com o mesmo volume, recusa de perfil em uso, recriação explícita com backup e preservação de usuário/configuração/histórico/autenticação de teste. Essa integração de conexão usa módulos simulados e não pareia números.

A validação não utilizou contas de clientes. A instalação real precisa receber a atualização mantendo seu volume e sua sessão. A disponibilidade do histórico depende da transferência feita pelo WhatsApp; o painel informa quando ainda está aguardando.

Comandos de desenvolvimento:

```sh
npm test
npm run build
npm run test:ui
node tests/docker-realtime.mjs nome-da-imagem
node tests/docker-profile-recovery.mjs nome-da-imagem
```
