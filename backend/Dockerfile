# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Instalar su-exec (drop de privilégios) e poppler-utils (pdftoppm para OCR de PDFs escaneados)
RUN apk add --no-cache su-exec poppler-utils

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copiar arquivos necessários do builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src/ext/api-docs-content.md ./dist/src/ext/api-docs-content.md

# Criar diretório de uploads local (fallback)
RUN mkdir -p /app/uploads && chown -R nestjs:nodejs /app/uploads

# Copiar entrypoint que corrige permissões do volume antes de iniciar
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expor porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/health || exit 1

# Entrypoint corrige permissões do volume Railway e executa como nestjs
ENTRYPOINT ["/entrypoint.sh"]
