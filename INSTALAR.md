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

O computador e o Docker precisam permanecer ligados para o agente responder. O histórico, a conta e a sessão ficam no volume persistente `cota-data`; esse volume é criado na primeira execução. A instalação nova não contém contas, senhas, histórico ou sessão de WhatsApp de outro ambiente.

## Outros sistemas com Docker

Em macOS, os mesmos passos de Docker Desktop e `docker compose` se aplicam. Em Linux, instale Docker Engine e o plugin Docker Compose conforme a documentação oficial https://docs.docker.com/engine/install/ e execute os comandos na pasta do projeto.

Para um servidor/VPS acessível pela internet, configure domínio, HTTPS e `APP_URL` com a URL HTTPS exata antes de expor o painel. Crie a conta de dono em um acesso restrito inicial. Esta etapa depende do domínio e do servidor escolhidos; não basta publicar a configuração do ambiente de desenvolvimento para hospedar o painel.

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
