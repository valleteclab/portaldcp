#!/bin/bash
# Configura VPS para usar banco local (não Railway)
set -e

cd /opt/portaldcp

echo "=== Configurando VPS para usar banco local ==="

# 1. Verificar se DATABASE_URL existe no .env
echo "🔍 Verificando DATABASE_URL no .env..."
if grep -q "DATABASE_URL" .env 2>/dev/null; then
    echo "⚠️  DATABASE_URL encontrado no .env - removendo..."
    sed -i '/DATABASE_URL/d' .env
    echo "✅ DATABASE_URL removido do .env"
else
    echo "✅ DATABASE_URL não está no .env"
fi

# 2. Verificar docker-compose.yml
echo "🔍 Verificando docker-compose.yml..."
if grep -q "DATABASE_URL" docker-compose.yml; then
    echo "⚠️  DATABASE_URL encontrado no docker-compose.yml"
    echo "📋 Linhas encontradas:"
    grep -n "DATABASE_URL" docker-compose.yml || true
else
    echo "✅ DATABASE_URL não está no docker-compose.yml"
fi

# 3. Mostrar configuração atual de banco
echo ""
echo "📋 Configuração de banco atual no .env:"
grep -E "^(DB_|DATABASE)" .env | grep -v PASSWORD || echo "(nenhuma configuração DB_ encontrada)"

echo ""
echo "📋 Configuração de banco no docker-compose.yml:"
grep -A10 "backend:" docker-compose.yml | grep -E "(DB_|DATABASE)" | grep -v PASSWORD || echo "(nenhuma configuração DB_ encontrada)"

# 4. Reiniciar backend para usar banco local
echo ""
echo "🔄 Reiniciando backend para usar banco local..."
docker-compose stop backend
docker-compose rm -f backend 2>/dev/null || true
docker-compose up -d backend

echo ""
echo "⏳ Aguardando backend iniciar..."
sleep 10

# 5. Verificar status
echo ""
echo "📊 Status dos containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(licitafacil|portaldcp)" || docker ps

echo ""
echo "🧪 Testando conexão com banco local..."
docker exec licitafacil_db psql -U portaldcp -d portaldcp -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "⚠️  Não foi possível conectar ao banco local"

echo ""
echo "✅ Configuração concluída!"
echo "A VPS agora deve usar o banco local (licitafacil_db)"
echo ""
echo "Para confirmar que está usando banco local:"
echo "1. Acesse https://compras.cmlem.ba.gov.br"
echo "2. Crie um contrato de teste"
echo "3. Verifique se aparece no Railway (não deve aparecer)"
