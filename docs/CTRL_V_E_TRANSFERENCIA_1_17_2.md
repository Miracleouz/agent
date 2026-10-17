# Prints por Ctrl+V e transferência — Cota 1.17.2

## Colar um print

1. Faça a captura da tela, por exemplo com **Win+Shift+S**, ou copie uma imagem.
2. Abra uma conversa individual em atendimento manual e clique na caixa da mensagem.
3. Pressione **Ctrl+V**. O painel abre a prévia da foto.
4. Se quiser, escreva uma legenda e clique em **Enviar foto**. Colar não envia automaticamente. **Cancelar** fecha a prévia e mantém o texto que já estava no campo da conversa.

Também é possível colar a imagem no diálogo **Enviar foto**, inclusive no campo da legenda. São aceitos PNG, JPEG e WebP de até 8 MB. Colar texto continua funcionando normalmente.

Se uma mensagem estiver selecionada para **Responder**, o print será enviado como resposta citada. A foto, a legenda e a assinatura do usuário ficam no histórico como os demais envios de foto.

Uma transferência ou mudança do atendimento invalida a prévia pendente. O arquivo não é enviado para outro chat. Em grupos, com o bot ativo ou em atendimento ocupado por outro usuário, colar o print não prepara nem envia a foto.

A implementação usa o evento de colagem iniciado pelo usuário; não lê a área de transferência automaticamente nem exige permissão de leitura em segundo plano.

## Admin transfere sem liberação prévia

O Admin pode abrir **Conversas → Todos os atendimentos**, selecionar o chat ocupado e clicar em **Transferir**. Escolha o novo responsável e confirme. **Não é necessário que o usuário anterior libere a conversa**.

O novo responsável assume o atendimento manual; o anterior perde a permissão de responder naquele chat. Rascunhos e versões antigas são invalidados, o histórico é preservado e o bot fica pausado até reativação ou liberação da conversa. A transferência não envia mensagem ao cliente. Esse fluxo já existia e foi novamente verificado nesta versão; o painel agora o explica no botão e no diálogo de transferência.

## Atualizar

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), na pasta e no projeto Compose da instalação atual, preservando o volume. Depois de atualizar, confira a versão **1.17.2** e pressione **Ctrl+F5** no navegador para carregar o painel novo.

## Validação desta entrega

Em 17/10/2026, passaram:

- Build Vite do painel.
- **63 testes de navegador**, incluindo Ctrl+V real com imagem, prévia, cancelamento, texto normal, envio único, legenda/assinatura, citação, persistência, limite de tamanho, formatos, transferência durante a prévia e bloqueio em grupos/atendimento automático.
- **350 testes** dos fluxos de foto, mensagens e compra usados pela integração.
- **212 testes de distribuição de atendimento**, incluindo transferência pelo Admin sem liberação prévia, acesso e rascunhos antigos.
- Inicialização da imagem Docker **1.17.2**, saúde HTTP, carregamento do painel e presença do código de Ctrl+V/transferência no bundle servido.

Nenhum desses testes conectou um número real ou enviou mensagens a contatos. Os cenários de navegador usam API/banco reais com transporte WhatsApp controlado. O Ctrl+V foi exercitado no Chromium com uma imagem na área de transferência.

A imagem validada tem identificador `sha256:6e5d008bb7d12b5a92944976f970652ee8b8a7be82fa60995e058568036de394`; servidor e dependências foram mantidos, com o painel e a versão atualizados sobre a base já validada. As limitações e os testes das funcionalidades anteriores continuam nos respectivos guias.
