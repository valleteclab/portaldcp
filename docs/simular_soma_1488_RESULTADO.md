# Simulação: R$ 1.488,00 a partir dos `Valor_R$` do contrato

**Alvo:** R$ 1.488,00 (= 54.633,15 − 53.145,15 na sua conta).

**Método:** subset sum sobre a coluna **Valor_R$** (saldo remanescente por item) de [contrato_25_2025_descricao_completa.csv](contrato_25_2025_descricao_completa.csv), em centavos.

**Script:** [simular_soma_1488.py](simular_soma_1488.py) — `python simular_soma_1488.py`

## Conclusão importante

Existem **muitas** combinações diferentes de itens cujos **Valor_R$** somam **exatamente** R$ 1.488,00. O contrato **sozinho não identifica** qual pedido/NF gerou o desvio — só mostra que **1.488 é “compatível”** com vários pacotes de linhas.

Por isso faz sentido você **enviar o CSV de cada pedido**: aí dá para filtrar combinações que correspondam a **pedidos reais** (itens pedidos × PU ≈ valor na NF).

## Exemplo de combinação que soma 1.488,00 (5 itens)

| Item | Valor_R$ (R$) |
|------|----------------|
| 11 | 288,00 |
| 26 | 390,00 |
| 28 | 170,00 |
| 30 | 440,00 |
| 33 | 200,00 |
| **Soma** | **1.488,00** |

Outros exemplos encontrados pelo script (soma 1.488,00):

- Itens **2+4+5+9+23+39+91** (7 linhas)
- Itens **2+4+5+68+87+93** (6 linhas)
- Itens **11+26+28+30+33** (5 linhas) — igual a primeira solução do DP

## O que os CSVs de pedido permitem fazer depois

Para cada pedido (CSV), calcular **valor por linha** (quantidade × PU ou total da linha) e:

1. Comparar com **NF** (quantidade/valor faturado).
2. Ver se algum pedido tem **diferença acumulada de 1.488,00** entre “sistema” e “NF”.
3. Cruzar **só itens que aparecem em pedidos** com as combinações acima — reduz drasticamente as ambiguidades.

---

*Valores numéricos gerados por `simular_soma_1488.py`; reexecute após alterar o CSV do contrato.*
