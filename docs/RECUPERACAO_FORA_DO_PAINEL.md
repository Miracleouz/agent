# Recuperar bloqueio pelo Docker, sem depender do painel

Este procedimento usa a versão já instalada. É destinado ao Compose padrão, com um único contêiner do serviço `cota` e volume local do Docker montado em `/app/data`. Ele identifica o volume e a imagem do contêiner existente, para evitar recuperar uma pasta ou projeto diferente.

O bloco para o Cota, confere se algum outro contêiner deste Docker ainda usa o volume e executa somente a manutenção de links, em um contêiner temporário sem rede. Depois inicia o mesmo contêiner original, preservando sua configuração. Não apaga banco, estoque ou autenticação e não inicia um novo projeto Compose.

Cole o bloco inteiro no PowerShell, na pasta da instalação atual:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $cotaIds = @(docker compose ps --all --quiet cota)
    if ($LASTEXITCODE -ne 0 -or $cotaIds.Count -ne 1) { throw 'Não foi possível identificar um único contêiner do Cota nesta pasta.' }
    $cotaId = $cotaIds[0]
    $cotaVolume = docker inspect --format '{{range .Mounts}}{{if and (eq .Destination "/app/data") (eq .Type "volume")}}{{.Name}}{{end}}{{end}}' $cotaId
    $cotaImage = docker inspect --format '{{.Image}}' $cotaId
    if (-not $cotaVolume -or $cotaImage -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Não foi possível confirmar o volume e a imagem existentes. Nenhum arquivo foi alterado.' }
    $cotaDriver = docker volume inspect --format '{{.Driver}}' $cotaVolume
    $cotaOptions = docker volume inspect --format '{{json .Options}}' $cotaVolume
    if ($LASTEXITCODE -ne 0 -or $cotaDriver -ne 'local' -or $cotaOptions -notin @('null','{}')) { throw 'O volume não é local padrão. A recuperação automática foi interrompida.' }
    docker stop --time 30 $cotaId
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível parar o Cota.' }
    $cotaAtivos = @(docker ps --filter "volume=$cotaVolume" --quiet)
    if ($LASTEXITCODE -ne 0 -or $cotaAtivos.Count -gt 0) { throw 'Outro contêiner ainda usa o volume, ou a verificação falhou. Nenhum bloqueio foi removido.' }
    docker run --rm --init --network none --mount "type=volume,source=$cotaVolume,target=/app/data" -e DATA_DIR=/app/data --entrypoint node $cotaImage server/recover-whatsapp-profile.js --clear-stale-locks --confirm-all-instances-stopped
    if ($LASTEXITCODE -ne 0) { throw 'A manutenção foi recusada. Envie o erro acima; o Cota permanece parado.' }
    docker start $cotaId
    if ($LASTEXITCODE -ne 0) { throw 'A manutenção terminou, mas o contêiner não iniciou. Envie o erro acima.' }
}
```

A manutenção informa quantos links foram removidos, ou que não havia links a remover. Após iniciar, abra o painel, pressione Ctrl+F5 e aguarde a restauração/QR. Se necessário, clique em Gerar QR Code. Se a manutenção recusar, envie seu texto exato: ele distingue outro processo, permissões, diretório ou formato inesperado. O bloco não tenta contornar uma recusa nem reinicia automaticamente o serviço após erro na manutenção.

Esse caminho foi verificado em contêiner descartável com usuário node, init, imagem 1.15.6 e volume persistente. O teste confirmou o bloqueio inicial, identificou imagem/volume reais, parou o serviço, conferiu o volume sem outros usuários, removeu três links, iniciou o mesmo contêiner e gerou QR, preservando usuário, configuração, histórico e marcador da autenticação, sem tentativa de envio. Foram oito verificações. Os módulos WhatsApp desse teste são simulados; não houve pareamento.

Teste de desenvolvimento:

```sh
node tests/docker-profile-recovery.mjs nome-da-imagem --offline-recovery
```

Para investigar o botão, é necessário o texto após confirmar Recuperar e gerar QR. Um trecho de log contendo somente `browser_start`, `closing_previous` e `disconnecting` não mostra o resultado da rota de recuperação. Quando a manutenção é iniciada pelo painel, aparece `stage=profile_recovery`; uma recusa interna inclui `[WhatsApp profile]` com a etapa e a causa.
