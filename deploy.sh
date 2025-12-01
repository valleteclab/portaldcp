#!/bin/bash

# ============================================
# LICITAFÁCIL - SCRIPT DE DEPLOY
# ============================================

set -e

echo "============================================"
echo "  LICITAFÁCIL - Deploy para Produção"
echo "============================================"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se .env existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}Arquivo .env não encontrado. Copiando de .env.production...${NC}"
    cp .env.production .env
    echo -e "${RED}ATENÇÃO: Edite o arquivo .env com suas configurações antes de continuar!${NC}"
    exit 1
fi

# Função para exibir status
status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# 1. Parar containers existentes
echo ""
echo "1. Parando containers existentes..."
docker-compose down 2>/dev/null || true
status "Containers parados"

# 2. Limpar imagens antigas (opcional)
if [ "$1" == "--clean" ]; then
    echo ""
    echo "2. Limpando imagens antigas..."
    docker system prune -f
    docker image prune -f
    status "Imagens limpas"
fi

# 3. Build das imagens
echo ""
echo "3. Construindo imagens Docker..."
docker-compose build --no-cache
status "Imagens construídas"

# 4. Iniciar containers
echo ""
echo "4. Iniciando containers..."
docker-compose up -d
status "Containers iniciados"

# 5. Aguardar serviços ficarem prontos
echo ""
echo "5. Aguardando serviços ficarem prontos..."
sleep 10

# Verificar se os serviços estão rodando
echo ""
echo "6. Verificando status dos serviços..."

# Postgres
if docker-compose exec -T postgres pg_isready -U licitafacil > /dev/null 2>&1; then
    status "PostgreSQL está rodando"
else
    warning "PostgreSQL ainda iniciando..."
fi

# Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    status "Redis está rodando"
else
    warning "Redis ainda iniciando..."
fi

# Backend
sleep 5
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    status "Backend está rodando"
else
    warning "Backend ainda iniciando..."
fi

# Frontend
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    status "Frontend está rodando"
else
    warning "Frontend ainda iniciando..."
fi

# 7. Exibir logs
echo ""
echo "============================================"
echo -e "${GREEN}Deploy concluído com sucesso!${NC}"
echo "============================================"
echo ""
echo "URLs de acesso:"
echo "  - Frontend: http://localhost:3000"
echo "  - Backend:  http://localhost:3001"
echo "  - API Docs: http://localhost:3001/api"
echo ""
echo "Comandos úteis:"
echo "  - Ver logs:     docker-compose logs -f"
echo "  - Parar:        docker-compose down"
echo "  - Reiniciar:    docker-compose restart"
echo "  - Status:       docker-compose ps"
echo ""
