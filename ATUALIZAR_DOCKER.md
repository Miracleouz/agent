# Atualizar para a versão 1.19.2 no Docker

A versão 1.19.2 usa **Whisper large-v3-turbo local**, permite transcrever novamente e confirma referências ambíguas antes de cotar. Inclui **Pedidos → Testar pedido completo**, com diálogo salvo no chat e pedido concluído identificado como simulação. Veja [voz local, demonstração e limites](docs/VOZ_LOCAL_E_PEDIDO_TESTE_1_19_2.md).

A versão 1.19.1 corrige o envio de uma resposta a cotações antigas após reativar/liberar um atendimento. Essas ações passam a aguardar somente uma nova mensagem do cliente, sem aviso de retorno. O histórico é preservado. Veja [reativação silenciosa e validação](docs/REATIVACAO_SILENCIOSA_1_19_1.md).

A versão 1.19.0 mantém sua posição ao ler mensagens antigas, incluindo atualizações em tempo real e grupos. Também reconhece o perfil falado “bê trinta” como B30 no atendimento automático por áudio, deixa o agente pronto ao encerrar, exporta a agenda completa para Excel e adiciona a aba [Pedidos](docs/PEDIDOS_1_19_0.md), com períodos e cancelamento que devolve os itens ao estoque. Veja [áudio automático e rolagem](docs/AUDIO_E_ROLAGEM_1_19_0.md).

A versão 1.18.2 corrige uma incompatibilidade interna no envio de fotos e usa o cache atual de arquivos do WhatsApp para carregar imagens e áudios. Inclui diagnóstico e preparo do modelo local de voz. Veja [correções, testes e limites](docs/CORRECAO_MIDIA_1_18_2.md). Mantém as atualizações anteriores.

A versão 1.18.1 organiza o acompanhamento em **painéis separados por usuário**, com contatos e tempo de espera individual atualizado a cada segundo. Veja [painéis por usuário](docs/JANELAS_POR_USUARIO_1_18_1.md). Também inclui interpretação de áudio, cotações não lidas na sincronização, reativação de chats encerrados e correções de histórico e anexos. Inclui as atualizações anteriores.

A versão 1.18.0 adiciona a aba **Acompanhamento**, exclusiva de Admin, com responsáveis em tempo real e tempo médio de resposta por usuário, além de **rascunhos privados por conversa**. Veja [acompanhamento e rascunhos](docs/ACOMPANHAMENTO_E_RASCUNHOS_1_18.md). Inclui todas as atualizações anteriores.

A versão 1.17.2 adiciona [colagem de prints com Ctrl+V e orientação para transferência sem liberação](docs/CTRL_V_E_TRANSFERENCIA_1_17_2.md). Mantém os recursos da versão 1.17.1, que inclui [edição e exclusão para todos por cargo](docs/EDITAR_E_APAGAR_1_17_1.md). Mantém os recursos da 1.17.0, que adiciona confirmação de compra com baixa de estoque por item e medida, reativação do bot ao liberar o chat, atendimento em tela ampliada, mídia, reações, citação e transcrição local. Veja o [guia dos recursos e limites](docs/ATENDIMENTO_E_ESTOQUE_1_17.md). Mantém as correções de sincronização e identificadores do WhatsApp da 1.16.2.

Use a instalação que já está funcionando. O ZIP contém o código; estoque, usuários, conversas e sessão do WhatsApp permanecem no volume existente.

1. Deixe o Docker em execução. Extraia o ZIP em uma pasta temporária.
2. Abra um terminal na pasta da instalação atual, onde está o `compose.yaml` que você já usa. No Windows, abra essa pasta no Explorador, digite `powershell` na barra de endereço e pressione Enter.
3. Pare o serviço antes de substituir os arquivos:

```powershell
docker compose stop -t 30 cota
```

4. Copie o conteúdo da pasta extraída (`agent-<código>` no download do GitHub ou `cota-whatsapp-1.19.2` no pacote local) para a pasta da instalação atual, substituindo os arquivos do código. O `compose.yaml`, o `Dockerfile`, `server` e `src` devem ficar diretamente na pasta atual, sem criar outra pasta dentro dela. Preserve seu `.env`, dados locais e eventuais ajustes próprios de porta, domínio ou volumes no `compose.yaml`.
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

Deve mostrar `1.19.2`.

Para preparar e conferir a transcrição local, execute cada comando separadamente:

```powershell
docker compose exec cota npm run audio:prepare
docker compose exec cota npm run audio:diagnose
```

Esta versão precisa preparar o **novo modelo large-v3-turbo**, mesmo que o base anterior já esteja instalado. O download é de aproximadamente 1,5 GB e fica no volume existente. Aguarde o primeiro comando terminar antes de executar o segundo. Precisa de Internet para baixar o modelo; os áudios são processados localmente. Não exige recriar a sessão do WhatsApp.

8. Perfis gerenciados pela versão 1.17.0 recuperam bloqueios antigos automaticamente. Para um bloqueio **profile_busy** herdado de versões anteriores, use **Recuperar conexão** uma vez, preservando a autenticação. Esse procedimento não precisa de **Recriar conexão**. Para o erro **profile_busy**, abra **WhatsApp → Recuperar conexão** após confirmar que todas as outras instâncias que usam a mesma sessão estão paradas. Marque a confirmação e clique em **Recuperar e gerar QR**. A atualização do código sozinha não remove links de bloqueio antigos; esse passo os recupera preservando os dados. Se o erro for **browser_close_timeout**, reinicie o serviço antes de tentar novamente:

```powershell
docker compose restart -t 30 cota
```

9. Quando o WhatsApp ficar **Conectado**, a sincronização é automática. Use **Sincronizar WhatsApp** para consultar novamente as listas e **Carregar histórico** no chat para consultar as mensagens disponíveis dos últimos 30 dias. O histórico pode aguardar transferência pelo aparelho. A consulta individual ao histórico não aciona o bot. Na sincronização geral, o agente ativo verifica também cotações antigas ainda não lidas e pode respondê-las uma única vez; mensagens já lidas permanecem somente no histórico.

10. Em **WhatsApp → Ver diagnóstico de mensagens**, consulte os estados e contadores. **Baixar diagnóstico** gera um relatório sem números, textos de conversas ou dados da sessão.

11. Abra o endereço que você já usa para acessar o painel e pressione **Ctrl+F5**. Na instalação local padrão, o endereço digitado no navegador é `localhost:3000`. Assuma um chat de teste com outro número e envie uma mensagem manual. Confira a mensagem no WhatsApp e o check no Cota. Se houver perda de confirmação sem prova suficiente, o painel mostrará **Envio não confirmado**, com orientação para conferir no WhatsApp antes de reenviar. Não há reenvio automático. As marcações antigas já gravadas não são alteradas sem confirmação.

Com o WhatsApp desconectado, suas conversas, contatos e histórico ficam ocultos, com os dados preservados no volume. Ao reconectar, voltam a aparecer conforme o cargo e o responsável. As simulações seguem disponíveis.

Com o WhatsApp **Conectado**, as listas de conversas, grupos e contatos salvos disponíveis são sincronizadas automaticamente. Um Admin pode abrir **WhatsApp** ou **Contatos** e clicar em **Sincronizar WhatsApp**. Conversas livres já lidas aparecem em **Histórico**; **Não lidas** contém entradas recebidas pendentes de leitura. Admin também vê **Todos os atendimentos**. Agora a importação percorre as mensagens disponíveis dos últimos 30 dias das conversas privadas, sem limite fixo de 50. Em **Contatos**, clicar no nome abre a consulta sem assumir o chat ou enviar mensagens. Não é necessário apagar a sessão para preencher as listas. Veja [SINCRONIZACAO_WHATSAPP.md](docs/SINCRONIZACAO_WHATSAPP.md). Se a carga ficar incompleta, envie o detalhe de `docker compose logs --tail=100 cota`, nas linhas `[WhatsApp sync]`.

Na primeira atualização para 1.13.0, os contadores antigos de WhatsApp são zerados uma única vez, pois incluíam marcações artificiais de importação ou liberação. O histórico, os responsáveis, os pedidos e os alertas continuam disponíveis. Mensagens novas recebidas após a atualização voltam a aparecer em Não lidas e mantêm o contador nos reinícios seguintes. Veja [HISTORICO_MENSAL_E_NAO_LIDAS.md](docs/HISTORICO_MENSAL_E_NAO_LIDAS.md).

A versão 1.14.0 sincroniza a leitura com o celular ao abrir a conversa, consultar por Contatos e responder pelo painel ou pelo bot. Faça um teste enviando uma mensagem de outro WhatsApp para a loja e abra o chat no Cota: deve aparecer **Leitura sincronizada com o WhatsApp** e a marcação de não lida deve sair do celular. Ler no celular também limpa o contador do painel, sem transferir o responsável. Se aparecer uma pendência, use **Sincronizar leitura** após conferir a conexão; isso não reenvia a resposta. Os checks azuis só aparecem quando o WhatsApp informar que o cliente leu. Alertas de pedido e atendente continuam independentes da leitura. Veja [LEITURA_E_PAINEL_MP.md](docs/LEITURA_E_PAINEL_MP.md).

O histórico, as fotos e os registros de edição ficam no banco do volume existente. Fechar o painel ou transferir o chat preserva as mensagens e os autores. Depois de assumir um atendimento manual, use **Enviar foto** para JPEG/PNG/WebP de até 8 MB. Use **Editar** para corrigir textos e legendas em até 15 minutos do envio, quando o WhatsApp permitir; **Ver edições** mostra as versões anteriores. Um Comercial edita e apaga suas próprias mensagens no atendimento manual. Admin pode editar ou apagar mensagens enviadas pelo número da loja, inclusive do bot e de outros atendentes, sem transferir a conversa. O WhatsApp determina prazos e permissões. A imagem original é mantida. Confira uma conversa ao sair/entrar novamente e após transferir para outro usuário.

A aba **Contatos** permite cadastrar nome, WhatsApp e empresa e clicar em **Conversar**. Com o WhatsApp conectado, a conversa abre em atendimento manual e fica com o usuário que assumiu. A primeira mensagem só sai quando ele escrever e clicar em enviar; o bot não inicia contato sozinho. Apenas Admin exclui contatos, mantendo o histórico. O guia completo está em `INSTALAR.md`.

Nesta versão, o atendimento automático envia um único aviso e encerra após cinco minutos sem resposta; o antigo menu de cinco minutos foi removido. Teste também `oi vim pelo site`, depois uma cotação e aguarde cinco minutos: deve aparecer o encerramento, sem repetição. Não é necessário informar credenciais do WhatsApp no simulador, que não envia a contatos reais.

Não execute `docker compose down -v` nem exclua o volume `cota-data`. O nome real do volume costuma incluir o nome do projeto Compose. Mantenha a mesma instalação/projeto para preservar estoque, acessos, histórico e sessão. Caso a sessão de WhatsApp tenha expirado, gere um novo QR no painel.

Os resultados e limites dos testes desta versão estão em [VOZ_LOCAL_E_PEDIDO_TESTE_1_19_2.md](docs/VOZ_LOCAL_E_PEDIDO_TESTE_1_19_2.md). Os testes da entrega anterior estão em [TESTES_1_19_0.md](docs/TESTES_1_19_0.md). Construa a imagem na sua instalação pelo comando acima.

Se a recuperação pelo painel não concluir, há um [procedimento de recuperação offline pelo Docker](docs/RECUPERACAO_FORA_DO_PAINEL.md) para a instalação padrão. Ele usa a imagem e o volume exatos do contêiner existente e verifica se outros contêineres ainda usam esse volume, sem exigir outra atualização do aplicativo.


Resultados históricos da versão 1.17.0: [TESTES_1_17_0.md](docs/TESTES_1_17_0.md). Prepare o modelo local com `audio:prepare` antes de transcrever; consulte as condições de rede e memória no guia desta versão.
