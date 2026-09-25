import type { EntityManager } from 'typeorm';
import type { EstadoEditalCredenciamento } from './regras-credenciamento';

/**
 * Consultas SEM injeção de dependência (usadas pela máquina de estados —
 * TransicoesService.consultas — e pelo CredenciamentoService).
 */

/** Regras do edital de chamamento + itens (pré-condição do PUBLICAR do credenciamento). */
export async function estadoEditalCredenciamentoSql(m: EntityManager, licitacaoId: string): Promise<EstadoEditalCredenciamento | null> {
  const [c] = await m.query(
    `SELECT hipotese, regra_distribuicao, vigencia_inicio, vigencia_fim, condicoes_padronizadas,
            prazo_denuncia_dias, validade_credenciado_meses
       FROM credenciamento_configuracoes WHERE licitacao_id::text = $1`,
    [licitacaoId],
  );
  if (!c) return null;
  const itens = await m.query(
    `SELECT numero_item, descricao_resumida AS descricao, valor_unitario_estimado
       FROM itens_licitacao WHERE licitacao_id::text = $1 ORDER BY numero_item`,
    [licitacaoId],
  );
  return {
    hipotese: c.hipotese,
    regra_distribuicao: c.regra_distribuicao,
    vigencia_inicio: c.vigencia_inicio,
    vigencia_fim: c.vigencia_fim,
    condicoes_padronizadas: c.condicoes_padronizadas,
    prazo_denuncia_dias: c.prazo_denuncia_dias == null ? null : Number(c.prazo_denuncia_dias),
    validade_credenciado_meses: c.validade_credenciado_meses == null ? null : Number(c.validade_credenciado_meses),
    itens: itens.map((i: any) => ({ numero_item: Number(i.numero_item), descricao: i.descricao, valor_unitario_estimado: Number(i.valor_unitario_estimado) })),
  };
}

/** Encerramento da vigência: inscrições sem decisão são arquivadas (não haverá mais contratações). */
export async function arquivarInscricoesPendentesSql(m: EntityManager, licitacaoId: string): Promise<number> {
  const r = await m.query(
    `UPDATE credenciamento_inscricoes
        SET status = 'ARQUIVADA', decisao_motivo = COALESCE(decisao_motivo, 'Vigência do edital de credenciamento encerrada antes da decisão.'),
            decidida_em = COALESCE(decidida_em, $2), updated_at = $2
      WHERE licitacao_id::text = $1 AND status = 'PENDENTE'`,
    [licitacaoId, new Date()],
  );
  return Array.isArray(r) ? Number(r[1] ?? 0) : 0;
}
