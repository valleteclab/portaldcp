#!/bin/bash
# Find contract 028/2023 and call debug endpoint
CONTRACT_ID=$(docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp -t -A -c "SELECT id FROM modalidades_contrato WHERE numero_contrato LIKE '%028/2023%' LIMIT 1;")
echo "Contract ID: $CONTRACT_ID"

if [ -n "$CONTRACT_ID" ]; then
  echo ""
  echo "=== Debug empenhos 2026 ==="
  curl -s "http://localhost:3000/api/contratos/${CONTRACT_ID}/empenhos-debug?ano=2026" | python3 -m json.tool
fi
