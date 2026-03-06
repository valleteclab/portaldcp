#!/bin/bash
# Script de deploy automático do PortalDCP na VPS Hostinger
# Execute como root ou com sudo

set -e

echo "🚀 Iniciando deploy do PortalDCP..."

# 1. Instalar Docker e Docker Compose (se não estiver instalado)
if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl enable docker
    systemctl start docker
    rm get-docker.sh
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 Instalando Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# 2. Criar diretório do projeto
PROJECT_DIR="/opt/portaldcp"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# 3. Clonar repositório (se não existir)
if [ ! -d ".git" ]; then
    echo "📥 Clonando repositório..."
    git clone https://github.com/valleteclab/portaldcp.git .
else
    echo "🔄 Atualizando repositório..."
    git pull origin main
fi

# 4. Criar arquivo .env se não existir
if [ ! -f ".env" ]; then
    echo "📝 Criando arquivo .env..."
    cat > .env << 'EOF'
# Banco de Dados
DB_USERNAME=portaldcp
DB_PASSWORD=PortalDCP2026!Secure
DB_DATABASE=portaldcp

# JWT
JWT_SECRET=PortalDCP2026JWTSecretKeyMuitoSegura!
JWT_EXPIRES_IN=7d

# URLs (ajuste para seu IP/domínio)
APP_URL=http://72.60.4.218:3000
API_URL=http://72.60.4.218:3001

# PNCP
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1
PNCP_LOGIN=
PNCP_SENHA=
PNCP_CNPJ_ORGAO=

# Uploads
UPLOAD_MAX_SIZE=52428800
EOF
    echo "⚠️  IMPORTANTE: Edite o arquivo .env em $PROJECT_DIR/.env"
fi

# 5. Parar containers antigos (se existirem)
echo "🛑 Parando containers antigos..."
docker-compose -f docker-compose.coolify.yml down 2>/dev/null || true

# 6. Remover imagens antigas para forçar rebuild
echo "🧹 Limpando imagens antigas..."
docker-compose -f docker-compose.coolify.yml down --rmi local 2>/dev/null || true

# 7. Fazer build e subir containers
echo "🏗️  Fazendo build e subindo containers..."
docker-compose -f docker-compose.coolify.yml up -d --build --force-recreate

# 8. Aguardar containers ficarem saudáveis
echo "⏳ Aguardando containers iniciarem..."
sleep 30

# 9. Verificar status
echo "📊 Status dos containers:"
docker-compose -f docker-compose.coolify.yml ps

# 10. Mostrar logs
echo ""
echo "📋 Últimos logs do backend:"
docker-compose -f docker-compose.coolify.yml logs --tail=50 backend

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "🌐 Acesse:"
echo "   Frontend: http://72.60.4.218:3000"
echo "   Backend:  http://72.60.4.218:3001/api/health"
echo ""
echo "📝 Para ver logs em tempo real:"
echo "   docker-compose -f docker-compose.coolify.yml logs -f"
echo ""
echo "🔄 Para atualizar (git pull + rebuild):"
echo "   bash $0"
