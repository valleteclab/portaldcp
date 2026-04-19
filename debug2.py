#!/usr/bin/env python3
"""Debug: fetch raw HTML from Fator Transparencia for 2026 and check Nº Empenho"""
import re, sys, json, urllib.request, urllib.parse

BASE_URL = "https://transparencia.fator.gov.br/index.php"
CNPJ = "24393499000102"  # E R SILVA DE BRITO from contract 028/2023

params = {
    "id": "92",
    "unidade_gestora": 1,
    "tipo": -1,
    "fornecedor": "",
    "cpfcnpj": CNPJ,
    "data_publicacao": "01/01/2026",
    "data_publicacao_fim": "31/12/2026",
    "Numero": "",
    "NProcesso": "",
    "funcao": -1,
    "subfuncao": -1,
    "Despesa": "",
    "Historico": "",
    "fonte": -1,
    "acao": -1,
    "Valor": "",
    "modalidade": -1,
    "Categoria_Economica": -1,
    "Grupo_Despesa": -1,
    "Modalidade_Aplicacao": -1,
    "Elemento": -1,
    "Subelemento": -1,
    "nContrato": "",
    "ano": 2026,
}

url = BASE_URL + "?" + urllib.parse.urlencode(params)
print(f"Fetching Fator Transparencia 2026...")

try:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; PortalDCP/1.0)",
        "Accept": "text/html,application/xhtml+xml",
    })
    resp = urllib.request.urlopen(req, timeout=20)
    html = resp.read().decode("utf-8", errors="replace")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

print(f"HTML length: {len(html)} chars")

# Extract all dialog blocks
dialog_pattern = re.compile(r"<div id='(dialog_\d+)'[^>]*title='Detalhe da Despesa'[^>]*>([\s\S]*?)(?=<div id='dialog_\d+'|$)", re.IGNORECASE)
dialogs = list(dialog_pattern.finditer(html))
print(f"Found {len(dialogs)} dialogs")

for m in dialogs:
    dialog_id = m.group(1)
    content = m.group(2)
    
    # Extract Nº Empenho with multiple patterns
    emp_match1 = re.search(r"Nº Empenho:&nbsp;</strong>(\d+)", content)
    emp_match2 = re.search(r"Nº Empenho:\s*</strong>\s*([^<]+)", content)
    emp_match3 = re.search(r"N.*Empenho.*?</strong>\s*([^<]+)", content)
    
    liq_match = re.search(r"Nº Liquidação:&nbsp;</strong>(\d+)", content)
    
    # Show raw around Nº Empenho
    emp_idx = content.find("Empenho")
    raw = content[emp_idx:emp_idx+100] if emp_idx >= 0 else "NOT FOUND"
    
    emp_num = emp_match1.group(1) if emp_match1 else (emp_match2.group(1).strip() if emp_match2 else "")
    liq_num = liq_match.group(1) if liq_match else ""
    
    print(f"\n{dialog_id}: NºEmpenho='{emp_num}', NºLiq='{liq_num}'")
    if not emp_num:
        print(f"  Pattern2: '{emp_match2.group(1).strip() if emp_match2 else 'N/A'}'")
        print(f"  Pattern3: '{emp_match3.group(1).strip() if emp_match3 else 'N/A'}'")
        print(f"  RAW: {raw[:100]}")

# Also show table rows
row_pattern = re.compile(r"<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(dialog_\d+)</td>\s*</tr>", re.DOTALL)
print("\n=== TABLE ROWS 2026 ===")
for m in row_pattern.finditer(html):
    data, nproc, fase, credor, valor, dialog = m.groups()
    fase_clean = re.sub(r'<[^>]+>', '', fase).strip()
    print(f"  {data.strip()} | {fase_clean} | {valor.strip()} | {dialog}")
