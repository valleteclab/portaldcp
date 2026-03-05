#!/bin/bash
# Webhook para deploy automático via GitHub
# Coloque este script em /opt/portaldcp/deploy-webhook.sh

set -e

PROJECT_DIR="/opt/portaldcp"
LOG_FILE="/var/log/portaldcp-deploy.log"

echo "$(date): 🔄 Deploy iniciado via webhook" >> $LOG_FILE

cd $PROJECT_DIR

# Pull das últimas alterações
git pull origin main >> $LOG_FILE 2>&1

# Rebuild e restart dos containers
docker-compose -f docker-compose.coolify.yml up -d --build >> $LOG_FILE 2>&1

echo "$(date): ✅ Deploy concluído" >> $LOG_FILE
