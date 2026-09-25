import type { ExecutorSql } from '../disputa-v2/migracao-lances';
import { calendarioDoOrgao, fimDoPrazoEmDiasUteis } from '../common/prazos/dias-uteis';

/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS DOS RECURSOS (plano E5) — idempotente
 * ============================================================================
 *
 * Antes da E5 havia dois caminhos paralelos: a INTENÇÃO como evento da sessão
 * (`INTENCAO_RECURSO_REGISTRADA`, sem registro próprio, com "abrir/encerrar
 * prazo" só na tela) e o RECURSO formal criado pelo pregoeiro ao "admitir"
 * (com contrarrazões numa lista JSON e decisão única). Esta rotina leva tudo
 * ao modelo novo, sem inventar decisões:
 *  1. JANELAS: cada prazo de intenção do fluxo antigo (evento
 *     PRAZO_RECURSAL_INICIADO; ou o encerramento "Prazo de intencao de recurso
 *     encerrado…"; ou, sem nenhum dos dois, a 1ª intenção/recurso da sessão)
 *     vira uma janela ENCERRADA em `janelas_intencao_recurso` (origem
 *     MIGRACAO_E5). Aberta = início do prazo; fechada = encerramento
 *     registrado ou início + 10 min;
 *  2. INTENÇÕES sem recurso formal viram recurso: status INTENCAO (aguarda o
 *     juízo de admissibilidade — bloqueia a adjudicação, como manda o art.
 *     168) quando a licitação está ATIVA em HABILITACAO/RECURSO; senão
 *     NAO_CONHECIDO (registro histórico: a licitação já seguiu sem apreciá-la);
 *  3. RECURSOS existentes: contrarrazões da lista JSON → `recursos_contrarrazoes`;
 *     ato recorrido desconhecido → OUTRO; RAZOES_APRESENTADAS → CONTRARRAZOES;
 *     prazos de contrarrazões/reconsideração calculados quando ausentes;
 *     decididos → instância LEGADO, sem efeito automático (nada é refeito
 *     retroativamente).
 * Marca de idempotência: `origem` preenchida (recursos) e janelas/linhas com
 * origem MIGRACAO_E5 conferidas por NOT EXISTS / ON CONFLICT.
 */

export interface RelatorioMigracaoRecursos {
  janelas: number;
  intencoes: number;
  contrarrazoes: number;
  recursos: number;
}

export const houveMudancaRecursos = (r: RelatorioMigracaoRecursos) =>
  r.janelas + r.intencoes + r.contrarrazoes + r.recursos > 0;

export const resumoMigracaoRecursos = (r: RelatorioMigracaoRecursos) =>
  `${r.janelas} janela(s) de intenção reconstituída(s), ${r.intencoes} intenção(ões) → recurso, ` +
  `${r.contrarrazoes} contrarrazão(ões) migrada(s), ${r.recursos} recurso(s) ajustado(s)`;

const MINUTOS_LEGADO = 10;
const DIAS_UTEIS = 3;
const ENCERRAMENTO_LEGADO = 'Prazo de intencao de recurso encerrado%';

const linhas = (r: any): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : Array.isArray(r) ? r : []);
const data = (v: any): Date | null => (v ? new Date(v) : null);

export async function migrarRecursos(db: ExecutorSql): Promise<RelatorioMigracaoRecursos> {
  const rel: RelatorioMigracaoRecursos = { janelas: 0, intencoes: 0, contrarrazoes: 0, recursos: 0 };

  // ------------------------------------------------------------------------
  // 1. Janelas do fluxo antigo
  // ------------------------------------------------------------------------
  const eventos = linhas(
    await db.query(
      `SELECT e.sessao_id::text AS sessao_id, s.licitacao_id::text AS licitacao_id, e.tipo::text AS tipo,
              e.created_at, e.usuario_nome, e.descricao
         FROM eventos_sessao e JOIN sessoes_disputa s ON s.id = e.sessao_id
        WHERE COALESCE(e.dados_adicionais->>'origem', '') <> 'recursos'
          AND (e.tipo::text IN ('PRAZO_RECURSAL_INICIADO', 'INTENCAO_RECURSO_REGISTRADA')
               OR (e.tipo::text = 'MENSAGEM_SISTEMA' AND e.descricao LIKE $1))
        ORDER BY e.sessao_id, e.created_at`,
      [ENCERRAMENTO_LEGADO],
    ),
  );
  const recursosLegados = linhas(
    await db.query(
      `SELECT sessao_id::text AS sessao_id, licitacao_id::text AS licitacao_id, MIN(COALESCE(data_intencao, created_at)) AS primeira
         FROM recursos_administrativos WHERE origem IS NULL GROUP BY sessao_id, licitacao_id`,
    ),
  );
  const porSessao = new Map<string, { licitacaoId: string; janelas: Array<{ aberta: Date; fecha: Date; por: string | null }> }>();
  const sessao = (id: string, licitacaoId: string) => {
    if (!porSessao.has(id)) porSessao.set(id, { licitacaoId, janelas: [] });
    return porSessao.get(id)!;
  };
  const abertaAtual = new Map<string, { aberta: Date; por: string | null } | null>();
  for (const e of eventos) {
    const s = sessao(e.sessao_id, e.licitacao_id);
    const t = new Date(e.created_at);
    if (e.tipo === 'PRAZO_RECURSAL_INICIADO') {
      const anterior = abertaAtual.get(e.sessao_id);
      if (anterior) s.janelas.push({ aberta: anterior.aberta, fecha: new Date(anterior.aberta.getTime() + MINUTOS_LEGADO * 60_000), por: anterior.por });
      abertaAtual.set(e.sessao_id, { aberta: t, por: e.usuario_nome ?? null });
    } else if (e.tipo === 'MENSAGEM_SISTEMA') {
      const anterior = abertaAtual.get(e.sessao_id);
      s.janelas.push({ aberta: anterior?.aberta ?? new Date(t.getTime() - MINUTOS_LEGADO * 60_000), fecha: t, por: anterior?.por ?? e.usuario_nome ?? null });
      abertaAtual.set(e.sessao_id, null);
    } else if (e.tipo === 'INTENCAO_RECURSO_REGISTRADA' && !abertaAtual.get(e.sessao_id) && !s.janelas.some((j) => j.aberta <= t && t <= j.fecha)) {
      // intenção sem prazo aberto registrado: janela reconstituída a partir dela
      abertaAtual.set(e.sessao_id, { aberta: t, por: null });
    }
  }
  for (const [sessaoId, a] of abertaAtual) {
    if (a) sessao(sessaoId, porSessao.get(sessaoId)!.licitacaoId).janelas.push({ aberta: a.aberta, fecha: new Date(a.aberta.getTime() + MINUTOS_LEGADO * 60_000), por: a.por });
  }
  for (const r of recursosLegados) {
    const s = sessao(r.sessao_id, r.licitacao_id);
    if (!s.janelas.length) {
      const t = new Date(r.primeira);
      s.janelas.push({ aberta: t, fecha: new Date(t.getTime() + MINUTOS_LEGADO * 60_000), por: null });
    }
  }
  for (const [sessaoId, s] of porSessao) {
    for (const j of s.janelas) {
      const r = await db.query(
        `INSERT INTO janelas_intencao_recurso (id, sessao_id, licitacao_id, aberta_em, fecha_em, minutos, aberta_por_nome, origem, created_at)
         SELECT gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6, 'MIGRACAO_E5', now()
          WHERE NOT EXISTS (SELECT 1 FROM janelas_intencao_recurso WHERE sessao_id = $1::uuid AND origem = 'MIGRACAO_E5' AND aberta_em = $3)
         RETURNING id`,
        [sessaoId, s.licitacaoId, j.aberta, j.fecha, Math.max(MINUTOS_LEGADO, Math.round((j.fecha.getTime() - j.aberta.getTime()) / 60_000)), j.por],
      );
      rel.janelas += linhas(r).length;
    }
  }

  // ------------------------------------------------------------------------
  // 2. Intenções (eventos) sem recurso formal
  // ------------------------------------------------------------------------
  const intencoes = linhas(
    await db.query(
      `SELECT e.id::text AS evento_id, e.sessao_id::text AS sessao_id, s.licitacao_id::text AS licitacao_id,
              e.fornecedor_identificador AS fornecedor_id, e.created_at, e.dados_adicionais->>'motivacao' AS motivacao,
              e.descricao, l.fase::text AS fase, l.situacao::text AS situacao, f.razao_social
         FROM eventos_sessao e
         JOIN sessoes_disputa s ON s.id = e.sessao_id
         JOIN licitacoes l ON l.id = s.licitacao_id
         LEFT JOIN fornecedores f ON f.id::text = e.fornecedor_identificador
        WHERE e.tipo::text = 'INTENCAO_RECURSO_REGISTRADA'
          AND COALESCE(e.dados_adicionais->>'origem', '') <> 'recursos'
          AND e.fornecedor_identificador IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM recursos_administrativos r
                           WHERE r.sessao_id::text = e.sessao_id::text AND r.fornecedor_id = e.fornecedor_identificador)`,
    ),
  );
  for (const i of intencoes) {
    const ativaNaFase = i.situacao === 'ATIVA' && ['HABILITACAO', 'RECURSO'].includes(i.fase);
    const [janela] = linhas(
      await db.query(
        `SELECT id FROM janelas_intencao_recurso WHERE sessao_id = $1::uuid AND aberta_em <= $2 ORDER BY aberta_em DESC LIMIT 1`,
        [i.sessao_id, i.created_at],
      ),
    );
    const r = await db.query(
      `INSERT INTO recursos_administrativos
         (id, sessao_id, licitacao_id, fornecedor_id, fornecedor_nome, motivacao_intencao, data_intencao, status,
          ato_recorrido, janela_id, motivo_nao_conhecimento, origem, created_at, updated_at)
       SELECT gen_random_uuid(), s.id, s.licitacao_id, $3::text, $4::text, $5::text, $6::timestamp, $7, 'OUTRO', $8::uuid, $9::text, 'MIGRACAO_E5', $6::timestamp, now()
         FROM sessoes_disputa s
        WHERE s.id::text = $1::text AND s.licitacao_id::text = $2::text
          AND NOT EXISTS (SELECT 1 FROM recursos_administrativos WHERE sessao_id::text = $1::text AND fornecedor_id = $3::text)
       RETURNING id`,
      [
        i.sessao_id,
        i.licitacao_id,
        i.fornecedor_id,
        i.razao_social ?? null,
        i.motivacao || i.descricao,
        i.created_at,
        ativaNaFase ? 'INTENCAO' : 'NAO_CONHECIDO',
        janela?.id ?? null,
        ativaNaFase
          ? null
          : 'Intenção registrada no fluxo anterior à E5 sem juízo de admissibilidade; a licitação já seguiu (registro histórico).',
      ],
    );
    rel.intencoes += linhas(r).length;
  }

  // ------------------------------------------------------------------------
  // 3. Recursos formais do fluxo antigo
  // ------------------------------------------------------------------------
  const antigos = linhas(
    await db.query(
      `SELECT r.id::text AS id, r.sessao_id::text AS sessao_id, r.licitacao_id::text AS licitacao_id, r.status::text AS status,
              r.contrarrazoes, r.prazo_razoes, r.data_razoes, r.prazo_contrarrazoes, r.prazo_reconsideracao,
              r.data_intencao, r.updated_at, r.janela_id,
              (SELECT l.orgao_id::text FROM licitacoes l WHERE l.id::text = r.licitacao_id::text) AS orgao_id
         FROM recursos_administrativos r WHERE r.origem IS NULL`,
    ),
  );
  for (const r of antigos) {
    const lista = (typeof r.contrarrazoes === 'string' ? JSON.parse(r.contrarrazoes) : r.contrarrazoes) ?? [];
    for (const c of Array.isArray(lista) ? lista : []) {
      if (!c?.fornecedor_id || !c?.texto) continue;
      const ins = await db.query(
        `INSERT INTO recursos_contrarrazoes (id, recurso_id, licitacao_id, fornecedor_id, fornecedor_nome, texto, origem, apresentada_em, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, 'MIGRACAO_E5', $6, now())
         ON CONFLICT (recurso_id, fornecedor_id) DO NOTHING RETURNING id`,
        [r.id, r.licitacao_id, String(c.fornecedor_id), c.fornecedor_nome ?? null, String(c.texto), c.data ? new Date(c.data) : new Date(r.updated_at)],
      );
      rel.contrarrazoes += linhas(ins).length;
    }
    let status: string = r.status;
    if (status === 'RAZOES_APRESENTADAS') status = 'CONTRARRAZOES';
    let prazoContrarrazoes = data(r.prazo_contrarrazoes);
    if (status === 'CONTRARRAZOES' && !prazoContrarrazoes) {
      const base = data(r.prazo_razoes) ?? data(r.data_razoes) ?? new Date(r.updated_at);
      prazoContrarrazoes = fimDoPrazoEmDiasUteis(base, DIAS_UTEIS, calendarioDoOrgao(r.orgao_id ?? null));
    }
    let prazoReconsideracao = data(r.prazo_reconsideracao);
    if (status === 'EM_ANALISE' && !prazoReconsideracao) {
      prazoReconsideracao = fimDoPrazoEmDiasUteis(prazoContrarrazoes ?? new Date(r.updated_at), DIAS_UTEIS, calendarioDoOrgao(r.orgao_id ?? null));
    }
    const decidido = ['PROVIDO', 'IMPROVIDO'].includes(status);
    const [janela] = r.janela_id
      ? [{ id: r.janela_id }]
      : linhas(
          await db.query(
            `SELECT id FROM janelas_intencao_recurso WHERE sessao_id = $1::uuid ORDER BY aberta_em ASC LIMIT 1`,
            [r.sessao_id],
          ),
        );
    const up = await db.query(
      `UPDATE recursos_administrativos
          SET status = $2, ato_recorrido = COALESCE(ato_recorrido, 'OUTRO'), prazo_contrarrazoes = $3, prazo_reconsideracao = $4,
              instancia_decisao = CASE WHEN $5 THEN COALESCE(instancia_decisao, 'LEGADO') ELSE instancia_decisao END,
              efeitos = CASE WHEN $5 AND efeitos IS NULL THEN $6::jsonb ELSE efeitos END,
              janela_id = COALESCE(janela_id, $7), origem = 'MIGRACAO_E5', updated_at = now()
        WHERE id::text = $1 AND origem IS NULL
        RETURNING id`,
      [
        r.id,
        status,
        prazoContrarrazoes,
        prazoReconsideracao,
        decidido,
        JSON.stringify({
          automatico: false,
          aplicado_em: new Date().toISOString(),
          alteracoes: [],
          aceitacoes_canceladas: [],
          alterou_resultado: false,
          fase_concluida: true,
          observacao: 'Decidido antes da E5 — sem efeito automático aplicado (registro histórico).',
        }),
        janela?.id ?? null,
      ],
    );
    rel.recursos += linhas(up).length;
  }
  return rel;
}
