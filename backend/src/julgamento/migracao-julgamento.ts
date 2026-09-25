import type { ExecutorSql } from '../disputa/migracao-lances';

/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS DO JULGAMENTO (plano E3) — idempotente
 * ============================================================================
 *
 * Sessões que já passaram da etapa de lances antes da E3 não têm
 * `licitantes_unidade`. Esta rotina:
 *  1. cria as linhas CLASSIFICADO das unidades ENCERRADAS a partir dos lances
 *     (melhor oferta ativa de cada licitante, direção do critério: maior lance
 *     em ordem decrescente; item — ou lote na base TOTAL_LOTE) — ON CONFLICT
 *     DO NOTHING;
 *  2. aplica os eventos de habilitação da sessão em ordem cronológica
 *     (HABILITACAO_REPROVADA → INABILITADO, HABILITACAO_APROVADA → HABILITADO)
 *     nas unidades do licitante — só sobre linhas criadas pela própria
 *     migração/encerramento (ator SISTEMA), nunca sobre um ato E3;
 *  3. licitações que já estão em HABILITACAO ou além (RECURSO, ADJUDICACAO,
 *     HOMOLOGACAO, CONCLUIDO): a aceitação foi implícita — o 1º não excluído
 *     de cada unidade sem proposta aceita vira ACEITO (motivo registrado);
 *  4. sessões de pregão/concorrência paradas na etapa NEGOCIACAO com a
 *     licitação em JULGAMENTO passam à etapa ACEITACAO_PROPOSTA (a nova etapa
 *     pós-lances; a dispensa continua em NEGOCIACAO).
 * Licitações em JULGAMENTO seguem pela aceitação normal (nada é aceito por elas).
 */

export interface RelatorioMigracaoJulgamento {
  licitantesCriados: number;
  inabilitados: number;
  habilitados: number;
  aceitosImplicitos: number;
  sessoesParaAceitacao: number;
}

export const houveMudancaJulgamento = (r: RelatorioMigracaoJulgamento) =>
  r.licitantesCriados + r.inabilitados + r.habilitados + r.aceitosImplicitos + r.sessoesParaAceitacao > 0;

export const resumoMigracaoJulgamento = (r: RelatorioMigracaoJulgamento) =>
  `${r.licitantesCriados} licitante(s)×unidade criado(s), ${r.inabilitados} inabilitado(s), ${r.habilitados} habilitado(s), ` +
  `${r.aceitosImplicitos} aceite(s) implícito(s), ${r.sessoesParaAceitacao} sessão(ões) levadas à etapa de aceitação`;

const FASES_POS_JULGAMENTO = ['HABILITACAO', 'RECURSO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'];
const FASES_POS_DISPUTA = ['JULGAMENTO', ...FASES_POS_JULGAMENTO];

const contagem = (r: any): number => {
  // UPDATE/INSERT via query: [linhas, afetadas] (pg) ou objeto com rowCount
  if (Array.isArray(r) && typeof r[1] === 'number') return r[1];
  if (r && typeof r.rowCount === 'number') return r.rowCount;
  return Array.isArray(r) ? r.length : 0;
};

export async function migrarJulgamento(db: ExecutorSql): Promise<RelatorioMigracaoJulgamento> {
  const rel: RelatorioMigracaoJulgamento = {
    licitantesCriados: 0,
    inabilitados: 0,
    habilitados: 0,
    aceitosImplicitos: 0,
    sessoesParaAceitacao: 0,
  };

  // 1a. Unidades ITEM encerradas (licitação por item) — melhor oferta ativa por licitante
  const itens = await db.query(
    `WITH alvo AS (
       SELECT i.id AS unidade_id, i.licitacao_id, (l.criterio_julgamento::text = 'MAIOR_LANCE') AS maior
         FROM itens_licitacao i JOIN licitacoes l ON l.id = i.licitacao_id
        WHERE COALESCE(l.base_lance, 'TOTAL_ITEM') <> 'TOTAL_LOTE'
          AND i.status_disputa::text IN ('ENCERRADO','NEGOCIACAO')
          AND l.fase::text = ANY($1)
          AND NOT EXISTS (SELECT 1 FROM licitantes_unidade x WHERE x.licitacao_id = l.id AND x.ator_id IS DISTINCT FROM 'migracao-e3')
     ),
     melhores AS (
       SELECT DISTINCT ON (a.unidade_id, ln.fornecedor_id)
              a.unidade_id, a.licitacao_id, a.maior, ln.fornecedor_id, ln.valor, ln.created_at
         FROM alvo a JOIN lances ln ON ln.item_id = a.unidade_id
        WHERE ln.cancelado = false AND ln.fornecedor_id IS NOT NULL
        ORDER BY a.unidade_id, ln.fornecedor_id,
                 CASE WHEN a.maior THEN -ln.valor ELSE ln.valor END, ln.created_at
     ),
     ranqueados AS (
       SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.unidade_id
                ORDER BY CASE WHEN m.maior THEN -m.valor ELSE m.valor END, m.created_at) AS posicao
         FROM melhores m
     )
     INSERT INTO licitantes_unidade
       (id, licitacao_id, tipo_unidade, unidade_id, fornecedor_id, situacao, posicao_final, valor_final,
        ator_tipo, ator_id, situacao_em, created_at, updated_at)
     SELECT gen_random_uuid(), r.licitacao_id, 'ITEM', r.unidade_id, r.fornecedor_id, 'CLASSIFICADO', r.posicao, r.valor,
            'SISTEMA', 'migracao-e3', now(), now(), now()
       FROM ranqueados r
     ON CONFLICT (unidade_id, fornecedor_id) DO NOTHING`,
    [FASES_POS_DISPUTA],
  );
  rel.licitantesCriados += contagem(itens);

  // 1b. Unidades LOTE encerradas (licitação por lote) — lance do lote (item_id nulo)
  const lotes = await db.query(
    `WITH alvo AS (
       SELECT lt.id AS unidade_id, lt.licitacao_id
         FROM lotes_licitacao lt JOIN licitacoes l ON l.id = lt.licitacao_id
        WHERE l.base_lance = 'TOTAL_LOTE' AND lt.status_disputa IN ('ENCERRADO','NEGOCIACAO')
          AND l.fase::text = ANY($1)
          AND NOT EXISTS (SELECT 1 FROM licitantes_unidade x WHERE x.licitacao_id = l.id AND x.ator_id IS DISTINCT FROM 'migracao-e3')
     ),
     melhores AS (
       SELECT DISTINCT ON (a.unidade_id, ln.fornecedor_id)
              a.unidade_id, a.licitacao_id, ln.fornecedor_id, ln.valor, ln.created_at
         FROM alvo a JOIN lances ln ON ln.lote_id = a.unidade_id AND ln.item_id IS NULL
        WHERE ln.cancelado = false AND ln.fornecedor_id IS NOT NULL
        ORDER BY a.unidade_id, ln.fornecedor_id, ln.valor, ln.created_at
     ),
     ranqueados AS (
       SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.unidade_id ORDER BY m.valor, m.created_at) AS posicao FROM melhores m
     )
     INSERT INTO licitantes_unidade
       (id, licitacao_id, tipo_unidade, unidade_id, fornecedor_id, situacao, posicao_final, valor_final,
        ator_tipo, ator_id, situacao_em, created_at, updated_at)
     SELECT gen_random_uuid(), r.licitacao_id, 'LOTE', r.unidade_id, r.fornecedor_id, 'CLASSIFICADO', r.posicao, r.valor,
            'SISTEMA', 'migracao-e3', now(), now(), now()
       FROM ranqueados r
     ON CONFLICT (unidade_id, fornecedor_id) DO NOTHING`,
    [FASES_POS_DISPUTA],
  );
  rel.licitantesCriados += contagem(lotes);

  // Só licitações ainda não tocadas pela E3 (todas as linhas vieram desta migração e sem convocação)
  const intocada = (alias: string) =>
    `NOT EXISTS (SELECT 1 FROM licitantes_unidade x WHERE x.licitacao_id = ${alias} AND x.ator_id IS DISTINCT FROM 'migracao-e3')
     AND NOT EXISTS (SELECT 1 FROM aceitacoes_proposta ap WHERE ap.licitacao_id = ${alias})`;

  // 2. Eventos de habilitação: vale o ÚLTIMO de cada licitante na licitação
  const eventos: any[] = await db.query(
    `SELECT DISTINCT ON (s.licitacao_id, e.fornecedor_identificador)
            s.licitacao_id, e.fornecedor_identificador AS fornecedor_id, e.tipo::text AS tipo, e.descricao, e.dados_adicionais
       FROM eventos_sessao e JOIN sessoes_disputa s ON s.id = e.sessao_id
      WHERE e.tipo::text IN ('HABILITACAO_REPROVADA','HABILITACAO_APROVADA') AND e.fornecedor_identificador IS NOT NULL
        AND ${intocada('s.licitacao_id')}
      ORDER BY s.licitacao_id, e.fornecedor_identificador, e.created_at DESC`,
  );
  // 2a. Reprovado → INABILITADO em todas as unidades (a habilitação é do licitante)
  for (const e of eventos.filter((x) => x.tipo === 'HABILITACAO_REPROVADA')) {
    const motivo = e.dados_adicionais?.motivo ?? e.descricao ?? null;
    const r = await db.query(
      `UPDATE licitantes_unidade SET situacao = 'INABILITADO', motivo = $3, situacao_em = now(), updated_at = now()
        WHERE licitacao_id = $1 AND fornecedor_id = $2 AND ator_id = 'migracao-e3' AND situacao <> 'INABILITADO'`,
      [e.licitacao_id, String(e.fornecedor_id), motivo],
    );
    rel.inabilitados += contagem(r);
  }
  // 2b. Aprovado → HABILITADO só nas unidades em que ele é o 1º não excluído
  for (const e of eventos.filter((x) => x.tipo === 'HABILITACAO_APROVADA')) {
    const r = await db.query(
      `UPDATE licitantes_unidade lu SET situacao = 'HABILITADO', situacao_em = now(), updated_at = now()
        WHERE lu.licitacao_id = $1 AND lu.fornecedor_id = $2 AND lu.ator_id = 'migracao-e3'
          AND lu.situacao NOT IN ('HABILITADO','INABILITADO','RECUSADO','DESCLASSIFICADO')
          AND NOT EXISTS (SELECT 1 FROM licitantes_unidade o
                           WHERE o.unidade_id = lu.unidade_id AND o.id <> lu.id
                             AND o.situacao NOT IN ('INABILITADO','RECUSADO','DESCLASSIFICADO')
                             AND COALESCE(o.posicao_final, 2147483647) < COALESCE(lu.posicao_final, 2147483647))`,
      [e.licitacao_id, String(e.fornecedor_id)],
    );
    rel.habilitados += contagem(r);
  }

  // 3. Licitações já além do julgamento: aceite implícito do 1º não excluído, por unidade sem aceite
  const aceitos = await db.query(
    `WITH candidatos AS (
       SELECT DISTINCT ON (lu.unidade_id) lu.id, lu.situacao
         FROM licitantes_unidade lu JOIN licitacoes l ON l.id = lu.licitacao_id
        WHERE l.fase::text = ANY($1) AND ${intocada('l.id')}
          AND lu.situacao NOT IN ('DESCLASSIFICADO','RECUSADO','INABILITADO')
          AND NOT EXISTS (SELECT 1 FROM licitantes_unidade x
                           WHERE x.unidade_id = lu.unidade_id AND x.situacao IN ('ACEITO','HABILITADO','VENCEDOR'))
        ORDER BY lu.unidade_id, lu.posicao_final NULLS LAST, lu.created_at
     )
     UPDATE licitantes_unidade SET situacao = 'ACEITO', situacao_em = now(), updated_at = now(),
            motivo = 'Migração E3: aceitação implícita (licitação já estava além do julgamento)'
      WHERE id IN (SELECT id FROM candidatos)`,
    [FASES_POS_JULGAMENTO],
  );
  rel.aceitosImplicitos += contagem(aceitos);

  // 4. Sessões paradas na etapa pós-lances antiga (NEGOCIACAO) com a licitação em JULGAMENTO
  const sessoes = await db.query(
    `UPDATE sessoes_disputa s SET etapa = 'ACEITACAO_PROPOSTA'
       FROM licitacoes l
      WHERE l.id = s.licitacao_id AND s.etapa::text = 'NEGOCIACAO' AND l.fase::text = 'JULGAMENTO'
        AND l.modalidade::text <> 'DISPENSA_ELETRONICA'
        AND NOT EXISTS (SELECT 1 FROM eventos_sessao e WHERE e.sessao_id = s.id AND e.tipo::text LIKE 'NEGOCIACAO_%')`,
  );
  rel.sessoesParaAceitacao += contagem(sessoes);

  return rel;
}
