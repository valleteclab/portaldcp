#!/bin/bash
# First find the table name, then find contract 028/2023
TABLES=$(docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")
echo "Tables: $TABLES"

# Try common names
for T in contrato contratos modalidade_contrato modalidades_contrato contract contracts; do
  ID=$(docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp -t -A -c "SELECT id FROM $T WHERE numero_contrato LIKE '%028/2023%' LIMIT 1;" 2>/dev/null)
  if [ -n "$ID" ]; then
    echo "Found in table $T: $ID"
    echo ""
    echo "=== Debug empenhos 2026 ==="
    curl -s "http://localhost:3000/api/contratos/${ID}/empenhos-debug?ano=2026" | python3 -m json.tool
    break
  fi
done
