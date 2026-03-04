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
    Tenta compras primeiro, depois serviços.
    """
    # Tentar compras primeiro
    itens = parsear_itens_compras(texto)
    if itens:
        return itens
    
    # Se não encontrou, tentar serviços
    return parsear_itens_servicos(texto)


def parsear_itens_compras(texto: str) -> list:
    """
    Parseia itens de COMPRAS.
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
                r"^DE\s+[\d.,]+\s+[\d.,]+$",
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
                    "descricao": descricao or f"Item {numero_item}",
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


def parsear_itens_servicos(texto: str) -> list:
    """
    Parseia itens de SERVICOS de tabelas tipo:
    ITEM | DESCRICAO | UNIDADE | QUANT. | VALOR TOTAL
    
    Suporta descricao em multiplas linhas.
    """
    itens = []
    linhas = texto.split("\n")
    
    i = 0
    while i < len(linhas):
        linha = linhas[i].strip()
        
        # Procurar linha que começa com numero de item seguido de descricao
        # Padrao: "1 Elaboracao..." ou "1  Elaboracao..."
        match_inicio = re.match(r'^(\d+)\s+(.+)', linha)
        
        if match_inicio:
            num_item = int(match_inicio.group(1))
            descricao = match_inicio.group(2).strip()
            
            # Verificar se nesta mesma linha ja tem UNIDADE/QUANT/VALOR
            # Padrao: descricao...UNIDADE 01 R$ 85.000,00
            match_completo = re.search(
                r'(.*?)\s+(UNIDADE|UN|SERVICO|MESES|HORAS|DIAS|CONTRATO|GLOBAL)\s+(\d+(?:,\d+)?)\s+R?\$?\s*([\d.,]+(?:,\d{2})?)$',
                descricao, re.IGNORECASE
            )
            
            if match_completo:
                # Tudo na mesma linha
                desc = match_completo.group(1).strip()
                unidade = match_completo.group(2).upper()
                quant = parse_valor(match_completo.group(3))
                valor = parse_valor(match_completo.group(4))
                
                itens.append({
                    "numero_item": num_item,
                    "descricao": desc[:2000],
                    "marca": None,
                    "unidade_medida": unidade,
                    "valor_unitario": round(valor / quant, 2) if quant > 0 else valor,
                    "quantidade_contratada": int(quant) if quant == int(quant) else quant,
                })
            else:
                # Descricao continua nas proximas linhas
                # Acumular ate encontrar uma linha com UNIDADE/QUANT/VALOR
                descricao_acumulada = [descricao]
                j = i + 1
                encontrado = False
                
                while j < len(linhas) and j < i + 20:  # limite de 20 linhas
                    linha_seguinte = linhas[j].strip()
                    
                    # Verificar se esta linha contem UNIDADE/QUANT/VALOR
                    match_fim = re.search(
                        r'(.*?)\s+(UNIDADE|UN|SERVICO|MESES|HORAS|DIAS|CONTRATO|GLOBAL)\s+(\d+(?:,\d+)?)\s+R?\$?\s*([\d.,]+(?:,\d{2})?)',
                        linha_seguinte, re.IGNORECASE
                    )
                    
                    if match_fim:
                        # Se tem conteudo antes da unidade, adicionar a descricao
                        antes = match_fim.group(1).strip()
                        if antes and not any(x in antes.upper() for x in ['CNPJ', 'RUA ', 'CONTABILIZADO', 'R$ ']):
                            descricao_acumulada.append(antes)
                        
                        unidade = match_fim.group(2).upper()
                        quant = parse_valor(match_fim.group(3))
                        valor = parse_valor(match_fim.group(4))
                        
                        desc_final = ' '.join(descricao_acumulada)
                        desc_final = re.sub(r'\s+', ' ', desc_final).strip()
                        
                        itens.append({
                            "numero_item": num_item,
                            "descricao": desc_final[:2000],
                            "marca": None,
                            "unidade_medida": unidade,
                            "valor_unitario": round(valor / quant, 2) if quant > 0 else valor,
                            "quantidade_contratada": int(quant) if quant == int(quant) else quant,
                        })
                        encontrado = True
                        i = j  # Avancar para esta linha
                        break
                    else:
                        # Adicionar a descricao se nao for linha de header/ruido
                        if linha_seguinte and not any(x in linha_seguinte.upper() for x in 
                            ['CNPJ', 'RUA ', 'CONTABILIZADO', 'TEL:', 'WWW.', 'HTTP', 'CLÁUSULA', 
                             'ITEM ', 'TOTAL', 'REGISTRO', 'PAGINA', 'DATA:', 'ASSINATURA']):
                            descricao_acumulada.append(linha_seguinte)
                    
                    j += 1
        
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
