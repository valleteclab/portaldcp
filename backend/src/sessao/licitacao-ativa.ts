import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { Licitacao, SituacaoLicitacao } from '../licitacoes/entities/licitacao.entity';
import { ROTULO_SITUACAO } from '../licitacoes/transicoes/fases';

/**
 * ============================================================================
 * SESSÃO PÚBLICA SÓ COM A LICITAÇÃO ATIVA (plano E1)
 * ============================================================================
 *
 * Todo ato da sala (REST e socket — /sessao, socket /disputa, recursos): iniciar
 * sessão/itens, lance, encerrar item, reiniciar, suspender/retomar a sessão,
 * habilitação, recursos, adjudicação, homologação...) só é praticado com a
 * licitação ATIVA. Suspensa, revogada, anulada, deserta, fracassada ou
 * concluída → 409, com a mesma mensagem em todos os caminhos.
 *
 * Único ponto da regra: SessaoService, RecursosService, DisputaService (v2) e
 * o relógio da disputa usam estas funções.
 */

/** Mensagem de recusa para a situação (null = ATIVA, ato permitido). */
export function motivoSessaoBloqueada(situacao: SituacaoLicitacao | null | undefined): string | null {
  const s = situacao ?? SituacaoLicitacao.ATIVA;
  if (s === SituacaoLicitacao.ATIVA) return null;
  if (s === SituacaoLicitacao.SUSPENSA) {
    return 'Licitação suspensa — a sessão pública não admite atos até a retomada do processo.';
  }
  return `Licitação ${ROTULO_SITUACAO[s]?.toLowerCase() ?? s} — processo encerrado; a sessão pública não admite mais atos.`;
}

/**
 * Exige a licitação ATIVA (409 se não). Com `bloquear`, lê a linha com
 * `FOR SHARE` dentro da transação do chamador: um SUSPENDER/REVOGAR
 * concorrente (que trava a linha com `FOR UPDATE` no TransicoesService)
 * espera o ato da sala terminar — e vice-versa.
 */
export async function exigirLicitacaoAtiva(
  fonte: EntityManager | Repository<Licitacao>,
  licitacaoId: string,
  opts: { bloquear?: boolean } = {},
): Promise<Pick<Licitacao, 'id' | 'situacao' | 'fase'>> {
  const repo = fonte instanceof EntityManager ? fonte.getRepository(Licitacao) : fonte;
  const lic = await repo.findOne({
    where: { id: licitacaoId },
    select: { id: true, situacao: true, fase: true },
    ...(opts.bloquear ? { lock: { mode: 'pessimistic_read' as const } } : {}),
  });
  if (!lic) throw new NotFoundException('Licitação não encontrada');
  const motivo = motivoSessaoBloqueada(lic.situacao);
  if (motivo) throw new ConflictException({ message: motivo, situacao: lic.situacao });
  return lic;
}

/** Versão booleana (relógio da disputa: não encerra itens de licitação parada). */
export async function licitacaoEstaAtiva(manager: EntityManager, licitacaoId: string): Promise<boolean> {
  const r = await manager.query(`SELECT situacao::text AS situacao FROM licitacoes WHERE id = $1`, [licitacaoId]);
  if (!r[0]) return false;
  return !motivoSessaoBloqueada(r[0].situacao);
}
