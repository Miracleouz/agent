# Inicialização, Socket nulo e navegação do WhatsApp — versão 1.15.3

## Falhas reproduzidas

Os logs da versão 1.15.2 mostravam uma rejeição assíncrona na navegação da página (`Attempted to use detached Frame`), seguida do encerramento do processo Node. Após reiniciar, a autenticação falhava com `Cannot read properties of null (reading 'Socket')`.

Na biblioteca instalada, `whatsapp-web.js` 1.34.7, a presença de `window.Debug.VERSION` não garante que o módulo de autenticação já esteja disponível. O método original acessa `WAWebSocketModel.Socket` diretamente. Além disso, o callback assíncrono de `framenavigated` chama a injeção sem capturar sua rejeição e recebe eventos de frames filhos.

O cenário de Socket nulo foi reproduzido com o método original do SDK, tanto em uma VM quanto em Chromium real com páginas locais controladas. O callback original de navegação também foi exercitado em Chromium. Nenhuma conta ou sessão do usuário foi usada nesses testes.

## Correção

O cliente do Cota mantém o fluxo de autenticação, QR e sessão da biblioteca instalada, com proteção nestas etapas:

- Aguarda o Socket de autenticação, seu estado e os módulos básicos antes de iniciar a injeção.
- Compartilha uma única injeção entre solicitações concorrentes. Uma mesma página já preparada não recebe outro conjunto de listeners.
- Confirma que a preparação terminou no mesmo documento e Socket em que começou. Uma navegação no meio da operação não marca outra página como preparada.
- Trata somente navegações do frame principal e captura a rejeição do callback do SDK. Não instala um handler global para ocultar erros do processo.
- Faz no máximo duas novas tentativas de preparação para erros transitórios, dentro do limite de autenticação configurado. O limite também cobre o SDK preso aguardando o estado `OPENING`.
- Cancela a preparação quando o cliente é fechado ou substituído. Se o prazo acabar, fecha o navegador dessa tentativa e mostra o diagnóstico.
- Durante recarga da página, pausa o transporte, cancela acompanhamentos e oculta as listas até a conexão estar pronta. Mensagens antigas e eventos atrasados continuam sem autorizar respostas automáticas.
- Usa o HTML atual do WhatsApp, com o cache de HTML da biblioteca desativado. Preserva a autenticação do `LocalAuth` e os dados do servidor. Não é preciso remover arquivos antigos desse cache.
- Com esse cache desativado, evita registrar o listener do SDK que tentava ler o corpo HTML da resposta durante o fechamento do navegador. Esse listener também apresentou uma rejeição no teste de falha de navegação.

O adaptador está em `server/whatsapp-client.js`; não modifica arquivos instalados em `node_modules`. Ele não remove locks, cookies, autenticação, banco ou histórico. A manutenção específica de `profile_busy` continua separada e exige o serviço parado, conforme [PERFIL_OCUPADO_E_CONEXAO.md](PERFIL_OCUPADO_E_CONEXAO.md).

## Diagnósticos no painel

- **`auth_modules`:** os componentes de autenticação não ficaram disponíveis dentro do prazo. A tentativa termina, preservando a sessão; o Admin pode clicar novamente em Gerar QR Code.
- **`page_reloaded`:** a navegação foi interrompida ou o documento mudou repetidamente durante a preparação. O processo continua em execução e permite uma nova tentativa.
- Outros erros continuam com suas categorias específicas. Falhas não reconhecidas continuam aparecendo como `initialization`, com detalhes nos logs.

Os avisos de sincronização de listas e de página repetida do histórico são tratados pelo sincronizador: dados disponíveis são preservados e as pendências continuam indicadas. Esta correção não transforma um histórico indisponível no telefone em um histórico completo. A recuperação das listas e o pedido de histórico ao telefone permanecem ativos depois da conexão.

## Verificação

- **32 novos testes do cliente:** método real do SDK, módulos carregados com atraso, Socket nulo, exclusão de frames filhos, preparação concorrente, troca de documento, cancelamento, limite de tentativas e timeout em `OPENING`.
- Um subprocesso com `--unhandled-rejections=strict` comprova que a rejeição de navegação é capturada e que o processo continua em execução.
- Testes com **Chromium real e inicialização completa do SDK** reproduzem o erro original, geram QR com módulos carregados depois e exercitam o callback nativo após recarga da página. As respostas dessas páginas são locais, sem parear um número.
- **Cinco testes novos de diagnóstico** verificam as categorias para os erros fornecidos.
- **Dois cenários novos no painel** usam o SDK e Chromium: geração de QR após a espera e após uma recarga; falha de navegação, servidor saudável e nova tentativa com QR, preservando os dados.
- O diagnóstico `npm run whatsapp:diagnose` gera um QR no WhatsApp Web real em perfil temporário, sem mostrar o código, parear um número ou enviar mensagens.

O resultado da bateria completa está registrado no README. Não foi construído um contêiner Docker neste ambiente. A conexão com a conta real e a sessão do usuário deve ser conferida no host após atualizar.

## Atualização

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md): pare o serviço, substitua somente o código na pasta atual, preserve `.env`, o projeto e o volume, e reconstrua a imagem. Confira a versão `1.15.3`, atualize o painel com Ctrl+F5 e tente conectar. A sessão salva pode reconectar automaticamente; caso precise de novo pareamento, o QR será apresentado.
