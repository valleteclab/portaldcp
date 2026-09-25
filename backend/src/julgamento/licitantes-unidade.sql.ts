import type { ExecutorSql } from '../disputa/migracao-lances';
import { STATUS_ACEITACAO_ATIVOS, SituacaoLicitante, StatusAceitacao } from './regras-julgamento';

/**
 * Funções SQL SEM injeção de dependência — o motor de disputa (disputa) as
 * chama sem importar o módulo de julgamento (evita ciclo de módulos: o
 * julgamento depende do motor, não o contrário).
 */

/**
 * Fim da etapa de lances de uma unidade: cada licitante do ranking final entra
 * em `licitantes_unidade` como CLASSIFICADO (posição e valor do retrato).
 * Idempotente — quem já tem linha (e situação) não é tocado.
 */
export async function registrarLicitantesDaUnidade(
  db: ExecutorSql,
  p: {
    licitacaoId: string;
    tipoUnidade: 'ITEM' | 'LOTE';
    unidadeId: string;
    ranking: Array<{ fornecedorId: string; melhorValor: number }>;
  },
): Promise<void> {
  let posicao = 0;
  for (const r of p.ranking) {
    posicao++;
    if (!r.fornecedorId) continue;
    await db.query(
      `INSERT INTO licitantes_unidade
         (id, licitacao_id, tipo_unidade, unidade_id, fornecedor_id, situacao, posicao_final, valor_final,
          ator_tipo, ator_id, situacao_em, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'SISTEMA', 'disputa', now(), now(), now())
       ON CONFLICT (unidade_id, fornecedor_id) DO NOTHING`,
      [p.licitacaoId, p.tipoUnidade, p.unidadeId, r.fornecedorId, SituacaoLicitante.CLASSIFICADO, posicao, r.melhorValor],
    );
  }
}

/**
 * Reinício da etapa de lances (motor): o julgamento recomeça do zero — as
 * convocações ativas são CANCELADAS (histórico mantido) e as situações
 * derivadas do ranking anterior são descartadas.
 */
export async function reiniciarJulgamentoDaLicitacao(db: ExecutorSql, licitacaoId: string, motivo: string): Promise<void> {
  await db.query(
    `UPDATE aceitacoes_proposta
        SET status = $2, decidida_em = now(), decisao_motivo = $3, updated_at = now()
      WHERE licitacao_id = $1 AND status = ANY($4)`,
    [licitacaoId, StatusAceitacao.CANCELADA, `Reinício da disputa: ${motivo}`, STATUS_ACEITACAO_ATIVOS],
  );
  await db.query(`DELETE FROM licitantes_unidade WHERE licitacao_id = $1`, [licitacaoId]);
  // Desempate ME/EPP (LC 123 art. 45): convocações canceladas; a apuração recomeça no novo encerramento
  await db.query(
    `UPDATE convocacoes_desempate_mpe SET status = 'CANCELADA', respondida_em = now(), motivo = $2, updated_at = now()
      WHERE licitacao_id = $1 AND status IN ('AGUARDANDO','PROCESSANDO')`,
    [licitacaoId, `Reinício da disputa: ${motivo}`],
  );
  await db.query(`DELETE FROM desempates_mpe WHERE licitacao_id = $1`, [licitacaoId]);
  // Desempate do art. 60 (desempate.service): os registros deixam de valer (histórico mantido)
  await db.query(
    `UPDATE desempates SET status = 'CANCELADO', updated_at = now() WHERE licitacao_id = $1 AND status <> 'CANCELADO'`,
    [licitacaoId],
  );
}
