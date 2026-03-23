#!/bin/bash
# Script de configuração nginx para compras.cmlem.ba.gov.br
# Execute na VPS com: sudo bash setup-nginx.sh

set -e

echo "=== Configurando nginx para compras.cmlem.ba.gov.br ==="

# Instala nginx se não existir
if ! command -v nginx &> /dev/null; then
    echo "Instalando nginx..."
    apt update
    apt install -y nginx
fi

# Instala certbot
if ! command -v certbot &> /dev/null; then
    echo "Instalando certbot..."
    apt install -y certbot python3-certbot-nginx
fi

# Cria diretórios necessários
mkdir -p /var/log/nginx
mkdir -p /etc/nginx/sites-available
mkdir -p /etc/nginx/sites-enabled

# Copia configuração
cat > /etc/nginx/sites-available/compras.cmlem.ba.gov.br << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name compras.cmlem.ba.gov.br;

    # Logs
    access_log /var/log/nginx/compras.cmlem.ba.gov.br.access.log;
    error_log /var/log/nginx/compras.cmlem.ba.gov.br.error.log;

    # Tamanho máximo de upload (50MB para PDFs de contrato)
    client_max_body_size 50M;

    # Timeout aumentado para operações de IA
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API (NestJS)
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout maior para endpoints de IA
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

# Ativa site
ln -sf /etc/nginx/sites-available/compras.cmlem.ba.gov.br /etc/nginx/sites-enabled/

# Remove default se existir
rm -f /etc/nginx/sites-enabled/default

# Testa configuração
echo "Testando configuração nginx..."
nginx -t

# Reinicia nginx
echo "Reiniciando nginx..."
systemctl restart nginx
systemctl enable nginx

echo ""
echo "=== Nginx configurado! ==="
echo "Agora vamos obter o certificado SSL..."
echo ""

# Obtém certificado SSL
certbot --nginx -d compras.cmlem.ba.gov.br --non-interactive --agree-tos --email loamesilva@valleteclab.com.br || true

echo ""
echo "=== Configuração completa! ==="
echo "Site: https://compras.cmlem.ba.gov.br"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:3001"
