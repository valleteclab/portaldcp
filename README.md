# 🏛️ Portal DCP - Diário de Compras Públicas

Sistema completo de gestão de licitações públicas conforme Lei 14.133/2021.

## 🚀 Deploy no Railway

### Serviços necessários no Railway:

1. **PostgreSQL** - Banco de dados (usar template do Railway)
2. **Redis** - Cache (usar template do Railway)  
3. **Backend** - API NestJS (apontar para pasta `/backend`)
4. **Frontend** - Next.js (apontar para pasta `/frontend`)

### Variáveis de Ambiente

#### Backend (`/backend`)
```env
# Banco (Railway preenche automaticamente se usar o plugin PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USERNAME=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_DATABASE=${{Postgres.PGDATABASE}}

# Redis (Railway preenche automaticamente se usar o plugin Redis)
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_HOST=${{Redis.REDISHOST}}
REDIS_PORT=${{Redis.REDISPORT}}

# JWT
JWT_SECRET=SeuSecretMuitoForteAqui123!
JWT_EXPIRES_IN=7d

# URLs
APP_URL=https://seu-frontend.up.railway.app
API_URL=https://seu-backend.up.railway.app

# PNCP (opcional)
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1
PNCP_LOGIN=
PNCP_SENHA=
PNCP_CNPJ_ORGAO=

# Uploads
UPLOAD_MAX_SIZE=52428800
UPLOAD_DEST=./uploads

# Porta (Railway define automaticamente)
PORT=3001
```

#### Frontend (`/frontend`)
```env
NEXT_PUBLIC_API_URL=https://seu-backend.up.railway.app
PORT=3000
```

### Passo a Passo

1. Crie um novo projeto no Railway
2. Adicione PostgreSQL (New → Database → PostgreSQL)
3. Adicione Redis (New → Database → Redis)
4. Adicione o Backend:
   - New → GitHub Repo → Selecione este repo
   - Settings → Root Directory: `/backend`
   - Configure as variáveis de ambiente
5. Adicione o Frontend:
   - New → GitHub Repo → Selecione este repo
   - Settings → Root Directory: `/frontend`
   - Configure as variáveis de ambiente

## 🛠️ Desenvolvimento Local

```bash
# Backend
cd backend
npm install
npm run start:dev

# Frontend (outro terminal)
cd frontend
npm install
npm run dev
```

## 📦 Tecnologias

- **Backend:** NestJS, TypeORM, PostgreSQL
- **Frontend:** Next.js 14, React, TailwindCSS, shadcn/ui
- **Infra:** Docker, Railway

## 📄 Licença

Proprietário - Todos os direitos reservados.
