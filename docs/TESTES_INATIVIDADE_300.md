# Encerramento por inatividade e 300 conversas — versão 1.9.0

Verificação em 16/10/2026: **1.462 testes automatizados**, **12 testes do painel** e **build de produção** aprovados. São utilizados bancos, estoque, contatos e transporte fictícios. Não houve pareamento nem envio para contatos reais. O build da imagem Docker deve ser executado no host de instalação; não foi executado neste ambiente.

## Comportamento atual

O cliente precisa iniciar o contato com uma mensagem privada válida. O atendimento automático é encerrado após cinco minutos de silêncio, com uma única mensagem:

> Como não recebemos uma resposta em 5 minutos, este atendimento foi encerrado. Quando precisar, é só enviar uma nova mensagem.

A contagem reinicia quando chega uma nova mensagem válida. Para evitar encerrar imediatamente após uma resposta que demorou no transporte, o prazo também respeita cinco minutos desde o último envio concluído do bot. O servidor confere os prazos a cada dez segundos, portanto o aviso pode sair alguns segundos depois do prazo.

O aviso substitui o antigo menu de fechar/adicionar/encerrar. Não depende de ter encontrado preços: saudações, medidas faltantes e preenchimento da retirada também podem encerrar enquanto estiverem no modo automático. O prazo é fixo em cinco minutos; configurações antigas de prazo não restauram o menu. **Não** no menu de ajuda ainda encerra imediatamente em silêncio, como solicitado anteriormente.

Conversas assumidas por uma pessoa, pausadas ou encaminhadas para a equipe não são encerradas por esse relógio. Solicitações de compra continuam alertando a equipe e pausando o bot; a pergunta de forma de envio após três minutos continua limitada ao fluxo autorizado sem responsável. O encerramento não cancela uma compra, não confirma venda e não altera estoque.

Após encerrar, agradecimentos e opções numéricas repetidas não recebem nova resposta nem criam outro aviso. Uma nova solicitação significativa do cliente reabre o atendimento, com contexto de cotação limpo, e pode ter seu próprio encerramento. Nenhum relógio reabre um chat sozinho.

## Proteção contra primeiro contato automático

Cada resposta do agente exige uma mensagem recebida e validada na mesma conversa. As mensagens novas recebem uma marca de verificação no processamento; registros importados e mensagens antigas não são marcados retroativamente. O agente vincula o atendimento à mensagem que o iniciou e confere essa origem antes de enviar.

O encerramento também exige uma resposta do bot enviada com sucesso naquela sessão e a correspondência entre a última mensagem recebida e o agendamento. Alteração de destinatário, cadastro sem contato, histórico local ou importado, grupos, status, canais, mensagens próprias, eventos internos e mensagens anteriores à conexão não autorizam envio. O número 99 e referências de produto continuam seguindo suas regras de cotação/retirada, sem iniciar conversas externas.

A mensagem de encerramento é marcada e a conversa é fechada antes de chamar o transporte. Verificações simultâneas e resultados incertos não repetem o aviso. Falha de envio fica registrada no painel; não há tentativa automática posterior. Desconexão, pausa, desligamento, reinício e prazo atrasado em mais de dois minutos descartam o agendamento, sem enviar avisos antigos ao voltar. Uma nova mensagem do cliente é necessária para agendar novamente.

## 300 conversas com variações de escrita

O arquivo [inactivity-conversations.test.js](../tests/inactivity-conversations.test.js) executa **20 saudações × 15 cotações = 300 conversas completas** pelo adaptador real do aplicativo com um cliente de WhatsApp simulado.

As saudações incluem `oi vim pelo site`, `Olá, vim pelo site!`, `Bom dia, vim pelo site`, `Boa tarde vim pelo site`, `Boa noite vim pelo site`, `vim pelo site`, `oi`, `olá`, `opa`, `cheguei pelo site`, `OI!!!`, `OLÁ!`, `bom dia`, `boa tarde`, `boa noite`, `e aí`, `hello`, `vim do site`, `cheguei do site` e `Olá, vim através do site`.

| Cotação combinada com cada saudação | Conferência |
| --- | --- |
| cotar corr B 72 | Abreviação e referência com espaços |
| QRO COTACAO B72 | Caixa alta e abreviação |
| kero orcamento A89 | Variação de quero |
| vlr da coreia A 89 | Abreviação de valor e erro de escrita |
| precu 3VX500 | Erro de escrita de preço |
| orcamentu B-72 | Erro de escrita e referência com hífen |
| quanto custa 4 PK 650 | Peça pronta e quatro frisos |
| PK650 com 4 frizos | Frisos com variação de escrita |
| cotar 4PK650 | Referência compacta |
| correia 3vx 500 | Caixa baixa e referência com espaços |
| me passa os valores da B72 | Pedido de valores em linguagem comum |
| quero cotar B72 e A89 | Dois itens |
| cotar corr B72; A89; 3VX500 | Três itens |
| A-89 | Apenas a referência com hífen |
| preciso de uma correia B 72 | Pedido em linguagem comum |

Cada uma das 300 conversas confere:

1. Cadastro e mensagens locais/importadas de outro contato não autorizam primeiro envio, inclusive ao tentar agendar ou chamar o envio automático diretamente.
2. Antes de conectar e sem mensagem válida, nenhum contato recebe resposta.
3. Eventos internos, histórico, mensagens próprias, grupo, status e canal não geram resposta nem alerta indevido.
4. A primeira mensagem recebida recebe a apresentação do ROBINHO uma vez; duplicá-la não envia outra.
5. A cotação tem preços reais do estoque fictício e não é confundida com intenção de compra.
6. O prazo usa a mensagem mais recente: não encerra aos cinco minutos da saudação quando uma cotação chegou depois.
7. Aos 4min59,999s da última interação não encerra; ao atingir cinco minutos, dez verificações concorrentes produzem um único aviso.
8. A conversa fica encerrada, sem menu, sem contexto de cotação antigo e sem novos agendamentos.
9. Agradecimentos e números repetidos não geram respostas. Trinta dias de relógio e novas verificações não geram insistência.
10. Só uma nova cotação recebida reabre e pode autorizar um novo encerramento. Nenhuma mensagem sai para o contato que não iniciou o atendimento.

Além dessas 300 conversas, há **40 cenários adicionais**: 20 eventos/entradas ignorados sem primeiro contato e os mesmos 20 durante um atendimento ativo, comprovando que não reiniciam o prazo. São **340 testes** nesse arquivo.

## Regressões e painel

[followups.test.js](../tests/followups.test.js) cobre contagem por cliente, reinício do prazo, saudações, medidas faltantes, pesquisa, atendimento humano, pausa, desligamento, desconexão, prazo perdido, resposta manual, encerramento da aplicação, falha incerta, cem verificações concorrentes e dois agendadores, entrada chegando enquanto o aviso aguarda na fila, duplicidade, reinício, configuração antiga e resposta de transporte demorada.

Os testes anteriores de cotação, preços por friso/mm/metro, múltiplos itens, retirada, equipes, cargos, fila, grupos e agradecimentos permanecem na regressão. As expectativas de inatividade foram atualizadas para o encerramento solicitado. Os relatórios das versões anteriores descrevem seu comportamento histórico.

No navegador, um relógio controlado apenas no servidor temporário de teste permite verificar o aviso no histórico, o estado **Conversa encerrada**, ausência do menu, ausência de repetição após agradecer e reabertura por nova cotação. Não existe endpoint de avanço de relógio na aplicação de produção. Os demais testes cobrem o painel e a indicação do prazo fixo em Configurações.

Comandos: `npm run test:inactivity`, `npm test`, `npm run build` e `npm run test:ui`.
