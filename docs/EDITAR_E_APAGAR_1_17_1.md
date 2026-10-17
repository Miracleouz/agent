# Editar e apagar para todos — Cota 1.17.1

## Permissões

| Cargo | Editar | Apagar para todos |
| --- | --- | --- |
| Admin | Mensagens enviadas pelo número da loja, incluindo bot, outros atendentes e mensagens importadas do celular/Web | Mensagens enviadas pelo número da loja |
| Comercial | Próprias mensagens enviadas pelo painel, no atendimento sob sua responsabilidade | Próprias mensagens enviadas pelo painel, no atendimento sob sua responsabilidade |

O Admin pode usar os controles em um chat de outro atendente sem transferir o responsável ou pausar o bot. Um Comercial precisa estar no atendimento manual do próprio chat; não pode alterar mensagens de outro usuário nem do bot. A assinatura e o autor original continuam preservados na edição. O registro identifica quem realizou a alteração.

O cargo Admin do Cota não muda as permissões do número no WhatsApp. No privado, o WhatsApp não permite editar ou apagar para todos mensagens recebidas do cliente. A edição tem limite de 15 minutos do envio original e depende do tipo de mensagem. A exclusão depende da permissão e do prazo que o WhatsApp disponibilizar no momento. Grupos continuam em modo de consulta.

## Como usar

- Clique em **Editar** abaixo da mensagem, altere o texto ou a legenda e salve. **Ver edições** mostra as versões anteriores enquanto a mensagem estiver disponível.
- Clique em **Apagar para todos** e depois em **Confirmar exclusão para todos**. O painel consulta a permissão do WhatsApp e solicita a revogação da mensagem.
- Quando o WhatsApp confirmar a mensagem como revogada, o chat mostra **Mensagem apagada**, com o autor da ação. A mídia e a transcrição deixam de ser exibidas; links antigos deixam de disponibilizar os arquivos. Referências locais à mensagem citada também mostram que ela foi apagada.
- Se o WhatsApp recusar, o conteúdo continua no chat e o painel mostra o motivo. Se não for possível confirmar, aparece **Exclusão não confirmada**. Confira no WhatsApp antes de tentar novamente. A mesma solicitação não é reenviada por clique repetido, timer ou reinício.

A operação nunca troca silenciosamente “apagar para todos” por “apagar só para mim”. Edições e exclusões feitas pelo celular ou WhatsApp Web também são refletidas no painel quando o WhatsApp emitir o evento correspondente. Nenhuma dessas ações cria uma mensagem nova ou aciona o bot.

A exclusão de uma mensagem não cancela uma compra, não devolve estoque e não apaga o histórico inteiro. O banco mantém um registro interno da solicitação e de quem a fez. Após a revogação, o texto anterior deixa de aparecer na conversa e no registro de edições acessível pela API.

## Atualização

Use o [guia de atualização Docker](../ATUALIZAR_DOCKER.md). Preserve o volume, a pasta da instalação e o projeto Compose existentes. Depois da atualização, confira `1.17.1` com:

```powershell
docker compose exec cota node -p "require('./package.json').version"
```

Os testes usam dados controlados, SDK/Chromium e clientes simulados; não houve pareamento de um número real nem exclusão de mensagem de cliente. Os limites de transcrição local da versão 1.17.0 continuam descritos no [guia de áudio e mídia](ATENDIMENTO_E_ESTOQUE_1_17.md).

## Testes desta entrega

Validação em 17/10/2026:

| Verificação | Resultado |
| --- | --- |
| `npm run build` | Build Vite concluído |
| `npm test` | 4.062 passaram, sem falhas, ignorados ou cancelados |
| `npm run test:ui` | 55 cenários passaram |
| `npx playwright test tests/browser/admin-messages.spec.js` | 2 passaram, incluindo o cenário adicional de Comercial; 56 cenários distintos de navegador no total |
| `node tests/docker-realtime.mjs cota-qr-repro:1.17.1` | 639 passaram na imagem de produção |
| `node tests/docker-profile-recovery.mjs cota-qr-repro:1.17.1 --automatic-recovery` | 24 verificações de QR/perfil passaram |

A imagem validada, com servidor, painel e versão atualizados sobre a base de dependências da 1.17.0, tem identificador `sha256:b85860be37c5aadb8130877ba64a58e879026003795c062cf821aedd290f9999`.

Os novos testes verificam permissões por autor/cargo, preservação do responsável e assinatura, limite de edição, recusa do WhatsApp, exclusão incerta sem reenvio, cliques duplicados, bloqueio da exclusão apenas local, remoção das mídias e transcrições da consulta, sincronização de eventos do celular e proteção contra restauração por download ou transcrição atrasados.
