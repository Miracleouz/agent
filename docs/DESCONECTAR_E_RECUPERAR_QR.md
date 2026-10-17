# Desconexão e recuperação de QR — 1.15.5

## Problema corrigido

Na versão anterior, o botão Desconectar podia ignorar uma falha de `destroy()` e mostrar sucesso, deixando o navegador com o perfil em uso. A referência ao cliente era descartada antes de confirmar seu encerramento; outra tentativa podia iniciar enquanto a anterior ainda fechava. O logout também não tinha limite próprio. Esses casos foram reproduzidos com falhas e esperas controladas.

O log `profile_busy` também pode vir de links `Singleton*` deixados por um contêiner encerrado. Fechar uma tentativa que nem conseguiu abrir o Chromium não remove esses links antigos. Esse bloqueio foi reproduzido em Chromium real com um hostname antigo no link, e não é resolvido apenas pelo limite de tempo da versão 1.15.4.

## Comportamento novo

- Desconectar interrompe imediatamente a autorização para respostas, oculta os dados do WhatsApp e mostra **Desconectando** enquanto encerra a tentativa.
- A referência ao navegador é mantida até confirmar seu fechamento. Solicitações simultâneas compartilham o encerramento; uma nova conexão aguarda seu término.
- Logout e fechamento têm prazo. Uma falha recebe resposta HTTP de erro e orientação específica, sem o aviso **Sessão desconectada**.
- O erro `browser_close_timeout` mantém a referência ao cliente e impede iniciar outro navegador no mesmo perfil. Reinicie o serviço antes de tentar novamente.
- Se o logout falhar, o navegador ainda é fechado. O painel informa `logout_failed`, orienta conferir Aparelhos conectados e preserva a autenticação que não foi desvinculada. Uma operação de logout ainda pendente bloqueia a reconexão até terminar ou até reiniciar o serviço.
- O cliente bloqueia reinjeções de navegação antes de executar o logout do SDK. Cancelar antes do lançamento impede abrir um navegador atrasado; um lançamento já iniciado precisa terminar e fechar antes de declarar o encerramento.

## Recuperar um bloqueio antigo no painel

Se aparecer **Código: profile_busy**, use o novo botão **Recuperar conexão** na aba **WhatsApp**:

1. Pare outras instalações ou contêineres que compartilham a mesma sessão/volume. Mantenha somente este Cota em execução.
2. Clique em **Recuperar conexão**.
3. Marque **Confirmo que todas as outras instâncias que usam esta sessão estão paradas**.
4. Clique em **Recuperar e gerar QR** e aguarde o código ou o diagnóstico da nova tentativa.

A recuperação é exclusiva para Admin, exige confirmação explícita e proteção da requisição. Ela fecha a tentativa atual antes da manutenção e verifica processos visíveis usando o mesmo perfil. Um Cota com outro `DATA_DIR` não bloqueia a recuperação de uma sessão independente; quando não é possível verificar o diretório de outro processo do Cota, a operação é recusada por segurança.

Somente os três links simbólicos conhecidos são removidos. Arquivos de formato inesperado, mudanças durante a verificação ou um Chromium ativo impedem a remoção. O código não segue os links nem remove seus alvos. Estoque, usuários, histórico e autenticação são preservados; recuperar não envia mensagens.

O sistema não consegue inspecionar processos de outros contêineres ou computadores. Por isso a confirmação de que as outras instâncias estão paradas é necessária. Não há remoção automática de bloqueios ao iniciar. Se houver `browser_close_timeout`, reinicie primeiro o serviço e confirme que não existe outra instância usando o volume.

O botão **Desconectar sessão**, quando o WhatsApp está conectado, continua solicitando a desvinculação pelo SDK. Isso é diferente de recuperar um bloqueio antigo ou fechar o serviço para atualizar. Falhas não são tratadas como desvinculação confirmada.

O procedimento de terminal com todas as instâncias paradas continua disponível em [PERFIL_OCUPADO_E_CONEXAO.md](PERFIL_OCUPADO_E_CONEXAO.md).

## Validação

Foram acrescentados 24 cenários de ciclo de conexão, dois casos de diagnóstico e dois casos de escopo de processos. Os testes cobrem estados iniciando/QR/conectado/erro, fechamento recusado ou pendente, logout recusado ou pendente, cliques simultâneos, cancelamento durante encerramento, bloqueio antigo, perfil ativo e permissões do endpoint.

Com o SDK instalado e Chromium real, foram executados quatro ciclos de gerar QR, desconectar e abrir novamente o mesmo perfil persistente. Outro teste exercita o método de logout original do SDK com módulos locais simulados, verificando fechamento do navegador e outro QR. Os quatro cenários novos do painel incluem recuperação de um bloqueio real de Chromium, mais três ciclos pelo botão, falhas sem aviso falso de sucesso e logout pelo painel. Banco, histórico, usuário e marcador de sessão são conferidos após as operações, sem envio de mensagens.

Os cenários de logout usam módulos simulados; nenhum número foi pareado. O diagnóstico separado com WhatsApp Web real usa um perfil temporário e não exibe o QR nem envia mensagens. Não foi construído um contêiner Docker neste ambiente. Os resultados completos estão no README; a instalação e a conta do usuário precisam ser validadas após atualizar.
