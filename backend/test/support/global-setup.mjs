/**
 * globalSetup do Jest e2e — sobe um Postgres DESCARTÁVEL (embedded-postgres)
 * numa porta livre e num diretório temporário. Nada aqui aponta para banco real.
 *
 * - O binário do Postgres vem do pacote npm `embedded-postgres` (versão 15,
 *   a mesma major do docker-compose de produção).
 * - O banco `portaldcp_e2e` recebe um COMMENT com um token aleatório; o
 *   `criarApp()` confere esse token ANTES de o TypeORM conectar/sincronizar.
 * - As informações de conexão vão para um arquivo JSON cujo caminho fica em
 *   PORTALDCP_E2E_PG_INFO (herdado pelos workers do Jest).
 *
 * Arquivo .mjs porque `embedded-postgres` é ESM puro.
 */
import EmbeddedPostgres from 'embedded-postgres';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const DATABASE = 'portaldcp_e2e';

function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export default async function globalSetup() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portaldcp-e2e-'));
  const dataDir = path.join(baseDir, 'pgdata');
  const uploadsDir = path.join(baseDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const port = await portaLivre();
  const user = 'e2e';
  const password = crypto.randomBytes(12).toString('hex');
  const token = crypto.randomBytes(16).toString('hex');
  const verbose = process.env.E2E_PG_LOG === '1';

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user,
    password,
    persistent: false, // apaga o diretório de dados no stop()
    authMethod: 'password',
    // Só escuta em loopback: ninguém de fora alcança o banco de teste
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'fsync=off', '-c', 'max_connections=200'],
    initdbFlags: ['--encoding=UTF8', '--no-sync'],
    onLog: (m) => {
      if (verbose) console.log('[pg]', m);
    },
    onError: (m) => {
      if (verbose) console.error('[pg]', m);
    },
  });

  const inicio = Date.now();
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DATABASE);

  // Marca o banco como descartável; conferido pelo guard antes do boot do app
  const client = pg.getPgClient('postgres', '127.0.0.1');
  await client.connect();
  await client.query(`COMMENT ON DATABASE ${DATABASE} IS 'portaldcp-e2e:${token}'`);
  await client.end();

  const info = {
    host: '127.0.0.1',
    port,
    user,
    password,
    database: DATABASE,
    token,
    baseDir,
    uploadsDir,
    pid: process.pid,
  };
  const infoPath = path.join(baseDir, 'pg-info.json');
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
  process.env.PORTALDCP_E2E_PG_INFO = infoPath;

  // Lido pelo globalTeardown (mesmo processo)
  globalThis.__PORTALDCP_E2E_PG__ = { pg, baseDir };

  console.log(
    `\n[e2e] Postgres descartável em 127.0.0.1:${port}/${DATABASE} (${Date.now() - inicio} ms) — ${baseDir}`,
  );
}
