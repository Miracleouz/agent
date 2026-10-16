# Perfil ocupado e dados visíveis somente com WhatsApp conectado — 1.15.2

## Erro de QR após recriar o contêiner

O log `The profile appears to be in use by another Chromium process (...) on another computer (...)`, seguido de `profile_busy`, significa que o Chromium recusou abrir o perfil salvo. O nome do computador pode ser o hostname de um contêiner anterior, registrado no `SingletonLock`. Outra instância ativa compartilhando o volume também pode causar esse erro.

A recuperação usa uma manutenção com o serviço parado. Ela consulta os processos visíveis, exige confirmação de que todas as instâncias que usam o volume estão paradas e remove somente os links `SingletonLock`, `SingletonCookie` e `SingletonSocket`. Não segue os links, não remove pastas, não abre o SQLite, não inicializa WhatsApp e não executa logout. Se encontrar processo ativo, diretório com link simbólico, formato inesperado ou falha na verificação, recusa a recuperação.

A verificação de processos dentro de um contêiner não enxerga processos de outros contêineres. Por isso é necessário parar também qualquer outra instância que compartilhe a sessão antes de usar a opção de confirmação. Não há remoção automática de bloqueios ao iniciar ou ao clicar em Gerar QR.

### Recuperar no Docker Desktop / PowerShell

Use a **mesma pasta, projeto Compose e volume** da instalação atual. Não execute estes comandos na pasta temporária do ZIP.

1. Baixe o ZIP 1.15.2. Na pasta da instalação atual, pare o serviço:

```powershell
docker compose stop -t 30 cota
```

2. Confira os outros contêineres no Docker Desktop ou execute:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Pare qualquer outro contêiner do Cota que use o mesmo volume de sessão. Isso inclui instalações iniciadas com outro projeto Compose. O comando de manutenção a seguir depende dessa verificação.

3. Copie o código do ZIP para a pasta da instalação atual. Preserve `.env`, o volume e ajustes próprios de portas/domínio/volumes do Compose. O Compose fornecido passa a dar 30 segundos para uma parada normal, antes do encerramento forçado pelo Docker.
4. Construa a imagem atualizada, sem iniciar o serviço:

```powershell
docker compose build cota
```

5. Execute a manutenção uma vez. Esta confirmação declara que todas as instâncias que usam a sessão estão paradas:

```powershell
docker compose run --rm --no-deps cota npm run whatsapp:recover-profile -- --clear-stale-locks --confirm-all-instances-stopped
```

O resultado informa os links removidos ou que nenhum arquivo foi alterado. Se houver recusa, não apague o perfil ou use `--force`: confira a causa. Não há opção para apagar autenticação ou histórico nessa ferramenta.

6. Inicie apenas uma instância:

```powershell
docker compose up -d cota
docker compose exec cota node -p "require('./package.json').version"
```

A versão deve ser `1.15.2`. Recarregue o painel com Ctrl+F5. A sessão salva pode reconectar automaticamente; se precisar de novo pareamento, clique em **Gerar QR Code** e leia no celular. Use `docker compose logs --tail=100 cota` se houver outro erro. Não compartilhe QR Code, credenciais ou arquivos da sessão.

Para consultar os nomes e tipos dos bloqueios sem alterar nada, com a imagem nova:

```powershell
docker compose run --rm --no-deps cota npm run whatsapp:recover-profile
```

Não use `docker compose down -v`, não exclua o volume e não remova `whatsapp/session` para resolver este bloqueio.

## Conversas e contatos dependem da conexão

Com o WhatsApp em `ready` (**Conectado**), os usuários veem conversas, grupos, agenda e histórico de acordo com seus cargos e responsáveis. Nos estados desconectado, iniciando, QR, autenticando ou erro, esses dados ficam ocultos. O painel mostra uma orientação para conectar.

A API também restringe o acesso direto às mensagens, fotos, avatares, histórico de edições e contatos enquanto estiver desconectado. As listas retornam vazias; operações que precisam da conexão retornam HTTP 409. Ao desconectar, uma consulta de histórico aberta é fechada, a seleção de conversa é limpa e respostas antigas de consultas em andamento não recolocam contatos na tela.

Nada disso apaga dados. Ao reconectar, voltam os mesmos registros, autores, fotos, responsáveis e histórico persistido. As simulações continuam disponíveis sem uma conta real e permanecem identificadas como teste. Reconexão e importação continuam sem autorizar respostas automáticas a mensagens antigas.

## Testes

- **22 testes novos de perfil:** inspeção sem alteração, confirmação obrigatória, processo ativo, links para arquivos externos, pastas inesperadas, alteração concorrente, preservação de dados e execução da manutenção pela CLI.
- Um teste usa **Chromium real**: recusa a limpeza com o perfil em uso; reproduz `profile_busy` com links de um contêiner anterior; recupera os links com o navegador parado; reabre o mesmo perfil. Sem conta ou mensagens reais.
- **32 testes novos de visibilidade:** cinco perfis Admin/Comercial em seis estados de conexão, acessos diretos, fotos, autores, responsáveis, preservação após reinício e bloqueio de alteração de contatos por uma página antiga.
- **Dois cenários novos de navegador:** desconexão com conversa aberta e restauração do histórico; encerramento de histórico por Contatos e descarte de resposta atrasada.
- O diagnóstico `npm run whatsapp:diagnose` gerou um QR real com perfil temporário. Nenhum número foi pareado, o QR não foi exibido e não foram enviadas mensagens.

O resultado da regressão completa está registrado no README. Não foi executado build Docker neste ambiente; a imagem deve ser construída no host com os comandos acima. A manutenção do volume do usuário só é executada quando ele roda o comando na instalação.
