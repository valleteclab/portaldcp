import type { EntityManager } from 'typeorm';
import { garantirExigenciasSql } from './habilitacao.sql';

export interface RelatorioMigracaoHabilitacao {
  licitacoesComExigencias: number;
  exigenciasCriadas: number;
  convocacoesMigradas: number;
}

/** Prazo dado às convocações anteriores à E4 (contado da implantação). */
export const PRAZO_CONVOCACAO_MIGRADA_HORAS = 24;

/**
 * MIGRAÇÃO DE DADOS DA HABILITAÇÃO (plano E4 item 8) — idempotente:
 *  1. licitação em HABILITACAO sem exigências → modelo padrão do objeto;
 *  2. sessão com convocado da habilitação antiga (`fornecedor_habilitacao_id`)
 *     e sem habilitação registrada → cria a habilitação (origem MIGRACAO,
 *     prazo de 24 h a partir de agora, pré-checagem do cadastro) para o
 *     licitante poder enviar pelo fluxo novo. Os EVENTOS antigos da sessão
 *     (convocação/aprovação/reprovação) ficam como estão (registro da ata).
 * `criarConvocacao` é o do HabilitacaoService (mesma regra do cadastro).
 */
export async function migrarHabilitacao(
  m: EntityManager,
  criarConvocacao: (m: EntityManager, p: { licitacaoId: string; sessaoId: string; fornecedorId: string; prazoHoras: number }) => Promise<void>,
): Promise<RelatorioMigracaoHabilitacao> {
  const r: RelatorioMigracaoHabilitacao = { licitacoesComExigencias: 0, exigenciasCriadas: 0, convocacoesMigradas: 0 };
  const lics: any[] = await m.query(
    `SELECT l.id FROM licitacoes l
      WHERE l.fase::text = 'HABILITACAO'
        AND NOT EXISTS (SELECT 1 FROM exigencias_habilitacao e WHERE e.licitacao_id = l.id)`,
  );
  for (const l of lics) {
    const { criadas } = await garantirExigenciasSql(m, String(l.id));
    if (criadas) {
      r.licitacoesComExigencias++;
      r.exigenciasCriadas += criadas;
    }
  }
  const convocados: any[] = await m.query(
    `SELECT s.id AS sessao_id, s.licitacao_id, s.fornecedor_habilitacao_id AS fornecedor_id
       FROM sessoes_disputa s JOIN licitacoes l ON l.id = s.licitacao_id
      WHERE s.fornecedor_habilitacao_id IS NOT NULL AND l.fase::text = 'HABILITACAO' AND l.situacao::text = 'ATIVA'
        AND NOT EXISTS (SELECT 1 FROM habilitacoes_licitante h
                         WHERE h.licitacao_id = s.licitacao_id AND h.fornecedor_id = s.fornecedor_habilitacao_id::text)`,
  );
  for (const c of convocados) {
    await criarConvocacao(m, {
      licitacaoId: String(c.licitacao_id),
      sessaoId: String(c.sessao_id),
      fornecedorId: String(c.fornecedor_id),
      prazoHoras: PRAZO_CONVOCACAO_MIGRADA_HORAS,
    });
    r.convocacoesMigradas++;
  }
  return r;
}

export const houveMudancaHabilitacao = (r: RelatorioMigracaoHabilitacao) =>
  r.exigenciasCriadas > 0 || r.convocacoesMigradas > 0;

export const resumoMigracaoHabilitacao = (r: RelatorioMigracaoHabilitacao) =>
  `${r.exigenciasCriadas} exigência(s) padrão em ${r.licitacoesComExigencias} licitação(ões) em habilitação; ` +
  `${r.convocacoesMigradas} convocação(ões) antiga(s) trazida(s) para o fluxo novo`;
