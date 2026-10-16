# Listas vazias com WhatsApp conectado — 1.14.2

O painel relatado mostrava **0 conversas, 0 grupos e 30 contatos**, com sincronização incompleta. O log antigo repetia apenas `[WhatsApp sync] r`. Esse detalhe isolado não identifica a causa exata na conta conectada.

Foi reproduzida uma falha compatível com esse sintoma usando os métodos da biblioteca instalada (`whatsapp-web.js`), suas funções injetadas e coleções de teste, inclusive no Chromium: a atualização de metadados de um grupo lança `r` e faz `getChats()` rejeitar toda a lista, pois a biblioteca reúne os chats com `Promise.all`.

## Correções

- Quando a consulta normal falha, fica vazia ou expira, consulta as listas já disponíveis no navegador conectado. Essa leitura evita a serialização completa dos chats e a atualização de metadados de grupos. Um item quebrado não descarta os demais.
- Recupera os chats privados e grupos disponíveis e continua buscando o histórico privado dos últimos 30 dias. Grupos permanecem sem respostas ou importação de histórico.
- A recuperação da agenda evita getters opcionais incompatíveis; mantém a exigência de contato salvo e não transforma identificadores LID em telefones inventados.
- A aba Contatos não cancela uma consulta em andamento por causa de uma atualização de progresso. Antes, eventos chegando mais rápido que a resposta poderiam manter a lista invisível. Trocar a busca ou a página ainda invalida respostas da consulta anterior.
- O painel diferencia falhas de listas, identificação e histórico. Se a lista continuar indisponível, exibe `chats/list_unavailable`; se o WhatsApp ainda não carregou nenhuma conversa, informa isso em vez de declarar a importação concluída.
- Os logs incluem a etapa (`stage=chats`, `contacts`, `identities` ou `history`) e o stack fornecido pelo navegador, com a ocultação existente de campos de autenticação e URLs completas.

Histórico, responsáveis, estoque, contatos locais e sessão são preservados. Sincronizar não envia mensagens, não cria prova de mensagem recebida e não marca histórico importado como novo. Contatos importados ficam em **Contatos**, chats livres antigos em **Histórico** e grupos em **Grupos**. **Não lidas** contém somente mensagens realmente novas.

## Atualizar no Docker

Use a mesma pasta e o mesmo projeto Compose da instalação atual. Pare o serviço, copie o conteúdo do ZIP atualizado para essa pasta, preservando `.env`, volume e ajustes próprios do Compose. Depois execute:

```powershell
docker compose up -d --build --force-recreate cota
docker compose exec cota node -p "require('./package.json').version"
```

O segundo comando deve retornar **1.14.2**. Abra o painel e pressione **Ctrl+F5**. Com o WhatsApp conectado, use **Sincronizar WhatsApp** e confira **Histórico**, **Grupos** e **Contatos**. Não apague a sessão nem use `down -v` para atualizar.

Se continuar incompleto, o código da etapa no painel e as linhas novas de log permitem distinguir falha da lista e falha de histórico:

```powershell
docker compose logs --tail=150 cota
```

## Validação

Passaram **3.146 testes de servidor**, **27 testes de navegador** e o build de produção. Esta correção acrescenta dez testes de servidor e três de navegador. Os testes novos executam métodos da biblioteca instalada e suas funções injetadas em coleções fictícias; três cenários também rodam no Chromium.

Cobrem a reprodução de `r` por um grupo, recuperação de chats/grupos/30 contatos, histórico sem respostas, isolamento de um item inválido, getters de contatos incompatíveis, listas vazias, timeout com resultado atrasado, desconexão, preservação de dados, diagnóstico por etapa e Contatos sob eventos contínuos com resposta lenta.

Os testes não usam a conta real do usuário, não pareiam WhatsApp e não enviam mensagens a clientes. A falha reproduzida foi corrigida; o funcionamento da conta conectada deve ser confirmado após a atualização. A imagem Docker é construída no host de instalação.
