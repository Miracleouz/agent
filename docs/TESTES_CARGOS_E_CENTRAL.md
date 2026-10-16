# Cargos e central de atendimento — versão 1.5.0

Verificação em 16/10/2026: **508 testes automatizados**, **8 testes de navegador** e **build de produção** aprovados. Os testes usam bancos temporários, perfis e senhas fictícios, e WhatsApp simulado. Não enviam mensagens para clientes.

## Comportamento

Há exatamente dois cargos atribuíveis: **Admin** e **Comercial**. Vários usuários podem ser Admin. O antigo acesso do dono migra para Admin e os antigos atendentes para Comercial. A migração mantém identificadores, hashes, sessões, histórico e referências do banco. Não promove novamente uma conta que já foi rebaixada pelo administrador.

| Ação | Admin | Comercial |
| --- | --- | --- |
| Ver chats e históricos | Todos | Seus próprios e a fila sem responsável |
| Assumir uma conversa livre | Sim | Sim |
| Responder manualmente | Após assumir | Após assumir |
| Transferir para outro usuário ativo | Sim | Não |
| Gerenciar usuários e cargos | Sim | Não |
| Gerenciar estoque, QR e configurações | Sim | Não |
| Trocar a própria senha | Sim | Sim |

O Admin também deve assumir explicitamente um atendimento ocupado antes de responder. A transferência pausa somente o chat transferido e não envia mensagens ao cliente. O responsável anterior deixa de ver o chat, e o novo passa a vê-lo. Contadores e indicadores de digitação do Comercial respeitam a mesma visibilidade. Os filtros **Meus**, **Fila**, **Aguardando** e **Agente ativo** complementam a caixa de entrada.

## Testes adicionais

Os oito testes de [roles.test.js](../tests/roles.test.js) verificam:

1. Somente Admin e Comercial são aceitos; múltiplos Admins funcionam; Comercial não cria nem promove usuários.
2. Admin vê todos os históricos. Comercial vê seus chats e a fila. A API bloqueia leitura e marcação como lido de outro responsável. Os contadores e a digitação não incluem chats ocultos.
3. Transferência por Admin altera a visibilidade e as permissões de envio, mantém pausa e cancela acompanhamento. Nenhuma confirmação automática é enviada.
4. Promoção e rebaixamento exigem novo login e aplicam as novas permissões. As demais contas mantêm o acesso.
5. O último Admin ativo não pode ser desativado nem rebaixado. Um Admin desativado não conta para essa proteção.
6. Cadastro em lote de cinco usuários, com dois Admins e três Comerciais: todos entram com suas próprias contas e recebem hashes distintos, sem expor credenciais nas respostas.
7. Lotes com e-mails duplicados são revertidos integralmente; perfis inválidos, cargos inválidos, mais de 50 contas e solicitações de Comercial são rejeitados.
8. Migração da versão 1.4.0 mantém senhas, sessões e identificadores e preserva as chaves estrangeiras. Reiniciar não desfaz um rebaixamento de cargo.

O oitavo teste de navegador cadastra cinco contas em lote, confirma os cargos na tabela, abre sessões independentes de Admin e dois Comerciais, transfere um atendimento entre eles e confere que ele desaparece de um painel e aparece no outro. Em seguida rebaixa um Admin e verifica encerramento da sessão e perda dos controles administrativos após novo login. Também confere o layout da equipe em tela móvel.

A bateria anterior permanece ativa: **100 conversas completas**, **20 cenários sem início pelo cliente**, apresentação do ROBINHO, cotações, intenções, medidas, proteção contra duplicidade, pausas e acompanhamento sem repetição. Cadastro, troca de cargo e transferência não disparam mensagens ao cliente.

## Cadastro na instalação local

Em **Equipe → Cadastrar em lote**, informe as pessoas como `Nome;email;cargo` e a senha inicial no campo próprio. Esses dados ficam no banco daquela instalação. O ZIP público não inclui senhas, contas, banco, estoque ou sessão de WhatsApp. O cadastro de usuários não é executado automaticamente ao baixar ou iniciar o código.

```bash
npm test
npm run test:team
npm run build
npm run test:ui
```

Os resultados validam os casos documentados, sem pareamento ou entrega real de WhatsApp. A imagem Docker não foi construída neste ambiente. Não há sincronização com o Digisac: a aplicação usa seu próprio banco, central de atendimento, conexão por QR e controle de acesso.
