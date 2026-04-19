"""
Reverte no contrato a baixa correspondente ao gap contábil de R$ 1.082,50
(lotes 4, 27, 30, 34, 39 — quantidades do pedido duplicado não reconhecidas).

Para cada item: Saida -= qtd (mínimo 0); Estoque = Quantidade - Saida; Valor = Estoque * PU.
"""
from __future__ import annotations

import csv
import shutil
from pathlib import Path

REVERTER: dict[int, float] = {
    4: 100,
    27: 10,
    30: 50,
    34: 10,
    39: 50,
}


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


def main() -> None:
    root = Path(__file__).resolve().parent
    contrato = root / "contrato_25_2025_descricao_completa.csv"
    backup = root / "contrato_25_2025_descricao_completa_antes_reverter_1082.csv"
    shutil.copy2(contrato, backup)

    rows: list[list[str]] = []
    with contrato.open(encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f, delimiter=";")
        rows.append(next(r))
        for row in r:
            if len(row) < 9:
                continue
            item = int(row[0].strip())
            if item not in REVERTER:
                rows.append(row)
                continue
            qtd_c = br_float(row[5])
            saida = br_float(row[6])
            pu = br_float(row[4])
            rev = REVERTER[item]
            saida_nova = max(0.0, saida - rev)
            estoque_novo = qtd_c - saida_nova
            valor_novo = estoque_novo * pu
            new_row = row[:]
            new_row[6] = fmt_qty(saida_nova)
            new_row[7] = fmt_br_money(valor_novo)
            new_row[8] = fmt_qty(estoque_novo)
            rows.append(new_row)
            print(
                f"Item {item}: saida {saida:g} -> {saida_nova:g} | "
                f"valor R$ {br_float(row[7]):.2f} -> {valor_novo:.2f}"
            )

    with contrato.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL).writerows(rows)

    t = 0.0
    for row in rows[1:]:
        if len(row) >= 8 and row[0].strip().isdigit():
            t += br_float(row[7])
    print(f"Soma Valor_R$ apos ajuste: R$ {t:.2f}")
    print(f"Backup: {backup.name}")


if __name__ == "__main__":
    main()
