/**
 * globalTeardown do Jest e2e — derruba o Postgres descartável e apaga o
 * diretório temporário (dados + uploads gerados pelos testes).
 */
import fs from 'node:fs';

export default async function globalTeardown() {
  const estado = globalThis.__PORTALDCP_E2E_PG__;
  if (!estado) return;
  try {
    await estado.pg.stop();
  } catch (e) {
    console.error('[e2e] falha ao parar o Postgres descartável:', e);
  }
  try {
    fs.rmSync(estado.baseDir, { recursive: true, force: true });
  } catch {
    // Windows às vezes segura arquivos por alguns ms; o diretório é temporário
  }
  delete process.env.PORTALDCP_E2E_PG_INFO;
}
