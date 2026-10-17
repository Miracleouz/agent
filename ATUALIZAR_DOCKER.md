# Atualizar para a versão 1.15.4 no Docker

A versão 1.15.4 corrige uma espera sem limite no carregamento da página antes da autenticação. O painel mostra o progresso, a inicialização tem prazo e uma falha permite nova tentativa, preservando a sessão e o histórico. Veja [CARREGAMENTO_QR.md](docs/CARREGAMENTO_QR.md). Se o erro atual for `profile_busy`, use o procedimento específico em [PERFIL_OCUPADO_E_CONEXAO.md](docs/PERFIL_OCUPADO_E_CONEXAO.md), com as instâncias que compartilham a sessão paradas.

Use a instalação que já está funcionando. O ZIP contém o código; estoque, usuários, conversas e sessão do WhatsApp permanecem no volume existente.

1. Deixe o Docker em execução. Extraia o ZIP em uma pasta temporária.
2. Abra um terminal na pasta da instalação atual, onde está o `compose.yaml` que você já usa. No Windows, abra essa pasta no Explorador, digite `powershell` na barra de endereço e pressione Enter.
3. Pare o serviço antes de substituir os arquivos:

```powershell
docker compose stop -t 30 cota
```

4. Copie o conteúdo da pasta extraída (`agent-<código>` no download do GitHub ou `cota-whatsapp-1.15.4` no pacote local) para a pasta da instalação atual, substituindo os arquivos do código. O `compose.yaml`, o `Dockerfile`, `server` e `src` devem ficar diretamente na pasta atual, sem criar outra pasta dentro dela. Preserve seu `.env`, dados locais e eventuais ajustes próprios de porta, domínio ou volumes no `compose.yaml`.
5. Na mesma pasta e usando o mesmo projeto Compose da instalação anterior, execute:

```powershell
docker compose up -d --build --force-recreate cota
```

Se você normalmente usa `docker compose -p nome-do-projeto` ou um arquivo Compose específico, mantenha essas mesmas opções em todos os comandos. Isso permite reutilizar o volume correto. Não inicie a atualização diretamente na pasta temporária do ZIP.

6. Confira o serviço e os logs:

```powershell
docker compose ps
docker compose logs --tail=100 cota
```

7. Confira a versão instalada:

```powershell
docker compose exec cota node -p "require('./package.json').version"
```

Deve mostrar `1.15.4`.

8. Abra o endereço que você já usa para acessar o painel e pressione **Ctrl+F5**. Na instalação local padrão, o endereço digitado no navegador é `localhost:3000`. Assuma um chat de teste com outro número e envie uma mensagem manual. Confira a mensagem no WhatsApp e o check no Cota. Se houver perda de confirmação sem prova suficiente, o painel mostrará **Envio não confirmado**, com orientação para conferir no WhatsApp antes de reenviar. Não há reenvio automático. As marcações antigas já gravadas não são alteradas sem confirmação.

Com o WhatsApp desconectado, suas conversas, contatos e histórico ficam ocultos, com os dados preservados no volume. Ao reconectar, voltam a aparecer conforme o cargo e o responsável. As simulações seguem disponíveis.

Com o WhatsApp **Conectado**, as listas de conversas, grupos e contatos salvos disponíveis são sincronizadas automaticamente. Um Admin pode abrir **WhatsApp** ou **Contatos** e clicar em **Sincronizar WhatsApp**. Conversas livres já lidas aparecem em **Histórico**; **Não lidas** contém somente mensagens novas. Admin também vê **Todos os atendimentos**. Agora a importação percorre as mensagens disponíveis dos últimos 30 dias das conversas privadas, sem limite fixo de 50. Em **Contatos**, clicar no nome abre a consulta sem assumir o chat ou enviar mensagens. Não é necessário apagar a sessão para preencher as listas. Veja [SINCRONIZACAO_WHATSAPP.md](docs/SINCRONIZACAO_WHATSAPP.md). Se a carga ficar incompleta, envie o detalhe de `docker compose logs --tail=100 cota`, nas linhas `[WhatsApp sync]`.

Na primeira atualização para 1.13.0, os contadores antigos de WhatsApp são zerados uma única vez, pois incluíam marcações artificiais de importação ou liberação. O histórico, os responsáveis, os pedidos e os alertas continuam disponíveis. Mensagens novas recebidas após a atualização voltam a aparecer em Não lidas e mantêm o contador nos reinícios seguintes. Veja [HISTORICO_MENSAL_E_NAO_LIDAS.md](docs/HISTORICO_MENSAL_E_NAO_LIDAS.md).

A versão 1.14.0 sincroniza a leitura com o celular ao abrir a conversa, consultar por Contatos e responder pelo painel ou pelo bot. Faça um teste enviando uma mensagem de outro WhatsApp para a loja e abra o chat no Cota: deve aparecer **Leitura sincronizada com o WhatsApp** e a marcação de não lida deve sair do celular. Ler no celular também limpa o contador do painel, sem transferir o responsável. Se aparecer uma pendência, use **Sincronizar leitura** após conferir a conexão; isso não reenvia a resposta. Os checks azuis só aparecem quando o WhatsApp informar que o cliente leu. Alertas de pedido e atendente continuam independentes da leitura. Veja [LEITURA_E_PAINEL_MP.md](docs/LEITURA_E_PAINEL_MP.md).

O histórico, as fotos e os registros de edição ficam no banco do volume existente. Fechar o painel ou transferir o chat preserva as mensagens e os autores. Depois de assumir um atendimento manual, use **Enviar foto** para JPEG/PNG/WebP de até 8 MB. Use **Editar** para corrigir textos e legendas em até 15 minutos do envio, quando o WhatsApp permitir; **Ver edições** mostra as versões anteriores. Um Comercial edita suas próprias mensagens; Admin precisa assumir o chat para editar mensagens de outro atendente. A imagem original é mantida. Confira uma conversa ao sair/entrar novamente e após transferir para outro usuário.

A aba **Contatos** permite cadastrar nome, WhatsApp e empresa e clicar em **Conversar**. Com o WhatsApp conectado, a conversa abre em atendimento manual e fica com o usuário que assumiu. A primeira mensagem só sai quando ele escrever e clicar em enviar; o bot não inicia contato sozinho. Apenas Admin exclui contatos, mantendo o histórico. O guia completo está em `INSTALAR.md`.

Nesta versão, o atendimento automático envia um único aviso e encerra após cinco minutos sem resposta; o antigo menu de cinco minutos foi removido. Teste também `oi vim pelo site`, depois uma cotação e aguarde cinco minutos: deve aparecer o encerramento, sem repetição. Não é necessário informar credenciais do WhatsApp no simulador, que não envia a contatos reais.

Não execute `docker compose down -v` nem exclua o volume `cota-data`. O nome real do volume costuma incluir o nome do projeto Compose. Mantenha a mesma instalação/projeto para preservar estoque, acessos, histórico e sessão. Caso a sessão de WhatsApp tenha expirado, gere um novo QR no painel.

O pacote foi verificado com 3.309 testes automatizados, 42 testes de navegador e build de produção. A imagem Docker precisa ser construída no seu host pelo comando acima; não foi executado um build Docker neste ambiente.
