import type { ExecutorSql } from '../disputa-v2/migracao-lances';
import {
  pendenciasEditalLeilaoSql,
  pendenciasPagamentoLeilaoSql,
  pendenciasTermosLeilaoSql,
  motivoPropostaLeilaoSql,
} from '../leilao/leilao.sql';
import {
  pendenciasEditalConcursoSql,
  pendenciasJulgamentoConcursoSql,
  pendenciasPremiacaoConcursoSql,
  pendenciasResultadoConcursoSql,
} from '../concurso/concurso.sql';
import {
  motivoPropostaDialogoSql,
  pendenciasConclusaoDialogoSql,
  pendenciasDisputaDialogoSql,
  pendenciasEditalDialogoSql,
  pendenciasFaseCompetitivaSql,
} from '../dialogo-competitivo/dialogo.sql';

/**
 * Pendências das modalidades especiais por CHAVE (pré-condições da máquina
 * de estados — `definicoes-especiais.ts`). SQL sem DI: roda dentro da
 * transação do ato (manager do TransicoesService).
 */
export async function pendenciasModalidadeSql(
  db: ExecutorSql,
  licitacaoId: string,
  chave: string,
  ctx: { dados?: Record<string, any>; agora?: Date; somenteAvaliacao?: boolean },
): Promise<string[]> {
  switch (chave) {
    // Leilão (art. 31)
    case 'LEILAO_EDITAL':
      return pendenciasEditalLeilaoSql(db, licitacaoId);
    case 'LEILAO_ARREMATACOES_PAGAS':
      return pendenciasPagamentoLeilaoSql(db, licitacaoId);
    case 'LEILAO_TERMOS':
      return pendenciasTermosLeilaoSql(db, licitacaoId);
    // Concurso (art. 30)
    case 'CONCURSO_EDITAL':
      return pendenciasEditalConcursoSql(db, licitacaoId);
    case 'CONCURSO_JULGAMENTO':
      return pendenciasJulgamentoConcursoSql(db, licitacaoId);
    case 'CONCURSO_RESULTADO_DECLARADO':
      return pendenciasResultadoConcursoSql(db, licitacaoId);
    case 'CONCURSO_PREMIACAO':
      return pendenciasPremiacaoConcursoSql(db, licitacaoId);
    // Diálogo competitivo (art. 32)
    case 'DIALOGO_EDITAL':
      return pendenciasEditalDialogoSql(db, licitacaoId);
    case 'DIALOGO_CONCLUIR':
      return pendenciasConclusaoDialogoSql(db, licitacaoId, ctx.dados, ctx.somenteAvaliacao);
    case 'DIALOGO_FASE_COMPETITIVA':
      return pendenciasFaseCompetitivaSql(db, licitacaoId, ctx.dados, ctx.agora ?? new Date(), ctx.somenteAvaliacao);
    case 'DIALOGO_DISPUTA':
      return pendenciasDisputaDialogoSql(db, licitacaoId);
    default:
      return [`Pendência desconhecida: ${chave}`];
  }
}

/**
 * Guarda da PROPOSTA nas modalidades especiais (PropostasService.create/updateItem):
 *  - leilão: lance inicial (proposta fechada — Dec. 11.461 art. 8º II) ≥ preço mínimo de cada bem;
 *  - concurso: a inscrição é feita pelo módulo do concurso (trabalho sob código) — nunca pela rota de propostas;
 *  - diálogo: só na fase competitiva e só de pré-selecionado.
 */
export async function motivoPropostaPelaModalidade(
  db: ExecutorSql,
  licitacaoId: string,
  fornecedorId: string,
  itens: Array<{ item_licitacao_id: string; valor_unitario: number }>,
): Promise<string | null> {
  const [l] = await db.query(`SELECT modalidade::text AS m FROM licitacoes WHERE id::text = $1`, [licitacaoId]);
  switch (l?.m) {
    case 'LEILAO':
      return motivoPropostaLeilaoSql(db, licitacaoId, itens);
    case 'CONCURSO':
      return 'Concurso: a inscrição é feita com o envio do trabalho pelo painel do concurso (sigilo de autoria — art. 30).';
    case 'DIALOGO_COMPETITIVO':
      return motivoPropostaDialogoSql(db, licitacaoId, fornecedorId);
    default:
      return null;
  }
}
