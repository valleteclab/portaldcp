#!/usr/bin/env python3
"""
Extrai texto de PDF - versão simples para Node.js chamar via exec
"""
import sys
import PyPDF2

def extrair_texto_pdf(caminho_pdf):
    try:
        with open(caminho_pdf, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            texto = ""
            for page in reader.pages:
                texto += page.extract_text() + "\n"
            return texto.strip()
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python extrair_texto_pdf.py <caminho_pdf>", file=sys.stderr)
        sys.exit(1)
    
    caminho = sys.argv[1]
    texto = extrair_texto_pdf(caminho)
    print(texto)
