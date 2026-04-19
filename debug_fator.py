#!/usr/bin/env python3
"""Debug: fetch raw HTML from Fator Transparencia and extract Nº Empenho fields"""
import re, sys, json, urllib.request, urllib.parse

# Get org ID from system_config
# Hardcoded for debug - we'll use the API
BASE_URL = "https://transparencia.fator.gov.br/index.php"

# First get the org ID via the backend API
resp = urllib.request.urlopen("http://localhost:3000/api/contratos?limit=500")
data = json.loads(resp.read())
lst = data if isinstance(data, list) else data.get("data", [])
contrato_id = None
cnpj = None
for c in lst:
    if "028/2023" in c.get("numero_contrato", ""):
        contrato_id = c["id"]
        cnpj = c.get("fornecedor_cnpj", "")
        print(f"Contrato: {c['numero_contrato']}, ID: {contrato_id}, CNPJ: {cnpj}")
        break

if not contrato_id:
    print("Contrato 028/2023 nao encontrado")
    sys.exit(1)

# Now fetch the Fator page directly for 2026
params = {
    "id": "92",  # FATOR_TRANSPARENCIA_ID - may need adjustment
    "unidade_gestora": 1,
    "tipo": -1,
    "fornecedor": "",
    "cpfcnpj": cnpj.replace(".", "").replace("/", "").replace("-", "") if cnpj else "",
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
print(f"\nFetching: {url[:150]}...")

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

# Extract all dialog blocks and look for Nº Empenho
dialog_pattern = re.compile(r"<div id='(dialog_\d+)'[^>]*>([\s\S]*?)(?=<div id='dialog_\d+'|$)", re.IGNORECASE)
for m in dialog_pattern.finditer(html):
    dialog_id = m.group(1)
    content = m.group(2)
    
    # Extract Nº Empenho
    emp_match = re.search(r"Nº Empenho:&nbsp;</strong>([^<]+)", content)
    liq_match = re.search(r"Nº Liquidação:&nbsp;</strong>([^<]+)", content)
    fase_match = re.search(r"<strong>Fase:</strong>\s*([^<]+)", content)
    
    emp_num = emp_match.group(1).strip() if emp_match else ""
    liq_num = liq_match.group(1).strip() if liq_match else ""
    fase = fase_match.group(1).strip() if fase_match else ""
    
    # Also check raw content around "Nº Empenho"
    emp_raw_start = content.find("Nº Empenho")
    emp_raw = content[emp_raw_start:emp_raw_start+80] if emp_raw_start >= 0 else "NOT FOUND"
    
    print(f"\n{dialog_id}: fase={fase}, NºEmpenho='{emp_num}', NºLiq='{liq_num}'")
    if not emp_num:
        print(f"  RAW around Nº Empenho: {emp_raw[:80]}")

# Also show table rows
row_pattern = re.compile(r"<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(dialog_\d+)</td>\s*</tr>", re.DOTALL)
print("\n=== TABLE ROWS 2026 ===")
for m in row_pattern.finditer(html):
    data, nproc, fase, credor, valor, dialog = m.groups()
    fase_clean = re.sub(r'<[^>]+>', '', fase).strip()
    print(f"  {data.strip()} | {fase_clean} | {valor.strip()} | {dialog}")
