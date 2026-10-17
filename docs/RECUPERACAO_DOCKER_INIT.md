# Recuperação em Docker com init — versão 1.15.6

## Causa reproduzida

O Compose fornecido usa `init: true` e o comando `node server/index.js`. O PID 1 é `docker-init`, cujo comando inclui o comando completo do filho: `/sbin/docker-init -- node server/index.js`.

O verificador da versão 1.15.5 procurava `server/index.js` em qualquer argumento. Ao recuperar dentro do próprio serviço, ele excluía o PID do Node atual, mas confundia o PID 1 com outra instância do Cota. Dependendo das permissões, ler os metadados do init falhava ou apontava para o mesmo diretório; ambos faziam a operação ser recusada. Assim, um bloqueio antigo continuava impedindo o QR mesmo após a confirmação no painel.

Além disso, `recoverConnection()` substituía a causa por `COTA_PROFILE_RECOVERY_FAILED`. O log anexado pelo usuário comprova a versão 1.15.5 e a recusa, mas essa substituição escondia seu motivo. A falha foi reproduzida separadamente em Docker, com `--init`, usuário UID 1000 e perfil com bloqueios antigos: a versão 1.15.5 recusou a recuperação sem outra instância usando o perfil.

## Correção

- O verificador reconhece um servidor Node pelo executável do próprio processo antes de interpretar os argumentos. `docker-init`, `tini`, `dumb-init` e shells contendo o comando do filho não são tratados como outro servidor.
- Outro Node usando o mesmo `DATA_DIR` continua bloqueando a recuperação. Chromium com `--user-data-dir` apontando para o perfil também continua protegido.
- Metadados de uma instância real que não possam ser verificados interrompem a recuperação com um motivo específico.
- Erros conhecidos mantêm sua categoria no painel: `profile_active`, `profile_process_check`, `profile_permissions`, `profile_lock_format`, `profile_path` e `profile_changed`.
- O log registra uma etapa fixa, código e, quando disponível, o código do sistema de arquivos. Exemplo: `[WhatsApp profile] stage=lock_validate code=COTA_PROFILE_LOCK_FORMAT`. Não registra ambiente de processos, credenciais ou conteúdo de sessão.
- O botão Recuperar continua disponível depois de uma recusa específica, permitindo corrigir sua causa e tentar novamente.

A recuperação permanece restrita aos três links simbólicos de bloqueio. Ela não segue os links nem apaga autenticação, histórico, estoque ou usuários. A confirmação de que outras instâncias usando a sessão estão paradas continua necessária, pois processos de outros contêineres não são visíveis dentro do serviço.

## Validação

A regressão acrescenta 24 testes de servidor e dois cenários de navegador, incluindo o comando do docker-init, metadados do init inacessíveis, outro Node realmente ativo, permissões, formato de arquivo inesperado e preservação do motivo no transporte/log.

O teste optativo `tests/docker-profile-recovery.mjs` usa contêineres e volume descartáveis com nomes exclusivos. A imagem da versão 1.15.5 reproduziu a recusa; a 1.15.6 passou 18 verificações cobrindo:

- `docker-init` e usuário UID 1000, como no Compose de produção;
- clicar em Recuperar conexão e gerar QR dentro do painel servido pelo contêiner;
- três ciclos de clicar em Desconectar sessão e gerar outro QR no mesmo perfil;
- parada abrupta, recriação do contêiner e recuperação dos links reais deixados pelo Chromium no mesmo volume;
- recusa de recuperação enquanto outro Chromium realmente usa o perfil;
- preservação de usuário, configuração, histórico e marcador de autenticação; nenhum envio tentado.

A imagem foi construída com as instruções do Dockerfile. Para o proxy deste ambiente de teste, o build usou adicionalmente seu certificado confiável existente por um mount temporário do BuildKit durante o npm. A validação TLS permaneceu ativa e o certificado não foi incluído na imagem de execução. Nenhuma alteração de certificado é necessária no Dockerfile entregue.

O teste injeta um preload **somente nos contêineres descartáveis**, respondendo localmente às requisições da página para simular os módulos de autenticação. O SDK instalado, Chromium, LocalAuth, SQLite, API, painel, init e volume são reais; nenhum número é pareado. O Dockerfile de produção não copia os testes nem ativa esse preload. O diagnóstico separado com WhatsApp Web real gera QR usando perfil temporário, sem exibir o código ou conectar uma conta.

Para repetir, após construir a imagem:

```sh
node tests/docker-profile-recovery.mjs nome-da-imagem
```

O teste exige Docker e Chromium/Playwright no host de desenvolvimento. Ele remove apenas os contêineres e o volume exclusivos que criou. A regressão completa de servidor, navegador e build está registrada no README.

## Atualizar

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), mantendo a mesma pasta/projeto e o volume existente. Confira `1.15.6`, atualize o navegador com Ctrl+F5 e use **WhatsApp → Recuperar conexão → Recuperar e gerar QR**. Os bloqueios antigos já gravados precisam desse procedimento após atualizar; o código não os remove automaticamente sem confirmação.
