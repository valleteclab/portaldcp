#!/bin/sh
set -e

# Corrigir permissões do volume Railway montado em /data
# O volume pertence ao root, mas o app roda como nestjs
if [ -n "$UPLOAD_DIR" ]; then
  mkdir -p "$UPLOAD_DIR" 2>/dev/null || true
  chown -R nestjs:nodejs "$UPLOAD_DIR" 2>/dev/null || true
  echo "[entrypoint] Upload dir: $UPLOAD_DIR (permissions fixed)"
elif [ -d "/data" ]; then
  chown -R nestjs:nodejs /data 2>/dev/null || true
  echo "[entrypoint] /data permissions fixed"
fi

# Diretório PRIVADO dos uploads sensíveis, se estiver em outro volume
# (sem a variável, ele fica em $UPLOAD_DIR/.privado e já foi corrigido acima)
if [ -n "$UPLOAD_PRIVATE_DIR" ]; then
  mkdir -p "$UPLOAD_PRIVATE_DIR" 2>/dev/null || true
  chown -R nestjs:nodejs "$UPLOAD_PRIVATE_DIR" 2>/dev/null || true
  echo "[entrypoint] Upload privado: $UPLOAD_PRIVATE_DIR (permissions fixed)"
fi

# Executar app como usuario nestjs
exec su-exec nestjs node dist/src/main
