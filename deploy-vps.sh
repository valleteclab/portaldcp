#!/bin/bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/portaldcp}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/valleteclab/portaldcp.git}"

# Serviços que possuem build e são recriados no deploy.
# postgres/redis usam imagem pronta e NÃO são reiniciados (sem downtime do banco).
BUILD_SERVICES="${BUILD_SERVICES:-backend frontend}"
# Porta interna do backend para o health check.
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_BIN="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN="docker-compose"
else
  echo "[ERRO] Docker Compose não encontrado. Instale 'docker compose' ou 'docker-compose'."
  exit 1
fi

if [ -f "$PROJECT_DIR/docker-compose.coolify.yml" ]; then
  COMPOSE_FILE="docker-compose.coolify.yml"
elif [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
  COMPOSE_FILE="docker-compose.yml"
else
  COMPOSE_FILE="docker-compose.coolify.yml"
fi

echo "=================================================="
echo " Portal DCP - Deploy VPS (build antes de recriar)"
echo "=================================================="
echo "Projeto: $PROJECT_DIR"
echo "Branch:  $BRANCH"
echo "Compose: $COMPOSE_FILE"
echo "Build:   $BUILD_SERVICES"
echo ""

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

if [ ! -d ".git" ]; then
  echo "[1/6] Clonando repositório..."
  git clone "$REPO_URL" .
fi

echo "[2/6] Atualizando código (--autostash p/ edições locais)..."
git fetch origin
git checkout "$BRANCH"
git pull --rebase --autostash origin "$BRANCH"

if [ ! -f ".env" ]; then
  echo "[ERRO] Arquivo .env não encontrado em $PROJECT_DIR/.env"
  echo "Crie o .env antes do primeiro deploy."
  exit 1
fi

echo "[3/6] Validando arquivos principais..."
test -f "$COMPOSE_FILE"
test -f "backend/Dockerfile"
test -f "frontend/Dockerfile"

# A stack ATUAL permanece no ar durante todo o build — aqui NÃO há downtime.
echo "[4/6] Buildando imagens novas (stack atual continua servindo)..."
# shellcheck disable=SC2086
$COMPOSE_BIN -f "$COMPOSE_FILE" build $BUILD_SERVICES

# 'up -d' (sem --force-recreate) recria SOMENTE os serviços cuja imagem mudou
# (backend/frontend). postgres e redis continuam rodando. Downtime ~segundos por serviço.
echo "[5/6] Recriando apenas os serviços atualizados (banco intocado)..."
$COMPOSE_BIN -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[6/6] Aguardando backend saudável em $HEALTH_URL ..."
OK=0
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" || true)
  if [ "$code" = "200" ]; then OK=1; echo "  Backend OK (HTTP 200) na tentativa $i."; break; fi
  sleep 3
done
if [ "$OK" != "1" ]; then
  echo "[AVISO] Backend não retornou HTTP 200 em $HEALTH_URL dentro do tempo limite."
  echo "        Verifique os logs: $COMPOSE_BIN -f $COMPOSE_FILE logs --tail=100 backend"
fi

echo ""
echo "Status:"
$COMPOSE_BIN -f "$COMPOSE_FILE" ps

# Remove imagens órfãs antigas para liberar disco (não-fatal).
docker image prune -f >/dev/null 2>&1 || true

echo ""
echo "Deploy concluído."
echo "Comandos úteis:"
echo "  cd $PROJECT_DIR"
echo "  $COMPOSE_BIN -f $COMPOSE_FILE ps"
echo "  $COMPOSE_BIN -f $COMPOSE_FILE logs -f backend"
echo "  $COMPOSE_BIN -f $COMPOSE_FILE logs -f frontend"
