import type { ExecutorSql } from '../disputa/migracao-lances';
import { DadosPontuacao, ehCriterioTecnico } from './criterios-julgamento';

/**
 * Funções SQL do julgamento técnico SEM injeção de dependência — o motor de
 * disputa (disputa) as chama sem importar o módulo de julgamento (mesmo
 * padrão de `licitantes-unidade.sql.ts`).
 */

export async function criterioDaLicitacao(db: ExecutorSql, licitacaoId: string): Promise<string> {
  const [l] = await db.query(`SELECT criterio_julgamento::text AS c FROM licitacoes WHERE id = $1`, [licitacaoId]);
  return String(l?.c ?? 'MENOR_PRECO');
}

/**
 * Lei 14.133 art. 36 §2º ("avaliadas e ponderadas as propostas técnicas e, em
 * seguida, as propostas de preço"): nos critérios técnicos, a etapa de preço
 * (abertura das unidades da disputa) só começa depois de PUBLICADAS as notas
 * técnicas. Devolve o motivo do bloqueio ou null.
 */
export async function pendenciaJulgamentoTecnico(db: ExecutorSql, licitacaoId: string): Promise<string | null> {
  const criterio = await criterioDaLicitacao(db, licitacaoId);
  if (!ehCriterioTecnico(criterio)) return null;
  const [jt] = await db.query(`SELECT publicado_em FROM julgamento_tecnico WHERE licitacao_id = $1`, [licitacaoId]);
  if (jt?.publicado_em) return null;
  return (
    `Critério ${criterio === 'TECNICA_E_PRECO' ? 'técnica e preço' : 'melhor técnica'}: a etapa de preços só começa ` +
    'depois de publicadas as notas técnicas (Lei 14.133/2021, arts. 36 §2º e 37) — conclua o julgamento técnico.'
  );
}

/** Dados de pontuação de uma unidade para o ranking pontuado (notas publicadas / retorno econômico). */
export async function dadosPontuacao(db: ExecutorSql, licitacaoId: string, unidadeId: string, criterio: string): Promise<DadosPontuacao> {
  if (criterio === 'MAIOR_RETORNO_ECONOMICO') {
    const rows: any[] = await db.query(
      `SELECT fornecedor_id, economia_estimada, percentual_remuneracao FROM propostas_retorno_economico
        WHERE licitacao_id = $1 AND unidade_id::text = $2`,
      [licitacaoId, unidadeId],
    );
    return {
      retornos: new Map(
        rows.map((r) => [
          String(r.fornecedor_id),
          { economiaEstimada: Number(r.economia_estimada), percentualRemuneracao: Number(r.percentual_remuneracao) },
        ]),
      ),
    };
  }
  const [jt] = await db.query(`SELECT peso_tecnica, publicado_em, resultado FROM julgamento_tecnico WHERE licitacao_id = $1`, [licitacaoId]);
  const notas = new Map<string, number>();
  const desclassificados = new Set<string>();
  if (jt?.publicado_em && Array.isArray(jt.resultado)) {
    for (const r of jt.resultado) {
      if (r?.fornecedorId == null) continue;
      notas.set(String(r.fornecedorId), Number(r.notaTecnica));
      if (r.abaixoDoMinimo) desclassificados.add(String(r.fornecedorId));
    }
  }
  return { notas, desclassificados, pesoTecnica: jt?.peso_tecnica != null ? Number(jt.peso_tecnica) : null };
}
