import type { ExecutorSql } from '../disputa-v2/migracao-lances';

/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS DO RESULTADO (plano E6) — idempotente
 * ============================================================================
 *
 * Licitações adjudicadas/homologadas pelos caminhos antigos (sala
 * `adjudicar-todos`/`homologar`, `itens/:id/adjudicar|homologar`, cockpit
 * `PUT homologar`, julgamento da dispensa, resultado externo) ficam coerentes
 * com o modelo novo SEM refazer nada:
 *  1. fase HOMOLOGACAO (ou situação CONCLUIDA): item com vencedor e valor
 *     (status ATIVO — a sala antiga não mudava o status — ou ADJUDICADO) →
 *     HOMOLOGADO;
 *  2. fase ADJUDICACAO: item com vencedor e valor ainda ATIVO → ADJUDICADO;
 *  3. todo item ADJUDICADO/HOMOLOGADO com vencedor → o vencedor fica VENCEDOR
 *     em `licitantes_unidade` na unidade (item, ou lote na disputa por lote);
 *  4. homologada sem `valor_homologado` → soma dos itens com vencedor.
 * Contratos/atas NÃO são gerados nem alterados (o que existe fica como está).
 */
export interface RelatorioMigracaoResultado {
  itensHomologados: number;
  itensAdjudicados: number;
  vencedores: number;
  valoresHomologados: number;
}

export const houveMudancaResultado = (r: RelatorioMigracaoResultado) =>
  r.itensHomologados + r.itensAdjudicados + r.vencedores + r.valoresHomologados > 0;

export const resumoMigracaoResultado = (r: RelatorioMigracaoResultado) =>
  `${r.itensHomologados} item(ns) → HOMOLOGADO, ${r.itensAdjudicados} item(ns) → ADJUDICADO, ` +
  `${r.vencedores} vencedor(es) em licitantes_unidade, ${r.valoresHomologados} valor(es) homologado(s) recalculado(s)`;

const contagem = (r: any): number => {
  if (Array.isArray(r) && typeof r[1] === 'number') return r[1];
  if (r && typeof r.rowCount === 'number') return r.rowCount;
  return Array.isArray(r) ? r.length : 0;
};

export async function migrarResultado(db: ExecutorSql): Promise<RelatorioMigracaoResultado> {
  const rel: RelatorioMigracaoResultado = { itensHomologados: 0, itensAdjudicados: 0, vencedores: 0, valoresHomologados: 0 };

  rel.itensHomologados = contagem(
    await db.query(
      `UPDATE itens_licitacao i SET status = 'HOMOLOGADO'
         FROM licitacoes l
        WHERE l.id = i.licitacao_id
          AND (l.fase::text = 'HOMOLOGACAO' OR l.situacao::text = 'CONCLUIDA')
          AND i.fornecedor_vencedor_id IS NOT NULL AND i.valor_total_homologado IS NOT NULL
          AND i.status::text IN ('ATIVO','ADJUDICADO')`,
    ),
  );

  rel.itensAdjudicados = contagem(
    await db.query(
      `UPDATE itens_licitacao i SET status = 'ADJUDICADO'
         FROM licitacoes l
        WHERE l.id = i.licitacao_id AND l.fase::text = 'ADJUDICACAO'
          AND i.fornecedor_vencedor_id IS NOT NULL AND i.valor_total_homologado IS NOT NULL
          AND i.status::text = 'ATIVO'`,
    ),
  );

  // Vencedor na unidade: lote (base TOTAL_LOTE) ou item. Um vencedor por unidade.
  rel.vencedores = contagem(
    await db.query(
      `INSERT INTO licitantes_unidade
         (id, licitacao_id, tipo_unidade, unidade_id, fornecedor_id, situacao, motivo, ator_tipo, ator_id, situacao_em, created_at, updated_at)
       SELECT gen_random_uuid(), x.licitacao_id, x.tipo, x.unidade_id, x.fornecedor_id, 'VENCEDOR',
              'Migração E6: vencedor do resultado registrado pelo fluxo anterior', 'SISTEMA', 'migracao-e6', now(), now(), now()
         FROM (
           SELECT DISTINCT ON (1, 3)
                  i.licitacao_id,
                  CASE WHEN COALESCE(l.base_lance::text, 'TOTAL_ITEM') = 'TOTAL_LOTE' AND i.lote_id IS NOT NULL THEN 'LOTE' ELSE 'ITEM' END AS tipo,
                  CASE WHEN COALESCE(l.base_lance::text, 'TOTAL_ITEM') = 'TOTAL_LOTE' AND i.lote_id IS NOT NULL THEN i.lote_id ELSE i.id END AS unidade_id,
                  i.fornecedor_vencedor_id::text AS fornecedor_id
             FROM itens_licitacao i JOIN licitacoes l ON l.id = i.licitacao_id
            WHERE i.fornecedor_vencedor_id IS NOT NULL AND i.status::text IN ('ADJUDICADO','HOMOLOGADO')
            ORDER BY 1, 3, i.numero_item
         ) x
       ON CONFLICT (unidade_id, fornecedor_id) DO UPDATE
          SET situacao = 'VENCEDOR', motivo = EXCLUDED.motivo, ator_tipo = 'SISTEMA', ator_id = 'migracao-e6',
              situacao_em = now(), updated_at = now()
        WHERE licitantes_unidade.situacao <> 'VENCEDOR'`,
    ),
  );

  rel.valoresHomologados = contagem(
    await db.query(
      `UPDATE licitacoes l SET valor_homologado = s.total
         FROM (SELECT licitacao_id, ROUND(SUM(valor_total_homologado)::numeric, 2) AS total
                 FROM itens_licitacao
                WHERE fornecedor_vencedor_id IS NOT NULL AND status::text IN ('ADJUDICADO','HOMOLOGADO')
                GROUP BY licitacao_id) s
        WHERE s.licitacao_id = l.id AND l.data_homologacao IS NOT NULL AND l.valor_homologado IS NULL AND s.total > 0`,
    ),
  );

  return rel;
}
