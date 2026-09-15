import { Repository } from 'typeorm';
import { RequisicaoItemOS } from './entities/requisicao-item-os.entity';
import { StatusRequisicao, TipoRequisicao } from './entities/requisicao.entity';
import { ModalidadeExecucao } from '../contratos/entities/contrato.entity';

/** Início da vigência renovada + modalidade do contrato (contexto do ciclo atual). */
export interface ContextoCicloVigente {
  inicio: Date | null;
  modalidade: ModalidadeExecucao | null;
}

/**
 * Soma `quantidade_solicitada` por item do cronograma das OS ativas da vigência
 * atual (o "comprometido" de cada item).
 *
 * Fica aqui, e não dentro do RequisicaoService, porque a MEDIÇÃO também precisa
 * da mesma regra para montar o saldo disponível por item (contexto do lançamento
 * retroativo). Duplicar a regra em dois serviços já produziu saldo divergente no
 * passado; ambos chamam esta função.
 *
 * @param excludeRequisicaoId ao editar uma OS, exclui a própria do somatório.
 */
export async function somarQuantidadeComprometidaPorItemOS(
  requisicaoItemOSRepository: Repository<RequisicaoItemOS>,
  contratoId: string,
  contextoCiclo: ContextoCicloVigente,
  excludeRequisicaoId?: string,
): Promise<Map<string, number>> {
  const statusMedicoesQueConsomemOS = [
    'SUBMETIDA',
    'AGUARDANDO_ATESTE',
    'PARCIALMENTE_ATESTADA',
    'AGUARDANDO_APROVACAO',
    'APROVADA',
  ];
  const qb = requisicaoItemOSRepository
    .createQueryBuilder('rio')
    .select('rio.item_cronograma_id', 'id')
    .addSelect('COALESCE(SUM(rio.quantidade_solicitada), 0)', 'total')
    .innerJoin('rio.requisicao', 'r')
    .where('r.contrato_id = :cid', { cid: contratoId })
    .andWhere('r.tipo = :tipo', { tipo: TipoRequisicao.ORDEM_SERVICO })
    .andWhere('r.status IN (:...status)', {
      status: [
        StatusRequisicao.RASCUNHO,
        StatusRequisicao.AGUARDANDO_AUTORIZACAO,
        StatusRequisicao.AUTORIZADA,
      ],
    })
    // A OS global é somente a liberação inicial e não reserva saldo contra
    // as OS parciais. Em MEDICAO, a reserva migra para a medição vinculada;
    // em ORDEM_SERVICO, a própria OS continua sendo a fonte do consumo.
    .andWhere("COALESCE(r.modo_os, '') != :modoGlobalExcluido", {
      modoGlobalExcluido: 'ORDEM_GLOBAL',
    });
  if (contextoCiclo.modalidade !== ModalidadeExecucao.ORDEM_SERVICO) {
    qb.andWhere(
      `NOT EXISTS (
          SELECT 1 FROM medicoes m
          WHERE m.requisicao_id = r.id
            AND m.status IN (:...statusMedicoesQueConsomemOS)
        )`,
      { statusMedicoesQueConsomemOS },
    );
  }
  if (contextoCiclo.inicio) {
    qb.andWhere('r.data_solicitacao >= :inicioCicloVigente', {
      inicioCicloVigente: contextoCiclo.inicio,
    });
  }
  if (excludeRequisicaoId) {
    qb.andWhere('r.id != :excludeId', { excludeId: excludeRequisicaoId });
  }
  const rows = await qb
    .groupBy('rio.item_cronograma_id')
    .getRawMany<{ id: string; total: string }>();
  const mapa = new Map<string, number>();
  for (const r of rows) mapa.set(r.id, Number(r.total));
  return mapa;
}
