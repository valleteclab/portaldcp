import { ConflictException, Logger } from '@nestjs/common';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';

const logger = new Logger('TransicoesSessao');

/**
 * Fim da etapa de lances (todos os itens encerrados): pede ENCERRAR_DISPUTA
 * (EM_DISPUTA → JULGAMENTO). Idempotente — se a licitação já passou da
 * disputa, não faz nada; se não chegou a entrar em disputa (sessão legada que
 * nunca pediu INICIAR_DISPUTA) ou está parada, registra no log e segue: o
 * encerramento do ITEM nunca é desfeito por causa da licitação.
 *
 * Usado pelo relógio da disputa (ator SISTEMA), pelo encerramento manual
 * do último item (ator = pregoeiro) e pela sala legada /sessao.
 */
export async function pedirEncerramentoDisputa(
  transicoes: TransicoesService,
  licitacaoId: string,
  ator: AtorTransicao,
): Promise<boolean> {
  try {
    await transicoes.executar(licitacaoId, AtoLicitacao.ENCERRAR_DISPUTA, {
      ator,
      ignorarSeJaAplicado: true,
      registro: { origem: 'sessao', motivo: 'todos os itens encerrados' },
    });
    return true;
  } catch (e: any) {
    if (e instanceof ConflictException) {
      logger.warn(`ENCERRAR_DISPUTA não aplicado na licitação ${licitacaoId}: ${e.message}`);
      return false;
    }
    throw e;
  }
}
