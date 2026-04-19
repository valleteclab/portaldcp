"""
Alinha soma Valor_R$ ao disponivel contabil: R$ 42.159,50.

Formula: 54.633,15 (pos reverte 1488) - 12.473,65 (pedido duplicado contabil) = 42.159,50.

O script do pedido duplicado reduz ~11.648,00; falta reduzir mais R$ 825,65 sobre o estado
apos uma aplicacao do duplicado (ex.: contrato_25_2025_descricao_completa_antes_reverter_1082.csv).

Este script:
1. Parte do CSV de entrada (default: backup pos-duplicado, sem reverter gap 1082)
2. Aumenta Saida em itens com estoque ate reduzir exatamente 825,65 em Valor_R$ (DP em centavos)
3. Sobrescreve contrato_25_2025_descricao_completa.csv

Se nao houver decomposicao exata em unidades inteiras, aborta com erro.
"""
from __future__ import annotations

import csv
import shutil
from pathlib import Path


def br_float(s: str) -> float:
    s = (s or "").strip()
    if not s:
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def fmt_br_money(val: float) -> str:
    s = f"{float(val):.2f}"
    ip, fp = s.split(".", 1)
    neg = ip.startswith("-")
    if neg:
        ip = ip[1:]
    rev = ip[::-1]
    grouped = ".".join(rev[i : i + 3] for i in range(0, len(rev), 3))[::-1]
    if neg:
        grouped = "-" + grouped
    return f"{grouped},{fp}"


def fmt_qty(val: float) -> str:
    if abs(val - round(val)) < 1e-6:
        return str(int(round(val)))
    return f"{val:.2f}".replace(".", ",")


def find_exact_extra_saida(
    items: list[tuple[int, int, int]], target_cents: int
) -> dict[int, int] | None:
    """
    items: (item, pu_cents, max_extra_units)
    Returns dict item -> extra units or None.
    """
    pred: dict[int, tuple[int, int, int] | None] = {0: None}
    for item, c, max_u in items:
        new = dict(pred)
        for s in sorted(pred.keys()):
            for u in range(1, max_u + 1):
                ns = s + u * c
                if ns > target_cents:
                    break
                if ns not in new:
                    new[ns] = (s, item, u)
        pred = new
        if target_cents in pred:
            break
    if target_cents not in pred:
        return None
    alloc: dict[int, int] = {}
    s = target_cents
    while s > 0:
        prev, it, u = pred[s]  # type: ignore[misc]
        alloc[it] = alloc.get(it, 0) + u
        s = prev
    return alloc


def main() -> None:
    root = Path(__file__).resolve().parent
    entrada = root / "contrato_25_2025_descricao_completa_antes_reverter_1082.csv"
    contrato_out = root / "contrato_25_2025_descricao_completa.csv"
    backup = root / "contrato_25_2025_descricao_completa_antes_alinhar_42159.csv"

    reducao_centavos = 82565  # R$ 825,65

    rows: list[list[str]] = []
    with entrada.open(encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f, delimiter=";")
        rows.append(next(r))
        for row in r:
            if len(row) < 9:
                continue
            rows.append(row)

    dp_items: list[tuple[int, int, int]] = []
    for row in rows[1:]:
        item = int(row[0].strip())
        pu = br_float(row[4])
        qtd_c = br_float(row[5])
        saida = br_float(row[6])
        est = qtd_c - saida
        c = int(round(pu * 100))
        if est <= 0 or c <= 0:
            continue
        max_extra = int(round(est - 1e-6))
        if max_extra <= 0:
            continue
        dp_items.append((item, c, max_extra))

    alloc = find_exact_extra_saida(dp_items, reducao_centavos)
    if alloc is None:
        raise SystemExit(
            "Nao foi possivel decompor 825,65 em unidades inteiras com estoques atuais."
        )

    shutil.copy2(entrada, backup)
    print(f"Backup: {backup.name}")

    total_antes = 0.0
    for row in rows[1:]:
        if len(row) >= 8 and row[0].strip().isdigit():
            total_antes += br_float(row[7])

    total_depois = 0.0
    for row in rows[1:]:
        if len(row) < 9 or not row[0].strip().isdigit():
            continue
        item = int(row[0].strip())
        vr_antes = br_float(row[7])
        if item not in alloc:
            total_depois += vr_antes
            continue
        qtd_c = br_float(row[5])
        saida = br_float(row[6])
        pu = br_float(row[4])
        ex = alloc[item]
        saida_nova = saida + ex
        est_novo = qtd_c - saida_nova
        valor_novo = est_novo * pu
        total_depois += valor_novo
        row[6] = fmt_qty(saida_nova)
        row[7] = fmt_br_money(valor_novo)
        row[8] = fmt_qty(est_novo)
        print(f"Item {item}: +{ex} saida | valor R$ {vr_antes:.2f} -> {valor_novo:.2f}")

    # fix print: we mutated row in place - need vr before
    print(f"Soma Valor_R$ antes: R$ {total_antes:.2f}")
    print(f"Soma Valor_R$ depois: R$ {total_depois:.2f}")
    print(f"Reducao: R$ {total_antes - total_depois:.2f} (meta 825,65)")

    with contrato_out.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL).writerows(rows)

    print(f"Meta 42.159,50: {'OK' if abs(total_depois - 42159.50) < 0.02 else 'VERIFICAR'}")
    print(f"Atualizado: {contrato_out.name}")


if __name__ == "__main__":
    main()
