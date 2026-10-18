# Voz local e pedido de teste — 1.19.2

## Transcrição

O motor é **Whisper large-v3-turbo com faster-whisper**, em português, executado na CPU com precisão int8. Há uma única opção de voz nesta entrega. Não usa API de transcrição, chave ou cobrança por áudio. A Internet é necessária para baixar os arquivos do modelo na preparação inicial; a transcrição usa os arquivos locais.

É necessário preparar o novo modelo mesmo que o modelo `base` da versão anterior já esteja instalado:

```powershell
docker compose exec cota npm run audio:prepare
```

Espere terminar antes de executar o diagnóstico:

```powershell
docker compose exec cota npm run audio:diagnose
```

O modelo ocupa aproximadamente 1,5 GB, além do sistema e do cache anterior. Recomenda-se notebook com 16 GB de RAM e SSD. A transcrição pode levar alguns segundos ou mais, conforme CPU, duração e fila de áudios; as mensagens continuam sendo recebidas enquanto isso. O preparo inicial pode demorar conforme a Internet. O modelo fica no volume persistente.

## Referências e confirmação

- `cê cem` e `C cem` são interpretados como C100; `bê trinta` como B30.
- São tratados perfis falados como `a tê cinco`, `a tê dez`, `tê vinte` e materiais `pê u aço`.
- `Correia C sem` é ambíguo: o agente pergunta se a referência entendida está correta **antes de apresentar preços**. Responda SIM para cotar ou informe a referência correta. Não altera o preço ou o estoque nessa confirmação.
- Uma referência que o motor marcou como incerta também exige confirmação. Fala imprecisa sem referência reconhecível sinaliza atendimento humano sem disparar uma resposta automática. Repetições anormais do reconhecimento são recusadas.
- `sem fim`, `sem preço` ou `sem marca` não são convertidos em 100. Não se troca C101 por C100 nem se escolhe uma medida próxima só por existir no catálogo.
- Pausa, encerramento, liberação, reativação, mudança de responsável e nova mensagem invalidam confirmações antigas. Áudios históricos não reabrem atendimentos encerrados.

O texto original do reconhecimento continua visível. Em áudios já transcritos, **Transcrever novamente** permite usar o novo motor. Esse botão atualiza o texto no painel e **não envia outra resposta ao cliente**. Para testar uma nova resposta automática, deixe o chat no automático e envie um áudio novo de outro número.

## Pedido completo com diálogo

Abra **Pedidos → Testar pedido completo**. O sistema executa o agente e o fechamento com um catálogo fictício em banco separado; salva a conversa e o pedido de simulação para conferência.

A aba muda para **Pedidos de teste**, mostrando o pedido como **Concluído**. Clique em **Ver conversa** para abrir o diálogo no chat. É possível voltar e ler a saudação, cotação, solicitação de compra, retirada, identificação do retirante e confirmação. O diálogo permanece após recarregar o painel.

O teste usa duas correias A42, escolhe a primeira opção da cotação e registra retirada com “Motorista Teste, da Empresa Demonstração”. O atendimento assina as mensagens com o nome do usuário que iniciou o teste. O pedido contém valores fictícios e fica fora dos totais de **Pedidos reais**. Não altera produtos, lotes ou movimentos de estoque reais e não envia nada ao WhatsApp.

## Limites e evidência

Os testes de interpretação usam transcrições controladas; eles verificam referências, preços, pausas e ausência de envios indevidos, não medem acurácia acústica. Também são usados arquivos Ogg/Opus com reconhecimento local real e Chromium controlado, sem parear uma conta WhatsApp real.

Nos ensaios acústicos, o novo motor reconheceu a frase de teste B72 e a lista AT5, AT10 e T20. Algumas vozes sintéticas curtas de C100 e AT5 com material ainda produziram erros. Por isso, não se promete erro zero, nem se transforma fala irreconhecível em uma cotação por adivinhação. Os áudios originais dos exemplos do usuário não foram anexados; imagens da transcrição não permitem medir o reconhecimento desses arquivos reais.

As verificações de pausa, confidencialidade de rascunhos, fotos, estoque, relatórios, sincronização e reativação silenciosa permanecem na suíte. Resultados finais já concluídos: **4.445 testes do servidor, 90 testes do painel e 944 testes na imagem Docker passaram**, sem falhas, cancelamentos ou testes ignorados nessas rodadas. O diagnóstico e o preparo local do modelo também passaram. A imagem de teste usa as dependências de produção já validadas da 1.19.1, com código, scripts de voz e painel compilado da 1.19.2; o Dockerfile entregue e as dependências permanecem inalterados.

O teste final de áudio na imagem Docker também passou: um Ogg/Opus real foi transcrito pelo large-v3-turbo, a referência B72 foi reconhecida e o agente apresentou a cotação. Transcrever manualmente outra vez não gerou resposta adicional. A execução usou o usuário `node`, cache do modelo somente para leitura e rede desativada, sem conta WhatsApp real. Uma tentativa anterior de executar as duas suítes Docker em paralelo esgotou o espaço temporário; após limpar o cache de compilação, ambas foram executadas separadamente e passaram.
