#!/usr/bin/env python3
"""
Extrai itens de um Extrato de Contrato (PDF) e gera JSON para importacao.

Uso:
  python extrair_itens_extrato_pdf.py <caminho_pdf> [--output saida.json]
  python extrair_itens_extrato_pdf.py "Extrato de Contrato_xxx.pdf"

O JSON gerado pode ser enviado para:
  POST /api/almoxarifado/contratos/:contratoId/itens/importar
  Body: { "itens": [...] }
"""

import json
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader


def extrair_texto_pdf(caminho: str) -> str:
    """Extrai texto de todas as paginas do PDF."""
    return "\n".join((p.extract_text() or "") for p in PdfReader(caminho).pages)


def parse_valor(s: str) -> float:
    """Converte '1.300,00' ou '25,00' para float."""
    s = str(s).strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parsear_itens(texto: str) -> list:
    """
    Parseia o texto do extrato e extrai itens.
    Padrao: 0,00  0,00  [preco] [qtd]  [marca]  [valor_total]  UNIDA
    """
    itens = []
    padrao_linha = re.compile(
        r"0,00\s+0,00\s+"
        r"([\d.,]+)\s+([\d.,]+)\s+"
        r"([A-Za-z0-9\s]+?)\s+"
        r"([\d.,]+)"
    )

    linhas = texto.split("\n")
    descricao_buffer = []
    numero_item = 0

    i = 0
    while i < len(linhas):
        linha = linhas[i]
        m = padrao_linha.search(linha)
        if m:
            preco_str, qtd_str, marca, valor_total_str = m.groups()
            preco = parse_valor(preco_str)
            qtd = parse_valor(qtd_str)
            valor_total = parse_valor(valor_total_str)
            marca = marca.strip()

            desc_partes = []
            skip_patterns = [
                r"^Lote\s*:", r"^Descricao", r"^[IÍ]tem\s+Sa[ií]da", r"^--\s*\d+\s+of\s+\d+",
                r"^EXTRATO DE CONTRATO", r"^Resultado do Grupo", r"^Total do Lote",
                r"^Saldo do Contrato", r"^Valor total", r"^Registros:",
                r"^\d{2}/\d{2}/\d{4}\s+VALLETECLAB", r"^Licitacao\s*:", r"^Fornecedor\s*:",
                r"^\d{2}/\d{4}\s+CONTRATO", r"^Saida\s+Marca", r"^Qtdade\s+Valor",
                r"^Preco\s+R\$\s+Qtdade", r"^null\s*$", r"^Und\s*$",
                r"^DE\s+[\d.,]+\s+[\d.,]+$",  # linha "DE 5,00 1.250,00"
            ]
            for j in range(len(descricao_buffer) - 1, -1, -1):
                d = descricao_buffer[j].strip()
                if not d or re.match(r"^0,00\s+0,00", d):
                    continue
                if any(re.match(p, d, re.I) for p in skip_patterns):
                    break
                desc_partes.insert(0, d)
            descricao = " ".join(desc_partes).strip() if desc_partes else ""

            # Remover residuos "DE X,XX Y.YYY,YY" do inicio/fim
            descricao = re.sub(r"^DE\s+[\d.,]+\s+[\d.,]+\s*", "", descricao)
            descricao = re.sub(r"\s+DE\s+[\d.,]+\s+[\d.,]+\s*$", "", descricao)
            descricao = re.sub(r"\s+", " ", descricao)
            descricao = descricao[:2000]

            if descricao or (preco > 0 and qtd > 0):
                numero_item += 1
                qtd_val = int(qtd) if qtd == int(qtd) else round(qtd, 2)
                itens.append({
                    "numero_item": numero_item,
                    "descricao": descricao or "Item " + str(numero_item),
                    "marca": marca or None,
                    "unidade_medida": "UNIDADE",
                    "valor_unitario": round(preco, 2),
                    "quantidade_contratada": qtd_val,
                })

            descricao_buffer = []
        else:
            if "Total do Lote" not in linha and "Resultado do Grupo" not in linha:
                if linha.strip() and not re.match(r"^--\s*\d+\s+of", linha):
                    descricao_buffer.append(linha)
        i += 1

    return itens


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nExemplo: python extrair_itens_extrato_pdf.py docs/contratos/Extrato_de_Contrato_xxx.pdf")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    output_path = None
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = Path(sys.argv[idx + 1])

    if not pdf_path.exists():
        print("Arquivo nao encontrado: " + str(pdf_path), file=sys.stderr)
        sys.exit(1)

    print("Extraindo texto de " + str(pdf_path) + "...", file=sys.stderr)
    texto = extrair_texto_pdf(str(pdf_path))
    print("Texto extraido: " + str(len(texto)) + " caracteres", file=sys.stderr)

    itens = parsear_itens(texto)
    print("Itens extraidos: " + str(len(itens)), file=sys.stderr)

    if not itens:
        print("Nenhum item extraido. Verifique o formato do PDF.", file=sys.stderr)
        sys.exit(1)

    resultado = {"itens": itens}

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print("JSON salvo em: " + str(output_path), file=sys.stderr)
    else:
        output_path = pdf_path.with_suffix(".itens.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print("JSON salvo em: " + str(output_path), file=sys.stderr)

    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
