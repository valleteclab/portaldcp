"""
Aplica o pedido do contrato duplicado (69d9bc39e7352.csv) sobre o contrato:
- Para cada Lote, aumenta Saida na quantidade pedida, limitada ao estoque disponível
  (não ultrapassa Quantidade contratada).
- Recalcula Estoque_Atual = Quantidade - Saida
- Recalcula Valor_R$ = Estoque_Atual * Preco_Unitario

Backup do CSV atual antes de sobrescrever.
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


def fmt_qty(val: float) -> str:
    if abs(val - round(val)) < 1e-6:
        return str(int(round(val)))
    return f"{val:.2f}".replace(".", ",")


def parse_pedido_duplicado(path: Path) -> dict[int, float]:
    """Lote -> quantidade total pedida (soma se repetir lote)."""
    acc: dict[int, float] = {}
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
            qtd = float(r[2])
            acc[lote] = acc.get(lote, 0.0) + qtd
    return acc


def main() -> None:
    root = Path(__file__).resolve().parent
    contrato = root / "contrato_25_2025_descricao_completa.csv"
    pedido_dup = root / "69d9bc39e7352.csv"
    backup = root / "contrato_25_2025_descricao_completa_antes_pedido_duplicado.csv"

    pedido = parse_pedido_duplicado(pedido_dup)
    shutil.copy2(contrato, backup)
    print(f"Backup: {backup.name}")

    rows_out: list[list[str]] = []
    with contrato.open(encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f, delimiter=";")
        header = next(r)
        rows_out.append(header)

        total_antes = 0.0
        total_depois = 0.0
        alterados = []

        for row in r:
            if len(row) < 9:
                continue
            item = int(row[0].strip())
            qtd_c = br_float(row[5])
            saida = br_float(row[6])
            pu = br_float(row[4])
            vr_antes = br_float(row[7])
            total_antes += vr_antes

            if item not in pedido:
                rows_out.append(row)
                total_depois += vr_antes
                continue

            q_ped = pedido[item]
            estoque_disp = max(0.0, qtd_c - saida)
            extra = min(q_ped, estoque_disp)
            saida_nova = saida + extra
            estoque_novo = qtd_c - saida_nova
            valor_novo = estoque_novo * pu

            total_depois += valor_novo

            new_row = row[:]
            new_row[6] = fmt_qty(saida_nova)
            new_row[7] = fmt_br_money(valor_novo)
            new_row[8] = fmt_qty(estoque_novo)
            rows_out.append(new_row)

            if extra > 0:
                alterados.append(
                    (item, q_ped, extra, saida, saida_nova, vr_antes, valor_novo)
                )

    with contrato.open("w", encoding="utf-8", newline="") as f:
        csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL).writerows(rows_out)

    print(f"Pedido duplicado: {pedido_dup.name} ({len(pedido)} lotes com quantidade)")
    print(f"Soma Valor_R$ antes: R$ {total_antes:.2f}")
    print(f"Soma Valor_R$ depois: R$ {total_depois:.2f}")
    print(f"Reducao total saldo (R$): {total_antes - total_depois:.2f}")
    print(f"Itens com baixa aplicada: {len(alterados)}")
    for t in alterados[:25]:
        item, q_ped, extra, sa, sa_n, vr_a, vr_n = t
        print(
            f"  Item {item}: pedido {q_ped:g} un, baixa {extra:g} | "
            f"saida {sa:g}->{sa_n:g} | valor R$ {vr_a:.2f}->{vr_n:.2f}"
        )
    if len(alterados) > 25:
        print(f"  ... e mais {len(alterados) - 25} itens")
    print(f"Atualizado: {contrato.name}")


if __name__ == "__main__":
    main()
