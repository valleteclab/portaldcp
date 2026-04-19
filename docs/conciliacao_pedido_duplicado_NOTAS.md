# Conciliação: pedido duplicado × contrato migração × contabilidade

Artefatos gerados:

- Planilha com join: [conciliacao_pedido_duplicado.csv](conciliacao_pedido_duplicado.csv) (separador `;`, UTF-8 com BOM).
- Script que regenera a planilha: [conciliacao_pedido_duplicado.py](conciliacao_pedido_duplicado.py).

## Totais (pedido `69d9bc39e7352.csv`)

| Conceito | Valor (R$) |
|----------|------------|
| Soma das linhas do pedido (sistema) | 13.556,15 |
| Valor informado pela contabilidade | 12.473,65 |
| Diferença | **1.082,50** |

## Colunas da planilha

- **Item_Lote**: número do lote no pedido (= `Item` no CSV de migração).
- **PU_pedido / Qtd_pedido / Valor_linha_pedido**: dados do export do pedido duplicado.
- **PU_contrato, Qtd_contratada, Saida, Estoque_Atual_migracao**: [contrato_25_2025_descricao_completa.csv](contrato_25_2025_descricao_completa.csv).
- **Qtd_excedente_saldo**: `max(0, Qtd_pedido − Estoque_Atual_migracao)`.
- **Valor_excedente**: `Qtd_excedente_saldo × PU_pedido`.
- **Pedido_sem_saldo_estoque_zero**: `SIM` se `Estoque_Atual_migracao ≤ 0` e `Qtd_pedido > 0` (pedido com saldo zero no extrato de migração).

## Destaque — item 4 (balões)

- Pedido: **100** un. × **7,45** = **745,00**.
- Migração: **Estoque_Atual = 50** (50 un. já consumidas no contrato original).
- **Excesso**: **50** un. × **7,45** = **372,50** (pedido no duplicado pede o dobro do saldo remanescente no contrato de referência).

## Destaque — item 55 (papel A4)

- No join com o CSV de migração: **500** un. de saldo, pedido **200** un. → **excesso contábil zero** nesta regra.
- A diferença global **1.082,50 ÷ 26,90 ≈ 40,24** resmas é apenas uma **hipótese aritmética**: “se toda a diferença fosse só papel A4 a R$ 26,90”, equivaleria a **~40 resmas** não reconhecidas. Isso **não** consta como excesso de saldo na migração; só fecha com **NF / liquidação** ou critério da contabilidade.

## Soma dos “excedentes” por saldo

A soma de **Valor_excedente** na planilha (**2.007,15**) é **maior** que **1.082,50**, porque a contabilidade não precisa ter recusado “tudo que excede saldo” linha a linha; ela pode ter pago parte dos itens **sem saldo** no extrato ou rateado de outra forma.

## Itens com `Pedido_sem_saldo_estoque_zero = SIM`

Itens em que o pedido traz quantidade **> 0** e o extrato de migração mostra **Estoque_Atual = 0**:

27, 34, 36, 40, 41, 43, 57, 61, 66, 67, 86, 88.

(Conferir linhas correspondentes na planilha.)

## Cruzamento com contabilidade / NF (checklist)

Para fechar **qual linha** sustenta os **12.473,65** e o que explica **1.082,50**:

1. Solicitar **nota fiscal** ou **relatório de liquidação** do fornecedor referente a **este pedido do contrato duplicado**, com **valor por item** ou por NF.
2. Conferir se algum item foi **faturado parcialmente** (ex.: papel A4 com quantidade menor que o pedido).
3. Confrontar item a item: coluna **Valor_linha_pedido** da planilha × valor **pago/reconhecido** na NF.
4. Manter separado o racional dos saldos **globais** (ex.: 53.145,15 vs 42.159,50) da diferença **dentro deste pedido** (1.082,50), salvo que a contabilidade una tudo num único relatório.

Nenhuma dessas etapas depende de alteração no código do Portal; é conciliação de dados e documentos.

## Por que, no fim, ainda pode não bater com o “saldo disponível” da contabilidade

A planilha e o join **não reproduzem automaticamente** o saldo que a contabilidade chama de “disponível” (ex.: **42.159,50**), nem fecham com o saldo que o sistema mostra só com pedidos do original (ex.: **53.145,15**). Motivos típicos:

1. **Definições diferentes**  
   Contabilidade costuma usar **empenho, liquidação, pagamento, NF, glosas, estornos** e **data de corte**. O Portal/migração usam **contrato − entregas − reservas** em **unidades/valor contratual**. São **duas curvas**; só coincidem se as regras e a data forem as mesmas.

2. **Contrato duplicado**  
   Houve **dois contratos** e pedidos nos dois. O CSV de migração é **um** extrato consolidado; a contabilidade pode ter **rateado**, **bloqueado** ou **reconhecido** valores só em um dos instrumentos. Sem o **mapa contábil** (qual despesa vai para qual contrato), o saldo “oficial” não deriva só do join pedido × migração.

3. **Dois níveis de diferença**  
   - **~1.082,50**: diferença **dentro deste pedido** (valor do pedido no sistema **13.556,15** vs o que a contabilidade **pagou/reconheceu** **12.473,65**).  
   - **~10.985,65** (**53.145,15 − 42.159,50**): diferença de **posição global** — outra conta; **não** é explicada só pelo pedido duplicado.

4. **O que falta para “bater” de verdade**  
   Alinhar explicitamente: **(a)** fórmula do saldo na contabilidade, **(b)** extrato do contrato na data do relatório, **(c)** NFs e pagamentos **por contrato** e **por pedido**, **(d)** ajustes manuais (glosas, devoluções, multas). A planilha aqui é **apoio analítico**; o fechamento é **processo contábil + documentos**, não só CSV.

Em resumo: é esperado que **saldo disponível contábil ≠ saldo do sistema** até que esses elos sejam amarrados; a conciliação do plano **localiza divergências no pedido duplicado**, mas **não substitui** o fechamento com a contabilidade.
