"""
Gera planilha de conciliação: pedido duplicado (69d9bc39e7352.csv) vs contrato migração.
Saída: conciliacao_pedido_duplicado.csv
"""
from __future__ import annotations

import csv
import re
from pathlib import Path


def br_float(s: str) -> float:
    s = (s or "").strip()
    if not s:
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def parse_pedido(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = next(csv.reader([line]))
            if len(r) < 4:
                continue
            desc = r[0]
            pu = float(r[1])
            qtd = float(r[2])
            valor = float(r[3])
            m = re.search(r"Lote:\.(\d+)", desc)
            lote = int(m.group(1)) if m else None
            rows.append(
                {
                    "lote": lote,
                    "pu_pedido": pu,
                    "qtd_pedido": qtd,
                    "valor_linha_pedido": valor,
                }
            )
    return rows


def load_migracao(path: Path) -> dict[int, dict]:
    by_item: dict[int, dict] = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f, delimiter=";")
        header = next(reader)
        for row in reader:
            if len(row) < 9:
                continue
            item = int(row[0].strip())
            by_item[item] = {
                "descricao": row[1],
                "marca": row[2],
                "pu_contrato": br_float(row[4]),
                "qtd_contratada": br_float(row[5]),
                "saida": br_float(row[6]),
                "valor_r_contrato": br_float(row[7]),
                "estoque_atual": br_float(row[8]),
            }
    return by_item


def main() -> None:
    root = Path(__file__).resolve().parent
    pedido_path = root / "69d9bc39e7352.csv"
    mig_path = root / "contrato_25_2025_descricao_completa.csv"
    out_csv = root / "conciliacao_pedido_duplicado.csv"

    pedido_rows = parse_pedido(pedido_path)
    mig = load_migracao(mig_path)

    total_pedido = sum(r["valor_linha_pedido"] for r in pedido_rows)
    valor_contab = 12473.65
    diff_sistema_contab = round(total_pedido - valor_contab, 2)

    out_rows: list[list] = []
    header = [
        "Item_Lote",
        "PU_pedido",
        "Qtd_pedido",
        "Valor_linha_pedido",
        "PU_contrato",
        "Qtd_contratada",
        "Saida",
        "Estoque_Atual_migracao",
        "Qtd_excedente_saldo",
        "Valor_excedente",
        "Pedido_sem_saldo_estoque_zero",
        "Descricao_migracao",
    ]
    out_rows.append(header)

    soma_excedente = 0.0
    flags_sem_saldo = []

    for r in pedido_rows:
        lid = r["lote"]
        if lid is None or lid not in mig:
            out_rows.append(
                [
                    lid or "",
                    r["pu_pedido"],
                    r["qtd_pedido"],
                    r["valor_linha_pedido"],
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "LOTE_NAO_ENCONTRADO",
                    "",
                ]
            )
            continue
        m = mig[lid]
        est = m["estoque_atual"]
        qtd_p = r["qtd_pedido"]
        exced_q = max(0.0, qtd_p - est)
        val_exc = round(exced_q * r["pu_pedido"], 2)
        soma_excedente += val_exc
        sem_saldo = est <= 0 and qtd_p > 0
        if sem_saldo:
            flags_sem_saldo.append(lid)

        out_rows.append(
            [
                lid,
                r["pu_pedido"],
                r["qtd_pedido"],
                r["valor_linha_pedido"],
                m["pu_contrato"],
                m["qtd_contratada"],
                m["saida"],
                est,
                round(exced_q, 4),
                val_exc,
                "SIM" if sem_saldo else "NAO",
                (m["descricao"][:200] + "…") if len(m["descricao"]) > 200 else m["descricao"],
            ]
        )

    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerows(out_rows)

    # Resumo no stderr para debug
    print(f"Total valor linhas pedido: {total_pedido:.2f}")
    print(f"Valor contabilidade (informado): {valor_contab:.2f}")
    print(f"Diferença sistema - contab: {diff_sistema_contab:.2f}")
    print(f"Soma valor excedente (qtd excedente x PU pedido): {soma_excedente:.2f}")
    print(f"Itens pedido com estoque=0 e qtd>0: {flags_sem_saldo}")
    print(f"Escrito: {out_csv.name}")


if __name__ == "__main__":
    main()
