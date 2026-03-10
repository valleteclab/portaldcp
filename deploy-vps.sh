#!/bin/bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/portaldcp}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/valleteclab/portaldcp.git}"

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
echo " Portal DCP - Deploy VPS"
echo "=================================================="
echo "Projeto: $PROJECT_DIR"
echo "Branch:  $BRANCH"
echo "Compose: $COMPOSE_FILE"
echo ""

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

if [ ! -d ".git" ]; then
  echo "[1/7] Clonando repositório..."
  git clone "$REPO_URL" .
fi

echo "[2/7] Atualizando código..."
git fetch origin
git checkout "$BRANCH"
git pull --rebase origin "$BRANCH"

if [ ! -f ".env" ]; then
  echo "[ERRO] Arquivo .env não encontrado em $PROJECT_DIR/.env"
  echo "Crie o .env antes do primeiro deploy."
  exit 1
fi

echo "[3/7] Validando arquivos principais..."
test -f "$COMPOSE_FILE"
test -f "backend/Dockerfile"
test -f "frontend/Dockerfile"

echo "[4/7] Derrubando stack antiga..."
$COMPOSE_BIN -f "$COMPOSE_FILE" down --remove-orphans || true

echo "[5/7] Subindo stack atualizada..."
$COMPOSE_BIN -f "$COMPOSE_FILE" up -d --build --force-recreate

echo "[6/7] Aguardando serviços..."
sleep 20

echo "[7/7] Status final..."
$COMPOSE_BIN -f "$COMPOSE_FILE" ps

echo ""
echo "Últimos logs do backend:"
$COMPOSE_BIN -f "$COMPOSE_FILE" logs --tail=50 backend || true

echo ""
echo "Deploy concluído."
echo "Comandos úteis:"
echo "  cd $PROJECT_DIR"
echo "  $COMPOSE_BIN -f $COMPOSE_FILE ps"
echo "  $COMPOSE_BIN -f $COMPOSE_FILE logs -f backend"
echo "  $COMPOSE_BIN -f $COMPOSE_FILE logs -f frontend"
