# Fila de atendimento e 200 cenários — versão 1.6.0

Verificação em 16/10/2026: **720 testes automatizados**, **9 testes de navegador** e **build de produção** aprovados. Os testes usam números, contas, senhas, estoque e transporte fictícios. Nenhuma mensagem foi enviada a um contato real.

## Fluxo implementado

| Ação | Resultado |
| --- | --- |
| Cliente escreve sem responsável | Conversa fica em **Não lidas**, a fila compartilhada |
| Usuário abre um chat livre | Assume automaticamente; abre em **Conversas · nome**; bot pausado sem prazo |
| Outro Comercial atualiza o painel | O chat assumido desaparece; histórico direto também é bloqueado na API |
| Admin abre o chat ocupado | Acompanha sem mudar responsável ou limpar o não lido do responsável |
| Cliente escreve durante o atendimento | Continua com o mesmo usuário e visível ao Admin; não volta à fila |
| Responsável ou Admin usa **Liberar conversa** | Retorna à fila; sai da aba pessoal; histórico e alertas preservados; bot continua pausado |
| Outro usuário abre a conversa liberada | Assume com uma nova versão do atendimento |
| Bot é reativado ou pausa termina | Responsável mantido; não devolve o chat à equipe automaticamente |
| Admin transfere | Muda o responsável sem mensagem automática ao cliente |
| Usuário consulta Grupos | Somente leitura; sem agente, respostas, acompanhamentos ou download de anexos |

**Não lidas** é a fila de trabalho sem responsável. Conversas liberadas retornam a ela mesmo que tenham sido lidas. Os Admins também têm a aba **Todos os atendimentos**. Uma conta desativada perde o acesso e seus chats retornam à fila com o agente pausado.

A tomada e a liberação usam a fila do mesmo chat que processa mensagens e acompanhamentos. A tomada é atômica no banco. Cada mudança de responsabilidade incrementa a versão do atendimento; uma resposta ou liberação de uma tela antiga é rejeitada. A sessão é conferida novamente ao executar uma ação enfileirada. Um envio que já começou no transporte não pode ser retirado; as verificações protegem operações que ainda não começaram.

## 200 cenários novos

Matriz de **5 perfis** (2 Admins e 3 Comerciais) × **5 entradas** (saudação, cotação, compra, atendente e comprimento de aberta) × **8 fluxos**. Cada caso roda pela API HTTP, com sessão autenticada e banco isolado, usando o agente para receber a mensagem inicial.

Os oito fluxos verificam tomada/resposta/liberação; disputa simultânea; reabertura e nova mensagem; liberação e novo atendimento; rejeição de tela antiga; transferência por Admin; manutenção do responsável após prazo/reativação; e autorização/identidade. As verificações comparam visibilidade entre os cinco usuários e o número efetivo de mensagens enviadas pelo transporte simulado. Abrir, liberar, observar e transferir não enviam mensagens.

| # | Cenário executado | Resultado |
| ---: | --- | --- |
| 1 | Admin Um · oi vim pelo site · abrir, responder e liberar | Passou |
| 2 | Admin Um · oi vim pelo site · disputa simultânea | Passou |
| 3 | Admin Um · oi vim pelo site · reabertura e nova mensagem | Passou |
| 4 | Admin Um · oi vim pelo site · liberação e novo atendimento | Passou |
| 5 | Admin Um · oi vim pelo site · rascunho de versão antiga | Passou |
| 6 | Admin Um · oi vim pelo site · transferência por Admin | Passou |
| 7 | Admin Um · oi vim pelo site · prazo e reativação preservam responsável | Passou |
| 8 | Admin Um · oi vim pelo site · permissões e identidade | Passou |
| 9 | Admin Um · A42 · abrir, responder e liberar | Passou |
| 10 | Admin Um · A42 · disputa simultânea | Passou |
| 11 | Admin Um · A42 · reabertura e nova mensagem | Passou |
| 12 | Admin Um · A42 · liberação e novo atendimento | Passou |
| 13 | Admin Um · A42 · rascunho de versão antiga | Passou |
| 14 | Admin Um · A42 · transferência por Admin | Passou |
| 15 | Admin Um · A42 · prazo e reativação preservam responsável | Passou |
| 16 | Admin Um · A42 · permissões e identidade | Passou |
| 17 | Admin Um · quero fechar · abrir, responder e liberar | Passou |
| 18 | Admin Um · quero fechar · disputa simultânea | Passou |
| 19 | Admin Um · quero fechar · reabertura e nova mensagem | Passou |
| 20 | Admin Um · quero fechar · liberação e novo atendimento | Passou |
| 21 | Admin Um · quero fechar · rascunho de versão antiga | Passou |
| 22 | Admin Um · quero fechar · transferência por Admin | Passou |
| 23 | Admin Um · quero fechar · prazo e reativação preservam responsável | Passou |
| 24 | Admin Um · quero fechar · permissões e identidade | Passou |
| 25 | Admin Um · ATENDENTE · abrir, responder e liberar | Passou |
| 26 | Admin Um · ATENDENTE · disputa simultânea | Passou |
| 27 | Admin Um · ATENDENTE · reabertura e nova mensagem | Passou |
| 28 | Admin Um · ATENDENTE · liberação e novo atendimento | Passou |
| 29 | Admin Um · ATENDENTE · rascunho de versão antiga | Passou |
| 30 | Admin Um · ATENDENTE · transferência por Admin | Passou |
| 31 | Admin Um · ATENDENTE · prazo e reativação preservam responsável | Passou |
| 32 | Admin Um · ATENDENTE · permissões e identidade | Passou |
| 33 | Admin Um · AT10 33000 · abrir, responder e liberar | Passou |
| 34 | Admin Um · AT10 33000 · disputa simultânea | Passou |
| 35 | Admin Um · AT10 33000 · reabertura e nova mensagem | Passou |
| 36 | Admin Um · AT10 33000 · liberação e novo atendimento | Passou |
| 37 | Admin Um · AT10 33000 · rascunho de versão antiga | Passou |
| 38 | Admin Um · AT10 33000 · transferência por Admin | Passou |
| 39 | Admin Um · AT10 33000 · prazo e reativação preservam responsável | Passou |
| 40 | Admin Um · AT10 33000 · permissões e identidade | Passou |
| 41 | Admin Dois · oi vim pelo site · abrir, responder e liberar | Passou |
| 42 | Admin Dois · oi vim pelo site · disputa simultânea | Passou |
| 43 | Admin Dois · oi vim pelo site · reabertura e nova mensagem | Passou |
| 44 | Admin Dois · oi vim pelo site · liberação e novo atendimento | Passou |
| 45 | Admin Dois · oi vim pelo site · rascunho de versão antiga | Passou |
| 46 | Admin Dois · oi vim pelo site · transferência por Admin | Passou |
| 47 | Admin Dois · oi vim pelo site · prazo e reativação preservam responsável | Passou |
| 48 | Admin Dois · oi vim pelo site · permissões e identidade | Passou |
| 49 | Admin Dois · A42 · abrir, responder e liberar | Passou |
| 50 | Admin Dois · A42 · disputa simultânea | Passou |
| 51 | Admin Dois · A42 · reabertura e nova mensagem | Passou |
| 52 | Admin Dois · A42 · liberação e novo atendimento | Passou |
| 53 | Admin Dois · A42 · rascunho de versão antiga | Passou |
| 54 | Admin Dois · A42 · transferência por Admin | Passou |
| 55 | Admin Dois · A42 · prazo e reativação preservam responsável | Passou |
| 56 | Admin Dois · A42 · permissões e identidade | Passou |
| 57 | Admin Dois · quero fechar · abrir, responder e liberar | Passou |
| 58 | Admin Dois · quero fechar · disputa simultânea | Passou |
| 59 | Admin Dois · quero fechar · reabertura e nova mensagem | Passou |
| 60 | Admin Dois · quero fechar · liberação e novo atendimento | Passou |
| 61 | Admin Dois · quero fechar · rascunho de versão antiga | Passou |
| 62 | Admin Dois · quero fechar · transferência por Admin | Passou |
| 63 | Admin Dois · quero fechar · prazo e reativação preservam responsável | Passou |
| 64 | Admin Dois · quero fechar · permissões e identidade | Passou |
| 65 | Admin Dois · ATENDENTE · abrir, responder e liberar | Passou |
| 66 | Admin Dois · ATENDENTE · disputa simultânea | Passou |
| 67 | Admin Dois · ATENDENTE · reabertura e nova mensagem | Passou |
| 68 | Admin Dois · ATENDENTE · liberação e novo atendimento | Passou |
| 69 | Admin Dois · ATENDENTE · rascunho de versão antiga | Passou |
| 70 | Admin Dois · ATENDENTE · transferência por Admin | Passou |
| 71 | Admin Dois · ATENDENTE · prazo e reativação preservam responsável | Passou |
| 72 | Admin Dois · ATENDENTE · permissões e identidade | Passou |
| 73 | Admin Dois · AT10 33000 · abrir, responder e liberar | Passou |
| 74 | Admin Dois · AT10 33000 · disputa simultânea | Passou |
| 75 | Admin Dois · AT10 33000 · reabertura e nova mensagem | Passou |
| 76 | Admin Dois · AT10 33000 · liberação e novo atendimento | Passou |
| 77 | Admin Dois · AT10 33000 · rascunho de versão antiga | Passou |
| 78 | Admin Dois · AT10 33000 · transferência por Admin | Passou |
| 79 | Admin Dois · AT10 33000 · prazo e reativação preservam responsável | Passou |
| 80 | Admin Dois · AT10 33000 · permissões e identidade | Passou |
| 81 | Comercial A · oi vim pelo site · abrir, responder e liberar | Passou |
| 82 | Comercial A · oi vim pelo site · disputa simultânea | Passou |
| 83 | Comercial A · oi vim pelo site · reabertura e nova mensagem | Passou |
| 84 | Comercial A · oi vim pelo site · liberação e novo atendimento | Passou |
| 85 | Comercial A · oi vim pelo site · rascunho de versão antiga | Passou |
| 86 | Comercial A · oi vim pelo site · transferência por Admin | Passou |
| 87 | Comercial A · oi vim pelo site · prazo e reativação preservam responsável | Passou |
| 88 | Comercial A · oi vim pelo site · permissões e identidade | Passou |
| 89 | Comercial A · A42 · abrir, responder e liberar | Passou |
| 90 | Comercial A · A42 · disputa simultânea | Passou |
| 91 | Comercial A · A42 · reabertura e nova mensagem | Passou |
| 92 | Comercial A · A42 · liberação e novo atendimento | Passou |
| 93 | Comercial A · A42 · rascunho de versão antiga | Passou |
| 94 | Comercial A · A42 · transferência por Admin | Passou |
| 95 | Comercial A · A42 · prazo e reativação preservam responsável | Passou |
| 96 | Comercial A · A42 · permissões e identidade | Passou |
| 97 | Comercial A · quero fechar · abrir, responder e liberar | Passou |
| 98 | Comercial A · quero fechar · disputa simultânea | Passou |
| 99 | Comercial A · quero fechar · reabertura e nova mensagem | Passou |
| 100 | Comercial A · quero fechar · liberação e novo atendimento | Passou |
| 101 | Comercial A · quero fechar · rascunho de versão antiga | Passou |
| 102 | Comercial A · quero fechar · transferência por Admin | Passou |
| 103 | Comercial A · quero fechar · prazo e reativação preservam responsável | Passou |
| 104 | Comercial A · quero fechar · permissões e identidade | Passou |
| 105 | Comercial A · ATENDENTE · abrir, responder e liberar | Passou |
| 106 | Comercial A · ATENDENTE · disputa simultânea | Passou |
| 107 | Comercial A · ATENDENTE · reabertura e nova mensagem | Passou |
| 108 | Comercial A · ATENDENTE · liberação e novo atendimento | Passou |
| 109 | Comercial A · ATENDENTE · rascunho de versão antiga | Passou |
| 110 | Comercial A · ATENDENTE · transferência por Admin | Passou |
| 111 | Comercial A · ATENDENTE · prazo e reativação preservam responsável | Passou |
| 112 | Comercial A · ATENDENTE · permissões e identidade | Passou |
| 113 | Comercial A · AT10 33000 · abrir, responder e liberar | Passou |
| 114 | Comercial A · AT10 33000 · disputa simultânea | Passou |
| 115 | Comercial A · AT10 33000 · reabertura e nova mensagem | Passou |
| 116 | Comercial A · AT10 33000 · liberação e novo atendimento | Passou |
| 117 | Comercial A · AT10 33000 · rascunho de versão antiga | Passou |
| 118 | Comercial A · AT10 33000 · transferência por Admin | Passou |
| 119 | Comercial A · AT10 33000 · prazo e reativação preservam responsável | Passou |
| 120 | Comercial A · AT10 33000 · permissões e identidade | Passou |
| 121 | Comercial B · oi vim pelo site · abrir, responder e liberar | Passou |
| 122 | Comercial B · oi vim pelo site · disputa simultânea | Passou |
| 123 | Comercial B · oi vim pelo site · reabertura e nova mensagem | Passou |
| 124 | Comercial B · oi vim pelo site · liberação e novo atendimento | Passou |
| 125 | Comercial B · oi vim pelo site · rascunho de versão antiga | Passou |
| 126 | Comercial B · oi vim pelo site · transferência por Admin | Passou |
| 127 | Comercial B · oi vim pelo site · prazo e reativação preservam responsável | Passou |
| 128 | Comercial B · oi vim pelo site · permissões e identidade | Passou |
| 129 | Comercial B · A42 · abrir, responder e liberar | Passou |
| 130 | Comercial B · A42 · disputa simultânea | Passou |
| 131 | Comercial B · A42 · reabertura e nova mensagem | Passou |
| 132 | Comercial B · A42 · liberação e novo atendimento | Passou |
| 133 | Comercial B · A42 · rascunho de versão antiga | Passou |
| 134 | Comercial B · A42 · transferência por Admin | Passou |
| 135 | Comercial B · A42 · prazo e reativação preservam responsável | Passou |
| 136 | Comercial B · A42 · permissões e identidade | Passou |
| 137 | Comercial B · quero fechar · abrir, responder e liberar | Passou |
| 138 | Comercial B · quero fechar · disputa simultânea | Passou |
| 139 | Comercial B · quero fechar · reabertura e nova mensagem | Passou |
| 140 | Comercial B · quero fechar · liberação e novo atendimento | Passou |
| 141 | Comercial B · quero fechar · rascunho de versão antiga | Passou |
| 142 | Comercial B · quero fechar · transferência por Admin | Passou |
| 143 | Comercial B · quero fechar · prazo e reativação preservam responsável | Passou |
| 144 | Comercial B · quero fechar · permissões e identidade | Passou |
| 145 | Comercial B · ATENDENTE · abrir, responder e liberar | Passou |
| 146 | Comercial B · ATENDENTE · disputa simultânea | Passou |
| 147 | Comercial B · ATENDENTE · reabertura e nova mensagem | Passou |
| 148 | Comercial B · ATENDENTE · liberação e novo atendimento | Passou |
| 149 | Comercial B · ATENDENTE · rascunho de versão antiga | Passou |
| 150 | Comercial B · ATENDENTE · transferência por Admin | Passou |
| 151 | Comercial B · ATENDENTE · prazo e reativação preservam responsável | Passou |
| 152 | Comercial B · ATENDENTE · permissões e identidade | Passou |
| 153 | Comercial B · AT10 33000 · abrir, responder e liberar | Passou |
| 154 | Comercial B · AT10 33000 · disputa simultânea | Passou |
| 155 | Comercial B · AT10 33000 · reabertura e nova mensagem | Passou |
| 156 | Comercial B · AT10 33000 · liberação e novo atendimento | Passou |
| 157 | Comercial B · AT10 33000 · rascunho de versão antiga | Passou |
| 158 | Comercial B · AT10 33000 · transferência por Admin | Passou |
| 159 | Comercial B · AT10 33000 · prazo e reativação preservam responsável | Passou |
| 160 | Comercial B · AT10 33000 · permissões e identidade | Passou |
| 161 | Comercial C · oi vim pelo site · abrir, responder e liberar | Passou |
| 162 | Comercial C · oi vim pelo site · disputa simultânea | Passou |
| 163 | Comercial C · oi vim pelo site · reabertura e nova mensagem | Passou |
| 164 | Comercial C · oi vim pelo site · liberação e novo atendimento | Passou |
| 165 | Comercial C · oi vim pelo site · rascunho de versão antiga | Passou |
| 166 | Comercial C · oi vim pelo site · transferência por Admin | Passou |
| 167 | Comercial C · oi vim pelo site · prazo e reativação preservam responsável | Passou |
| 168 | Comercial C · oi vim pelo site · permissões e identidade | Passou |
| 169 | Comercial C · A42 · abrir, responder e liberar | Passou |
| 170 | Comercial C · A42 · disputa simultânea | Passou |
| 171 | Comercial C · A42 · reabertura e nova mensagem | Passou |
| 172 | Comercial C · A42 · liberação e novo atendimento | Passou |
| 173 | Comercial C · A42 · rascunho de versão antiga | Passou |
| 174 | Comercial C · A42 · transferência por Admin | Passou |
| 175 | Comercial C · A42 · prazo e reativação preservam responsável | Passou |
| 176 | Comercial C · A42 · permissões e identidade | Passou |
| 177 | Comercial C · quero fechar · abrir, responder e liberar | Passou |
| 178 | Comercial C · quero fechar · disputa simultânea | Passou |
| 179 | Comercial C · quero fechar · reabertura e nova mensagem | Passou |
| 180 | Comercial C · quero fechar · liberação e novo atendimento | Passou |
| 181 | Comercial C · quero fechar · rascunho de versão antiga | Passou |
| 182 | Comercial C · quero fechar · transferência por Admin | Passou |
| 183 | Comercial C · quero fechar · prazo e reativação preservam responsável | Passou |
| 184 | Comercial C · quero fechar · permissões e identidade | Passou |
| 185 | Comercial C · ATENDENTE · abrir, responder e liberar | Passou |
| 186 | Comercial C · ATENDENTE · disputa simultânea | Passou |
| 187 | Comercial C · ATENDENTE · reabertura e nova mensagem | Passou |
| 188 | Comercial C · ATENDENTE · liberação e novo atendimento | Passou |
| 189 | Comercial C · ATENDENTE · rascunho de versão antiga | Passou |
| 190 | Comercial C · ATENDENTE · transferência por Admin | Passou |
| 191 | Comercial C · ATENDENTE · prazo e reativação preservam responsável | Passou |
| 192 | Comercial C · ATENDENTE · permissões e identidade | Passou |
| 193 | Comercial C · AT10 33000 · abrir, responder e liberar | Passou |
| 194 | Comercial C · AT10 33000 · disputa simultânea | Passou |
| 195 | Comercial C · AT10 33000 · reabertura e nova mensagem | Passou |
| 196 | Comercial C · AT10 33000 · liberação e novo atendimento | Passou |
| 197 | Comercial C · AT10 33000 · rascunho de versão antiga | Passou |
| 198 | Comercial C · AT10 33000 · transferência por Admin | Passou |
| 199 | Comercial C · AT10 33000 · prazo e reativação preservam responsável | Passou |
| 200 | Comercial C · AT10 33000 · permissões e identidade | Passou |

## Verificações adicionais

- **3 testes de fila e persistência:** resposta aguardando na fila não sobrevive à liberação e retomada pela mesma pessoa; sessão revogada durante abertura impede a tomada; responsável, versão, histórico e fila de liberadas persistem ao reabrir o banco.
- **9 testes de grupos:** carregamento da lista sem histórico, deduplicação, filtros de eventos antigos/próprios/internos, anexos como aviso, limite estável das últimas 500 mensagens por consulta, identidades válidas, descarte de carregamento após desconexão, acesso autenticado e bloqueio de envio no transporte.
- **9 testes de navegador:** os fluxos anteriores de cotação, estoque, equipe e cargos, mais a abertura automática, mudança para a aba pessoal, desaparecimento da fila de outro usuário, resposta assinada, observação por Admin, liberação e retomada por outro Comercial. A aba Grupos é conferida sem campo de envio, e a caixa de entrada é verificada em tela móvel.
- As **100 conversas completas** e os **20 cenários sem início pelo cliente** da bateria anterior continuam ativos, assim como as verificações de apresentação, intenção, preços, medidas, falhas, duplicidade e limites do acompanhamento.

As contas reais da instalação não fazem parte do código nem do ZIP. Os exemplos de usuários e senhas nos testes são fictícios. O teste de navegador semeia somente um grupo fictício no banco temporário do próprio teste.

## Reproduzir

```bash
npm test
npm run test:routing
npm run build
npm run test:ui
```

Fontes: [routing.test.js](../tests/routing.test.js), [routing-races.test.js](../tests/routing-races.test.js), [groups.test.js](../tests/groups.test.js) e [panel.spec.js](../tests/browser/panel.spec.js).

Esses resultados cobrem os casos documentados, sem garantia absoluta sobre todas as redes ou mudanças do WhatsApp Web. A consulta de grupos e o transporte foram testados com clientes simulados, sem pareamento real nesta verificação. A imagem Docker não foi construída neste ambiente.
