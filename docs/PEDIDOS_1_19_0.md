# Pedidos fechados, concluídos e cancelados

A aba **Pedidos** mostra as compras confirmadas no Cota, com nome do cliente, WhatsApp, atendente, valor, data e situação. Cotações e manifestações de interesse não contam como pedidos fechados: o registro é criado na confirmação itemizada da compra, junto com a baixa de estoque.

Use **Dia**, **Semana** ou **Mês** e a **Data de referência**. Os períodos seguem o horário de Brasília e a semana começa na segunda-feira. O filtro considera a data em que o pedido foi fechado. Os cartões mostram quantos estão fechados, concluídos e cancelados; o valor desconsidera cancelados. O filtro **Situação** e a paginação ajudam a localizar os registros. A lista acompanha atualizações do painel e também possui **Atualizar pedidos**.

Admin vê os pedidos da equipe. Comercial vê os pedidos que confirmou. A transferência de uma conversa não muda o autor da venda. O nome e o WhatsApp são guardados no fechamento; alterações posteriores no contato não reescrevem o cliente daquele pedido. Pedidos anteriores à atualização aparecem como fechados usando os dados já disponíveis. Simulações ficam fora do relatório de vendas reais.

## Concluir ou cancelar

- **Concluir** registra a finalização do pedido, sem fazer outra baixa de estoque.
- **Cancelar** devolve automaticamente os itens ao estoque e preserva o pedido no histórico como cancelado. A confirmação informa essa devolução e permite uma observação opcional.
- A situação final registra quem alterou, quando e a observação. **Ver pedido** mostra os itens, medidas, valores e histórico da situação.
- Solicitações repetidas não duplicam a devolução. Uma disputa entre concluir e cancelar só aceita uma situação final. Um pedido concluído ou cancelado não é reaberto por esse fluxo; isso preserva a baixa e o histórico.

O cancelamento e a devolução são uma única transação: se um item não puder ser devolvido com segurança, nenhum saldo, situação ou registro parcial é aplicado. Se o cadastro foi removido, a unidade mudou ou os dados dos cortes foram substituídos, o painel pede a conferência do cadastro e preserva o pedido.

Peças voltam como peças. Frisos, sincronizadoras e abertas devolvem a quantidade debitada e os cortes correspondentes. Cortes devolvidos são lotes individuais: duas faixas estreitas não são somadas para prometer uma correia mais larga. Os testes verificam a devolução por peça, friso, milímetro e metro na largura inteira cadastrada.

Consultar, concluir ou cancelar um pedido não envia mensagens ao WhatsApp. O histórico continua no volume da instalação após fechar o painel ou reiniciar o Docker.
