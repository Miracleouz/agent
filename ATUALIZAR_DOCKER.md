# Atualizar para a versão 1.9.0 no Docker

Use a instalação que já está funcionando. O ZIP contém o código; estoque, usuários, conversas e sessão do WhatsApp permanecem no volume existente.

1. Deixe o Docker em execução. Extraia o ZIP em uma pasta temporária.
2. Abra um terminal na pasta da instalação atual, onde está o `compose.yaml` que você já usa. No Windows, abra essa pasta no Explorador, digite `powershell` na barra de endereço e pressione Enter.
3. Pare o serviço antes de substituir os arquivos:

```powershell
docker compose stop cota
```

4. Copie o conteúdo da pasta `cota-whatsapp-1.9.0` extraída para a pasta da instalação atual, substituindo os arquivos do código. O `compose.yaml`, o `Dockerfile`, `server` e `src` devem ficar diretamente na pasta atual, sem criar outra pasta dentro dela. Preserve seu `.env`, dados locais e eventuais ajustes próprios de porta, domínio ou volumes no `compose.yaml`.
5. Na mesma pasta e usando o mesmo projeto Compose da instalação anterior, execute:

```powershell
docker compose up -d --build cota
```

Se você normalmente usa `docker compose -p nome-do-projeto` ou um arquivo Compose específico, mantenha essas mesmas opções em todos os comandos. Isso permite reutilizar o volume correto. Não inicie a atualização diretamente na pasta temporária do ZIP.

6. Confira o serviço e os logs:

```powershell
docker compose ps
docker compose logs --tail=100 cota
```

7. Abra o endereço que você já usa para acessar o painel e pressione **Ctrl+F5**. Na instalação local padrão, o endereço digitado no navegador é `localhost:3000`. Use **Testar agente** para conferir a atualização. Teste `vou mandar o motorista`: deve pedir nome de quem vai retirar e nome da empresa. Repetir a frase no mesmo chat em menos de 24 horas não deve repetir a pergunta.

Nesta versão, o atendimento automático envia um único aviso e encerra após cinco minutos sem resposta; o antigo menu de cinco minutos foi removido. Teste também `oi vim pelo site`, depois uma cotação e aguarde cinco minutos: deve aparecer o encerramento, sem repetição. Não é necessário informar credenciais do WhatsApp no simulador, que não envia a contatos reais.

Não execute `docker compose down -v` nem exclua o volume `cota-data`. O nome real do volume costuma incluir o nome do projeto Compose. Mantenha a mesma instalação/projeto para preservar estoque, acessos, histórico e sessão. Caso a sessão de WhatsApp tenha expirado, gere um novo QR no painel.

O pacote foi verificado com 1.462 testes automatizados, 12 testes de navegador e build de produção. A imagem Docker precisa ser construída no seu host pelo comando acima; não foi executado um build Docker neste ambiente.
