"""
Remove efeito do pedido 000358 (69d9c069e7448.csv) do contrato:
- Reduz Saida nas qtds do pedido
- Recalcula Estoque_Atual = Quantidade - Saida
- Recalcula Valor_R$ = Estoque_Atual * Preco_Unitario

Gera backup e sobrescreve contrato_25_2025_descricao_completa.csv
"""
from __future__ import annotations

import csv
import re
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


def fmt_br_qty(val: float) -> str:
    if abs(val - round(val)) < 1e-6:
        return str(int(round(val)))
    return f"{val:.2f}".replace(".", ",")


def parse_pedido_qtd(path: Path) -> dict[int, float]:
    """Lote -> quantidade pedida"""
    out: dict[int, float] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = next(csv.reader([line]))
            if len(row) < 4:
                continue
            m = re.search(r"Lote:\.(\d+)", row[0])
            if not m:
                continue
            lote = int(m.group(1))
            qtd = float(row[2])
            out[lote] = qtd
    return out


def main() -> None:
    root = Path(__file__).resolve().parent
    contrato = root / "contrato_25_2025_descricao_completa.csv"
    pedido = root / "69d9c069e7448.csv"
    backup = root / "contrato_25_2025_descricao_completa_antes_ajuste_pedido_1488.csv"

    revert = parse_pedido_qtd(pedido)
    # validar soma pedido
    rows_in = []
    with contrato.open(encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f, delimiter=";")
        header = next(r)
        for row in r:
            if len(row) < 9:
                continue
            rows_in.append(row)

    chk = 0.0
    for lot, q in revert.items():
        for row in rows_in:
            if int(row[0]) == lot:
                pu = br_float(row[4])
                chk += q * pu
                break
    print(f"Pedido: itens {sorted(revert.keys())}, soma R$ {chk:.2f} (esperado 1488.00)")

    shutil.copy2(contrato, backup)
    print(f"Backup: {backup.name}")

    out_rows = [header]
    for row in rows_in:
        item = int(row[0])
        if item not in revert:
            out_rows.append(row)
            continue
        qtd_c = br_float(row[5])
        saida = br_float(row[6])
        pu = br_float(row[4])
        rev = revert[item]
        saida_nova = max(0.0, saida - rev)
        estoque_novo = qtd_c - saida_nova
        valor_novo = estoque_novo * pu
        new_row = row[:]
        new_row[6] = fmt_br_qty(saida_nova)
        new_row[7] = fmt_br_money(valor_novo)
        new_row[8] = fmt_br_qty(estoque_novo)
        out_rows.append(new_row)
        print(
            f"  Item {item}: saida {saida} -> {saida_nova}, "
            f"estoque {br_float(row[8])} -> {estoque_novo}, "
            f"valor R$ {br_float(row[7]):.2f} -> {valor_novo:.2f}"
        )

    with contrato.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        w.writerows(out_rows)

    print(f"Atualizado: {contrato.name}")


if __name__ == "__main__":
    main()
