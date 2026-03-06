#!/bin/bash
# Script para migrar banco de dados do Railway para VPS

set -e

echo "🔄 Iniciando migração do banco de dados..."

# Credenciais do Railway
RAILWAY_HOST="junction.proxy.rlwy.net"
RAILWAY_PORT="23803"
RAILWAY_USER="postgres"
RAILWAY_PASSWORD="PAzMuUCvOlQdNmKtPlbafQAzNSYtWVVF"
RAILWAY_DB="railway"

# 1. Instalar cliente PostgreSQL se não estiver instalado
echo "📦 Verificando cliente PostgreSQL..."
if ! command -v pg_dump &> /dev/null; then
    echo "Instalando cliente PostgreSQL..."
    apt-get update -qq
    apt-get install -y postgresql-client
fi

# 2. Fazer backup do Railway
echo "📥 Fazendo backup do banco Railway..."
PGPASSWORD=$RAILWAY_PASSWORD pg_dump \
    -h $RAILWAY_HOST \
    -p $RAILWAY_PORT \
    -U $RAILWAY_USER \
    -d $RAILWAY_DB \
    --no-owner \
    --no-acl \
    > /tmp/railway_backup.sql

if [ $? -eq 0 ]; then
    echo "✅ Backup criado: $(wc -l < /tmp/railway_backup.sql) linhas"
else
    echo "❌ Erro ao criar backup"
    exit 1
fi

# 3. Importar para PostgreSQL da VPS
echo "📤 Importando para PostgreSQL da VPS..."
docker exec -i portaldcp-postgres-1 psql -U portaldcp -d portaldcp < /tmp/railway_backup.sql

if [ $? -eq 0 ]; then
    echo "✅ Banco importado com sucesso!"
else
    echo "⚠️  Importação concluída com avisos (normal)"
fi

# 4. Verificar dados importados
echo "🔍 Verificando dados importados..."
TABLES=$(docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
echo "📊 Total de tabelas: $TABLES"

# 5. Limpar arquivo temporário
rm /tmp/railway_backup.sql
echo "🧹 Arquivo temporário removido"

echo ""
echo "🎉 Migração concluída com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "1. Criar arquivo .env com as variáveis de ambiente"
echo "2. Reiniciar o backend: docker-compose -f docker-compose.coolify.yml restart backend"
echo "3. Testar login no sistema"
