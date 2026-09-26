import { EntityManager } from 'typeorm';
import { CHAVE_LIMITE_DO_INCISO, INCISO_DA_CHAVE, LIMITES_DISPENSA_OFICIAIS } from './limites-dispensa';

/**
 * MIGRAÇÃO (boot, idempotente) — limites da dispensa POR EXERCÍCIO em
 * `limites_legais` (coluna `exercicio`):
 *  1. linha nacional antiga sem exercício (DISPENSA_*): se o valor é o de um
 *     exercício oficial, vira aquele exercício com o decreto certo — a semente
 *     antiga gravou os valores de 2024 (119.812,02 / 59.906,02) rotulados como
 *     "2025, Decreto 12.343/2024"; valor desconhecido (editado pelo admin)
 *     fica com o exercício do início da vigência;
 *  2. cria as linhas nacionais oficiais que faltam (um par por exercício).
 * Linhas de órgão (orgao_id preenchido) não são tocadas.
 */
export async function migrarLimitesDispensaPorExercicio(m: EntityManager): Promise<{ corrigidas: number; criadas: number }> {
  const chaves = Object.values(CHAVE_LIMITE_DO_INCISO);
  let corrigidas = 0;
  let criadas = 0;

  const antigas: Array<{ id: string; chave: string; valor: string; vigencia_inicio: string | Date }> = await m.query(
    `SELECT id::text AS id, chave, valor::text AS valor, vigencia_inicio
       FROM limites_legais
      WHERE orgao_id IS NULL AND exercicio IS NULL AND chave = ANY($1)`,
    [chaves],
  );
  for (const a of antigas) {
    const inciso = INCISO_DA_CHAVE[a.chave];
    const oficial = LIMITES_DISPENSA_OFICIAIS.find((l) => l.inciso === inciso && Math.abs(l.valor - Number(a.valor)) < 0.005);
    const [jaExiste] = oficial
      ? await m.query(`SELECT 1 FROM limites_legais WHERE orgao_id IS NULL AND chave = $1 AND exercicio = $2 LIMIT 1`, [a.chave, oficial.exercicio])
      : [];
    if (oficial && jaExiste) {
      // cópia da semente antiga com o mesmo valor oficial de um exercício já gravado — redundante
      await m.query(`DELETE FROM limites_legais WHERE id::text = $1`, [a.id]);
    } else if (oficial) {
      await m.query(
        `UPDATE limites_legais SET exercicio = $2, vigencia_inicio = $3, vigencia_fim = NULL, fonte = $4, updated_at = now() WHERE id::text = $1`,
        [a.id, oficial.exercicio, `${oficial.exercicio}-01-01`, oficial.ato_normativo],
      );
    } else {
      const ano = new Date(a.vigencia_inicio).getUTCFullYear();
      await m.query(`UPDATE limites_legais SET exercicio = $2, updated_at = now() WHERE id::text = $1`, [a.id, ano]);
    }
    corrigidas++;
  }

  for (const l of LIMITES_DISPENSA_OFICIAIS) {
    const chave = CHAVE_LIMITE_DO_INCISO[l.inciso];
    const [existe] = await m.query(
      `SELECT 1 FROM limites_legais WHERE orgao_id IS NULL AND chave = $1 AND exercicio = $2 LIMIT 1`,
      [chave, l.exercicio],
    );
    if (existe) continue;
    await m.query(
      `INSERT INTO limites_legais (id, orgao_id, chave, descricao, valor, vigencia_inicio, vigencia_fim, exercicio, fonte, created_at, updated_at)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3, $4, NULL, $5, $6, now(), now())`,
      [
        chave,
        l.inciso === 'I'
          ? 'Dispensa por valor — obras, serviços de engenharia e manutenção de veículos (art. 75, I)'
          : 'Dispensa por valor — outros serviços e compras (art. 75, II)',
        l.valor,
        `${l.exercicio}-01-01`,
        l.exercicio,
        l.ato_normativo,
      ],
    );
    criadas++;
  }
  return { corrigidas, criadas };
}
