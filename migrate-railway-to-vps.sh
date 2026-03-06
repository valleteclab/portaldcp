#!/bin/bash
# Script para migrar banco de dados do Railway para VPS

echo "🔄 Migrando banco de dados do Railway para VPS..."

# Variáveis do Railway (substitua com suas credenciais)
RAILWAY_DB_HOST="your-railway-host.railway.app"
RAILWAY_DB_PORT="5432"
RAILWAY_DB_USER="postgres"
RAILWAY_DB_PASSWORD="your-railway-password"
RAILWAY_DB_NAME="railway"

# 1. Fazer backup do banco Railway
echo "📦 Fazendo backup do banco Railway..."
PGPASSWORD=$RAILWAY_DB_PASSWORD pg_dump -h $RAILWAY_DB_HOST -p $RAILWAY_DB_PORT -U $RAILWAY_DB_USER -d $RAILWAY_DB_NAME > /tmp/railway_backup.sql

if [ $? -eq 0 ]; then
    echo "✅ Backup criado com sucesso!"
else
    echo "❌ Erro ao criar backup"
    exit 1
fi

# 2. Importar para PostgreSQL da VPS
echo "📥 Importando para PostgreSQL da VPS..."
docker exec -i portaldcp-postgres-1 psql -U portaldcp -d portaldcp < /tmp/railway_backup.sql

if [ $? -eq 0 ]; then
    echo "✅ Banco importado com sucesso!"
else
    echo "❌ Erro ao importar banco"
    exit 1
fi

# 3. Limpar arquivo temporário
rm /tmp/railway_backup.sql

echo "🎉 Migração concluída!"
