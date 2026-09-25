/**
 * criarApp() — sobe o AppModule inteiro contra o Postgres descartável.
 *
 * Replica a configuração HTTP do src/main.ts (prefixo global `api`, limite de
 * payload, CORS, arquivos estáticos). O main.ts NÃO registra ValidationPipe
 * global — cada controller usa o seu —, então aqui também não: o teste vê o
 * mesmo comportamento de produção. Swagger fica de fora (só documentação).
 *
 * Se mudar o bootstrap do main.ts, atualize aqui.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ThrottlerStorage } from '@nestjs/throttler';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { json, urlencoded } from 'express';
import { AddressInfo } from 'net';
import { join } from 'path';
// pg sem @types no projeto: tipagem mínima local
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('pg') as { Client: new (cfg: Record<string, unknown>) => any };
import request from 'supertest';
import type { InfoPostgresE2E } from './env';
// Seguro importar direto: o setupFiles (env.ts) já ajustou process.env antes
// deste arquivo ser avaliado.
import { AppModule } from '../../src/app.module';
import { UserType } from '../../src/auth/auth.service';
import { Role } from '../../src/auth/roles.decorator';
import { instalarRotaUploads } from '../../src/upload/servir-arquivo';
import { PncpFilaService, ResumoFila } from '../../src/pncp/fila/pncp-fila.service';

export interface AppE2E {
  app: NestExpressApplication;
  dataSource: DataSource;
  jwt: JwtService;
  /** http://127.0.0.1:<porta> — o app escuta de verdade (necessário p/ socket.io). */
  baseUrl: string;
  /** Atalho do supertest: `ctx.http().get('/api/...')`. */
  http: () => ReturnType<typeof request>;
  /** Token de super admin (não depende de registro no banco). */
  tokenAdmin: () => string;
  /** Religa os @Cron (desligados por padrão). */
  ligarCrons: () => void;
  /**
   * Roda o WORKER da fila do PNCP (E7) uma vez — o mesmo `processarFila()` do
   * cron de 1 minuto (desligado nos testes). `agora` simula o relógio (backoff).
   */
  processarFilaPncp: (opts?: { agora?: Date; licitacaoId?: string }) => Promise<ResumoFila>;
  fechar: () => Promise<void>;
}

export interface OpcoesCriarApp {
  /**
   * Mantém os jobs do ScheduleModule rodando (relógio da disputa-v2,
   * transição de fases por data, alertas...). Padrão: false — os testes ficam
   * determinísticos; ligue quando o teste depender do relógio.
   */
  crons?: boolean;
  /**
   * Mantém o limite global de requisições (ThrottlerGuard: 100 req/min por
   * IP). Padrão: false — no e2e TUDO sai de 127.0.0.1 (órgão, fornecedores,
   * pregoeiro), e um fluxo completo passa disso em segundos; em produção cada
   * participante tem o seu IP. Ligue só no teste que quiser medir o 429.
   */
  limitarRequisicoes?: boolean;
}

/**
 * Guard de segurança: confere, ANTES de o TypeORM conectar (e sincronizar o
 * schema), que o alvo é o banco descartável marcado pelo globalSetup.
 */
async function garantirBancoDescartavel(): Promise<void> {
  const info: InfoPostgresE2E | undefined = (globalThis as any).__PORTALDCP_E2E_INFO__;
  if (!info) {
    throw new Error('[e2e] test/support/env.ts não foi carregado (setupFiles do jest-e2e.json).');
  }
  const env = process.env;
  if (env.DATABASE_URL) {
    throw new Error('[e2e] DATABASE_URL definida — recusando rodar (ela tem prioridade sobre DB_*).');
  }
  if (
    env.DB_HOST !== '127.0.0.1' ||
    env.DB_PORT !== String(info.port) ||
    env.DB_DATABASE !== info.database ||
    env.DB_USERNAME !== info.user
  ) {
    throw new Error(
      `[e2e] DB_* não aponta para o Postgres descartável (${env.DB_HOST}:${env.DB_PORT}/${env.DB_DATABASE}) — recusando.`,
    );
  }

  const client = new Client({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
  });
  await client.connect();
  try {
    const { rows }: { rows: Array<{ marca?: string }> } = await client.query(
      `SELECT shobj_description(oid, 'pg_database') AS marca
         FROM pg_database WHERE datname = current_database()`,
    );
    if (rows[0]?.marca !== `portaldcp-e2e:${info.token}`) {
      throw new Error('[e2e] O banco conectado não tem a marca do globalSetup — recusando rodar.');
    }
  } finally {
    await client.end();
  }
}

function pararCrons(app: INestApplication): void {
  const registro = app.get(SchedulerRegistry);
  registro.getCronJobs().forEach((job) => job.stop());
}

/**
 * Desliga a contagem do ThrottlerGuard global só nesta instância do app (não
 * mexe no src/): toda requisição conta como a primeira da janela.
 */
function desligarThrottler(app: INestApplication): void {
  const storage = app.get(ThrottlerStorage, { strict: false }) as any;
  storage.increment = async () => ({
    totalHits: 1,
    timeToExpire: 60,
    isBlocked: false,
    timeToBlockExpire: 0,
  });
}

/** Apps abertos neste arquivo de teste — o setup-after-env fecha os esquecidos. */
const appsAbertos = new Set<INestApplication>();

/**
 * Worker da fila do PNCP do último app criado — usado por `aguardarPncp`
 * (support/pregao.ts), que não recebe o contexto: enquanto espera o mock,
 * processa a fila (o cron fica desligado nos testes).
 */
let processadorFilaPncp: (() => Promise<unknown>) | null = null;

export async function processarFilaPncpAtual(): Promise<void> {
  if (processadorFilaPncp) await processadorFilaPncp();
}

export async function fecharAppsAbertos(): Promise<void> {
  for (const app of appsAbertos) {
    await app.close().catch(() => undefined);
  }
  appsAbertos.clear();
}

export async function criarApp(opcoes: OpcoesCriarApp = {}): Promise<AppE2E> {
  await garantirBancoDescartavel();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    // E2E_VERBOSE=1 mostra o log completo do Nest
    logger: process.env.E2E_VERBOSE === '1' ? undefined : ['error', 'warn'],
  });
  appsAbertos.add(app);

  // --- espelho do src/main.ts ---
  app.use((req: any, _res: any, next: () => void) => {
    if (req.url.startsWith('//uploads/')) {
      req.url = req.url.replace(/^\/+uploads\//, '/uploads/');
    }
    next();
  });
  instalarRotaUploads(app);
  app.useStaticAssets(join(process.cwd(), 'demo-docs'), { prefix: '/api/demo-docs/' });
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.enableCors();
  app.setGlobalPrefix('api');
  // -------------------------------

  await app.init();

  // Segunda checagem, agora pelo DataSource que o app realmente abriu
  const dataSource = app.get(DataSource);
  const opts: any = dataSource.options;
  if (opts.url || opts.host !== '127.0.0.1' || String(opts.port) !== process.env.DB_PORT) {
    await app.close();
    throw new Error('[e2e] DataSource do app não aponta para o banco descartável.');
  }

  if (!opcoes.crons) pararCrons(app);
  if (!opcoes.limitarRequisicoes) desligarThrottler(app);

  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const jwt = app.get(JwtService);
  const processarFilaPncp = (o?: { agora?: Date; licitacaoId?: string }) => app.get(PncpFilaService).processarFila(o);
  processadorFilaPncp = () => processarFilaPncp();

  return {
    app,
    dataSource,
    jwt,
    baseUrl,
    http: () => request(app.getHttpServer()),
    tokenAdmin: () =>
      jwt.sign({ sub: 'super-admin', type: UserType.ADMIN, role: Role.SUPER_ADMIN, email: 'admin@e2e.local' }),
    ligarCrons: () => {
      app.get(SchedulerRegistry).getCronJobs().forEach((job) => job.start());
    },
    processarFilaPncp,
    fechar: async () => {
      appsAbertos.delete(app);
      processadorFilaPncp = null;
      await app.close();
    },
  };
}
