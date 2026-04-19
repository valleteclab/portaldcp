#!/usr/bin/env python3
import json, sys, urllib.request

# Get contract ID for 028/2023
url = "http://localhost:3000/api/contratos?limit=500"
resp = urllib.request.urlopen(url)
data = json.loads(resp.read())
lst = data if isinstance(data, list) else data.get("data", [])
contrato_id = None
for c in lst:
    if "028/2023" in c.get("numero_contrato", ""):
        contrato_id = c["id"]
        print(f"Contrato: {c['numero_contrato']} -> ID: {contrato_id}")
        break

if not contrato_id:
    print("Contrato 028/2023 nao encontrado")
    sys.exit(1)

# Get empenhos
url2 = f"http://localhost:3000/api/contratos/{contrato_id}/empenhos"
resp2 = urllib.request.urlopen(url2)
data2 = json.loads(resp2.read())
empenhos = data2.get("empenhos", data2)

# Filter EMPENHO phase from 2026
print("\n=== EMPENHOS (fase EMPENHO) com data 2026 ===")
for e in empenhos:
    if e.get("fase_tipo") != "EMPENHO":
        continue
    data_str = e.get("data", "")
    if "2026" not in data_str:
        continue
    print(json.dumps({
        "numero_empenho": e.get("numero_empenho"),
        "numero_liquidacao": e.get("numero_liquidacao"),
        "data": data_str,
        "valor": e.get("valor"),
        "valor_formatado": e.get("valor_formatado"),
        "fase": e.get("fase"),
        "credor": e.get("credor"),
    }, ensure_ascii=False))

# Also check all phases for 2026
print("\n=== TODOS os registros 2026 ===")
for e in empenhos:
    data_str = e.get("data", "")
    if "2026" not in data_str:
        continue
    print(json.dumps({
        "numero_empenho": e.get("numero_empenho"),
        "numero_liquidacao": e.get("numero_liquidacao"),
        "data": data_str,
        "fase_tipo": e.get("fase_tipo"),
        "valor": e.get("valor"),
        "credor": e.get("credor"),
    }, ensure_ascii=False))

# Check grupos_exercicio
print("\n=== GRUPOS EXERCICIO 2026 ===")
grupos = data2.get("grupos_exercicio", [])
for g in grupos:
    if g.get("ano") != 2026:
        continue
    print(f"Ano: {g.get('ano')}, Empenhos positivos: {len(g.get('empenhos_positivos', []))}")
    for ep in g.get("empenhos_positivos", []):
        print(f"  numero_empenho: '{ep.get('numero_empenho', '')}', data: {ep.get('data')}, valor: {ep.get('valor')}")
    for comp in g.get("empenhos_compostos", []):
        print(f"  Composto numero_empenho: '{comp.get('numero_empenho', '')}', saldo_a_liquidar: {comp.get('saldo_a_liquidar')}")
