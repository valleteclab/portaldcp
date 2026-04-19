"""
Simula quais itens (coluna Valor_R$) podem somar R$ 1.488,00 — alvo: diferença
contábil (54.633,15 - 53.145,15). Uso: python simular_soma_1488.py
"""
from __future__ import annotations

import csv
from pathlib import Path


def br_float(s: str) -> float:
    s = (s or "").strip()
    if not s:
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def main() -> None:
    root = Path(__file__).resolve().parent
    path = root / "contrato_25_2025_descricao_completa.csv"
    target = 1488.0
    target_cents = int(round(target * 100))

    rows: list[tuple[int, float, str]] = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader)
        for row in reader:
            if len(row) < 8:
                continue
            item = int(row[0].strip())
            vr = br_float(row[7])
            desc = row[1][:70] + "…" if len(row[1]) > 70 else row[1]
            rows.append((item, vr, desc))

    # Só linhas com valor remanescente > 0 (centavos)
    items: list[tuple[int, int, float, str]] = []
    for item, vr, desc in rows:
        c = int(round(vr * 100))
        if c > 0:
            items.append((item, c, vr, desc))

    # Subset sum DP com recuperação de uma solução
    pred: list[int] = [-1] * (target_cents + 1)
    pred[0] = -2
    for j, (item, c, vr, desc) in enumerate(items):
        if c > target_cents:
            continue
        for s in range(target_cents, c - 1, -1):
            if pred[s - c] != -1 and pred[s] == -1:
                pred[s] = j

    print(f"Alvo: R$ {target:.2f} ({target_cents} centavos)")
    print(f"Itens com Valor_R$ > 0: {len(items)}")
    print()

    if pred[target_cents] == -1:
        print("Não existe combinação EXATA (soma dos Valor_R$ em centavos) = alvo.")
        print("Buscando combinações aproximadas (até ±1 centavo) com poucos itens…")
        # Pares
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                s_cents = items[i][1] + items[j][1]
                if abs(s_cents - target_cents) <= 1:
                    print(
                        f"  Par: {items[i][0]} + {items[j][0]} = "
                        f"{(items[i][2] + items[j][2]):.2f}"
                    )
        # Trios
        nfound = 0
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                for k in range(j + 1, len(items)):
                    s_cents = items[i][1] + items[j][1] + items[k][1]
                    if abs(s_cents - target_cents) <= 1:
                        tot = items[i][2] + items[j][2] + items[k][2]
                        print(
                            f"  Trio: {items[i][0]} + {items[j][0]} + {items[k][0]} = {tot:.2f}"
                        )
                        nfound += 1
                        if nfound >= 30:
                            break
                if nfound >= 30:
                    break
            if nfound >= 30:
                break
        return

    # Recuperar solução
    sol_idx: list[int] = []
    s = target_cents
    while s > 0:
        j = pred[s]
        if j < 0:
            break
        sol_idx.append(j)
        s -= items[j][1]

    print("Pelo menos UMA combinação de linhas (Valor_R$) soma exatamente o alvo:")
    total = 0.0
    for j in reversed(sol_idx):
        item, c, vr, desc = items[j]
        total += vr
        print(f"  Item {item:3d}: R$ {vr:10.2f}  | {desc}")
    print(f"  Soma: R$ {total:.2f}")

    # Encontrar mais soluções (limitado): backtracking com poda
    print()
    print("Outras combinações (até 15), busca em profundidade com limite de itens:")
    solutions: list[list[int]] = []
    items_sorted = sorted(enumerate(items), key=lambda x: -x[1][1])  # maior c primeiro

    def dfs(start: int, rem: int, chosen: list[int]) -> None:
        if rem == 0 and chosen:
            solutions.append(chosen.copy())
            return
        if rem < 0 or len(solutions) >= 15:
            return
        if len(chosen) > 12:
            return
        for idx in range(start, len(items)):
            it, c, vr, d = items[idx]
            if c <= rem:
                chosen.append(idx)
                dfs(idx + 1, rem - c, chosen)
                chosen.pop()
                if len(solutions) >= 15:
                    return

    dfs(0, target_cents, [])
    seen: set[frozenset[int]] = set()
    for sol in solutions:
        key = frozenset(sol)
        if key in seen:
            continue
        seen.add(key)
        tot = sum(items[i][2] for i in sol)
        its = "+".join(str(items[i][0]) for i in sol)
        print(f"  Itens [{its}] = R$ {tot:.2f} ({len(sol)} linhas)")

    print()
    print(
        "Nota: Valor_R$ no CSV e saldo remanescente POR ITEM; a diferenca 1488 "
        "entre totais contabil e sistema nem sempre e soma de linhas inteiras "
        "(NF parcial, rateio, etc.). CSVs dos pedidos cruzam quantidade x PU."
    )


if __name__ == "__main__":
    main()
