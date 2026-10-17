# Instalar o Cota com Docker

O Docker instala Node.js e Chromium dentro do contêiner. Você só precisa instalar e abrir o Docker na máquina que vai manter o agente funcionando.

## Windows

1. Instale o **Docker Desktop** pelo site oficial: https://www.docker.com/products/docker-desktop/ . Se o instalador pedir, habilite o WSL 2 e reinicie o Windows.
2. Abra o Docker Desktop e espere o mecanismo ficar em execução.
3. No GitHub, escolha **Code → Download ZIP** e extraia o arquivo. Abra a pasta extraída (`agent-main`), onde está `compose.yaml`. Se estiver usando outro pacote do projeto, abra a pasta que contém esse mesmo arquivo.
4. Nessa pasta, abra o PowerShell/Terminal. No Explorador de Arquivos, você pode clicar na barra de endereço, digitar `powershell` e pressionar Enter.
5. Execute:

```powershell
docker compose up -d --build
```

A primeira execução baixa as dependências e pode demorar alguns minutos. Aguarde o comando terminar sem erros.

6. No navegador **da mesma máquina**, digite o endereço `localhost:3000`.
7. Crie seu nome, e-mail e senha de dono. Não há senha padrão.
8. Abra **Estoque → Importar uma planilha** e selecione seu próprio arquivo Excel/CSV de estoque. Confira a prévia e confirme a substituição. Para Google Sheets, cole o link da sua planilha e sincronize. O ZIP do GitHub contém apenas o código; estoque e dados de acesso são configurados nesta etapa.
9. Abra **WhatsApp → Gerar QR Code**. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho**. Leia o código.
10. Use **Testar agente** para conferir as cotações no simulador antes de atender clientes.
11. Em **Equipe → Novo usuário**, cadastre nome, e-mail, senha e cargo (**Admin** ou **Comercial**). Também há **Cadastrar em lote**. Cada pessoa abre a mesma instalação no navegador com seu próprio login. O QR conecta o número da loja; não é necessário conectar um número por usuário.

O computador e o Docker precisam permanecer ligados para o agente responder. O histórico, a conta e a sessão ficam no volume persistente `cota-data`; esse volume é criado na primeira execução. A instalação nova não contém contas, senhas, histórico ou sessão de WhatsApp de outro ambiente.

## Outros sistemas com Docker

Em macOS, os mesmos passos de Docker Desktop e `docker compose` se aplicam. Em Linux, instale Docker Engine e o plugin Docker Compose conforme a documentação oficial https://docs.docker.com/engine/install/ e execute os comandos na pasta do projeto.

Para um servidor/VPS acessível pela internet, configure domínio, HTTPS e `APP_URL` com a URL HTTPS exata antes de expor o painel. Crie a conta de dono em um acesso restrito inicial. Esta etapa depende do domínio e do servidor escolhidos; não basta publicar a configuração do ambiente de desenvolvimento para hospedar o painel.

## Usar em vários computadores

Instale o agente **uma vez**, no computador ou servidor que ficará ligado. Todos os usuários acessam esse mesmo servidor; não instale uma cópia independente para cada atendente.

Na rede da loja, use o IP do servidor, por exemplo `http://192.168.1.50:3000`, substituindo pelo endereço real. No Windows, `ipconfig` mostra o endereço IPv4. Libere a porta 3000 no firewall para a rede local. Nos computadores dos atendentes, `localhost:3000` não acessa o servidor da loja. Se utilizar `APP_URL`, ela deve corresponder à URL que todos usam. Para acesso externo, configure domínio e HTTPS.

Um Admin cadastra as contas em **Equipe**, com senha de pelo menos dez caracteres, e informa o acesso a cada pessoa. A aplicação não envia senhas por e-mail. **Admin** vê todos os chats, gerencia estoque, QR, configurações e acessos e pode transferir atendimentos. **Comercial** vê seus próprios chats e a fila sem responsável e pode trocar a própria senha em **Configurações**.

As abas de atendimento são:

- **Conversas · seu nome:** atendimentos que estão com você, incluindo novas mensagens desses clientes.
- **Não lidas:** mensagens novas ainda não lidas em conversas sem responsável. Clique para assumir automaticamente; a conversa sai dessa fila e abre na sua aba pessoal, com o bot pausado. Outro Comercial deixa de vê-la.
- **Histórico:** conversas livres já lidas ou importadas. Abrir permite consultar e assumir o atendimento; liberar um chat lido o torna disponível aqui.
- **Grupos:** lista e novas mensagens para consulta, sem respostas automáticas ou manuais pelo painel. A lista carrega ao conectar o WhatsApp. O histórico anterior à conexão não é importado, e anexos aparecem como aviso sem download.
- **Todos os atendimentos:** visão adicional do Admin. Abrir uma conversa de outro responsável permite acompanhar, sem tomar o atendimento nem limpar as mensagens não lidas dele.

Para devolver um chat à equipe, use **Liberar conversa**. Ele sai da sua aba pessoal e fica disponível aos outros usuários em **Histórico**, ou em **Não lidas** se existir mensagem nova pendente. O histórico, o pedido e os alertas são mantidos. A liberação não envia mensagem e deixa o bot pausado aguardando a equipe; não agenda lembretes. **Não lidas** contém somente mensagens novas. Importar histórico, liberar um chat lido ou desativar seu responsável não cria uma indicação de mensagem nova.

**Reativar agente** volta a permitir respostas a novas mensagens, mantendo a conversa com o responsável. O fim de uma pausa temporária também mantém esse responsável. Para disponibilizar aos outros, use **Liberar conversa** ou uma transferência por Admin. Se dois usuários abrirem o mesmo chat juntos, apenas um assume; o outro Comercial recebe aviso de que a conversa já foi assumida.

Ao digitar no painel, o nome aparece para os colegas. O cliente recebe a resposta assinada, por exemplo **Carla Lima: Olá, vou te atender.** O padrão é assinar; o dono pode alterar em **Configurações → Assinar mensagens no WhatsApp com o nome do atendente**. Cada chat tem um responsável por vez; o dono pode transferi-lo para si usando **Assumir atendimento**.

Para transferir para outra pessoa, um Admin abre o chat, usa **Transferir**, escolhe o responsável e confirma. O agente fica pausado naquele chat. O Comercial anterior deixa de ver o histórico e o novo responsável passa a vê-lo. Administradores continuam vendo todos os atendimentos. Transferir não envia mensagem ao cliente.

### Cadastrar várias pessoas de uma vez

1. Entre como Admin e abra **Equipe → Cadastrar em lote**.
2. Cole uma linha por pessoa no formato `Nome;email;cargo`, sem cabeçalho. Use `admin` ou `comercial`. Exemplo: `Pessoa de vendas;vendas@empresa.com;comercial`.
3. Informe a senha inicial da equipe uma única vez e clique em **Cadastrar usuários**.

O lote aceita até 50 pessoas e só é aplicado se todos os registros forem válidos. Se um e-mail já existir, nenhuma conta do lote é criada; edite a conta existente ou remova a linha do lote. Cada pessoa poderá trocar sua senha depois. As credenciais são salvas somente no banco da instalação em que você fez o cadastro. O ZIP contém o código, sem usuários ou senhas previamente cadastrados.

**Pode separar**, **quero fechar** e **vou comprar** criam o alerta **Quer fechar pedido** e pausam a conversa. Depois de conferir os detalhes com o cliente, o responsável usa **Marcar pedido fechado**, que registra seu nome no painel. Isso não envia outra mensagem automática, não cobra e não baixa o estoque. Pedidos de atendente mantêm seu próprio aviso. Para voltar ao atendimento automático, use **Reativar agente** somente naquele chat.

## Contatos e primeira mensagem manual

Após conectar o WhatsApp, conversas, grupos e contatos salvos disponíveis são sincronizados automaticamente. Um Admin pode usar **Sincronizar WhatsApp** na aba WhatsApp ou Contatos para tentar novamente. Conversas livres já lidas aparecem em **Histórico**; só mensagens novas entram em **Não lidas**. O Admin também possui **Todos os atendimentos**. A importação busca automaticamente os últimos 30 dias disponíveis das conversas privadas, sem respostas ao histórico antigo. Em Contatos, clique no nome para consultar o histórico sem assumir ou enviar. Veja [SINCRONIZACAO_WHATSAPP.md](docs/SINCRONIZACAO_WHATSAPP.md).

1. Abra **Contatos → Novo contato**. Informe nome, WhatsApp com DDD e, se quiser, empresa. Para números internacionais, use `+` e o código do país. No Brasil, `(11) 99999-9999` e `+55 (11) 99999-9999` identificam o mesmo cadastro.
2. Conecte o WhatsApp da loja por QR e clique em **Conversar**. O número é consultado antes de abrir; se não estiver no WhatsApp, aparece um aviso. O sistema reaproveita o histórico confirmado e coloca uma conversa livre sob sua responsabilidade em modo manual.
3. Digite a mensagem no campo de resposta manual e clique em **Enviar mensagem**. Cadastrar, editar e abrir um contato não enviam mensagem. O nome do atendente acompanha o texto conforme a configuração de assinaturas da loja.
4. Enquanto o atendimento estiver manual, o bot não responde nem envia o aviso de cinco minutos. Para voltar ao bot, use **Reativar agente**; novas respostas automáticas continuam dependendo de uma mensagem recebida do cliente.

A agenda é compartilhada pela equipe. Admin e Comercial podem cadastrar, editar e buscar. Só Admin pode excluir um cadastro; excluir não apaga as mensagens. Os limites de acesso aos chats permanecem: Comercial não abre conversa de outro responsável; Admin pode observar e transferir pelos controles existentes. **Liberar conversa** permite que outra pessoa assuma.

## Histórico, envio de fotos e edição

O histórico fica no banco do servidor, incluindo fotos, autores e registros de edição. Pode fechar o painel, sair da conta e entrar novamente: as conversas continuam disponíveis conforme suas permissões. Ao transferir, o novo responsável recebe o histórico completo já registrado e os Admins continuam podendo consultá-lo. O Comercial anterior deixa de ter acesso à conversa transferida; as mensagens que ele enviou mantêm seu nome.

1. Abra uma conversa sob sua responsabilidade em **Responder manual** e clique no ícone **Enviar foto**, ao lado do campo de texto.
2. Escolha um JPEG, PNG ou WebP de até **8 MB**, confira a prévia e escreva uma legenda opcional. Só o botão **Enviar foto** confirma o envio. A assinatura do atendente segue as Configurações.
3. Para corrigir uma mensagem enviada pelo painel, clique em **Editar** abaixo dela e salve o texto ou a legenda. O prazo é de **15 minutos desde o envio original**, sujeito à aceitação do WhatsApp. Editar não envia outra mensagem e não renova esse prazo. A imagem enviada não é substituída pela edição da legenda.
4. Use **Ver edições** para consultar o texto anterior, o novo e o nome de quem editou. Comercial só edita suas próprias mensagens no chat sob sua responsabilidade. Admin pode editar mensagens de outros atendentes depois de assumir o chat.

Falhas de envio ou edições sem confirmação aparecem no painel e não são repetidas automaticamente. Confira o WhatsApp antes de tentar novamente. Fotos recebidas após a conexão aparecem quando o download disponibilizado pelo WhatsApp funciona; não há importação do histórico antigo nem download de anexos de grupos.

Fechar apenas o navegador não interrompe o servidor. Para continuar recebendo mensagens e respondendo pelo agente, mantenha o computador/host e o serviço em execução. No Docker, preserve o volume existente **cota-data**: fotos e edições ficam no mesmo banco do histórico, sem necessidade de outro volume. Faça backup com o serviço parado, copiando todo o diretório de dados.

## Comandos do dia a dia

Iniciar novamente, sem reconstruir a imagem:

```powershell
docker compose up -d
```

Ver o estado:

```powershell
docker compose ps
```

Ver os logs, se o painel não abrir:

```powershell
docker compose logs --tail=100 cota
```

Parar o agente:

```powershell
docker compose stop
```

Não exclua o volume `cota-data`: ele guarda os dados e a sessão. Atualizar a aplicação com `docker compose up -d --build` preserva o volume. A publicação do ambiente na nuvem é separada da instalação e hospedagem da aplicação.

## Atualizar uma instalação existente

1. Baixe o ZIP da versão que você recebeu e extraia em uma pasta temporária. Confira a versão no arquivo `package.json`. O ZIP do GitHub só contém essa atualização depois que ela for publicada no repositório. Veja também `ATUALIZAR_DOCKER.md`, incluído neste pacote.
2. Na **pasta da instalação atual**, execute `docker compose stop`.
3. Copie os arquivos extraídos para essa mesma pasta da instalação, substituindo os arquivos do código. Preserve seu `.env`, caso exista, e a pasta `data`, caso use instalação com Node.js.
4. Ainda na pasta da instalação atual, execute:

```powershell
docker compose up -d --build
```

Mantenha o mesmo nome e caminho da pasta da instalação: o Docker Compose usa o nome do projeto para localizar o volume existente. Não execute `docker compose down -v` nem remova o volume. Seu estoque, usuário, histórico e sessão permanecem nesse volume.

Esta atualização impede que notificações internas do WhatsApp sejam confundidas com mensagens de clientes. O agente também ignora histórico anterior à conexão e respeita a pausa manual e o desligamento global ao confirmar pedidos de atendente. Se uma conversa recebeu um alerta indevido na versão anterior, confira o histórico e use a opção de reativar o agente nessa conversa; os alertas existentes são preservados.

A versão 1.1.0 também distingue cotação de intenção de compra. Ao reconhecer uma compra, exibe **Quer fechar pedido** e o resumo no painel, pausando somente aquela conversa para a equipe confirmar os detalhes. Respostas ambíguas pedem confirmação; a venda não é concluída automaticamente. A atualização adiciona os campos necessários ao banco e preserva o histórico existente.

A versão 1.2.0 entende `AT10 33000` como **33 metros de aberta**, perguntando a largura quando faltar. Em **Configurações → Acompanhamento após cotação**, o padrão é **5 minutos sem resposta**, com as três opções fechar pedido, adicionar itens e encerrar. Por QR, o cliente responde **1, 2 ou 3**. O menu tem no máximo uma tentativa por conversa em 24 horas e não fica se repetindo. Resposta do cliente, pedido para separar, atendimento manual, desligamento, reinício ou reconexão cancelam o agendamento anterior. A instalação atualizada não envia lembretes de cotações antigas: é necessária uma nova cotação após mensagem do cliente.

A versão 1.3.0 adiciona a apresentação fixa do **ROBINHO** uma vez a cada 24 horas, somente ao responder a uma mensagem recebida válida. Aceita `oi vim pelo site`, pedidos com várias referências e `4 PK 650` como quatro frisos de PK650, incluindo peças prontas e cortes quando cadastrados. A cotação lista até cinco opções por item; itens sem saldo ou preço não recebem valores inventados. A migração preserva o histórico e o horário da apresentação entre reinícios. A primeira apresentação após atualizar depende de uma nova mensagem do cliente; não há envio retroativo.

A versão **1.4.0** adiciona contas da equipe, digitação identificada, assinaturas nas respostas, responsável por chat e alertas separados de compra, pedido fechado e solicitação de atendente. Aceita **MT, MTS, METRO e METROS** para comprimento. A conta e senha atuais do dono continuam válidas, e os alertas existentes de compra/atendente são migrados. A criação de usuários e a marcação interna de pedido fechado não enviam mensagens a clientes. Depois de atualizar, entre com a conta do dono e cadastre os demais acessos em **Equipe**.

A versão **1.5.0** permite vários **Admins**, cargo **Comercial**, edição de cargos, cadastro em lote e transferências de chats entre usuários. O dono da versão anterior passa a **Admin**; os atendentes passam a **Comercial**, mantendo senhas, identificadores e histórico. Comerciais passam a ver seus próprios atendimentos e a fila sem responsável. Admins veem todos. Mudanças posteriores de cargo encerram as sessões do usuário alterado. É necessário manter pelo menos um Admin ativo.

A versão **1.6.0** adiciona as abas por usuário, Não lidas e Grupos, tomada automática ao abrir e **Liberar conversa**. A migração mantém os responsáveis já cadastrados. Novas tomadas automáticas não expiram; as pausas temporárias existentes continuam podendo reativar o bot, sem liberar o responsável. A atualização não envia mensagens a clientes nem importa mensagens antigas de grupos. Foram executados 200 cenários novos do fluxo de atendimento, além das regressões anteriores.

A versão **1.7.0** adiciona **RETIRA**, **CORREIOS** e **Consultar outros**. Se o cliente pedir para fechar/separar, não indicar a forma e ficar três minutos sem falar, o bot pergunta uma vez enquanto o chat está sem responsável. Se um atendente assumir antes, a pergunta é cancelada. Forma informada junto ao pedido ou durante a espera é registrada no resumo; não há cálculo automático de frete. Reiniciar ou reconectar não dispara perguntas antigas.

Depois de cotar, agradecimentos como **ok,obgd** e **obrigado pelos valores** recebem **te ajudo em algo mais?**. **Sim** pergunta **Oque mais precisa?**; o próximo item é cotado. **Não** encerra sem enviar confirmação ou lembrete. Repetir um agradecimento não repete o menu. Agradecer não é interpretado como compra. As opções são clicáveis no simulador; no WhatsApp por QR, o cliente responde com texto ou número: envio **1/2/3** e ajuda **1 = Sim / 2 = Não**.

A versão **1.8.0** reconhece o cliente enviando motorista, motoboy, Uber ou 99 para buscar e registra **RETIRA**. Também aceita `vou mandar retirar` e `vou retirar`. Pergunta **Para agilizar na hora da retirada informe nome de quem vai retirar e nome da empresa**, com uma tentativa por chat em 24 horas, sem insistência depois. Os textos recebidos aparecem em **Retirada · identificação** e no histórico. Pausas e atendimentos humanos são respeitados. A migração apenas acrescenta campos ao banco; atualizar não dispara mensagens antigas. Ao substituir os arquivos, preserve `.env` e os dados existentes. Recrie o serviço com `docker compose up -d --build` na mesma pasta da instalação e atualize o navegador com Ctrl+F5.

A versão **1.9.0** substitui o menu antigo de cinco minutos por **encerramento por inatividade**: após cinco minutos sem resposta no atendimento automático, avisa o cliente uma vez e encerra. Uma nova mensagem válida reinicia o prazo; só uma nova solicitação do cliente pode reabrir a conversa depois de encerrada. O prazo é fixo e aparece em Configurações. Atendimentos assumidos ou encaminhados para pessoas continuam sob controle da equipe. A coleta de envio após três minutos do interesse de compra continua separada. Cadastro, histórico importado, QR e reinício não iniciam conversas nem disparam avisos antigos. A migração adiciona campos de verificação sem apagar estoque, usuários ou histórico; nenhuma mensagem antiga é marcada como nova.

A versão **1.10.0** adiciona a agenda **Contatos** e o início de conversa manual pelo usuário, com assinatura, responsabilidade exclusiva por chat e verificação do número no WhatsApp conectado. O bot continua sem autorização para primeiro contato automático. A migração cria tabelas de agenda e vínculos de identificação, preservando os dados anteriores.

A versão **1.11.0** adiciona envio de fotos e edição de textos/legendas pelo painel multiusuário, com registro das versões anteriores. A migração acrescenta campos de mídia e auditoria ao banco existente, preservando mensagens, estoque, usuários e sessão. O histórico registrado permanece após fechar o painel, transferir o atendimento ou reiniciar o servidor usando o mesmo volume.

A versão **1.11.1** melhora o diagnóstico de falha ao gerar QR e protege contra reconexões simultâneas. A espera do carregamento da autenticação passa a 90 segundos por padrão. Não altera o banco nem apaga a sessão; problemas específicos de perfil, permissões, DNS ou rede exigem conferir o código e o log da instalação.

A versão **1.12.0** sincroniza listas de conversas, grupos e contatos salvos disponíveis no WhatsApp, e busca até 50 mensagens recentes ao abrir uma conversa privada. O histórico importado é apenas para consulta e nunca autoriza envios automáticos. O botão **Sincronizar WhatsApp** permite nova tentativa sem limpar a sessão. Responsáveis, pausas, pedidos, mensagens e fotos existentes são preservados.

A versão **1.13.0** busca o histórico disponível dos últimos 30 dias por paginação, sem limite fixo de 50 mensagens. **Histórico** e **Não lidas** ficam separados; liberar um chat lido não o marca como novo. Clique no nome em **Contatos** para consultar sem assumir o atendimento. Na primeira atualização, os contadores antigos de WhatsApp são zerados uma vez para remover a antiga marcação de fila; mensagens, responsáveis, estoque e alertas são preservados. Veja [HISTORICO_MENSAL_E_NAO_LIDAS.md](docs/HISTORICO_MENSAL_E_NAO_LIDAS.md).

A versão **1.14.0** adiciona leitura sincronizada com o celular, confirmação real dos checks das respostas e visual MP Correias em desktop e celular. Abrir o chat, consultar o histórico por Contatos ou responder pelo painel/bot marca a conversa como lida no WhatsApp. Se falhar, **Sincronizar leitura** permite tentar a leitura novamente sem repetir mensagens. A consulta por contato continua sem assumir o atendimento. A identificação MP permanece em texto, sem depender de um arquivo de logo. Também amplia os nomes de sincronizadoras reconhecidos no estoque, incluindo SINCR, SINC e SINCRON. Consulte [LEITURA_E_PAINEL_MP.md](docs/LEITURA_E_PAINEL_MP.md).

A versão **1.14.1** mantém o funcionamento da 1.14.0 e finaliza a entrega sem depender do logo. A bateria completa de testes de servidor e navegador foi executada novamente.

A versão **1.14.2** corrige a recuperação das listas quando a consulta do WhatsApp falha em um único chat e impede que atualizações da sincronização cancelem continuamente a carga de Contatos. O painel informa qual etapa ficou incompleta. Atualize preservando a sessão; não é necessário apagar o volume ou gerar outro QR para instalar a correção. Veja [CORRECAO_SINCRONIZACAO_1_14_2.md](docs/CORRECAO_SINCRONIZACAO_1_14_2.md).

A versão **1.15.0** mostra fotos de contatos e grupos e sincroniza automaticamente ao conectar e a cada cinco minutos. Pendências são verificadas novamente em 30 segundos; o botão de sincronização continua disponível. O histórico privado pede ao telefone os dados disponíveis, recupera falhas na leitura das mensagens e permite **Carregar histórico** por conversa ou contato. A consulta por Contatos continua sem assumir o atendimento. A migração adiciona um cache de fotos e preserva histórico, usuários, estoque e sessão. Veja [FOTOS_E_HISTORICO_AUTOMATICO.md](docs/FOTOS_E_HISTORICO_AUTOMATICO.md).

## Cotações configuradas

- **Abertas:** `(preço por metro da faixa inteira ÷ largura cadastrada em mm) × comprimento pedido em metros × largura pedida em mm`.
- **Sincronizadoras por mm:** preço por mm × largura do corte em mm.
- **Frisos/canais:** preço por friso/canal × número solicitado.
- **Peça pronta:** preço fechado da peça × quantidade de peças.

Nas abertas, por exemplo, faixa de 50 mm a R$ 114/m: um corte de 2 m × 25 mm custa R$ 114. O agente confere saldo e medidas; se faltar uma medida, pergunta ao cliente.

Por QR Code, o cliente usa **MAIS** e **ATENDENTE** como comandos. Os botões clicáveis do simulador representam esses comandos; botões nativos do WhatsApp exigiriam a integração oficial da Meta.

## Se não funcionar

- **docker não reconhecido:** confirme a instalação, abra o Docker Desktop e reinicie o Terminal.
- **Erro de conexão com o Docker:** espere o mecanismo terminar de iniciar; no Windows, confira se o WSL 2 está funcionando.
- **Porta 3000 ocupada:** pare a outra aplicação ou altere somente a primeira porta do mapeamento em `compose.yaml`, por exemplo de `3000:3000` para `3001:3000`; nesse caso, abra `localhost:3001`.
- **QR expirou:** gere outro no painel. Se o celular revogar a sessão, conecte novamente.
- **QR não aparece:** a partir da versão 1.11.1, o painel informa a categoria do erro e `docker compose logs --tail=100 cota` mostra a linha técnica `[WhatsApp]`. O comando `docker compose exec cota npm run whatsapp:diagnose` testa Chromium e rede com um perfil temporário, sem acessar ou apagar sua sessão. Veja [DIAGNOSTICO_QR.md](docs/DIAGNOSTICO_QR.md). A porta 3000 acessível não confirma que o navegador interno conseguiu iniciar.
- **Google Sheets não abre:** importe seu Excel pelo painel ou ajuste o compartilhamento da planilha.

O código, o build e os fluxos do painel foram testados no ambiente Node.js/Chromium da nuvem. A instalação por Docker precisa concluir o build no computador de destino; a imagem Docker não foi construída neste ambiente.

A versão **1.15.1** corrige a confirmação de envio de textos e fotos quando a biblioteca aceita a mensagem, mas perde o retorno da consulta. A confirmação recuperada usa o identificador exato da tentativa; não há reenvio. Falhas ao sincronizar a leitura não alteram um envio confirmado. Se não houver prova suficiente, aparece **Envio não confirmado**, sem check de envio. Confira no WhatsApp antes de reenviar. Veja [CONFIRMACAO_ENVIO.md](docs/CONFIRMACAO_ENVIO.md).

Na versão **1.15.2**, conversas, grupos, contatos e histórico do WhatsApp só aparecem com a conexão pronta. Ficam salvos no servidor quando desconectar e reaparecem ao reconectar. Simulações continuam disponíveis. Para o erro `profile_busy` após recriar o contêiner, há uma manutenção que remove apenas os links de bloqueio, sem apagar a sessão. Execute com todas as instâncias que compartilham a sessão paradas, seguindo [PERFIL_OCUPADO_E_CONEXAO.md](docs/PERFIL_OCUPADO_E_CONEXAO.md).

A versão **1.15.3** aguarda os componentes de autenticação antes de gerar o QR e trata erros de navegação que podiam derrubar o processo. A sessão e o histórico são preservados. Durante uma recarga do WhatsApp, o bot pausa os envios e os dados ficam ocultos até a conexão ficar pronta. Veja [AUTENTICACAO_E_NAVEGACAO.md](docs/AUTENTICACAO_E_NAVEGACAO.md).

A versão **1.15.4** mostra o progresso da conexão e limita a preparação inteira, inclusive a abertura do navegador e o carregamento inicial da página. Um recurso opcional pendente deixa de impedir o QR. Ao aparecer o QR, a espera pela leitura fica sob as regras do próprio WhatsApp. Veja [CARREGAMENTO_QR.md](docs/CARREGAMENTO_QR.md).
