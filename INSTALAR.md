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
- **Não lidas:** fila compartilhada de conversas sem responsável. Clique para assumir automaticamente; a conversa sai dessa fila e abre na sua aba pessoal, com o bot pausado. Outro Comercial deixa de vê-la.
- **Grupos:** lista e novas mensagens para consulta, sem respostas automáticas ou manuais pelo painel. A lista carrega ao conectar o WhatsApp. O histórico anterior à conexão não é importado, e anexos aparecem como aviso sem download.
- **Todos os atendimentos:** visão adicional do Admin. Abrir uma conversa de outro responsável permite acompanhar, sem tomar o atendimento nem limpar as mensagens não lidas dele.

Para devolver um chat à equipe, use **Liberar conversa**. Ele sai da sua aba pessoal e volta para **Não lidas**, disponível aos outros usuários. O histórico, o pedido e os alertas são mantidos. A liberação não envia mensagem e deixa o bot pausado aguardando a equipe; não agenda lembretes. A palavra Não lidas identifica a fila de trabalho: uma conversa liberada volta para lá mesmo se o histórico já foi lido.

**Reativar agente** volta a permitir respostas a novas mensagens, mantendo a conversa com o responsável. O fim de uma pausa temporária também mantém esse responsável. Para disponibilizar aos outros, use **Liberar conversa** ou uma transferência por Admin. Se dois usuários abrirem o mesmo chat juntos, apenas um assume; o outro Comercial recebe aviso de que a conversa já foi assumida.

Ao digitar no painel, o nome aparece para os colegas. O cliente recebe a resposta assinada, por exemplo **Carla Lima: Olá, vou te atender.** O padrão é assinar; o dono pode alterar em **Configurações → Assinar mensagens no WhatsApp com o nome do atendente**. Cada chat tem um responsável por vez; o dono pode transferi-lo para si usando **Assumir atendimento**.

Para transferir para outra pessoa, um Admin abre o chat, usa **Transferir**, escolhe o responsável e confirma. O agente fica pausado naquele chat. O Comercial anterior deixa de ver o histórico e o novo responsável passa a vê-lo. Administradores continuam vendo todos os atendimentos. Transferir não envia mensagem ao cliente.

### Cadastrar várias pessoas de uma vez

1. Entre como Admin e abra **Equipe → Cadastrar em lote**.
2. Cole uma linha por pessoa no formato `Nome;email;cargo`, sem cabeçalho. Use `admin` ou `comercial`. Exemplo: `Pessoa de vendas;vendas@empresa.com;comercial`.
3. Informe a senha inicial da equipe uma única vez e clique em **Cadastrar usuários**.

O lote aceita até 50 pessoas e só é aplicado se todos os registros forem válidos. Se um e-mail já existir, nenhuma conta do lote é criada; edite a conta existente ou remova a linha do lote. Cada pessoa poderá trocar sua senha depois. As credenciais são salvas somente no banco da instalação em que você fez o cadastro. O ZIP contém o código, sem usuários ou senhas previamente cadastrados.

**Pode separar**, **quero fechar** e **vou comprar** criam o alerta **Quer fechar pedido** e pausam a conversa. Depois de conferir os detalhes com o cliente, o responsável usa **Marcar pedido fechado**, que registra seu nome no painel. Isso não envia outra mensagem automática, não cobra e não baixa o estoque. Pedidos de atendente mantêm seu próprio aviso. Para voltar ao atendimento automático, use **Reativar agente** somente naquele chat.

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
- **Google Sheets não abre:** importe seu Excel pelo painel ou ajuste o compartilhamento da planilha.

O código, o build e os fluxos do painel foram testados no ambiente Node.js/Chromium da nuvem. A instalação por Docker precisa concluir o build no computador de destino; a imagem Docker não foi construída neste ambiente.
