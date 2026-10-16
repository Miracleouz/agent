# Cota · agente de cotações no WhatsApp

Painel do dono e da equipe para uma loja de correias industriais, abertas e sincronizadoras. React + Express + SQLite, com conexão do WhatsApp por QR Code e histórico persistente.

## O que está implementado

- Contas individuais com dois cargos: **Admin** e **Comercial**. O Admin cadastra, edita cargos, redefine senhas e desativa contas em **Equipe**. Pode haver vários administradores; o sistema impede desativar ou rebaixar o último Admin ativo. Senhas com scrypt, sessões em cookie HttpOnly, proteção de origem e limitação de tentativas de login. Cada usuário pode trocar sua senha, encerrando somente suas outras sessões. Mudança de cargo exige novo login; desativação revoga o acesso e libera os chats, mantendo o agente pausado.
- **Central de atendimento com um WhatsApp:** abas **Conversas · nome do usuário**, **Não lidas**, **Histórico** e **Grupos**, com **Todos os atendimentos** para Admin. Ao abrir uma conversa livre, ela é assumida automaticamente, sai da fila e passa à aba pessoal. Apenas o responsável e os Admins a veem. Admin pode acompanhar um chat ocupado sem alterar o responsável. **Liberar conversa** preserva o histórico e os alertas e o torna disponível aos demais em Histórico, ou em Não lidas se houver mensagem nova pendente; nenhuma mensagem é enviada. O acesso direto ao histórico de outro responsável também é bloqueado na API.
- **Responsável e automação independentes:** assumir ao abrir pausa o bot somente naquele chat até reativação. **Reativar agente** e o fim de uma pausa não liberam a conversa para outro usuário. A liberação deixa o bot pausado para a equipe e cancela acompanhamentos, sem fabricar uma mensagem não lida. Pedidos simultâneos têm um único responsável; Admin pode transferir para qualquer usuário ativo. O painel mostra quem está digitando, quem assumiu e quem respondeu. As mensagens humanas são assinadas por padrão, por exemplo `*Carla Lima*: Olá, vou te atender.`; o Admin pode alterar essa opção nas Configurações.
- **Cadastro em lote:** crie até 50 usuários com nome, e-mail, cargo e uma senha inicial informada no painel. O cadastro só é aplicado se todas as linhas forem válidas e os e-mails estiverem livres. Cada conta recebe seu próprio hash de senha. Contas e senhas da instalação não acompanham o ZIP público.
- **Contatos:** clique no nome para consultar o histórico sem assumir o chat ou enviar mensagens. Agenda compartilhada com nome, WhatsApp e empresa; cadastro, edição, busca e paginação. Admins e Comerciais podem cadastrar/editar e iniciar atendimento manual; somente Admins excluem cadastros. **Conversar** confirma o número no WhatsApp conectado, reutiliza o histórico e assume um chat livre com o agente pausado. Nada é enviado até o usuário escrever e clicar em enviar. A primeira mensagem segue a assinatura do atendente. Um Comercial não abre chats de outro responsável; Admins podem observar e usar as transferências existentes. Excluir um contato mantém o histórico.
- **Sincronização após conectar:** importa a lista de conversas privadas, grupos e contatos salvos disponíveis no WhatsApp. Um Admin acompanha o status e usa **Sincronizar WhatsApp** para repetir a consulta. Busca automaticamente o histórico disponível dos últimos 30 dias das conversas privadas, com progresso e paginação por data, sem disparar respostas ao histórico. A aba **Histórico** guarda conversas livres já lidas; **Não lidas** recebe somente mensagens novas. Chats, autores, edições, fotos, responsáveis e dados da agenda já existentes são preservados. Veja [SINCRONIZACAO_WHATSAPP.md](docs/SINCRONIZACAO_WHATSAPP.md).
- **Histórico, fotos e edições:** mensagens, fotos e versões anteriores dos textos ficam no SQLite do servidor. Fechar o navegador, sair da conta ou transferir o chat preserva o histórico e os autores. O novo responsável e os Admins consultam a mesma conversa. No atendimento manual, **Enviar foto** aceita JPEG, PNG e WebP de até 8 MB, com legenda opcional e assinatura do atendente. Selecionar o arquivo não envia; cliques repetidos na mesma solicitação não repetem o envio. **Editar** altera texto ou legenda no WhatsApp em até 15 minutos, quando permitido pelo serviço, e **Ver edições** mostra os textos anteriores e quem editou. Comercial edita suas próprias mensagens; Admin precisa assumir o chat para editar mensagens de outros. Fotos recebidas novas são guardadas quando o WhatsApp disponibiliza o download; grupos permanecem sem download de anexos.
- **Somente depois do cliente iniciar:** cada resposta automática exige uma mensagem recebida validada na mesma conversa. Cadastro, histórico importado, eventos internos, QR, relógio e registros locais não autorizam primeiro contato. Mensagens próprias, antigas, status, canais e grupos são ignorados. Avisos agendados também passam por essa verificação e não são repetidos após falha incerta.
- **ROBINHO:** no primeiro contato válido de cada cliente em uma janela de 24 horas, responde com “Olá, sou o agente ROBINHO, vou te ajudar no atendimento nesse momento”. Reconhece entradas como `oi vim pelo site`. Se a primeira mensagem já contiver um pedido, inclui a apresentação e a cotação na mesma resposta. O registro da apresentação é persistente; não existe envio de saudação por relógio, importação, reconexão ou cadastro de contato. Atendimento manual e agente desligado continuam sendo respeitados.
- **Fotos e atualização automática:** fotos de contatos e grupos na agenda, nas listas e nos cabeçalhos, respeitando a disponibilidade no WhatsApp. Sincroniza ao conectar e a cada cinco minutos, com nova tentativa em 30 segundos nas pendências. O botão manual continua disponível. O histórico pode ser recarregado por conversa e solicita os dados disponíveis ao telefone vinculado. Veja [fotos e histórico automático](docs/FOTOS_E_HISTORICO_AUTOMATICO.md).
- **Recuperação de listas:** se a consulta de conversas falhar por um chat incompatível, recupera as listas disponíveis no navegador conectado, sem enviar mensagens. Contatos continuam carregando durante os eventos de sincronização. Pendências mostram a etapa afetada. Veja [correção de sincronização](docs/CORRECAO_SINCRONIZACAO_1_14_2.md).
- **Autenticação e navegação:** aguarda os componentes do WhatsApp antes de preparar o QR, protege a troca da página e captura erros assíncronos de navegação. Socket nulo, espera excessiva e frame desanexado recebem diagnóstico e permitem nova tentativa, preservando a sessão. Veja [AUTENTICACAO_E_NAVEGACAO.md](docs/AUTENTICACAO_E_NAVEGACAO.md).
- **Recuperação do perfil:** manutenção com serviço parado para remover somente os três links de bloqueio do Chromium, preservando autenticação e dados. Verifica processos e exige confirmação de que todas as instâncias que usam a sessão estão paradas. Veja [perfil ocupado e conexão](docs/PERFIL_OCUPADO_E_CONEXAO.md).
- **Dados visíveis durante a conexão:** conversas, grupos, contatos e histórico do WhatsApp ficam ocultos enquanto estiver desconectado ou autenticando e reaparecem ao conectar. Os registros, autores e responsáveis são preservados; acesso direto pela API também exige conexão. O simulador segue disponível.
- **Confirmação de envio:** textos e fotos preservam o resultado quando o WhatsApp aceita o envio, mas a biblioteca perde o retorno. A recuperação usa o identificador exato da tentativa e não repete o envio. Falhas de leitura não alteram mensagens confirmadas. Quando falta prova, o painel mostra **Envio não confirmado** e orienta conferir no WhatsApp. Veja [CONFIRMACAO_ENVIO.md](docs/CONFIRMACAO_ENVIO.md).
- **Leitura sincronizada:** ao abrir uma conversa visível, consultar o histórico por contato ou responder por texto, foto ou ROBINHO, o Cota confirma a leitura no WhatsApp para limpar a marcação do celular. Ler no celular também atualiza o painel. Falhas oferecem **Sincronizar leitura**, sem reenviar mensagens. Os checks azuis das respostas dependem da confirmação de leitura do cliente; alertas de pedido e atendente permanecem mesmo após ler. Veja [leitura e painel MP](docs/LEITURA_E_PAINEL_MP.md).
- **Painel MP Correias:** navegação lateral, identificação de cargo/usuário e visual adaptado ao celular. A identificação MP é em texto; esta entrega não depende de um arquivo de logo.
- **Vocabulário industrial:** aceita sincronizadora, sincronizada, dentada e síncrona para descrições abreviadas como SINCR, SINC e SINCRON, preservando referência, passo e medidas.
- Caixa de entrada com aparência do WhatsApp, busca, filtros, histórico e atualização em tempo real. Clientes de teste são identificados e os totais de WhatsApp excluem simulações.
- **Responder manual** permite configurar uma pausa de 5–120 minutos ou até reativação. Ao abrir um chat livre, a tomada é automática, com pausa sem prazo. O agente volta para novas mensagens após reativação, sem responder retroativamente às antigas. Abrir o simulador para acompanhar uma cotação não assume o chat de teste; clicar na conversa na lista assume.
- **Falar com atendente** destaca o chat com uma exclamação, confirma a transferência uma vez e pausa até reativação explícita. Áudios e anexos também são encaminhados a uma pessoa.
- **Cotação ou compra:** reconhece pedidos de preço e orçamento, intenção de fechar uma compra, abreviações e erros comuns de escrita. Negação, pesquisa e perguntas de preço evitam um encaminhamento prematuro. Uma escolha ambígua, como apenas `2` ou `pode ser`, pede confirmação. `Quero a segunda`, `pode separar`, `quero fechar` e `vou comprar` geram o alerta **Quer fechar pedido** e pausam somente esse chat. A equipe vê a opção e a cotação de referência; confirma itens, medidas, disponibilidade e pagamento antes de finalizar. O agente não confirma a venda nem reserva estoque.
- **Forma de envio:** RETIRA, CORREIOS e Consultar outros. Após um pedido para fechar ou separar reconhecido e confirmado como recebido pelo bot, sem forma de envio, oferece essas opções uma vez após **3 minutos de silêncio**, enquanto a conversa aguarda a equipe sem responsável. Se o cliente falar antes, o prazo conta a partir da nova mensagem; se informar a forma, não pergunta. Reconhece retirada, buscar na loja/balcão, Correios, Sedex, PAC, transportadora, motoboy e outras variações. O painel mostra a forma registrada no resumo de compra. Frete, prazo e disponibilidade são confirmados pela equipe.
- **Retirada pelo cliente:** `vou mandar o motorista`, `vou mandar motoboy`, `vou mandar o uber`, `vou mandar o 99`, `vou mandar retirar` e `vou retirar` registram **RETIRA** e recebem **Para agilizar na hora da retirada informe nome de quem vai retirar e nome da empresa**. A pergunta tem uma tentativa por chat em 24 horas, sem repetir a pergunta; o atendimento automático encerra após cinco minutos de silêncio. Os dados recebidos ficam no histórico e em **Retirada · identificação**. Respeita atendimento manual e desligamento. `Pode mandar por motoboy` continua como entrega a consultar; cotações junto da retirada mantêm os preços na mesma resposta.
- **Agradecimento depois dos valores:** `ok`, `obgd`, `ok,obgd`, `obrigado`, `valeu` e variações oferecem **te ajudo em algo mais?**, uma vez por cotação. **Sim** pergunta **Oque mais precisa?** e inicia a consulta do próximo item; **Não** encerra em silêncio, sem outra confirmação ou acompanhamento. Agradecimentos e cliques repetidos após encerrar não reabrem o atendimento. Uma nova solicitação de cotação do cliente pode reabrir. Agradecer não cria pedido nem pergunta de envio.
- **Sem insistência no envio:** no máximo uma tentativa da pergunta de entrega por chat em 24 horas; falhas e envios incertos não são repetidos. Tomada manual, liberação, transferência, pedido de atendente, confirmação interna do pedido, desligamento do agente, reinício ou reconexão impedem o agendamento anterior. A pergunta de envio funciona independentemente do acompanhamento de cotação de cinco minutos.
- **Alertas de pedido e atendente separados:** após conferir a compra, o responsável pode **Marcar pedido fechado**. O painel registra o nome de quem marcou e mantém o alerta, sem enviar confirmação automática, cobrar ou baixar estoque. Se o cliente também pedir atendente, os dois avisos aparecem. **Reativar agente** resolve a pendência e libera o chat para novas mensagens; o estado do último pedido continua registrado.
- **Encerramento após 5 minutos de silêncio:** no atendimento automático iniciado pelo cliente, envia uma única mensagem de encerramento e fecha a conversa. Vale para saudações, cotações, perguntas de medida, ajuda e dados de retirada enquanto o bot estiver ativo. Uma nova mensagem válida reinicia o prazo. Se a resposta do bot demorar, o cliente recebe cinco minutos para responder após o envio concluído, evitando dois envios seguidos. Agradecimentos e cliques repetidos depois de encerrar ficam sem resposta; uma nova solicitação pode iniciar outro atendimento. Pausa manual, encaminhamento humano, desligamento, reconexão e reinício cancelam a espera. O antigo menu de fechar/adicionar/encerrar foi substituído por esse aviso, e o prazo é fixo em cinco minutos.
- Cotação com até cinco opções reais, priorizando marcas diferentes e preços menores, sem substituir outra referência para completar a lista. **MAIS** pagina sem repetir produtos já mostrados. Estoque insuficiente é informado; itens sem preço ficam sob consulta.
- **Vários itens:** entende pedidos como `cotar corr B 72; correia A 89; correia 3VX 500` e responde em uma mensagem com até cinco opções por item, marcas e preços separados e numeração contínua. `MAIS` pagina as opções de cada item. A opção escolhida mantém a referência e a medida correspondentes. Se só um item precisar de uma medida, pergunta por ele e mantém os demais. Limite de dez referências por mensagem; acima disso pede divisão do pedido, sem omitir itens silenciosamente.
- **4 PK 650:** entende quatro frisos de PK650. Mostra peça pronta 4PK650 e corte de PK650 por quatro frisos quando essas formas estiverem disponíveis, preservando diversidade de marcas. Peça pronta usa seu preço fechado; corte usa preço por friso × 4. Códigos conflitantes de SKU não autorizam substituir outra referência. Se peças prontas já tiverem preço e o estoque também contiver cortes sem a medida solicitada, mostra os valores das prontas e informa o que falta para cotar os cortes.
- Busca local com normalização de acentos, palavras usuais, plurais, pequenas variações de escrita, referência e números. Exemplos: `A42`, `A-42`, `A 42`; correias dentadas/sincronizadoras; filtros de marca e `até R$ 50`. Segue o contexto para marca ou orçamento. Não depende de uma API de IA paga, nem é um modelo de linguagem generalista.
- Importação de CSV/Excel com prévia e confirmação antes da substituição. Sincronização manual ou agendada com Google Sheets. Arquivos inválidos preservam o catálogo existente. Produtos sem SKU recebem identificador estável; linhas idênticas sem SKU são agregadas apenas quando descrição, marca, medida, preço e unidade coincidem.
- Cotações calculadas por unidade de venda: friso/canal × número pedido, sincronizadoras por mm × largura do corte, abertas por comprimento × largura em mm e peça × quantidade. Se faltar medida, o agente pergunta e mantém a referência na próxima mensagem. Conferência da largura/quantidade de cada lote impede unir retalhos para prometer uma correia maior. Peças prontas mantêm o preço fechado e as medidas fixas. O total de várias correias usa o valor de cada peça arredondado a centavos.
- Quantidades fracionárias e unidades distintas preservadas: peça, metro, milímetro, friso etc. Aceita **MT, MTS, METRO e METROS**, inclusive junto do número, para comprimento. Códigos como **8M** continuam sendo o passo da sincronizadora. Preços vazios/zero são **Sob consulta**; nunca se tornam uma cotação de R$ 0. A marcação de pedido fechado é interna: não há reserva, baixa automática de estoque ou pagamento.
- **O agente não responde em grupos.** A aba Grupos permite consultar a lista carregada na conexão e as novas mensagens recebidas depois dela, sem importar histórico anterior ou baixar anexos. Grupos não geram cotações, alertas de atendente, acompanhamentos ou envios manuais pelo painel. Status, transmissões, canais, mensagens próprias, eventos internos e histórico antigo continuam ignorados. Duplicatas não geram duas respostas nem duplicam mensagens do grupo.

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

Se o QR não aparecer, consulte [Diagnóstico do QR](docs/DIAGNOSTICO_QR.md). O painel diferencia falhas de navegador, perfil ocupado, rede, certificados e permissões; `npm run whatsapp:diagnose` testa um perfil temporário sem parear números ou usar a sessão existente. No Docker, use `docker compose exec cota npm run whatsapp:diagnose`.

A sessão fica em `data/whatsapp`. Para reconectar automaticamente após reiniciar, defina `WHATSAPP_AUTO_CONNECT=true`. Se o aparelho revogar ou expirar a sessão, leia um novo QR. Uma sessão deve ser usada por uma única instância do servidor.

### Acesso da equipe em vários computadores

Um Admin conecta o número da loja uma vez e cadastra as pessoas em **Equipe → Novo usuário**, selecionando **Admin** ou **Comercial**, ou em **Cadastrar em lote**. Cada pessoa abre **a mesma URL do painel** e entra com seu próprio e-mail e senha; não precisa conectar outro WhatsApp. Os nomes usados na digitação e na assinatura vêm da conta autenticada.

Mantenha **uma instalação central**, com o mesmo banco e sessão. Instalar uma cópia do ZIP em cada computador cria instalações separadas, sem compartilhar chats. Na rede local, os colegas acessam o endereço do computador servidor, por exemplo `http://192.168.1.50:3000` (substitua pelo IP real e libere a porta na rede local). `localhost` em outro computador aponta para ele próprio. Para acesso pela internet, use uma URL HTTPS e configure `APP_URL` com ela.

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
- **AT10 aberta 2 MT 25mm**, **AT10 2MTS x25mm** e **AT10 2 METROS 25mm**: todas pedem o mesmo corte de 2 metros × 25 mm. Se faltar a largura, o agente pergunta antes de calcular.
- **AT10 33000**: interpreta 33000 mm como **33 metros de correia aberta** e pergunta a largura se faltar. Também aceita `AT10 33.000`, `AT10 33000 x 25mm` e `AT10 33m 25mm`. A conversão abreviada é limitada aos perfis lineares AT/T: comprimentos sem unidade a partir de 10000 mm, ou a partir de 1000 mm quando explicitamente abertos/com unidade mm. Códigos comuns de fechadas e larguras como `AT10 50mm` não viram comprimentos. Se o cliente disser `fechada`, essa conversão não é aplicada.

O agente pergunta medidas faltantes e mantém a referência no contexto. Sincronizadoras por mm usam a largura do corte. Para abertas, comprimento é convertido para metros e largura para mm. O padrão `per_meter_full_width` considera o preço por metro da faixa inteira cadastrada; outra base pode ser selecionada nas Configurações. A cotação mostra a fórmula e o valor por correia, sem reservar ou baixar estoque. Cortes e disponibilidade são confirmados pelo atendente.

## Validar

```bash
npm test
npm run test:intents
npm run test:followups
npm run test:inactivity
npm run test:contacts
npm run test:messages
npm run test:connection
npm run test:sync
npm run test:read
npm run test:conversations
npm run test:team
npm run build
npm run test:ui
```

Os testes de navegador usam o Chromium local (`CHROME_PATH` pode sobrescrever) e um servidor/banco temporário isolado na porta 3101. Cobrem cadastro, cinco opções, paginação, alerta de atendente, resposta manual, reativação, importação confirmada e layout móvel. Não dependem de um número de WhatsApp nem enviam mensagens a clientes. A geração de um QR real foi validada separadamente; pareamento e entrega a um contato real dependem da leitura pelo dono e não foram feitos automaticamente.

Na versão **1.15.3**, passaram **3.292 testes automatizados**, **40 testes de navegador** e o build de produção. A [correção de autenticação e navegação](docs/AUTENTICACAO_E_NAVEGACAO.md) acrescenta 37 testes de servidor e dois cenários de navegador com o SDK instalado e Chromium, além da validação do QR no WhatsApp Web real sem pareamento. A [recuperação de perfil e visibilidade por conexão](docs/PERFIL_OCUPADO_E_CONEXAO.md) foi validada com 54 testes novos de servidor, dois novos cenários de navegador, reprodução do bloqueio em Chromium real e geração de QR sem pareamento. O [relatório de confirmação de envio](docs/CONFIRMACAO_ENVIO.md) descreve os 35 testes novos de envio e os quatro cenários de navegador para retornos perdidos ou incertos. O [relatório de leitura e painel MP](docs/LEITURA_E_PAINEL_MP.md) descreve 335 testes novos de leitura, respostas e vocabulário industrial e quatro novos cenários de navegador. O [relatório de histórico mensal e Não lidas](docs/HISTORICO_MENSAL_E_NAO_LIDAS.md) registra 305 testes novos de período, paginação e consulta por contato. O [relatório de sincronização](docs/SINCRONIZACAO_WHATSAPP.md) registra 310 testes anteriores de listas, histórico, permissões e ausência de respostas à importação. A [verificação do diagnóstico de QR](docs/DIAGNOSTICO_QR.md) registra 48 testes novos e geração de QR com Chromium real, sem pareamento. O [relatório de histórico, fotos e edições](docs/TESTES_HISTORICO_FOTOS_EDICAO.md) descreve os **326 testes acrescentados na versão 1.11.0**, incluindo persistência após reiniciar, transferências, permissões, edição e bloqueio de reenvios. O [relatório de contatos e início manual](docs/TESTES_CONTATOS_300.md) registra os 350 testes de contatos acrescentados na versão anterior. O [relatório de inatividade e 300 conversas](docs/TESTES_INATIVIDADE_300.md) documenta 300 combinações de saudações e cotações pelo adaptador QR simulado e outros 40 cenários sem primeiro contato ou com eventos ignorados durante o atendimento. Os relatórios anteriores registram o comportamento de cada versão; o encerramento por inatividade desta versão substitui o menu de cinco minutos das versões anteriores.

A bateria de intenções exercita **180 mensagens diferentes** pelo fluxo completo do agente, com expectativas escritas nos testes. Inclui cotação, compra, negação, condição, abreviações, erros de escrita e respostas ambíguas. Veja o [relatório dos testes de intenção](docs/TESTES_INTENCOES.md). Esses resultados cobrem os casos do corpus; a interpretação usa regras locais e não garante entendimento de qualquer frase possível.

O [relatório de acompanhamento e comprimentos](docs/TESTES_ACOMPANHAMENTO.md) documenta os testes de não repetição, concorrência, falhas, reconexão, reinício, escolhas do menu e conversão de comprimento. Os prazos são exercitados com relógio simulado, sem esperar cinco minutos reais ou enviar mensagens a contatos.

O [relatório do ROBINHO e das conversas](docs/TESTES_CONVERSAS_ROBINHO.md) registra **100 conversas completas pelo adaptador de WhatsApp simulado e 20 cenários sem início pelo cliente**, além das regressões de múltiplos itens, PK e apresentação a cada 24 horas. As conversas usam números e estoque fictícios, sem pareamento ou envio real.

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
