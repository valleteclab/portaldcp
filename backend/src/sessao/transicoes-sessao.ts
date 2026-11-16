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
    // Julgamento item a item: se a aceitação de algum item já começou antes do
    // fim dos lances, a sala entra agora na etapa de aceitação (antes era a
    // primeira convocação que fazia isso; ela pode ter acontecido mais cedo).
    await ((transicoes as any).dataSource as { query: (sql: string, p: any[]) => Promise<any> })
      ?.query(
        `UPDATE sessoes_disputa SET etapa = 'ACEITACAO_PROPOSTA'
          WHERE licitacao_id = $1 AND etapa::text IN ('DISPUTA_LANCES','RANDOM_ENCERRAMENTO','BENEFICIO_MPE')
            AND EXISTS (SELECT 1 FROM aceitacoes_proposta a WHERE a.licitacao_id = $1)`,
        [licitacaoId],
      )
      .catch((e: any) => logger.warn(`Etapa da sessão após o fim dos lances (${licitacaoId}): ${e?.message ?? e}`));
    return true;
  } catch (e: any) {
    if (e instanceof ConflictException) {
      logger.warn(`ENCERRAR_DISPUTA não aplicado na licitação ${licitacaoId}: ${e.message}`);
      return false;
    }
    throw e;
  }
}
