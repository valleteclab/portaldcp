/**
 * setupFiles do Jest e2e — roda ANTES de qualquer import do AppModule.
 *
 * O AppModule lê process.env no momento do import (TypeOrmModule.forRoot), por
 * isso as variáveis precisam estar prontas aqui. Regras:
 *  1. O banco é SEMPRE o Postgres descartável criado pelo globalSetup.
 *     DATABASE_URL é apagada (ela tem prioridade sobre DB_* no app.module).
 *  2. Toda credencial de integração herdada do shell é apagada — o teste nunca
 *     fala com WhatsApp, e-mail, IA, NFS-e, Receita etc.
 *  3. O PNCP aponta para um host fictício (.invalid) interceptado pelo nock
 *     (ver pncp-mock.ts). Mesmo se a interceptação falhar, o DNS não resolve.
 */
import * as fs from 'fs';
import * as path from 'path';

const infoPath = process.env.PORTALDCP_E2E_PG_INFO;
if (!infoPath || !fs.existsSync(infoPath)) {
  throw new Error(
    '[e2e] Postgres descartável não encontrado. Rode os testes com `npm run test:e2e` ' +
      '(o globalSetup em test/support/global-setup.mjs sobe o banco).',
  );
}

export interface InfoPostgresE2E {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  token: string;
  baseDir: string;
  uploadsDir: string;
}

const info: InfoPostgresE2E = JSON.parse(fs.readFileSync(infoPath, 'utf8'));

if (info.host !== '127.0.0.1' || !info.database.startsWith('portaldcp_e2e')) {
  throw new Error(`[e2e] Alvo de banco inesperado (${info.host}/${info.database}) — abortando.`);
}

// --- 1. Limpa integrações e segredos herdados do ambiente -------------------
const PREFIXOS_APAGAR = [
  'DATABASE_URL',
  'DB_',
  'PNCP_',
  'WHATSAPP_',
  'RESEND_',
  'SMTP_',
  'IMAP_',
  'OPENROUTER_',
  'OPENAI_',
  'ANTHROPIC_',
  'SPEDY_',
  'CNPJ_API',
  'FONTE_PRECOS',
  'FONTEPRECOS',
  'GOOGLE_',
  'RAILWAY_',
  'AGENTE_',
  'EXPORT_EQUIPE_QA',
  'FATOR_',
  'AWS_',
  'S3_',
];
for (const chave of Object.keys(process.env)) {
  if (
    PREFIXOS_APAGAR.some((p) => chave.startsWith(p)) ||
    /(API_KEY|_TOKEN|_SECRET|_SENHA|_PASSWORD)$/.test(chave)
  ) {
    delete process.env[chave];
  }
}

// --- 2. Banco descartável ---------------------------------------------------
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: info.host,
  DB_PORT: String(info.port),
  DB_USERNAME: info.user,
  DB_PASSWORD: info.password,
  DB_DATABASE: info.database,
  DB_SSL: 'false',
  DB_SYNCHRONIZE: 'true', // schema criado a partir das entidades
  DB_MIGRATIONS_RUN: 'false',
});

// --- 3. Valores seguros para o boot ----------------------------------------
Object.assign(process.env, {
  JWT_SECRET: 'e2e-jwt-secret-somente-para-testes',
  JWT_EXPIRES_IN: '1h',
  PNCP_ENCRYPTION_KEY: 'e2e-chave-cripto-32-caracteres!!',
  ADMIN_EMAIL: 'admin@e2e.local',
  ADMIN_PASSWORD: 'e2e-admin-senha',
  APP_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  UPLOAD_DIR: info.uploadsDir,
  UPLOAD_PATH: info.uploadsDir,
  // PNCP "configurado" contra host fictício: o código envia de verdade e o
  // nock captura (ver pncp-mock.ts)
  PNCP_API_URL: 'http://pncp.e2e.invalid/api/pncp/v1',
  PNCP_LOGIN: 'e2e-login',
  PNCP_SENHA: 'e2e-senha',
});

// Disponível para os helpers (guard do criarApp)
(globalThis as any).__PORTALDCP_E2E_INFO__ = info;
process.env.PORTALDCP_E2E_UPLOADS = path.resolve(info.uploadsDir);
