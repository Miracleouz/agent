# Quando o QR Code não aparece

O painel responder na porta 3000 confirma que o servidor está acessível. O QR depende de outro componente: o Chromium precisa iniciar, acessar o WhatsApp Web e carregar a página. A mensagem genérica das versões anteriores não permite concluir que houve falha de internet.

Se o painel mostra `profile_busy` e o log cita outro computador/contêiner, a versão **1.15.2** inclui um procedimento de recuperação que preserva a sessão e o banco. Veja [PERFIL_OCUPADO_E_CONEXAO.md](PERFIL_OCUPADO_E_CONEXAO.md). A manutenção exige que todas as instâncias que usam a sessão estejam paradas.

A versão **1.15.3** trata `Socket` nulo e rejeições assíncronas durante navegação. Veja [AUTENTICACAO_E_NAVEGACAO.md](AUTENTICACAO_E_NAVEGACAO.md). Os códigos novos são `auth_modules` e `page_reloaded`; a sessão é preservada e a tela permite nova tentativa.

## Diagnóstico no Docker do computador

Atualize o código na mesma instalação, mantendo `.env`, o projeto Compose, os ajustes próprios e o volume de dados. Recrie o serviço com `docker compose up -d --build cota` e atualize o painel com Ctrl+F5. Não use `down -v` nem apague `data`, o volume ou a sessão para tentar gerar um QR.

Abra **WhatsApp → Gerar QR Code**. Se falhar, o painel exibirá uma categoria de erro. Para obter o detalhe técnico, execute na pasta da instalação:

```powershell
docker compose logs --tail=100 cota
```

As linhas iniciadas por `[WhatsApp]` contêm a causa fornecida pelo navegador, com URLs sem credenciais/caminho e campos comuns de autenticação ocultados. O painel e a atividade do sistema recebem apenas orientação fixa, sem o detalhe técnico do navegador. Confira o conteúdo antes de compartilhar logs; nunca envie QR Code, senhas ou arquivos de sessão.

Para testar o navegador e a rede separadamente da sessão salva:

```powershell
docker compose exec cota npm run whatsapp:diagnose
```

Esse comando usa um banco em memória e um perfil temporário, com limite de 120 segundos. Não lê o histórico da instalação, não autentica um número, não mostra o QR, não envia mensagens e não remove a sessão existente. O sucesso informa que o Chromium abriu o WhatsApp e produziu um QR naquele momento; não confirma o pareamento nem a entrega de mensagens.

Se o diagnóstico temporário funcionar e o painel continuar falhando, confira o código de erro do painel: o perfil persistente ou a instância do serviço pode exigir análise. O teste temporário não tenta consertar ou limpar o perfil salvo.

## Categorias

| Código | O que conferir |
| --- | --- |
| `profile_busy` | Outra instância usando o perfil ou bloqueio remanescente após reinício/recriação do contêiner. Confirme que só uma instância usa a sessão. Não apague arquivos de autenticação; a liberação de bloqueios exige confirmar que não existe outro navegador ativo. |
| `browser_missing` | Chromium ausente ou `CHROME_PATH` inválido. Use a imagem Docker do projeto ou instale/configure o navegador fora do Docker. |
| `permissions` | Permissão para executar o navegador e gravar o volume de sessão. |
| `disk_full` | Espaço disponível no host e no armazenamento do Docker Desktop. |
| `memory` | Memória disponível e limites do contêiner/Docker Desktop. |
| `certificate` | Relógio do computador, certificados e proxy da rede. Não desative a verificação HTTPS. |
| `proxy` | Endereço, acesso e autenticação do proxy usado pelo serviço. |
| `dns` | Resolução de nomes no host e dentro do contêiner. |
| `network` | Acesso do contêiner ao WhatsApp Web e regras de firewall/rede. |
| `timeout` | Lentidão da rede, do host ou do Chromium. O carregamento de autenticação agora espera 90 segundos por padrão. |
| `browser_dependencies` | Bibliotecas do Chromium ausentes; reconstrua a imagem fornecida. |
| `browser_start` | Navegador encerrado ou falha de lançamento; o log identifica o detalhe. |
| `auth_modules` | Componentes do WhatsApp indisponíveis durante a autenticação. A preparação tem limite; confira os logs e tente gerar o QR novamente. |
| `page_reloaded` | Navegação interrompida durante a preparação. A tentativa termina sem encerrar o servidor e permite gerar o QR novamente. |
| `initialization` | Falha não reconhecida. O log é necessário para determinar a causa. |

Se houver apenas timeout e recursos/rede estiverem adequados, `WHATSAPP_AUTH_TIMEOUT_MS` permite ajustar a espera do carregamento da autenticação entre 30000 e 300000 ms. O Compose fornecido encaminha essa variável do `.env`. Valores inválidos usam 90000 ms. Isso não corrige falta de memória, DNS, certificados, permissões ou perfil ocupado.

## Verificação da versão 1.11.1

Em 16/10/2026, foram aprovados **2.186 testes de servidor**, incluindo **48 testes novos** de diagnóstico, privacidade dos erros, limites de espera, eventos atrasados, reconexões concorrentes e cancelamento durante limpeza do navegador. Passaram também **17 testes de navegador**, incluindo a exibição de um erro de perfil ocupado e uma nova tentativa que gera QR sem logout ou envio. A regressão mantém as conversas e regras de não iniciar contato automaticamente. O build de produção passou.

O comando `npm run whatsapp:diagnose` foi executado com Chromium real e gerou um QR, sem pareamento e sem mensagens. A máquina do usuário ainda precisa ser verificada com seus próprios logs. A imagem Docker não foi construída neste ambiente.
