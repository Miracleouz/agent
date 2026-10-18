# Áudio, encerramento, rolagem e contatos · 1.19.0

## Cotação automática por áudio

Com o agente ativo no chat, um áudio novo do cliente é baixado, transcrito localmente e interpretado automaticamente. Não precisa clicar em **Transcrever áudio**. Uma pergunta como “vocês têm correia B30?” consulta o estoque e apresenta até cinco opções disponíveis de marcas e preços. “Bê trinta”, quando identificado em uma solicitação de correia, também é convertido em B30 para a busca; a transcrição original fica preservada.

Se não houver estoque correspondente, o agente pede confirmação em vez de inventar preços. Mantém os fluxos autorizados de saudação, pedido, retirada e atendente. Não responde assuntos fora do atendimento. Atendimento manual, agente desligado, grupos, eventos antigos/lidos e mensagens próprias continuam protegidos. Eventos duplicados não geram outra resposta.

No Compose padrão, `BOT_AUDIO_ENABLED=true` já habilita o fluxo automático. `AUTO_TRANSCRIBE=false` refere-se à transcrição opcional em atendimento manual; não desliga a interpretação do bot. Mantenha o modelo de voz preparado:

```powershell
docker compose exec cota npm run audio:prepare
docker compose exec cota npm run audio:diagnose
```

A transcrição depende da disponibilidade do arquivo no WhatsApp e da precisão do modelo; medidas e referências imprecisas podem exigir confirmação.

## Encerramento com o agente pronto

O botão **Encerrar atendimento** fecha o atendimento manual e deixa o chat em modo automático para a próxima mensagem recebida. Mantém o histórico e o responsável. Admin pode encerrar um chat ocupado; Comercial precisa ser o responsável. O servidor verifica a versão do atendimento para não encerrar uma transferência mais recente.

Encerramento pelo cliente, a resposta “Não” ao menu de ajuda e o encerramento após cinco minutos também deixam o bot pronto. O chat permanece marcado como encerrado até uma nova solicitação válida: isso impede novos lembretes, reabertura por sincronização e mensagens espontâneas. A reativação não ignora o desligamento global do agente nem uma pausa manual feita depois. Áudios que estavam sendo processados antes do encerramento não autorizam uma resposta atrasada.

## Leitura do histórico sem saltar para baixo

Antes, toda atualização do array de mensagens chamava `scrollIntoView`, inclusive confirmações de leitura e atualizações periódicas. O teste reproduziu um salto de aproximadamente 1.800 pixels enquanto o usuário lia acima.

Agora a conversa acompanha o fim quando você está próximo das mensagens mais recentes. Ao subir, mantém a mensagem e a posição visíveis durante atualizações, chegada de novas mensagens, carregamento de histórico anterior e carregamento de fotos. Voltar ao fim retoma o acompanhamento automático. O comportamento também vale para grupos e telas de celular.

## Exportar contatos para Excel

Em **Contatos → Exportar contatos**, o arquivo `.xlsx` contém duas colunas: **Nome** e **Celular**. Exporta toda a agenda compartilhada, mesmo com busca ou paginação ativa. Os números são texto, com o prefixo internacional preservado, para não virar notação científica no Excel. Nomes são gravados como texto, sem executar fórmulas.

Admin e Comercial podem exportar a agenda que já acessam no painel. Requer login e WhatsApp conectado. Exportar não abre chats nem envia mensagens. Não inclui histórico, mensagens, senhas, empresas ou arquivos de sessão.

## Atualização e validação

Siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md), mantendo a pasta/projeto Compose, `.env` e volume existentes. A versão esperada é **1.19.0**. Recarregue o painel com Ctrl+F5 depois da atualização.

Os testes usam dados fictícios e sessões controladas, sem enviar mensagens a clientes reais. Os testes novos cobrem o recebimento automático do áudio sem clique no painel, duplicação, pausas, grupos, encerramentos por texto e áudio, permissões, preservação de histórico, rolagem e exportação de uma agenda maior que a página visível. O arquivo Excel é reaberto pelos testes para conferir nomes, números e quantidade de linhas.


A versão também inclui a aba exclusiva de [pedidos por dia, semana e mês](PEDIDOS_1_19_0.md), com cliente, WhatsApp, conclusão e cancelamento com devolução automática do estoque.
