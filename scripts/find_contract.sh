#!/bin/bash
docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp -t -A -c "SELECT id FROM contrato WHERE numero_contrato LIKE '%028/2023%' LIMIT 1"
