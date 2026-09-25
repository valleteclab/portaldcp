import { DataSource } from 'typeorm';

/**
 * Fila única das migrações de dados executadas no boot.
 *
 * O Nest dispara em paralelo os `onApplicationBootstrap` dos providers de um
 * mesmo módulo (ex.: lances e dispensa no DisputaModule). Duas migrações
 * tocando as mesmas tabelas ao mesmo tempo geraram `deadlock detected` na
 * homologação (25/09/2026). Aqui elas passam a rodar uma de cada vez:
 *  - dentro do processo, por uma cadeia de promises;
 *  - entre instâncias, por um advisory lock de sessão no Postgres.
 * Uma falha não impede as seguintes (cada migração trata e loga o próprio erro).
 */
const CHAVE_ADVISORY_MIGRACOES_BOOT = 740_210_925;

let fila: Promise<unknown> = Promise.resolve();

export function executarMigracaoDeBoot<T>(dataSource: DataSource, executar: () => Promise<T>): Promise<T> {
  const vez = fila.then(async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.query('SELECT pg_advisory_lock($1)', [CHAVE_ADVISORY_MIGRACOES_BOOT]);
      return await executar();
    } finally {
      try {
        await qr.query('SELECT pg_advisory_unlock($1)', [CHAVE_ADVISORY_MIGRACOES_BOOT]);
      } finally {
        await qr.release();
      }
    }
  });
  fila = vez.catch(() => undefined);
  return vez;
}
