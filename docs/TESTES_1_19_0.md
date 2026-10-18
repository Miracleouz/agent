# Validação da versão 1.19.0

## Servidor e regras de atendimento

`npm test`: **4.211 passaram**, sem falhas, cancelamentos ou testes ignorados.

Inclui variações de cotações, unidades, não lidas, histórico, grupos, duplicação, pausas, distribuição da equipe, envio de mídia, confirmação de compras e os fluxos desta entrega:

- Áudio recebido é transcrito e cotado automaticamente, sem clicar no painel; “bê trinta” é interpretado como B30 quando o contexto é de correia. Transcrição original preservada.
- Encerramento pelo cliente, atendente, menu de ajuda ou inatividade aguarda nova mensagem; não dispara outra abordagem. Novas solicitações por texto e áudio reabrem o atendimento. Desligamento global e pausa posterior continuam valendo.
- Exportação XLSX de toda a agenda, inclusive além da página e da busca visível, números como texto, nomes sem fórmulas, autenticação e conexão exigidas.
- Pedidos por dia, semana e mês em Brasília, limites de data, semana iniciando na segunda, paginação, nomes/WhatsApp, visibilidade por cargo e preservação dos dados do fechamento.
- Conclusão não debita novamente. Cancelamento devolve peças e cortes uma única vez. Solicitações repetidas, versão desatualizada, unidade alterada, reimportação por SKU e falha de gravação verificam a consistência do estoque e do registro.

## Painel em Chromium

`npm run test:ui`: **87 passaram**. Os testes de pedidos foram repetidos depois do ajuste visual no celular e passaram novamente.

O teste de leitura reproduziu o defeito no código anterior: uma atualização deslocava a posição de leitura em cerca de 1.800 pixels. Com a correção, verifica a posição preservada durante atualizações, mensagens novas, histórico inserido antes e carregamento tardio de uma imagem. Abrange conversas individuais, grupos, desktop e celular, e retoma o acompanhamento ao voltar para o fim.

Os testes do Excel clicam no botão, aguardam o download e reabrem o arquivo para conferir as 125 linhas da agenda, mesmo com uma busca exibindo um único contato. Os testes de pedidos alteram situação pelo painel, conferem o saldo do produto e validam o número de WhatsApp inteiro no celular.

## Imagem Docker e voz

A imagem final `cota:1.19.0` foi construída e passou por **716 testes** com o código da imagem, dependências de produção, usuário `node`, processo de inicialização e Chromium real. Os testes executam sem rede e usam modelos controlados do WhatsApp: não há pareamento nem mensagens reais. Incluem a exportação do Excel, fechamento, relatório, cancelamento com devolução e retomada após nova cotação.

Uma verificação separada processou um arquivo Ogg/Opus real com o modelo local Whisper base, dentro da imagem, sem rede e com o modelo somente para leitura. Reconheceu B72; quando o restante da fala ficou incerto, o agente pediu confirmação. A transcrição manual não disparou resposta. Isso valida o processamento de voz, sem equivaler a um envio real pelo WhatsApp.

Para a construção neste ambiente de nuvem, foi usado um Dockerfile temporário com a autoridade certificadora do proxy como segredo de construção e cópias agrupadas para reduzir uso de disco. O Dockerfile entregue permanece inalterado; código, dependências e compilação do aplicativo são os da versão final.

## Limites da validação

São usados dados fictícios e modelos controlados do WhatsApp. O SDK instalado e Chromium são exercitados nos testes existentes de conexão, mensagens e mídia. Não foi vinculada uma conta WhatsApp real, nem enviada mensagem a clientes.

A transcrição depende do modelo local preparado e da qualidade do áudio. A precisão em todas as referências, sotaques ou ruídos não é garantida. O histórico de 30 dias depende dos dados disponibilizados pelo WhatsApp. Se a unidade ou os dados dos cortes tiverem sido substituídos, o cancelamento bloqueia a operação e preserva os registros para conferência, em vez de inventar uma devolução.

Não foram alteradas senhas ou contas da instalação do usuário. O ZIP não contém banco, estoque privado, sessão de WhatsApp ou `.env`.
