# Contatos e início manual — versão 1.10.0

Verificação em 16/10/2026: **1.812 testes automatizados**, **14 testes de navegador** e **build de produção** aprovados. Inclui **350 testes novos de contatos**. Os testes usam bancos, contas, contatos e cliente de WhatsApp simulados. Nenhuma mensagem foi enviada para um contato real; não houve novo pareamento nesta atualização. A imagem Docker deve ser construída no host de instalação.

## Uso

**Contatos → Novo contato** recebe nome, WhatsApp e empresa opcional. A agenda é compartilhada. Admins e Comerciais podem cadastrar, editar e buscar; somente Admins excluem. Remover o cadastro mantém as conversas, as mensagens e os responsáveis. Os dados da agenda ficam no banco da instalação e persistem no mesmo volume Docker.

Números brasileiros aceitam DDD com espaços, parênteses, pontos e hífens; o código 55 é acrescentado quando necessário. Outros países devem usar `+` e o código do país. Cadastros do mesmo telefone normalizado são rejeitados, mesmo com outra formatação. A lista tem pesquisa por nome, empresa ou telefone e paginação de 50 registros.

**Conversar** consulta o número no WhatsApp conectado. Não envia mensagem: abre ou reutiliza um chat, coloca uma conversa livre sob responsabilidade do usuário e mantém o agente pausado. O usuário escreve e envia pelo campo manual já existente. A mensagem segue a configuração de assinatura e grava nome, cargo e identificador do autor. Alterar o telefone do cadastro não muda o destinatário de uma conversa já aberta.

Comercial não acessa o chat de outro responsável. Admin observa sem roubar a conversa; transferências e tomada explícita continuam nos controles existentes. Liberar um chat permite que outra pessoa assuma. Abrir novamente incrementa a versão de controle quando necessário, invalidando rascunhos de uma responsabilidade anterior.

Abertura manual não cria mensagem recebida nem autoriza o bot a iniciar atendimento. Sem resposta do cliente, nem o relógio nem uma reativação do agente enviam mensagens. A resposta do cliente em um chat manual permanece com o atendente. Reativar o bot permite respostas a novas mensagens recebidas, mantendo o aviso de cinco minutos restrito ao atendimento automático.

## Mesmo cliente, identificadores diferentes

O adaptador consulta os identificadores PN e LID do WhatsApp e vincula as respostas ao histórico confirmado. Os domínios de número `c.us` e `s.whatsapp.net` também são reconhecidos. Assim, uma resposta recebida por LID após um início manual por telefone fica no mesmo chat, com o mesmo responsável e o bot pausado.

O sistema não une automaticamente dois históricos anteriores que já existam para identificadores distintos: nessa situação, avisa para abrir a conversa existente em Conversas. Não retoma bot nem transfere responsáveis para contornar o conflito. Número ausente do WhatsApp, identidade de grupo/status/canal, contato com a própria loja e desconexão impedem a abertura.

A sessão é validada novamente depois da consulta ao WhatsApp e ao executar a operação na fila. Contato apagado ou telefone modificado durante a consulta não cria um rascunho para o número antigo. A exclusividade e a versão do atendimento continuam protegendo envios manuais de telas antigas.

## Matriz de 300 cenários

[contacts.test.js](../tests/contacts.test.js) executa **5 perfis × 10 formatos de telefone × 6 fluxos = 300 cenários**. São dois Admins e três Comerciais, com contas de teste independentes. O transporte usa as mesmas funções de consulta e envio do adaptador, com cliente substituído por uma implementação simulada.

Formatos testados para o mesmo telefone:

- `11999999999`
- `(11) 99999-9999`
- `11 99999 9999`
- `+55 (11) 99999-9999`
- `5511999999999`
- `+5511999999999`
- `55 11 99999-9999`
- `11.99999.9999`
- `11-99999-9999`
- `  (11)99999-9999 `

| Fluxo | Conferências |
| --- | --- |
| Abrir e enviar manualmente | Cadastrar e abrir não enviam; chat manual com responsável; primeira mensagem assinada; silêncio não envia; resposta por LID mantém o chat manual; só nova mensagem após reativar permite cotação e encerramento automático |
| Cadastro, duplicidade e edição | Número equivalente não duplica; editar nome preserva empresa; telefone de grupo é rejeitado; exclusão só por Admin e mantém chat/histórico |
| Disputa por atendimento | Duas aberturas simultâneas produzem um responsável; outro Comercial é bloqueado; Admin pode observar; nenhuma mensagem é enviada pela abertura |
| Histórico existente por LID | Histórico é reaproveitado, prazo anterior é cancelado, responsável é preservado e resposta por número não cria outro chat ou bot |
| Sessão revogada durante consulta | Revogar o acesso enquanto o número é consultado impede criar ou assumir um chat e não envia mensagem |
| Liberação e versão antiga | Outro usuário assume o chat liberado; rascunho antigo não envia; reativar sem mensagem recebida permanece silencioso; uma solicitação válida do cliente permite resposta |

Todos os 300 casos verificam cadastro/pesquisa, normalização e ausência de envio após cinco minutos sem mensagem recebida inicial. Conferem também que os destinatários dos envios explícitos são os esperados e que não há mensagens recebidas artificiais.

## Outros 50 testes

- **34 validações de telefone:** 14 formatos aceitos, incluindo número fixo e outros países, e 20 entradas inválidas, incluindo grupos, canais, números incompletos e caracteres indevidos.
- **14 condições adicionais:** WhatsApp desconectado, número não registrado, própria loja, históricos conflitantes, edição ou exclusão durante consulta, desconexão durante consulta, quatro identidades inválidas retornadas pelo provedor, preservação do destinatário ao editar o telefone, autenticação/CSRF/campos forjados e paginação sem histórico.
- **Persistência:** reabrir o banco mantém contato, vínculo PN/LID, responsável e mensagem manual, sem autorizar primeiro contato automático.
- **Domínios PN:** resposta por `s.whatsapp.net` reutiliza o chat manual aberto por `c.us`, sem ativar outro bot.

## Painel e regressões

Dois novos testes de navegador conferem cadastro, edição, pesquisa por empresa, layout móvel, abertura sem envio, primeira mensagem assinada, exclusão com preservação do histórico, uso por Comercial, observação por Admin, bloqueio de outro Comercial e retomada depois da liberação. Também confirmam ausência de aviso automático em uma conversa iniciada e mantida em modo manual.

Os 12 testes anteriores do painel permanecem aprovados. A regressão de servidor mantém as 300 conversas com variações de escrita da versão 1.9.0, além dos testes de estoque, medidas, retirada, cotação, compra, grupos, inatividade, autenticação e equipe.

Comandos: `npm run test:contacts`, `npm test`, `npm run build` e `npm run test:ui`.
