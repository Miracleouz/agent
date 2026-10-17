# QR sem carregamento infinito — versão 1.15.4

## Espera reproduzida

A biblioteca original abre o WhatsApp com `waitUntil: 'load'` e `timeout: 0`. Um recurso opcional que não termina de carregar pode impedir a chegada à autenticação, mesmo com os componentes necessários já disponíveis. Nessa situação, o limite da autenticação da versão anterior ainda não tinha começado e o painel podia continuar preparando o QR sem terminar.

O problema foi reproduzido em Chromium real com a inicialização original do SDK: uma imagem pendente manteve a operação antes do QR. O cliente corrigido gerou o QR com a mesma imagem ainda pendente. Isso reproduz uma causa possível do sintoma; o retorno parcial do diagnóstico do usuário, contendo apenas o início do teste, não identifica sozinho a causa da instalação dele.

## Correção

- A navegação inicial espera o DOM, com timeout finito. A preparação continua verificando os componentes de autenticação antes de gerar QR ou permitir conexão.
- A inicialização completa, incluindo abrir o navegador e carregar a página, tem limite. O transporte também monitora o intervalo até QR ou conexão pronta, inclusive quando a biblioteca retorna sem emitir nenhum desses eventos.
- O prazo padrão é **90 segundos**, configurado por `WHATSAPP_AUTH_TIMEOUT_MS` na faixa já suportada de 30000 a 300000 ms. Uma tentativa de restauração depois de autenticar também tem prazo. Eventos repetidos não estendem indefinidamente a mesma espera.
- Quando o QR aparece, o prazo de preparação é cancelado: o usuário pode aguardar para ler o QR, respeitando as rotações/expiração do próprio WhatsApp.
- O painel informa a etapa atual e mantém a última etapa se houver erro. A tentativa termina com `connection_timeout` e permite tentar novamente.
- O encerramento do navegador tem limite. Uma tentativa anterior que não encerra recebe `browser_close_timeout`; o Cota não inicia outro navegador concorrente no mesmo perfil. Nesse caso, reinicie o serviço.
- Se o navegador terminar de abrir depois de um cancelamento, o cliente o fecha. Isso evita deixar a tentativa cancelada usando o perfil.
- O cancelamento e o timeout usam fechamento do cliente, preservando `LocalAuth` e os dados. O caminho de falha não chama logout nem remove autenticação, cookies, histórico ou arquivos de bloqueio. Se o fechamento normal não concluir, o cliente só pode encerrar o processo de navegador que ele próprio criou.

As regras de segurança do atendimento continuam: preparação de conexão não envia mensagens, importação não autoriza respostas ao histórico e o bot pausa durante recarga ou desconexão. Conversas, contatos e histórico permanecem ocultos até a conexão ficar pronta.

## Ler os logs atuais

O início do serviço inclui a versão, por exemplo `Cota v1.15.4 iniciado na porta 3000`. Cada avanço da conexão usa mensagens fixas:

```text
[WhatsApp connect] stage=browser_start
[WhatsApp connect] stage=page_load
[WhatsApp connect] stage=auth_modules
[WhatsApp connect] stage=qr_wait
```

`session_sync` indica restauração/sincronização após autenticar; `ready` indica conexão pronta; `closing_previous` indica encerramento da tentativa anterior. Esses logs não incluem QR, telefone, conteúdo de mensagens ou credenciais.

Depois de atualizar, execute na mesma pasta da instalação:

```powershell
docker compose logs --timestamps --since=2m --tail=100 cota
```

Mensagens antigas de `profile_busy`, anteriores ao último início do serviço, não comprovam que o bloqueio reapareceu. A manutenção de bloqueio continua em [PERFIL_OCUPADO_E_CONEXAO.md](PERFIL_OCUPADO_E_CONEXAO.md) e depende de confirmar que não há outra instância usando o perfil.

## Diagnóstico sem alterar a sessão

```powershell
docker compose exec cota npm run whatsapp:diagnose
```

O diagnóstico continua usando um perfil temporário sem parear número ou enviar mensagens. Agora mostra as etapas durante a execução, seguidas de **OK** ou **FALHA**. A frase inicial sozinha não é um resultado. O prazo externo do diagnóstico é de 120 segundos, seguido do encerramento do navegador.

## Verificação

Foram acrescentados **15 testes de inicialização/navegação**, **dois casos de diagnóstico** e **dois cenários de navegador**. Cobrem imagem pendente, página que não responde, timeout antes de abrir o navegador, espera sem QR, restauração, QR aguardando usuário, geração substituída, cancelamento, fechamento pendente e descarte de navegador aberto após cancelamento. O painel foi validado mostrando a etapa, encerrando a espera e gerando QR numa nova tentativa, com o mesmo banco e usuário.

O diagnóstico também foi executado com o WhatsApp Web real, usando perfil temporário, e gerou QR sem expor o código ou parear número. Os resultados da regressão completa estão no README. Não foi construído um contêiner Docker neste ambiente; a conexão com a conta e a rede do usuário precisa ser conferida na instalação após atualizar.

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), mantendo o projeto Compose e o volume existentes.
