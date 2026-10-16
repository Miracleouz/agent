# Cota · agente de cotações no WhatsApp

Painel do dono para uma loja de correias industriais, abertas e sincronizadoras. React + Express + SQLite, com conexão do WhatsApp por QR Code e histórico persistente.

## O que está implementado

- Conta única do dono, senha com scrypt, sessão em cookie HttpOnly, proteção de origem e limitação de tentativas de login. Troca de senha encerra outras sessões.
- Caixa de entrada com aparência do WhatsApp, busca, filtros, histórico e atualização em tempo real. Clientes de teste são identificados e os totais de WhatsApp excluem simulações.
- **Responder manual** pausa somente o chat escolhido por 5–120 minutos ou até reativação. O prazo padrão pode ser configurado. O agente volta para novas mensagens, sem responder retroativamente às antigas.
- **Falar com atendente** destaca o chat com uma exclamação, confirma a transferência uma vez e pausa até reativação explícita. Áudios e anexos também são encaminhados a uma pessoa.
- Cotação com até cinco opções reais, priorizando marcas diferentes e preços menores, sem substituir outra referência para completar a lista. **MAIS** pagina sem repetir produtos já mostrados. Estoque insuficiente é informado; itens sem preço ficam sob consulta.
- Busca local com normalização de acentos, palavras usuais, plurais, pequenas variações de escrita, referência e números. Exemplos: `A42`, `A-42`, `A 42`; correias dentadas/sincronizadoras; filtros de marca e `até R$ 50`. Segue o contexto para marca ou orçamento. Não depende de uma API de IA paga, nem é um modelo de linguagem generalista.
- Importação de CSV/Excel com prévia e confirmação antes da substituição. Sincronização manual ou agendada com Google Sheets. Arquivos inválidos preservam o catálogo existente. Produtos sem SKU recebem identificador estável; linhas idênticas sem SKU são agregadas apenas quando descrição, marca, medida, preço e unidade coincidem.
- Cotações calculadas por unidade de venda: friso/canal × número pedido, sincronizadoras por mm × largura do corte, abertas por comprimento × largura em mm e peça × quantidade. Se faltar medida, o agente pergunta e mantém a referência na próxima mensagem. Conferência da largura/quantidade de cada lote impede unir retalhos para prometer uma correia maior. Peças prontas mantêm o preço fechado e as medidas fixas. O total de várias correias usa o valor de cada peça arredondado a centavos.
- Quantidades fracionárias e unidades distintas preservadas: peça, metro, milímetro, friso etc. Preços vazios/zero são **Sob consulta**; nunca se tornam uma cotação de R$ 0. Não há reserva, baixa automática de estoque, pagamento ou conclusão de pedidos.
- **Grupos, status, listas de transmissão, canais e mensagens do próprio número são ignorados.** Mensagens recebidas duplicadas não geram duas respostas.

## Instalação passo a passo

Para instalar em seu computador com Docker e importar seu próprio Excel, siga [INSTALAR.md](INSTALAR.md).

## Iniciar

Requisitos: **Node.js 24+**, npm e Chromium/Chrome. Em Debian/Ubuntu, instale `chromium`, `ca-certificates`, `fonts-liberation` e `libnss3-tools` pelo gerenciador de pacotes do sistema. O Chromium já está instalado no ambiente atual.

```bash
cd /workspace/agent
PUPPETEER_SKIP_DOWNLOAD=true npm ci --cache /workspace/.npm-cache
npm run build
npm start
```

O servidor usa a porta 3000. No primeiro acesso, crie sua conta de dono. Não existe senha padrão. Crie essa conta antes de expor uma instalação nova ao público. Para desenvolvimento com atualização automática de interface, use `npm run dev`.

Ajustes opcionais estão em `.env.example`. Crie um `.env` local se necessário; não versionar segredos. `CHROME_PATH` seleciona outro Chrome. `DATA_DIR` muda o local do banco e da sessão do WhatsApp. Em hospedagem pública, configure `APP_URL` com a URL HTTPS exata e um proxy reverso que forneça HTTPS. O cookie se torna Secure e as mutações passam a conferir essa origem. Não exponha o servidor de desenvolvimento na internet.

### WhatsApp por QR Code

No painel, abra **WhatsApp → Gerar QR Code**. No celular, abra **Aparelhos conectados → Conectar um aparelho** e leia o código. A aplicação não envia mensagens antes de conectar; o simulador nunca aciona números reais. A conta conectada recebe respostas nas novas mensagens de conversas individuais enquanto o servidor estiver funcionando.

A sessão fica em `data/whatsapp`. Para reconectar automaticamente após reiniciar, defina `WHATSAPP_AUTO_CONNECT=true`. Se o aparelho revogar ou expirar a sessão, leia um novo QR. Uma sessão deve ser usada por uma única instância do servidor.

A integração usa `whatsapp-web.js`, **não oficial** e dependente de compatibilidade com o WhatsApp Web. Ela pode exigir novo pareamento quando o WhatsApp mudar. **Botões nativos de resposta não são suportados de forma confiável por QR.** Nesta implementação, o cliente digita **MAIS** ou **ATENDENTE**. No simulador há botões clicáveis equivalentes. Botões nativos no aplicativo exigiriam uma integração separada com a API oficial da Meta; ela não está implementada.

### Certificado do proxy do ambiente

Neste ambiente, o certificado de proxy fornecido em `NODE_EXTRA_CA_CERTS` precisou ser adicionado ao banco NSS do Chromium. `bash scripts/browser-trust.sh` reproduz essa importação de forma aditiva quando o certificado e `certutil` existem. O script pode precisar de permissão para escrever em `~/.pki/nssdb`. Não baixa certificados nem desativa TLS. Em uma máquina sem esse proxy, esse passo não é necessário.

## Seu estoque

Uma instalação nova começa sem estoque, histórico, conta de dono ou sessão de WhatsApp. Importe seu Excel/CSV pelo painel ou informe seu próprio link do Google Sheets. Os dados são mantidos no diretório local `data/`, ignorado pelo Git. O preço da planilha é tratado como preço de venda por padrão, sem acréscimo.

Colunas da sua planilha reconhecidas diretamente:

| Planilha original | Campo do agente |
| --- | --- |
| MARCA | Marca |
| DESCRIÇÃO PADRONIZADA | Produto e referência |
| QUANTIDADE TOTAL | Saldo, incluindo frações |
| UNIDADE | Unidade da cotação |
| VALOR UNITÁRIO ORIGINAL (R$) | Preço de venda |

Também aceita o modelo simples `sku;produto;marca;medida;preco;quantidade;unidade`, disponível em **Estoque → Baixar modelo**. Referência pode fazer parte do nome. Opcionais: SKU, medida e unidade. Aceita vírgula decimal brasileira e células numéricas do Excel. Lê a primeira aba do Excel; no Google Sheets, `gid` no link seleciona a aba. Limites: 8 MB e 100 mil produtos por importação. O painel pagina o catálogo em blocos de 100, com busca no catálogo inteiro.

A sincronização do Google requer compartilhamento **Qualquer pessoa com o link → Leitor**. Se a planilha precisar ficar privada, importe o Excel/CSV pelo painel. Não há autenticação de Google privado nesta versão.

Para atualização administrativa pela linha de comando (substitui todo o estoque):

```bash
npm run stock:sync
npm run stock:import -- /caminho/estoque.xlsx
```

A importação/sincronização substitui o catálogo inteiro, não soma ao estoque anterior. Cotação não reserva mercadoria: o atendente confirma disponibilidade e finaliza a venda. Os valores são em BRL, por unidade da planilha. Se futuramente importar custos, mude o tipo de valor nas configurações e informe o acréscimo percentual desejado.

### Exemplos ilustrativos de cálculo por corte

- **PJ 350, 5 frisos**: busca a referência PJ 350 e calcula `preço por friso × 5`. Se a referência ou o saldo não existir no estoque importado, pede confirmação ou oferece um atendente, sem substituir o modelo.
- **5V2240, 4 canais**: mantém `5V` como perfil e calcula por 4 canais. Uma peça pronta com 6 canais fixos não é oferecida como peça de 4 canais.
- **1304 8M, largura de 20 mm**: uma linha por mm é multiplicada por 20. Uma linha por peça pronta usa seu preço fechado e exige a largura correspondente.
- **Aberta AT10, 2 metros × 25 mm**: se uma faixa inteira de 50 mm custar R$ 100 por metro, o corte custa `(100 ÷ 50) × 2 × 25 = R$ 100`. Esse valor é apenas um exemplo de cálculo, não um catálogo fornecido com o código.

O agente pergunta medidas faltantes e mantém a referência no contexto. Sincronizadoras por mm usam a largura do corte. Para abertas, comprimento é convertido para metros e largura para mm. O padrão `per_meter_full_width` considera o preço por metro da faixa inteira cadastrada; outra base pode ser selecionada nas Configurações. A cotação mostra a fórmula e o valor por correia, sem reservar ou baixar estoque. Cortes e disponibilidade são confirmados pelo atendente.

## Validar

```bash
npm test
npm run build
npm run test:ui
```

Os testes de navegador usam o Chromium local (`CHROME_PATH` pode sobrescrever) e um servidor/banco temporário isolado na porta 3101. Cobrem cadastro, cinco opções, paginação, alerta de atendente, resposta manual, reativação, importação confirmada e layout móvel. Não dependem de um número de WhatsApp nem enviam mensagens a clientes. A geração de um QR real foi validada separadamente; pareamento e entrega a um contato real dependem da leitura pelo dono e não foram feitos automaticamente.

As dependências estão fixadas pelo lockfile. O override de `@puppeteer/browsers` evita dependências de extração antigas; a inicialização do Chromium pelo Puppeteer e a geração real do QR foram verificadas com ele. O override de UUID mantém uma versão corrigida compatível com ExcelJS. O navegador é fornecido pelo sistema, sem downloads automáticos de Chrome pelo npm.

## Hospedagem e persistência

Também há `Dockerfile` e `compose.yaml`:

```bash
docker compose up -d --build
```

A imagem instala Chromium e usa usuário não root. O volume `cota-data` mantém banco, conta e sessão. A composição é fornecida como alternativa de hospedagem; não foi executada neste ambiente. Configure HTTPS e `APP_URL` antes de produção.

Preserve todo o `DATA_DIR` em armazenamento persistente. Para backup por cópia, pare o servidor antes de copiar o diretório inteiro, incluindo eventuais arquivos WAL/SHM do SQLite. Não copie somente o `.sqlite` enquanto o servidor estiver gravando. A exclusão desse diretório apaga conta, estoque, histórico e sessão. Não publique esse diretório nem o QR de pareamento.

O ambiente precisa alcançar `docs.google.com` e redirecionamentos `*.googleusercontent.com` para o estoque; `web.whatsapp.com`, `*.whatsapp.com` e `*.whatsapp.net` para a conexão. Destinos adicionais usados pelo WhatsApp devem ser liberados conforme erros observados. A configuração de rede e as instruções reutilizáveis foram salvas no rascunho do ambiente; a publicação pertence ao usuário.

### Base e disponibilidade de correias abertas

Para abertas, `openBeltPriceBasis=per_meter_mm` significa preço por um metro longitudinal × um mm de largura. `per_meter_full_width` significa preço por metro com toda a largura informada na descrição; nessa modalidade o preço é dividido pela largura original antes de multiplicar por comprimento × largura solicitados. O valor unitário convertido não é arredondado antecipadamente: o arredondamento é no preço final de cada corte. A mesma multiplicação de largura e comprimento nunca é aplicada duas vezes.

O estoque em metros limita o comprimento contínuo, e a largura informada limita as faixas cortáveis. Para várias correias, o agente confere quantas faixas e segmentos inteiros cabem no lote; uma área equivalente suficiente não autoriza juntar retalhos para criar um corte contínuo maior. Registros de abertas com unidade de estoque incompatível com metros ou sem largura cadastrada são encaminhados ao atendente. Por exemplo, o saldo de uma aberta marcada como `Milímetro (MM)` não é interpretado automaticamente como metros: o registro exige revisão humana.

A base padrão das abertas é preço por metro da faixa inteira. Alterar a configuração não reativa automaticamente conversas assumidas ou encaminhadas ao atendente.
