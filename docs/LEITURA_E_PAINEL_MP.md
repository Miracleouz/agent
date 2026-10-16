# Leitura sincronizada, atendimento compartilhado e painel MP — 1.14.0

Ao abrir uma conversa, o painel antes limpava somente seu contador local. A marcação podia continuar no celular e os checks não distinguiam envio, entrega e leitura. Agora esses estados acompanham os eventos disponibilizados pela conexão WhatsApp Web.

## Leitura da loja e leitura do cliente

| Ação | Resultado |
| --- | --- |
| Abrir uma conversa no painel visível | Solicita leitura no WhatsApp e mostra a confirmação ou a pendência |
| Receber outra mensagem no chat aberto e visível | Confirma a leitura das novas mensagens exibidas |
| Deixar o painel oculto em outra aba | Aguarda voltar à aba para marcar novas mensagens como lidas |
| Enviar texto, foto ou resposta do ROBINHO | Confirma a leitura após o envio, sem criar outra mensagem |
| Ler a conversa no celular | Atualiza o contador do painel, sem alterar o responsável |
| Consultar histórico pelo nome em Contatos | Confirma a leitura sem assumir ou enviar mensagens |
| Abrir um grupo | Confirma a leitura, mantendo a consulta sem respostas do bot ou da equipe |
| Importar histórico e consultar listas | Não envia mensagens nem fabrica novos não lidos |

**Leitura sincronizada com o WhatsApp** informa que a loja leu a conversa. Os checks ao lado de uma resposta são outra informação: um check indica envio ao WhatsApp; dois indicam entrega; dois azuis aparecem somente após a confirmação de leitura do cliente (`message_ack`). A privacidade e a disponibilidade de confirmações no WhatsApp continuam valendo.

Se a leitura falhar, o painel oferece **Sincronizar leitura**. Tentar novamente confirma apenas a leitura. Uma mensagem cujo envio já foi confirmado continua enviada; não é repetida por falha de leitura. Operações simultâneas da mesma conversa são agrupadas, com prazo máximo. Desconexão e reinício interrompem confirmações pendentes sem reexecutar respostas. Mensagens recebidas depois do início de uma confirmação mantêm seu contador até uma nova leitura.

Na reconexão, um contador zero vindo do WhatsApp concilia as mensagens locais anteriores à consulta. Contadores positivos antigos do WhatsApp não são tratados como novas mensagens do Cota. Pedidos de atendente, interesse de compra e pedido fechado mantêm seus alertas mesmo depois da leitura; não dependem do contador de não lidas.

## Operação da equipe

O atendimento compartilha um único número conectado por QR e um banco central. Cada pessoa usa seu login. Abrir um chat livre assume a responsabilidade e pausa o bot nesse chat; a liberação permite que outra pessoa assuma. Uma transferência mantém o histórico, as fotos e os autores. Admin acompanha todos os chats; Comercial acessa seus chats e as conversas livres. O nome da conta assina as respostas quando essa opção está ativa.

As abas são **Conversas · nome**, **Não lidas**, **Histórico**, **Grupos** e, para Admin, **Todos os atendimentos**. Uma conversa atendida e lida pode estar em Histórico; não precisa continuar como não lida para estar acessível à equipe. Os controles de transferência e envio continuam verificando a responsabilidade no servidor, inclusive se dois usuários agirem ao mesmo tempo.

O painel usa navegação lateral em telas grandes e mantém o campo de resposta acessível acima da navegação no celular. O nome da loja configurado é preservado. A identificação **MP Correias** e o monograma MP em texto são provisórios: o arquivo do logo oficial ainda não foi anexado nesta etapa.

## Vocabulário e cotações

Descrições abreviadas do estoque como **SINCR**, **SINC** e **SINCRON** correspondem a pedidos de **sincronizadora**, **sincronizada**, **dentada** e **síncrona**, incluindo plurais e acentos. A equivalência é de descrição; números e passo continuam exatos. Marcas são reconhecidas como palavras completas: o nome SINCRO dentro de “sincronizadora” não restringe a cotação a essa marca. Mudar a largura no contexto também preserva a descrição e a referência. `1304 8M` não autoriza oferecer `1200 8M` ou `1304 D8M`.

As fórmulas anteriores permanecem: peça pronta tem preço fechado; frisos/canais multiplicam a quantidade solicitada; sincronizadoras por mm usam a largura do corte; abertas normalizam o preço da faixa inteira e calculam comprimento × largura. Se faltar medida, o agente pergunta. Se não houver cinco opções disponíveis, informa as opções reais; não inventa marcas, preços ou saldo para completar a lista.

## Verificação

Em 16/10/2026, passaram **3.136 testes de servidor**, **24 testes de navegador** e o build de produção. Foram acrescentados:

- **300 combinações** de cinco perfis, dez mensagens com variações e seis fluxos: abrir/ler; responder com ROBINHO; responder com texto/foto assinada; ler pelo celular/alias; falhar e tentar a leitura novamente; receber mensagem durante a confirmação.
- **Seis casos** de permissões, grupos, timeout/desconexão, eventos antigos/forjados, nova mensagem durante a consulta das listas e bloqueio de endereços arbitrários.
- **29 casos** de vocabulário industrial, preços de corte e preservação exata de referência/passo.
- **Quatro cenários de navegador** com leitura em aba visível/oculta, nova tentativa, checks, respostas assinadas, consulta de contatos, grupos e tela móvel.

Os testes usam bancos isolados e transporte simulado. Também foi conferida a interpretação de exemplos no Excel anexado, em memória, sem alterar o estoque da instalação. O Excel e seus valores não foram incluídos no pacote público. A conta real não foi pareada nestes testes; a confirmação no celular deve ser conferida na instalação do usuário, pois depende da conexão e da compatibilidade do WhatsApp Web. A imagem Docker deve ser construída no host de destino.

```bash
npm run test:read
npm test
npm run build
npm run test:ui
```

Para atualizar preservando dados e sessão, siga [ATUALIZAR_DOCKER.md](../ATUALIZAR_DOCKER.md).
