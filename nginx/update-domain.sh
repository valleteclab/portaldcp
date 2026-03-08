#!/bin/bash
# Script para atualizar as variáveis de ambiente para usar domínio HTTPS
# Execute na VPS com: sudo bash update-domain.sh

cd /opt/portaldcp

# Backup do .env atual
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Atualiza as variáveis para usar o domínio HTTPS
cat > .env << 'EOF'
# URL do domínio principal (HTTPS)
APP_URL=https://compras.cmlem.ba.gov.br
API_URL=https://compras.cmlem.ba.gov.br/api
FRONTEND_URL=https://compras.cmlem.ba.gov.br

# Banco de dados
DB_USERNAME=SEU_DB_USERNAME
DB_PASSWORD=SEU_DB_PASSWORD
DB_DATABASE=SEU_DB_DATABASE

# JWT
JWT_SECRET=SEU_JWT_SECRET
JWT_EXPIRES_IN=7d

# PNCP
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1
PNCP_LOGIN=SEU_PNCP_LOGIN
PNCP_SENHA=SUA_PNCP_SENHA
PNCP_CNPJ_ORGAO=SEU_PNCP_CNPJ_ORGAO

# Google Auth (ATUALIZADO para domínio HTTPS)
GOOGLE_CLIENT_ID=SEU_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=SEU_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=https://compras.cmlem.ba.gov.br/api/auth/google/callback

# Uploads
UPLOAD_MAX_SIZE=52428800
UPLOAD_DIR=/app/uploads

# Admin
ADMIN_EMAIL=SEU_ADMIN_EMAIL
ADMIN_PASSWORD=SEU_ADMIN_PASSWORD
EOF

echo "✅ Variáveis de ambiente atualizadas!"

# Rebuild do frontend com novas variáveis
echo "🔄 Rebuildando o frontend com novas variáveis..."
docker-compose down frontend
docker-compose up -d --build frontend

# Restart do backend para garantir
echo "🔄 Restartando backend..."
docker-compose restart backend

echo ""
echo "✅ Configuração atualizada!"
echo "Aguarde 30 segundos para os containers iniciarem..."
echo ""
echo "URLs configuradas:"
echo "  Frontend: https://compras.cmlem.ba.gov.br"
echo "  Backend: https://compras.cmlem.ba.gov.br/api"
