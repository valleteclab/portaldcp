import { randomUUID } from 'crypto';
import { FaseLicitacao, FASES_LEGADAS_DE_SITUACAO, SituacaoLicitacao } from '../entities/licitacao.entity';
import { ORDEM_FASES } from './fases';
import { REGISTRO_MIGRACAO_SITUACAO } from './transicoes.tipos';

/**
 * ============================================================================
 * MIGRAÇÃO DE DADOS — fase legada de situação → `situacao` + fase real (E1)
 * ============================================================================
 *
 * Antes da E1, suspender/revogar/anular gravavam a SITUAÇÃO no lugar da fase
 * (fase = 'SUSPENSO', 'REVOGADO'...), perdendo a fase do processo. Esta rotina
 * leva cada linha legada para o modelo novo:
 *
 *   situacao ← SUSPENSO→SUSPENSA · REVOGADO→REVOGADA · ANULADO→ANULADA ·
 *              DESERTO→DESERTA · FRACASSADO→FRACASSADA · CONCLUIDO→CONCLUIDA
 *   fase     ← melhor inferência da fase REAL do processo (regra abaixo)
 *
 * REGRA DE INFERÊNCIA DA FASE (a primeira que casar):
 *   1. fase_anterior preenchida e válida (não legada)  → fase_anterior
 *   2. CONCLUIDO                                        → HOMOLOGACAO
 *   3. data_homologacao                                 → HOMOLOGACAO
 *   4. data_adjudicacao OU algum item com vencedor      → ADJUDICACAO
 *   5. data_fim_disputa                                 → JULGAMENTO
 *   6. data_inicio_disputa                              → EM_DISPUTA
 *   7. fim do acolhimento (ou abertura da sessão) já passou → ANALISE_PROPOSTAS
 *   8. início do acolhimento já passou                  → ACOLHIMENTO_PROPOSTAS
 *   9. data_publicacao_edital                           → PUBLICADO
 *  10. fase_interna_concluida                           → APROVACAO_INTERNA
 *  11. senão                                            → PLANEJAMENTO
 *
 * IDEMPOTENTE: só toca linhas cuja fase ainda é um valor legado; o UPDATE
 * confere a fase legada no WHERE (duas execuções simultâneas não duplicam).
 * `observacoes` NÃO é alterada (o motivo histórico continua lá). Cada linha
 * migrada ganha um registro em `licitacao_transicoes` (ato MIGRACAO_SITUACAO,
 * ator SISTEMA/migracao) com a regra usada.
 */

export const MAPA_SITUACAO_LEGADA: Record<string, SituacaoLicitacao> = {
  [FaseLicitacao.SUSPENSO]: SituacaoLicitacao.SUSPENSA,
  [FaseLicitacao.REVOGADO]: SituacaoLicitacao.REVOGADA,
  [FaseLicitacao.ANULADO]: SituacaoLicitacao.ANULADA,
  [FaseLicitacao.DESERTO]: SituacaoLicitacao.DESERTA,
  [FaseLicitacao.FRACASSADO]: SituacaoLicitacao.FRACASSADA,
  [FaseLicitacao.CONCLUIDO]: SituacaoLicitacao.CONCLUIDA,
};

export interface LinhaLegada {
  id: string;
  fase: string;
  fase_anterior?: string | null;
  data_publicacao_edital?: Date | string | null;
  data_inicio_acolhimento?: Date | string | null;
  data_fim_acolhimento?: Date | string | null;
  data_abertura_sessao?: Date | string | null;
  data_inicio_disputa?: Date | string | null;
  data_fim_disputa?: Date | string | null;
  data_adjudicacao?: Date | string | null;
  data_homologacao?: Date | string | null;
  fase_interna_concluida?: boolean | null;
  tem_vencedor?: boolean | null;
}

export interface EstadoInferido {
  fase: FaseLicitacao;
  situacao: SituacaoLicitacao;
  regra: string;
}

const passou = (d: Date | string | null | undefined, agora: Date) => !!d && new Date(d) <= agora;

/** Função PURA: estado novo de uma linha legada (null se a linha não é legada). */
export function inferirEstadoLegado(l: LinhaLegada, agora: Date = new Date()): EstadoInferido | null {
  const situacao = MAPA_SITUACAO_LEGADA[l.fase];
  if (!situacao) return null;
  const r = (fase: FaseLicitacao, regra: string): EstadoInferido => ({ fase, situacao, regra });

  if (l.fase_anterior && ORDEM_FASES.includes(l.fase_anterior as FaseLicitacao)) {
    return r(l.fase_anterior as FaseLicitacao, 'fase_anterior');
  }
  if (l.fase === FaseLicitacao.CONCLUIDO) return r(FaseLicitacao.HOMOLOGACAO, 'concluido');
  if (l.data_homologacao) return r(FaseLicitacao.HOMOLOGACAO, 'data_homologacao');
  if (l.data_adjudicacao || l.tem_vencedor) return r(FaseLicitacao.ADJUDICACAO, l.data_adjudicacao ? 'data_adjudicacao' : 'item_com_vencedor');
  if (l.data_fim_disputa) return r(FaseLicitacao.JULGAMENTO, 'data_fim_disputa');
  if (l.data_inicio_disputa) return r(FaseLicitacao.EM_DISPUTA, 'data_inicio_disputa');
  if (passou(l.data_fim_acolhimento || l.data_abertura_sessao, agora)) {
    return r(FaseLicitacao.ANALISE_PROPOSTAS, 'fim_acolhimento_passou');
  }
  if (passou(l.data_inicio_acolhimento, agora)) return r(FaseLicitacao.ACOLHIMENTO_PROPOSTAS, 'inicio_acolhimento_passou');
  if (l.data_publicacao_edital) return r(FaseLicitacao.PUBLICADO, 'data_publicacao_edital');
  if (l.fase_interna_concluida) return r(FaseLicitacao.APROVACAO_INTERNA, 'fase_interna_concluida');
  return r(FaseLicitacao.PLANEJAMENTO, 'padrao');
}

/** UPDATE via TypeORM devolve [linhas, rowCount]; outros executores, as linhas. */
function linhasAfetadas(r: any): number {
  if (Array.isArray(r)) {
    if (r.length === 2 && Array.isArray(r[0]) && typeof r[1] === 'number') return r[1];
    return r.length;
  }
  return Number(r?.rowCount ?? r?.affected ?? 0);
}

/** Qualquer coisa com `.query(sql, params)` (QueryRunner, EntityManager, DataSource). */
export interface ExecutorSql {
  query(sql: string, params?: any[]): Promise<any>;
}

export interface ResultadoMigracao {
  encontradas: number;
  migradas: number;
  detalhes: Array<{ id: string; de: string; fase: FaseLicitacao; situacao: SituacaoLicitacao; regra: string }>;
}

/**
 * Executa a migração (idempotente). Pressupõe que as colunas `situacao`,
 * `fase_anterior` e a tabela `licitacao_transicoes` existem — o synchronize
 * (boot) ou a migration TypeORM as criam antes.
 */
export async function migrarSituacaoLegada(executor: ExecutorSql, agora: Date = new Date()): Promise<ResultadoMigracao> {
  const legadas = FASES_LEGADAS_DE_SITUACAO as string[];
  const linhas: LinhaLegada[] = await executor.query(
    `SELECT l.id, l.fase::text AS fase, l.fase_anterior, l.data_publicacao_edital, l.data_inicio_acolhimento,
            l.data_fim_acolhimento, l.data_abertura_sessao, l.data_inicio_disputa, l.data_fim_disputa,
            l.data_adjudicacao, l.data_homologacao, l.fase_interna_concluida,
            EXISTS (SELECT 1 FROM itens_licitacao i
                    WHERE i.licitacao_id = l.id AND i.fornecedor_vencedor_id IS NOT NULL) AS tem_vencedor
       FROM licitacoes l
      WHERE l.fase::text = ANY($1::text[])`,
    [legadas],
  );

  const resultado: ResultadoMigracao = { encontradas: linhas.length, migradas: 0, detalhes: [] };
  for (const linha of linhas) {
    const novo = inferirEstadoLegado(linha, agora);
    if (!novo) continue;
    const atualizadas = await executor.query(
      `UPDATE licitacoes SET fase = $2, situacao = $3
        WHERE id = $1 AND fase::text = $4
        RETURNING id`,
      [linha.id, novo.fase, novo.situacao, linha.fase],
    );
    if (linhasAfetadas(atualizadas) === 0) continue; // outra execução já migrou esta linha
    await executor.query(
      `INSERT INTO licitacao_transicoes
         (id, licitacao_id, fase_de, fase_para, situacao_de, situacao_para, ato, motivo, ator_tipo, ator_id, dados)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, 'SISTEMA', 'migracao', $8::jsonb)`,
      [
        randomUUID(),
        linha.id,
        linha.fase,
        novo.fase,
        novo.situacao,
        REGISTRO_MIGRACAO_SITUACAO,
        `Migração E1: fase legada ${linha.fase} → situação ${novo.situacao}, fase ${novo.fase} (regra: ${novo.regra}).`,
        JSON.stringify({ fase_legada: linha.fase, regra: novo.regra }),
      ],
    );
    resultado.migradas += 1;
    resultado.detalhes.push({ id: linha.id, de: linha.fase, fase: novo.fase, situacao: novo.situacao, regra: novo.regra });
  }
  return resultado;
}
