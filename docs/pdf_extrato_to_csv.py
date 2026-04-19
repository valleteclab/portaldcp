#!/usr/bin/env python3
"""Extrai linhas de itens de Extrato de Contrato (PDF) para CSV."""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

import pdfplumber

# Números BR: 1.234,56 ou 42,40
NUM = re.compile(r"(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}")
ITEM_START = re.compile(r"^(\d+)\s+(.+)$")


def last_n_br_numbers(s: str, n: int = 7) -> tuple[list[str], str] | None:
    matches = list(NUM.finditer(s))
    if len(matches) < n:
        return None
    take = matches[-n:]
    vals = [m.group(0) for m in take]
    cut = take[0].start()
    return vals, s[:cut].rstrip()


def is_noise_line(line: str) -> bool:
    t = line.strip()
    if not t:
        return True
    if t == "DE":
        return True
    if t.startswith("-- ") and t.endswith(" --"):
        return True
    if t.startswith("CAMARA MUNICIPAL"):
        return True
    if t.startswith("RUA OCTOGONAL"):
        return True
    if t.startswith("LUIS EDUARDO MAGALH"):
        return True
    if t.startswith("EXTRATO DE CONTRATO"):
        return True
    return False


def extract_rows(pdf_path: Path) -> tuple[list[list[str]], str]:
    parts: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
    text = "\n".join(parts)
    lines = text.splitlines()

    meta = []
    for line in lines[:8]:
        if line.strip():
            meta.append(line.strip())

    in_table = False
    rows: list[list[str]] = []
    i = 0

    while i < len(lines):
        line = lines[i]
        if "Descrição" in line and "Marca" in line and "Preço" in line:
            in_table = True
            i += 1
            continue
        if not in_table:
            i += 1
            continue
        if "Total do Lote" in line or "Resultado do Grupo" in line:
            break
        if is_noise_line(line):
            i += 1
            continue

        m = ITEM_START.match(line.strip())
        if not m:
            i += 1
            continue

        item_num, rest = m.group(1), m.group(2)
        parsed = last_n_br_numbers(rest, 7)
        if not parsed:
            i += 1
            continue

        nums, desc_and_brand = parsed
        desc_parts = [desc_and_brand.strip()]
        i += 1
        while i < len(lines):
            nxt = lines[i]
            if ITEM_START.match(nxt.strip()):
                break
            if "Total do Lote" in nxt or "Resultado do Grupo" in nxt:
                break
            if is_noise_line(nxt):
                i += 1
                continue
            if "Descrição" in nxt and "Marca" in nxt:
                i += 1
                continue
            desc_parts.append(nxt.strip())
            i += 1

        descricao = re.sub(r"\s+", " ", " ".join(desc_parts)).strip()
        rows.append(
            [
                item_num,
                descricao,
                nums[0],
                nums[1],
                nums[2],
                nums[3],
                nums[4],
                nums[5],
                nums[6],
            ]
        )

    return rows, " | ".join(meta[:6])


def main() -> int:
    root = Path(__file__).resolve().parent
    pdf = root / "Extrato de Contrato_9c3641ada5bb2435dfa1da244689c545.pdf"
    if len(sys.argv) > 1:
        pdf = Path(sys.argv[1])
    if not pdf.is_file():
        print(f"PDF não encontrado: {pdf}", file=sys.stderr)
        return 1

    rows, meta = extract_rows(pdf)
    out = pdf.with_suffix(".csv")

    header = [
        "item",
        "descricao_marca_unidade",
        "preco_rs",
        "qtdade",
        "valor_inicial_rs",
        "saida",
        "saida_rs",
        "qtdade_atual",
        "valor_rs",
    ]

    with out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["# " + meta])
        w.writerow(header)
        w.writerows(rows)

    print(f"Linhas de itens: {len(rows)} → {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
