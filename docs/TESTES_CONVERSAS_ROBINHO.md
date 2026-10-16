# ROBINHO, PK e pedidos com vários itens — versão 1.3.0

Verificação em 16/10/2026: **455 testes automatizados aprovados**, **6 testes de navegador aprovados** e build de produção aprovado. Inclui **100 conversas completas pelo adaptador de WhatsApp simulado**, **20 cenários em que o cliente não iniciou contato** e os testes de regressão anteriores. Os números, o estoque das conversas e o transporte são fictícios. Nenhuma mensagem foi enviada a um contato real.

## Comportamento verificado

- A primeira resposta de uma janela de 24 horas contém exatamente a apresentação: **Olá, sou o agente ROBINHO, vou te ajudar no atendimento nesse momento**.
- Para saudações como **oi vim pelo site**, a primeira resposta é só essa apresentação. Para uma mensagem que já pede cotação, a apresentação e a cotação vão na mesma resposta, evitando um envio separado.
- A apresentação não se repete dentro das 24 horas, persiste ao reabrir o banco e só é enviada após uma nova mensagem recebida válida. O fim das 24 horas não dispara nenhuma mensagem por si só. Atendimento manual e agente desligado impedem a resposta automática.
- **4 PK 650**, **4PK650**, **4 PK650**, **4-PK-650**, **PK 650 com 4 frisos** e **PK650 4 canais** mantêm quatro frisos e uma correia. Quando disponíveis, a lista inclui peça pronta 4PK650 e corte de PK650 com quatro frisos, com marcas e valores reais do catálogo usado.
- No estoque fictício, R$ 7 por friso × 4 = R$ 28. Uma peça pronta a R$ 34 continua a R$ 34, sem multiplicar novamente por quatro. Esses valores são exemplos de teste, não dados enviados ao catálogo da instalação.
- Peças de três frisos, outros comprimentos e SKUs conflitantes não autorizam oferecer outra referência.
- **cotar corr B 72 / correia A 89 / correia 3VX 500** gera uma resposta com os três itens, até cinco opções de marca/preço por item e numeração contínua. As barras aqui representam a separação de itens; também são aceitas quebras de linha, vírgula, ponto e vírgula e a palavra “e”.
- O **3** de **3VX500** faz parte do perfil, enquanto o **4** de **4PK650** é o número de frisos. Cada item mantém sua quantidade, unidade, cálculo e opções de marca.
- Itens não encontrados são informados junto dos demais; não há substituição automática. Medidas faltantes de um item mantêm a lista completa. Peças prontas com preço continuam aparecendo quando cortes do mesmo modelo ainda precisam de canais ou largura.
- **MAIS** busca opções restantes de cada item. Comprar ou consultar uma opção maior que cinco identifica o item correspondente, sem misturar referências.
- Há limite de dez referências por mensagem. Pedidos maiores recebem solicitação de divisão, sem descarte silencioso de itens.

## Proteção contra início automático de conversa

Cada uma das 100 conversas testa a ausência de envios antes do contato válido, eventos anteriores à conexão pronta, notificações internas, mensagens próprias, grupos, status e histórico antigo. Depois envia uma abertura real de teste, reenvia a mesma mensagem com o mesmo identificador para conferir duplicidade e pede uma cotação. As combinações usam dez aberturas e dez pedidos diferentes.

Em metade dos casos, a resposta do cliente cancela o acompanhamento antes do prazo. Na outra metade, o menu autorizado de cinco minutos é enviado uma vez e o cliente encerra. Após mais sete dias e várias verificações, não surge novo envio. Todos os destinatários de mensagens automáticas são conferidos contra o telefone que efetivamente iniciou aquele atendimento.

Nos 20 cenários sem início, existe um cadastro local sem mensagem recebida. Nem o cadastro, nem uma cotação gravada localmente, nem uma tentativa de forçar um agendamento no banco produzem contato automático. O agendamento e o envio exigem uma entrada recebida antes da cotação. Não há apresentação automática nesses casos.

A bateria anterior continua cobrindo falhas, concorrência, reinício, reconexão, pausa manual, agente desligado e limite de uma tentativa de acompanhamento por conversa em 24 horas. Uma vez que o transporte já começou a enviar uma mensagem, a aplicação não consegue retirá-la; o cancelamento protege envios que ainda não começaram.

## Cenários de conversa executados

| # | Conversa ou cenário | Resultado |
| ---: | --- | --- |
| 1 | conversa 1: oi vim pelo site → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 2 | conversa 2: oi vim pelo site → B72, A89 e 3VX500 | Passou |
| 3 | conversa 3: oi vim pelo site → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 4 | conversa 4: oi vim pelo site → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 5 | conversa 5: oi vim pelo site → QRO COTACAO B72,A89,3VX500 | Passou |
| 6 | conversa 6: oi vim pelo site → correia B72 / correia A89 / correia 3VX500 | Passou |
| 7 | conversa 7: oi vim pelo site → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 8 | conversa 8: oi vim pelo site → B 72 / A89 / 3VX500 | Passou |
| 9 | conversa 9: oi vim pelo site → cotar 4 PK 650, B72 e A89 | Passou |
| 10 | conversa 10: oi vim pelo site → quanto custa 4PK650 | Passou |
| 11 | conversa 11: Olá, vim pelo site! → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 12 | conversa 12: Olá, vim pelo site! → B72, A89 e 3VX500 | Passou |
| 13 | conversa 13: Olá, vim pelo site! → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 14 | conversa 14: Olá, vim pelo site! → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 15 | conversa 15: Olá, vim pelo site! → QRO COTACAO B72,A89,3VX500 | Passou |
| 16 | conversa 16: Olá, vim pelo site! → correia B72 / correia A89 / correia 3VX500 | Passou |
| 17 | conversa 17: Olá, vim pelo site! → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 18 | conversa 18: Olá, vim pelo site! → B 72 / A89 / 3VX500 | Passou |
| 19 | conversa 19: Olá, vim pelo site! → cotar 4 PK 650, B72 e A89 | Passou |
| 20 | conversa 20: Olá, vim pelo site! → quanto custa 4PK650 | Passou |
| 21 | conversa 21: Bom dia, vim pelo site → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 22 | conversa 22: Bom dia, vim pelo site → B72, A89 e 3VX500 | Passou |
| 23 | conversa 23: Bom dia, vim pelo site → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 24 | conversa 24: Bom dia, vim pelo site → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 25 | conversa 25: Bom dia, vim pelo site → QRO COTACAO B72,A89,3VX500 | Passou |
| 26 | conversa 26: Bom dia, vim pelo site → correia B72 / correia A89 / correia 3VX500 | Passou |
| 27 | conversa 27: Bom dia, vim pelo site → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 28 | conversa 28: Bom dia, vim pelo site → B 72 / A89 / 3VX500 | Passou |
| 29 | conversa 29: Bom dia, vim pelo site → cotar 4 PK 650, B72 e A89 | Passou |
| 30 | conversa 30: Bom dia, vim pelo site → quanto custa 4PK650 | Passou |
| 31 | conversa 31: Boa tarde vim pelo site → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 32 | conversa 32: Boa tarde vim pelo site → B72, A89 e 3VX500 | Passou |
| 33 | conversa 33: Boa tarde vim pelo site → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 34 | conversa 34: Boa tarde vim pelo site → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 35 | conversa 35: Boa tarde vim pelo site → QRO COTACAO B72,A89,3VX500 | Passou |
| 36 | conversa 36: Boa tarde vim pelo site → correia B72 / correia A89 / correia 3VX500 | Passou |
| 37 | conversa 37: Boa tarde vim pelo site → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 38 | conversa 38: Boa tarde vim pelo site → B 72 / A89 / 3VX500 | Passou |
| 39 | conversa 39: Boa tarde vim pelo site → cotar 4 PK 650, B72 e A89 | Passou |
| 40 | conversa 40: Boa tarde vim pelo site → quanto custa 4PK650 | Passou |
| 41 | conversa 41: Boa noite vim pelo site → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 42 | conversa 42: Boa noite vim pelo site → B72, A89 e 3VX500 | Passou |
| 43 | conversa 43: Boa noite vim pelo site → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 44 | conversa 44: Boa noite vim pelo site → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 45 | conversa 45: Boa noite vim pelo site → QRO COTACAO B72,A89,3VX500 | Passou |
| 46 | conversa 46: Boa noite vim pelo site → correia B72 / correia A89 / correia 3VX500 | Passou |
| 47 | conversa 47: Boa noite vim pelo site → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 48 | conversa 48: Boa noite vim pelo site → B 72 / A89 / 3VX500 | Passou |
| 49 | conversa 49: Boa noite vim pelo site → cotar 4 PK 650, B72 e A89 | Passou |
| 50 | conversa 50: Boa noite vim pelo site → quanto custa 4PK650 | Passou |
| 51 | conversa 51: vim pelo site → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 52 | conversa 52: vim pelo site → B72, A89 e 3VX500 | Passou |
| 53 | conversa 53: vim pelo site → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 54 | conversa 54: vim pelo site → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 55 | conversa 55: vim pelo site → QRO COTACAO B72,A89,3VX500 | Passou |
| 56 | conversa 56: vim pelo site → correia B72 / correia A89 / correia 3VX500 | Passou |
| 57 | conversa 57: vim pelo site → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 58 | conversa 58: vim pelo site → B 72 / A89 / 3VX500 | Passou |
| 59 | conversa 59: vim pelo site → cotar 4 PK 650, B72 e A89 | Passou |
| 60 | conversa 60: vim pelo site → quanto custa 4PK650 | Passou |
| 61 | conversa 61: oi → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 62 | conversa 62: oi → B72, A89 e 3VX500 | Passou |
| 63 | conversa 63: oi → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 64 | conversa 64: oi → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 65 | conversa 65: oi → QRO COTACAO B72,A89,3VX500 | Passou |
| 66 | conversa 66: oi → correia B72 / correia A89 / correia 3VX500 | Passou |
| 67 | conversa 67: oi → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 68 | conversa 68: oi → B 72 / A89 / 3VX500 | Passou |
| 69 | conversa 69: oi → cotar 4 PK 650, B72 e A89 | Passou |
| 70 | conversa 70: oi → quanto custa 4PK650 | Passou |
| 71 | conversa 71: olá → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 72 | conversa 72: olá → B72, A89 e 3VX500 | Passou |
| 73 | conversa 73: olá → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 74 | conversa 74: olá → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 75 | conversa 75: olá → QRO COTACAO B72,A89,3VX500 | Passou |
| 76 | conversa 76: olá → correia B72 / correia A89 / correia 3VX500 | Passou |
| 77 | conversa 77: olá → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 78 | conversa 78: olá → B 72 / A89 / 3VX500 | Passou |
| 79 | conversa 79: olá → cotar 4 PK 650, B72 e A89 | Passou |
| 80 | conversa 80: olá → quanto custa 4PK650 | Passou |
| 81 | conversa 81: opa → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 82 | conversa 82: opa → B72, A89 e 3VX500 | Passou |
| 83 | conversa 83: opa → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 84 | conversa 84: opa → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 85 | conversa 85: opa → QRO COTACAO B72,A89,3VX500 | Passou |
| 86 | conversa 86: opa → correia B72 / correia A89 / correia 3VX500 | Passou |
| 87 | conversa 87: opa → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 88 | conversa 88: opa → B 72 / A89 / 3VX500 | Passou |
| 89 | conversa 89: opa → cotar 4 PK 650, B72 e A89 | Passou |
| 90 | conversa 90: opa → quanto custa 4PK650 | Passou |
| 91 | conversa 91: cheguei pelo site → cotar corr B 72 / correia a 89 / correia 3VX 500 | Passou |
| 92 | conversa 92: cheguei pelo site → B72, A89 e 3VX500 | Passou |
| 93 | conversa 93: cheguei pelo site → preciso cotar B-72; A-89; 3VX-500 | Passou |
| 94 | conversa 94: cheguei pelo site → quero orçamento de B72 e A89 e 3VX500 | Passou |
| 95 | conversa 95: cheguei pelo site → QRO COTACAO B72,A89,3VX500 | Passou |
| 96 | conversa 96: cheguei pelo site → correia B72 / correia A89 / correia 3VX500 | Passou |
| 97 | conversa 97: cheguei pelo site → me passa preço da B72; valor da A89; 3VX500 | Passou |
| 98 | conversa 98: cheguei pelo site → B 72 / A89 / 3VX500 | Passou |
| 99 | conversa 99: cheguei pelo site → cotar 4 PK 650, B72 e A89 | Passou |
| 100 | conversa 100: cheguei pelo site → quanto custa 4PK650 | Passou |
| 101 | conversa sem início 1: cadastro e registros locais não autorizam primeiro contato | Passou |
| 102 | conversa sem início 2: cadastro e registros locais não autorizam primeiro contato | Passou |
| 103 | conversa sem início 3: cadastro e registros locais não autorizam primeiro contato | Passou |
| 104 | conversa sem início 4: cadastro e registros locais não autorizam primeiro contato | Passou |
| 105 | conversa sem início 5: cadastro e registros locais não autorizam primeiro contato | Passou |
| 106 | conversa sem início 6: cadastro e registros locais não autorizam primeiro contato | Passou |
| 107 | conversa sem início 7: cadastro e registros locais não autorizam primeiro contato | Passou |
| 108 | conversa sem início 8: cadastro e registros locais não autorizam primeiro contato | Passou |
| 109 | conversa sem início 9: cadastro e registros locais não autorizam primeiro contato | Passou |
| 110 | conversa sem início 10: cadastro e registros locais não autorizam primeiro contato | Passou |
| 111 | conversa sem início 11: cadastro e registros locais não autorizam primeiro contato | Passou |
| 112 | conversa sem início 12: cadastro e registros locais não autorizam primeiro contato | Passou |
| 113 | conversa sem início 13: cadastro e registros locais não autorizam primeiro contato | Passou |
| 114 | conversa sem início 14: cadastro e registros locais não autorizam primeiro contato | Passou |
| 115 | conversa sem início 15: cadastro e registros locais não autorizam primeiro contato | Passou |
| 116 | conversa sem início 16: cadastro e registros locais não autorizam primeiro contato | Passou |
| 117 | conversa sem início 17: cadastro e registros locais não autorizam primeiro contato | Passou |
| 118 | conversa sem início 18: cadastro e registros locais não autorizam primeiro contato | Passou |
| 119 | conversa sem início 19: cadastro e registros locais não autorizam primeiro contato | Passou |
| 120 | conversa sem início 20: cadastro e registros locais não autorizam primeiro contato | Passou |

## Reproduzir

```bash
npm test
npm run test:conversations
npm run build
npm run test:ui
```

Fontes: [conversations.test.js](../tests/conversations.test.js), [multi-quotes.test.js](../tests/multi-quotes.test.js), [industrial-stock.js](../tests/fixtures/industrial-stock.js) e [panel.spec.js](../tests/browser/panel.spec.js).

Os testes do navegador verificam a apresentação exata, os três itens cotados juntos, a numeração e a oferta de peças prontas e cortes PK, além dos fluxos existentes de estoque, medidas, atendimento manual e compra. Os resultados cobrem os casos documentados; a interpretação usa regras locais, não uma garantia de compreender qualquer frase possível. Estoque ausente ou sem preço nunca recebe um valor inventado.
