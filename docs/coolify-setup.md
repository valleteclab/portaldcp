# Configuração PortalDCP no Coolify

## Passo 1: Configurar o Docker Compose no Coolify

1. Acesse: http://72.60.4.218:8000
2. Vá em **Projects** → **portaldcp**
3. Clique na aplicação criada
4. Em **General** → **Base Directory**: deixe em branco (raiz)
5. Em **Docker Compose Location**: mude para `docker-compose.coolify.yml`
6. Salve as alterações

## Passo 2: Criar Banco de Dados PostgreSQL

1. No menu lateral, vá em **Databases** → **+ New**
2. Selecione **PostgreSQL**
3. Configure:
   - **Name**: `portaldcp-postgres`
   - **Database**: `portaldcp`
   - **Username**: `portaldcp`
   - **Password**: gere uma senha segura
   - **Port**: `5432`
4. Clique em **Create**

## Passo 3: Criar Redis

1. **Databases** → **+ New**
2. Selecione **Redis**
3. Configure:
   - **Name**: `portaldcp-redis`
   - **Port**: `6379`
4. Clique em **Create**

## Passo 4: Configurar Variáveis de Ambiente

Na aplicação, vá em **Environment Variables** e adicione:

```
# Banco de Dados (use os valores do PostgreSQL criado)
DB_HOST=portaldcp-postgres
DB_PORT=5432
DB_USERNAME=portaldcp
DB_PASSWORD=<senha_gerada_no_passo_2>
DB_DATABASE=portaldcp

# Redis (use os valores do Redis criado)
REDIS_HOST=portaldcp-redis
REDIS_PORT=6379

# JWT
JWT_SECRET=<gerar_chave_secreta_longa>
JWT_EXPIRES_IN=7d

# URLs (ajuste para seu domínio)
APP_URL=http://72.60.4.218:3000
API_URL=http://72.60.4.218:3001

# PNCP (configurar depois)
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1
PNCP_LOGIN=
PNCP_SENHA=
PNCP_CNPJ_ORGAO=

# Uploads
UPLOAD_MAX_SIZE=52428800
```

## Passo 5: Configurar Deploy Automático

1. Na aplicação, vá em **Settings** → **Git**
2. Verifique se está conectado ao GitHub: `valleteclab/portaldcp`
3. Ative **Auto Deploy**: `ON`
4. **Webhook** deve estar configurado automaticamente

## Passo 6: Deploy Manual (primeira vez)

1. Clique em **Deploy**
2. Aguarde o build (pode demorar alguns minutos)
3. Verifique os logs em **Logs**

## Verificação

Após o deploy, acesse:
- Frontend: http://72.60.4.218:3000
- Backend: http://72.60.4.218:3001/api/health

## Troubleshooting

Se der erro:
1. Verifique os **Logs** da aplicação
2. Confirme se as variáveis de ambiente estão todas preenchidas
3. Verifique se o PostgreSQL e Redis estão rodando
4. Tente fazer deploy novamente

## Próximo Push Automático

Após essa configuração, todo `git push` para o repositório `main` vai:
1. Disparar webhook do GitHub
2. Coolify recebe e inicia deploy automático
3. Build e deploy são feitos automaticamente
