import { EntityManager } from 'typeorm';

/**
 * E9 — campos legados da licitação (§2.3 do plano de consolidação).
 *
 * `pregoeiro_nome` (texto livre) × `pregoeiro_id` (usuário do órgão): a
 * RELAÇÃO é a fonte. O nome digitado fica como cópia de compatibilidade das
 * telas antigas; as leituras usam `nomeDoPregoeiro` (usuário vinculado
 * primeiro, texto livre só para licitações antigas sem vínculo).
 *
 * Migração (boot, idempotente): licitação sem `pregoeiro_id` cujo
 * `pregoeiro_nome` corresponde a EXATAMENTE um usuário ativo do mesmo órgão
 * (nome sem diferença de caixa/espaços) ganha o vínculo. Nada é apagado;
 * nomes sem correspondência única continuam só como texto.
 *
 * Funções SEM injeção de dependência.
 */

export function nomeDoPregoeiro(lic: { pregoeiro?: { nome?: string | null } | null; pregoeiro_nome?: string | null } | null | undefined): string | null {
  return lic?.pregoeiro?.nome || lic?.pregoeiro_nome || null;
}

export async function nomeDoPregoeiroSql(m: Pick<EntityManager, 'query'>, licitacaoId: string): Promise<string | null> {
  const [r] = await m.query(
    `SELECT COALESCE(u.nome, l.pregoeiro_nome) AS nome
       FROM licitacoes l LEFT JOIN usuarios u ON u.id::text = l.pregoeiro_id::text
      WHERE l.id::text = $1`,
    [licitacaoId],
  );
  return r?.nome ?? null;
}

export async function migrarPregoeiroDaLicitacao(m: EntityManager): Promise<{ vinculadas: number }> {
  const r: Array<{ id: string }> = await m.query(
    `UPDATE licitacoes l
        SET pregoeiro_id = u.id
       FROM (
             SELECT l2.id AS licitacao_id, MIN(u2.id::text) AS usuario_id
               FROM licitacoes l2
               JOIN usuarios u2 ON u2.orgao_id::text = l2.orgao_id::text AND u2.ativo = true
                AND lower(btrim(u2.nome)) = lower(btrim(l2.pregoeiro_nome))
              WHERE l2.pregoeiro_id IS NULL AND COALESCE(btrim(l2.pregoeiro_nome), '') <> ''
              GROUP BY l2.id
             HAVING COUNT(*) = 1
            ) alvo
       JOIN usuarios u ON u.id::text = alvo.usuario_id
      WHERE l.id = alvo.licitacao_id
      RETURNING l.id`,
  );
  // pg devolve [linhas, total] em UPDATE ... RETURNING pelo driver do TypeORM
  const linhas = Array.isArray(r[0]) ? (r[0] as unknown as Array<{ id: string }>) : r;
  return { vinculadas: linhas.length };
}
