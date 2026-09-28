import { ForbiddenException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';

/**
 * QUEM PRATICA OS ATOS QUE ENCERRAM O PROCESSO (homologação multiusuário,
 * 27/09/2026 — "Mais ações": Compras via "Excluir processo…", "Revogar" e
 * "Anular"). Sem injeção de dependência (só SQL): usado pelo cockpit
 * (LicitacoesModule) e pela extinção em dois tempos (PublicacaoModule).
 *
 *  - CONDUZ o processo: o login do órgão, o administrador (do órgão ou da
 *    plataforma), o agente de contratação designado e, sem agente, quem criou
 *    o processo — excluir (só na fase interna), revogar e anular;
 *  - AUTORIDADE: quem tem o papel funcional "Autoridade" ou é signatário da
 *    autorização na configuração da fase interna — revogar e anular (art. 71:
 *    a autoridade superior decide a revogação e a anulação).
 */
export interface PapelNoProcesso {
  conduz: boolean;
  autoridade: boolean;
}

/** Atos de extinção do processo (art. 71) — conduz ou autoridade. */
export const ATOS_DE_EXTINCAO = ['REVOGAR', 'ANULAR', 'INTENCAO_REVOGAR', 'INTENCAO_ANULAR'];

export async function papelNoProcesso(ds: DataSource | EntityManager, ator: Ator, licitacaoId: string): Promise<PapelNoProcesso> {
  if (ator.admin || ator.tipo === 'ORGAO') return { conduz: true, autoridade: true };
  if (ator.tipo !== 'USUARIO' || !ator.usuarioId || !ehUuid(ator.usuarioId) || !ehUuid(licitacaoId)) return { conduz: false, autoridade: false };
  const [r] = await ds.query(
    `SELECT u.role::text AS role, u.papeis_fase_interna AS papeis, l.pregoeiro_id::text AS pregoeiro_id,
            (SELECT t.ator_id FROM licitacao_transicoes t WHERE t.licitacao_id::text = l.id::text AND t.ato = 'CRIAR' AND t.ator_tipo = 'USUARIO' ORDER BY t.created_at LIMIT 1) AS criador,
            (SELECT c.signatarios_autorizacao FROM configuracoes_fase_interna c WHERE c.orgao_id::text = l.orgao_id::text) AS signatarios
       FROM licitacoes l JOIN usuarios u ON u.id::text = $2 AND u.orgao_id::text = l.orgao_id::text AND u.ativo = true
      WHERE l.id::text = $1`,
    [licitacaoId, ator.usuarioId],
  );
  if (!r) return { conduz: false, autoridade: false };
  const id = ator.usuarioId;
  const conduz = r.role === 'ADMIN' || r.pregoeiro_id === id || (!r.pregoeiro_id && String(r.criador ?? '') === id);
  const papeis: string[] = Array.isArray(r.papeis) ? r.papeis : [];
  const signatarios: Array<{ usuario_id?: string }> = Array.isArray(r.signatarios) ? r.signatarios : [];
  const autoridade = papeis.includes('AUTORIDADE') || signatarios.some((s) => s?.usuario_id === id);
  return { conduz, autoridade };
}

export async function exigirQuemConduz(ds: DataSource | EntityManager, ator: Ator, licitacaoId: string, acao: string): Promise<void> {
  if (!(await papelNoProcesso(ds, ator, licitacaoId)).conduz) {
    throw new ForbiddenException(`Só quem conduz o processo (o agente de contratação, o administrador do órgão ou o login do órgão) pode ${acao}.`);
  }
}

export async function exigirExtincao(ds: DataSource | EntityManager, ator: Ator, licitacaoId: string): Promise<void> {
  const p = await papelNoProcesso(ds, ator, licitacaoId);
  if (!p.conduz && !p.autoridade) {
    throw new ForbiddenException('Revogar ou anular o processo é ato de quem o conduz (agente de contratação, administrador do órgão) ou da autoridade competente (art. 71).');
  }
}
