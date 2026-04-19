"""
Concilia pedido duplicado (69d9bc39e7352.csv) com valor contábil 12.473,65.
Gap = 13.556,15 - 12.473,65 = 1.082,50

Gera:
- pedido_duplicado_conciliacao_contabilidade.csv (cada linha: valor sistema vs valor reconhecido)
- pedido_duplicado_gap_1082_subset.txt (uma decomposição exata do gap em linhas inteiras)
"""
from __future__ import annotations

import csv
import re
from pathlib import Path


def parse_pedido(path: Path) -> list[tuple[int, float, float, float]]:
    rows: list[tuple[int, float, float, float]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = next(csv.reader([line]))
            if len(r) < 4:
                continue
            m = re.search(r"Lote:\.(\d+)", r[0])
            if not m:
                continue
            lote = int(m.group(1))
            pu, qtd, tot = float(r[1]), float(r[2]), float(r[3])
            rows.append((lote, pu, qtd, tot))
    return rows


def subset_sum_first(vals: list[tuple[int, int]], target_cents: int) -> list[int] | None:
    """vals: list of (index_in_vals, cents). Returns indices into vals or None."""
    pred = [-1] * (target_cents + 1)
    pred[0] = -2
    for j, (_, c) in enumerate(vals):
        if c > target_cents:
            continue
        for s in range(target_cents, c - 1, -1):
            if pred[s - c] != -1 and pred[s] == -1:
                pred[s] = j
    if pred[target_cents] == -1:
        return None
    out: list[int] = []
    s = target_cents
    while s > 0:
        j = pred[s]
        out.append(j)
        s -= vals[j][1]
    return out


def main() -> None:
    root = Path(__file__).resolve().parent
    pedido_path = root / "69d9bc39e7352.csv"
    out_csv = root / "pedido_duplicado_conciliacao_contabilidade.csv"
    out_txt = root / "pedido_duplicado_gap_1082_subset.txt"

    rows = parse_pedido(pedido_path)
    total_sistema = round(sum(r[3] for r in rows), 2)
    valor_contab = 12473.65
    gap = round(total_sistema - valor_contab, 2)
    gap_cents = int(round(gap * 100))

    vals = [(i, int(round(rows[i][3] * 100))) for i in range(len(rows))]
    idxs = subset_sum_first(vals, gap_cents)
    if idxs is None:
        raise SystemExit("Nenhuma combinação de linhas inteiras soma o gap; revisar centavos.")

    # idxs = índices j em vals; row_idx = vals[j][0]
    row_indices_gap = {vals[j][0] for j in idxs}
    gap_lotes = {rows[i][0] for i in row_indices_gap}
    gap_sum = sum(rows[i][3] for i in row_indices_gap)

    lines_txt = [
        f"Pedido duplicado: {pedido_path.name}",
        f"Soma linhas (sistema): R$ {total_sistema:.2f}",
        f"Valor contabilidade (alvo): R$ {valor_contab:.2f}",
        f"Gap: R$ {gap:.2f}",
        "",
        "Uma decomposição EXATA do gap como soma de valores de linhas inteiras:",
        f"  Lotes: {sorted(gap_lotes)}",
        f"  Soma: R$ {gap_sum:.2f}",
        "",
        "Detalhe:",
    ]
    for ri in sorted(row_indices_gap, key=lambda x: rows[x][0]):
        lote, pu, qtd, tot = rows[ri]
        lines_txt.append(f"  Lote {lote}: R$ {tot:.2f}  ({qtd:g} un × R$ {pu:.2f})")
    lines_txt.extend(
        [
            "",
            "Interpretação: se a contabilidade NÃO reconheceu exatamente essas linhas,",
            "o total reconhecido seria R$ 12.473,65. Outras combinações de linhas",
            "podem somar o mesmo gap — a NF é quem define qual cenário é o real.",
        ]
    )
    out_txt.write_text("\n".join(lines_txt), encoding="utf-8")

    # CSV: valor_reconhecido = 0 nas linhas do gap (cenário: não pagas) ou proporcional — aqui cenário binário
    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(
            [
                "Item_Lote",
                "PU",
                "Qtd",
                "Valor_linha_sistema",
                "Diferenca_para_contabilidade",
                "Valor_reconhecido_cenario_subset",
                "No_subset_gap_1082",
            ]
        )
        for lote, pu, qtd, tot in rows:
            no_gap = lote in gap_lotes
            vrec = 0.0 if no_gap else tot
            diff = -tot if no_gap else 0.0
            w.writerow(
                [
                    lote,
                    f"{pu:.6f}".rstrip("0").rstrip("."),
                    f"{qtd:g}",
                    f"{tot:.2f}".replace(".", ","),
                    f"{diff:.2f}".replace(".", ","),
                    f"{vrec:.2f}".replace(".", ","),
                    "SIM" if no_gap else "NAO",
                ]
            )
        w.writerow([])
        w.writerow(["TOTAL_SISTEMA", "", "", f"{total_sistema:.2f}".replace(".", ","), f"{-gap:.2f}".replace(".", ","), f"{valor_contab:.2f}".replace(".", ","), ""])

    print("\n".join(lines_txt))
    print(f"\nEscrito: {out_csv.name}, {out_txt.name}")


if __name__ == "__main__":
    main()
