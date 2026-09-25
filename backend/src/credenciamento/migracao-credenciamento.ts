import type { EntityManager } from 'typeorm';

/**
 * ============================================================================
 * MIGRAÇÃO DO MODELO PARALELO DE CREDENCIAMENTO (plano E7b)
 * ============================================================================
 *
 * Antes: tabelas `credenciamentos`/`credenciados` sem vínculo com a licitação,
 * sem PNCP, validade fixa de 1 ano e sem guarda de estado. Agora: licitação
 * com modalidade CREDENCIAMENTO + `credenciamento_configuracoes` +
 * `credenciamento_inscricoes`.
 *
 * IDEMPOTENTE: a licitação recebe o MESMO id do credenciamento antigo (links
 * `/credenciamento/:id` continuam valendo) e a inscrição o mesmo id do
 * credenciado — o que já existe não é tocado. As tabelas antigas não são
 * apagadas (histórico). PRÉ-QUALIFICAÇÃO (art. 80) não é credenciamento:
 * fica na tabela antiga e é contada em `ignorados`.
 *
 * Mapeamento do status: RASCUNHO → PLANEJAMENTO/ATIVA; PUBLICADO → PUBLICADO;
 * EM_ANDAMENTO → ACOLHIMENTO_PROPOSTAS (inscrições abertas); ENCERRADO →
 * CONCLUIDA; SUSPENSO → SUSPENSA; REVOGADO/ANULADO → REVOGADA/ANULADA.
 * Inscritos: INSCRITO/EM_ANALISE → PENDENTE (documentos do modelo antigo em
 * `legado`, analisados pelo órgão sem a habilitação da E4); APROVADO →
 * CREDENCIADO (validade antiga mantida; ordem do rodízio pela data de
 * aprovação); REPROVADO → INDEFERIDO; SUSPENSO/DESCREDENCIADO → DESCREDENCIADO.
 */

export interface ResultadoMigracaoCredenciamento {
  processos: number;
  inscricoes: number;
  ignorados: number;
}

const FASE_DO_STATUS: Record<string, { fase: string; situacao: string }> = {
  RASCUNHO: { fase: 'PLANEJAMENTO', situacao: 'ATIVA' },
  PUBLICADO: { fase: 'PUBLICADO', situacao: 'ATIVA' },
  EM_ANDAMENTO: { fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'ATIVA' },
  ENCERRADO: { fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'CONCLUIDA' },
  SUSPENSO: { fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'SUSPENSA' },
  REVOGADO: { fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'REVOGADA' },
  ANULADO: { fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'ANULADA' },
};

const STATUS_INSCRICAO: Record<string, string> = {
  INSCRITO: 'PENDENTE',
  EM_ANALISE: 'PENDENTE',
  APROVADO: 'CREDENCIADO',
  REPROVADO: 'INDEFERIDO',
  SUSPENSO: 'DESCREDENCIADO',
  DESCREDENCIADO: 'DESCREDENCIADO',
};

export function houveMudancaCredenciamento(r: ResultadoMigracaoCredenciamento): boolean {
  return r.processos + r.inscricoes > 0;
}

export function resumoMigracaoCredenciamento(r: ResultadoMigracaoCredenciamento): string {
  return `${r.processos} credenciamento(s) → processo, ${r.inscricoes} inscrito(s) → inscrição, ${r.ignorados} pré-qualificação(ões) mantida(s) no modelo antigo`;
}

async function tabelaExiste(m: EntityManager, nome: string): Promise<boolean> {
  const [r] = await m.query(`SELECT to_regclass($1) IS NOT NULL AS existe`, [`public.${nome}`]);
  return !!r?.existe;
}

const texto = (v: any) => (v == null ? '' : String(v).trim());

export async function migrarCredenciamentosLegados(m: EntityManager): Promise<ResultadoMigracaoCredenciamento> {
  const r: ResultadoMigracaoCredenciamento = { processos: 0, inscricoes: 0, ignorados: 0 };
  if (!(await tabelaExiste(m, 'credenciamentos'))) return r;
  const temCredenciados = await tabelaExiste(m, 'credenciados');

  const antigos: any[] = await m.query(`SELECT c.*, c.tipo::text AS tipo_txt, c.status::text AS status_txt FROM credenciamentos c ORDER BY c.created_at`);
  for (const c of antigos) {
    if (c.tipo_txt === 'PRE_QUALIFICACAO') {
      r.ignorados++;
      continue;
    }
    const [ja] = await m.query(`SELECT 1 FROM licitacoes WHERE id = $1`, [c.id]);
    if (!ja) {
      const destino = FASE_DO_STATUS[c.status_txt] ?? FASE_DO_STATUS.RASCUNHO;
      let numeroProcesso = texto(c.numero_processo) || `CRED-${c.numero_edital || c.id.slice(0, 8)}`;
      const [conflito] = await m.query(`SELECT 1 FROM licitacoes WHERE numero_processo = $1`, [numeroProcesso]);
      if (conflito) numeroProcesso = `${numeroProcesso} (credenciamento ${texto(c.numero_edital) || c.id.slice(0, 8)})`;
      const publicado = destino.fase !== 'PLANEJAMENTO';
      const inicio = c.data_inicio_inscricoes ?? c.data_publicacao ?? null;
      const fim = c.inscricao_permanente ? null : c.data_fim_inscricoes ?? null;
      const notas = [
        '[Migração E7b] Credenciamento do modelo anterior (tabela credenciamentos) convertido em processo.',
        c.requisitos_habilitacao && `Requisitos de habilitação (texto antigo): ${c.requisitos_habilitacao}`,
        c.requisitos_tecnicos && `Requisitos técnicos: ${c.requisitos_tecnicos}`,
        c.documentos_exigidos && `Documentos exigidos: ${c.documentos_exigidos}`,
        c.forma_pagamento && `Forma de pagamento: ${c.forma_pagamento}`,
        c.edital_url && `Edital (link antigo): ${c.edital_url}`,
        c.anexos_url && `Anexos (link antigo): ${c.anexos_url}`,
        c.responsavel_nome && `Responsável: ${c.responsavel_nome}${c.responsavel_cargo ? ` (${c.responsavel_cargo})` : ''}`,
        c.observacoes && `Observações: ${c.observacoes}`,
        c.inscricao_permanente && 'Inscrição permanente (sem data de fim) — defina o fim da vigência do edital.',
      ]
        .filter(Boolean)
        .join('\n');
      await m.query(
        `INSERT INTO licitacoes (id, numero_processo, numero_edital, ano, sequencial, orgao_id, objeto, objeto_detalhado, justificativa,
                                 modalidade, tipo_contratacao, criterio_julgamento, modo_disputa, fase, situacao, valor_total_estimado,
                                 data_publicacao_edital, data_inicio_acolhimento, data_fim_acolhimento, fase_interna_concluida,
                                 tratamento_diferenciado_mpe, observacoes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CREDENCIAMENTO', 'SERVICO', 'MENOR_PRECO', 'ABERTO', $10, $11, $12,
                 $13, $14, $15, $16, false, $17, $18, now())`,
        [
          c.id,
          numeroProcesso,
          c.numero_edital ?? null,
          c.ano ?? null,
          c.sequencial ?? null,
          c.orgao_id,
          c.objeto,
          c.objeto_detalhado ?? null,
          c.justificativa ?? null,
          destino.fase,
          destino.situacao,
          c.valor_estimado ?? null,
          publicado ? c.data_publicacao ?? null : null,
          publicado ? inicio : null,
          publicado ? fim : null,
          publicado,
          notas,
          c.created_at ?? new Date(),
        ],
      );
      await m.query(
        `INSERT INTO credenciamento_configuracoes (licitacao_id, hipotese, regra_distribuicao, vigencia_inicio, vigencia_fim,
                                                  condicoes_padronizadas, prazo_denuncia_dias, origem, created_at, updated_at)
         VALUES ($1, 'PARALELA_NAO_EXCLUDENTE', 'RODIZIO', $2, $3, $4, NULL, 'LEGADO', now(), now())
         ON CONFLICT (licitacao_id) DO NOTHING`,
        [c.id, inicio, fim, [c.requisitos_tecnicos, c.forma_pagamento && `Pagamento: ${c.forma_pagamento}`].filter(Boolean).join('\n') || null],
      );
      await m.query(
        `INSERT INTO licitacao_transicoes (id, licitacao_id, fase_de, fase_para, situacao_de, situacao_para, ato, motivo, ator_tipo, ator_id, dados, created_at)
         VALUES (gen_random_uuid(), $1, NULL, $2, NULL, $3, 'MIGRACAO_CREDENCIAMENTO', $4, 'SISTEMA', 'migracao-e7b', $5::jsonb, now())`,
        [c.id, destino.fase, destino.situacao, `Credenciamento do modelo anterior (status ${c.status_txt}) convertido em processo.`, JSON.stringify({ status_antigo: c.status_txt })],
      );
      r.processos++;
    }

    if (!temCredenciados) continue;
    const inscritos: any[] = await m.query(
      `SELECT d.*, d.status::text AS status_txt FROM credenciados d
        WHERE d.credenciamento_id = $1 AND NOT EXISTS (SELECT 1 FROM credenciamento_inscricoes i WHERE i.id = d.id)
        ORDER BY d.data_aprovacao NULLS LAST, d.data_inscricao, d.id`,
      [c.id],
    );
    for (const d of inscritos) {
      const status = STATUS_INSCRICAO[d.status_txt] ?? 'PENDENTE';
      const credenciado = status === 'CREDENCIADO';
      const descredenciado = status === 'DESCREDENCIADO';
      const [{ ordem }] = credenciado
        ? await m.query(`SELECT COALESCE(MAX(ordem_rodizio), 0) + 1 AS ordem FROM credenciamento_inscricoes WHERE licitacao_id = $1`, [c.id])
        : [{ ordem: null }];
      await m.query(
        `INSERT INTO credenciamento_inscricoes (id, licitacao_id, fornecedor_id, fornecedor_cnpj, fornecedor_razao_social, status, habilitacao_id,
                                               inscrita_em, decidida_em, decisao_motivo, decidida_por_tipo, credenciado_em, validade_ate, ordem_rodizio,
                                               descredenciamento_iniciativa, descredenciamento_motivo, descredenciamento_efeitos_em,
                                               origem, legado, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'LEGADO', $17::jsonb, now(), now())`,
        [
          d.id,
          c.id,
          d.fornecedor_id,
          d.fornecedor_cnpj ?? null,
          d.fornecedor_razao_social ?? null,
          status,
          d.data_inscricao ?? d.created_at ?? new Date(),
          status === 'PENDENTE' ? null : d.data_analise ?? d.data_aprovacao ?? null,
          status === 'INDEFERIDO' ? texto(d.motivo_reprovacao) || texto(d.parecer) || 'Reprovado no modelo anterior' : texto(d.parecer) || null,
          status === 'PENDENTE' ? null : 'LEGADO',
          credenciado || descredenciado ? d.data_aprovacao ?? null : null,
          credenciado ? d.data_validade ?? null : null,
          ordem,
          descredenciado ? 'ADMINISTRACAO_DESCUMPRIMENTO' : null,
          descredenciado ? `${d.status_txt === 'SUSPENSO' ? 'Suspenso' : 'Descredenciado'} no modelo anterior (migração).` : null,
          descredenciado ? d.updated_at ?? new Date() : null,
          JSON.stringify({
            status_antigo: d.status_txt,
            analista_nome: d.analista_nome ?? null,
            parecer: d.parecer ?? null,
            documentos_enviados: d.documentos_enviados ?? null,
            documentos_pendentes: d.documentos_pendentes ?? null,
          }),
        ],
      );
      r.inscricoes++;
    }
  }
  return r;
}
