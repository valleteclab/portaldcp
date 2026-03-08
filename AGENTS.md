# Portal DCP - Diário de Compras Públicas

Brazilian government procurement/contract management system (Lei 14.133/2021).

## Architecture

| Component | Technology | Dev Port |
|-----------|-----------|----------|
| Backend | NestJS 11 (TypeORM, PostgreSQL) | 3000 |
| Frontend | Next.js 16 (React 19, Tailwind 4, shadcn/ui) | 3001 |
| Database | PostgreSQL 16 | 5432 |

## Cursor Cloud specific instructions

### Services

- **PostgreSQL** must be running (`sudo pg_ctlcluster 16 main start`). DB: `licitafacil`, user: `licitafacil`, password: `LicitaFacil2025!`.
- **Backend**: Run with `npx ts-node -r tsconfig-paths/register --transpile-only src/main.ts` from `backend/`. The standard `npm run start:dev` (which uses `nest start --watch`) fails due to 3 pre-existing TS errors in the codebase; `ts-node --transpile-only` bypasses type checking and starts successfully.
- **Frontend**: `npm run dev` from `frontend/` runs Next.js on port 3001.
- **Redis**: Not required — the backend uses in-memory `Map` fallback.

### Environment files

- `backend/.env` — must exist; create from `backend/.env.example`. Key vars: `DB_HOST=localhost`, `DB_PORT=5432`, `DB_USERNAME=licitafacil`, `DB_PASSWORD=LicitaFacil2025!`, `DB_DATABASE=licitafacil`, `JWT_SECRET`, `PORT=3000`.
- `frontend/.env.local` — set `NEXT_PUBLIC_API_URL=http://localhost:3000` and `BACKEND_URL=http://localhost:3000`.

### Lint / Test / Build

- **Backend lint**: `npx eslint "{src,apps,libs,test}/**/*.ts"` (pre-existing prettier warnings; exit 1 is expected)
- **Backend tests**: `npx jest --passWithNoTests` (1 test suite passes)
- **Backend build**: `npm run build` fails with 3 pre-existing TS errors; dev server works fine via `ts-node --transpile-only`
- **Frontend lint**: `npx eslint` from `frontend/` (pre-existing warnings; exit 1 is expected)
- **Frontend build**: `npm run build` succeeds

### Auth and login flows

- **Org login page**: `/orgao-login` (NOT `/login` which is supplier-only)
- **Org registration API**: `POST /api/orgaos/registro` (public, no auth needed)
- **Org login API**: `POST /api/orgaos/login` returns JWT token
- **Admin login**: `POST /api/auth/login/admin` uses `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars
- **Supplier login page**: `/login`
- TypeORM `synchronize: true` — tables auto-created on backend startup, no manual migrations needed.

### Port mapping gotcha

Backend defaults to port 3000 (`process.env.PORT || 3000`). Frontend dev runs on 3001 (`next dev -p 3001`). The frontend's `next.config.ts` rewrites `/api/*` to `BACKEND_URL` (defaults to production URL if env not set — always set `BACKEND_URL=http://localhost:3000` in `frontend/.env.local`).

### Package manager

Both `backend/` and `frontend/` use **npm** (`package-lock.json`). Frontend Dockerfile uses `--legacy-peer-deps`.
