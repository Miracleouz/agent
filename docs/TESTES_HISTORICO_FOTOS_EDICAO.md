# Histórico, fotos e edições — versão 1.11.0

Verificação em 16/10/2026: **2.138 testes automatizados**, **16 testes de navegador** e **build de produção** aprovados. Esta atualização acrescenta **326 testes de servidor** e **dois de navegador**. Os testes usam bancos temporários, contas fictícias e WhatsApp simulado. Não houve pareamento nem envio a um contato real. A imagem Docker deve ser construída no host de instalação.

## Persistência e acesso

Mensagens e fotos ficam no SQLite do servidor, no mesmo diretório/volume persistente usado por usuários, estoque e sessão. Os arquivos de foto são guardados como BLOB; o JSON do histórico contém apenas metadados. As imagens são consultadas em uma rota autenticada, com as mesmas permissões da conversa e sem cache compartilhado. Não há pasta pública de uploads.

Fechar/reabrir o navegador, fazer novo login, liberar ou transferir o atendimento preserva o histórico, os identificadores e os autores originais. O novo responsável e os Admins podem consultá-lo; o Comercial anterior perde acesso após uma transferência. Reiniciar o servidor com o mesmo banco mantém fotos e registros de edição. A atualização acrescenta campos e uma tabela de auditoria, sem apagar dados antigos. Não importa mensagens antigas do WhatsApp.

## Fotos e edição

- **Enviar foto** exige atendimento manual e permissão de controle, aceita JPEG/PNG/WebP de até 8 MB e permite legenda. O servidor verifica o conteúdo do arquivo e assina a legenda conforme a configuração. Abrir o seletor ou escolher o arquivo não envia a foto.
- Cada solicitação de foto tem uma chave persistente: seis cliques concorrentes com a mesma chave produzem um único envio. Uma solicitação que falhou ou ficou sem confirmação não é reenviada automaticamente. Reinício também não repete operações pendentes.
- Fotos novas recebidas em conversas privadas são baixadas e armazenadas quando o WhatsApp as disponibiliza. Duplicatas não repetem o download. Mensagens próprias, antigas, eventos internos, status e grupos não baixam fotos nem autorizam respostas.
- **Editar** altera texto ou legenda da mensagem enviada pelo painel, mantendo a imagem, o autor original, a assinatura e o horário original. O prazo é estritamente inferior a 15 minutos desde o envio original. A decisão final depende do WhatsApp. Não há novo envio nem renovação do prazo ao editar.
- Comercial edita somente suas próprias mensagens no atendimento sob sua responsabilidade. Admin pode editar mensagens de outro atendente após assumir o chat. Bot, mensagens recebidas e mensagens sem confirmação de envio não são editáveis por esse recurso.
- **Ver edições** apresenta texto anterior, novo texto, editor, horário e resultado de cada tentativa. Recusas mantêm o texto anterior. Operações interrompidas ou sem confirmação são sinalizadas para conferência no WhatsApp; não há repetição automática.

## Matriz de 300 cenários

[message-tools.test.js](../tests/message-tools.test.js) combina **5 perfis × 10 legendas/textos × 6 fluxos = 300 cenários**. Dois Admins e três Comerciais usam contas independentes. Os textos incluem legenda vazia, acentos, quebras de linha, aspas, preços e referências B72, PJ350, PK650 e AT10.

| Fluxo | Verificações |
| --- | --- |
| Foto e histórico | Arquivo, assinatura, autor, recuperação dos mesmos bytes, ausência de BLOB no JSON e silêncio sem mensagem recebida |
| Editar legenda | Mesmo arquivo e mensagem, texto anterior auditado, editor identificado e nenhum novo envio |
| Editar texto | Assinatura original preservada mesmo após mudar a configuração, versão antiga rejeitada e histórico com o mesmo identificador |
| Transferência | Fotos e textos preservados, acesso anterior revogado, Comercial não edita texto de outro e Admin assume antes de editar |
| Cliques repetidos e tela antiga | Seis solicitações concorrentes enviam uma foto; liberação/reabertura invalida solicitações da responsabilidade anterior |
| Prazo ou recusa | Limite de 15 minutos, recusa e falha incerta; cem avanços de relógio não repetem edição ou envio |

Todos os casos conferem o destinatário esperado e a ausência de mensagem recebida artificial. Uma foto ou texto enviado manualmente não autoriza o agente a iniciar contato automático.

## Outros 26 testes de servidor

- Recriação completa do servidor com banco em disco, novo login e histórico transferido: mesmos identificadores, fotos, autores, textos e versões.
- Edição interrompida torna-se incerta ao reabrir o banco, sem repetição de transporte.
- Foto recebida pelo adaptador QR mantém o chat manual e o vínculo PN/LID, sem segunda resposta do agente.
- Seis categorias de imagens ignoradas não são baixadas nem respondidas.
- Cinco arquivos inválidos ou grandes demais são recusados antes de salvar/enviar.
- Acesso anônimo e consulta de imagem/auditoria de outra conversa são bloqueados.
- Foto com falha ou sem identificador de confirmação não é reenviada por repetição de clique ou relógio.
- Reutilizar a mesma chave com outra legenda é rejeitado.
- Quatro erros de identidade da mensagem no provedor impedem editar outro destinatário ou mensagem não enviada pela loja.
- Edição em 14min59,999s é aceita; em 15min é recusada, mesmo após edição anterior.
- Legenda pode ser removida; texto não pode ficar vazio; texto inalterado não chama o provedor.
- Mensagens recebidas/do bot e atendimentos livres/automáticos não são editáveis como texto manual.
- Limpar conversas do simulador remove também seus registros de edição, sem afetar conversas reais.

## Navegador e regressões

Dois novos testes de navegador verificam upload com prévia de PNG realmente decodificado, edição da legenda, consulta do texto anterior, recarregamento, nova sessão de navegador, transferência entre usuários, preservação das fotos e nomes, edição de resposta do novo responsável e layout móvel. Os 14 testes anteriores continuam aprovados.

A regressão mantém os testes anteriores de variações de escrita, cotações, compra, envio, retirada, grupos, autenticação, equipe, contatos e encerramento após cinco minutos. Os testes usam relógio e transporte simulados; não garantem compatibilidade futura de todas as versões do WhatsApp Web nem interpretação de toda frase possível.

Comandos: `npm run test:messages`, `npm test`, `npm run build` e `npm run test:ui`.

Para atualizar, siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md). Preserve o mesmo projeto Compose, `.env` e volume `cota-data`. Fotos e histórico dependem desse volume; a distribuição ZIP contém somente código e exemplos fictícios.
