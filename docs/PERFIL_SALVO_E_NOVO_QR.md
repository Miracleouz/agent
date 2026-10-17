# QR com perfil temporário funciona, mas a conexão salva não inicia

Na versão 1.15.7, a página do WhatsApp ignora o cache HTTP e o service worker do Chromium. Desativar apenas `webVersionCache` da biblioteca não impedia o perfil persistente de servir uma página antiga. Essa correção preserva cookies, IndexedDB e autenticação.

Um diagnóstico temporário com resultado **OK** confirma a geração de QR naquele teste. Não garante que os dados do perfil salvo estejam utilizáveis. Se o perfil continuar falhando em `auth_modules` ou `connection_timeout`, existe agora uma ação explícita para preparar uma conexão nova.

## Atualizar e recriar a conexão

1. Atualize os arquivos na mesma pasta/projeto Compose, preservando seu `.env`, configurações próprias e volume. Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md).
2. Execute `docker compose up -d --build --force-recreate cota` e confirme a versão com `docker compose exec cota node -p "require('./package.json').version"`: deve ser **1.15.7**.
3. Atualize o painel com Ctrl+F5. A conexão normal já usa a correção de cache.
4. Se a conexão salva continuar falhando, abra **WhatsApp → Recriar conexão**. Essa opção também aparece quando a sessão está desconectada. Se estiver carregando, clique primeiro em **Desconectar sessão** e aguarde terminar.
5. Leia a explicação, confirme que outras instâncias que usam essa sessão estão paradas e clique em **Recriar e gerar QR**.
6. Leia o QR em **WhatsApp → Aparelhos conectados → Conectar um aparelho** no celular.

A recriação encerra o navegador atual antes de alterar o perfil, verifica processos e move o diretório antigo para `data/whatsapp/session-backup-<identificador>`. Depois prepara um diretório novo. Não apaga a autenticação anterior nem abre ou substitui o banco do painel durante a manutenção. Estoque, usuários e histórico do painel ficam no mesmo volume. A nova conexão precisará sincronizar os dados disponíveis no WhatsApp.

Os backups contêm autenticação privada: ficam somente no servidor e não devem ser compartilhados. A aplicação não os publica nem tenta restaurá-los automaticamente. Recriar o perfil não equivale a confirmar a desvinculação de um aparelho no celular; os aparelhos vinculados podem ser conferidos no próprio WhatsApp.

Outra instância ativa, falha na verificação de processos, permissões insuficientes, diretório com symlink ou bloqueio de formato inesperado interrompem a operação. Não existe exclusão automática de volume ou repetição de envios. **Recuperar conexão** continua disponível para remover apenas os três links antigos de bloqueio, preservando o perfil atual.

## Validação

Os testes usam perfis e bancos descartáveis. A regressão de cache instala um service worker real que devolve uma página antiga, reinicia o Chromium com o mesmo perfil e confirma a falha antes da correção. Após ignorar esse worker, o SDK instalado gera QR com módulos de autenticação locais, preservando marcadores em localStorage e IndexedDB. Outro teste reproduz JavaScript antigo no cache HTTP e confirma a atualização sem apagar as credenciais.

O painel também é testado com componentes de autenticação que permanecem indisponíveis no perfil original: a ação de recriar exige confirmação, preserva o perfil anterior em backup, produz um novo QR e permite desconectar e gerar outro QR. Esses testes não pareiam contas nem enviam mensagens.

Passaram **3.372 testes de servidor**, sem falhas, cancelamentos ou testes ignorados, **49 testes de navegador** e o **build de produção**. A geração de QR também passou no WhatsApp Web real usando perfil temporário, sem exibir o código, parear conta ou enviar mensagens.

A imagem Docker 1.15.7 foi construída e passou **23 verificações de integração** com init, usuário node e volume persistente. Foram validados os cliques do painel, três ciclos de desconexão/novo QR, recriação abrupta do contêiner com o mesmo volume, recusa de perfil usado por outro Chromium, timeout de componentes no perfil salvo, recriação explícita com backup, novo QR após recriar e mais um ciclo de desconexão/novo QR. Usuário, configuração, histórico e marcador privado de autenticação foram preservados e não houve tentativa de envio. Os módulos de WhatsApp dentro desse teste Docker são simulados; não houve pareamento.

A primeira tentativa da suíte completa do painel e a primeira construção da imagem foram interrompidas por falta de espaço neste ambiente. Após liberar a imagem descartável antiga e o cache de construção não utilizado, a construção e a suíte do painel foram executadas novamente com sucesso. O primeiro diagnóstico real encontrou uma mudança de rede; após terminar a criação da rede Docker, a repetição gerou QR. Isso não identifica a causa no computador do usuário.

Os testes locais de autenticação e os testes de integração não substituem o pareamento do número da loja. A instalação do usuário ainda precisa receber a versão nova e ler o QR.
