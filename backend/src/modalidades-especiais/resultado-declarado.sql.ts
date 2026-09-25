import type { ExecutorSql } from '../disputa/migracao-lances';

/**
 * Leilão e concurso (E7c): unidades com resultado possível (não deserta/
 * fracassada/cancelada) e com ofertas (lances no leilão; trabalhos no
 * concurso) que ainda NÃO têm resultado declarado — licitante ACEITO (ou já
 * VENCEDOR) em `licitantes_unidade`. Equivalente, para o resultado
 * declarado, do `unidadesSemPropostaAceita` do rito com aceitação.
 */
export async function unidadesSemResultadoDeclaradoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const rows: any[] = await db.query(
    `WITH lic AS (SELECT COALESCE(base_lance, 'TOTAL_ITEM') AS base, modalidade::text AS modalidade FROM licitacoes WHERE id = $1),
     unidades AS (
       SELECT i.id::text AS unidade_id, 'Item ' || i.numero_item AS rotulo, i.numero_item AS ordem
         FROM itens_licitacao i, lic
        WHERE i.licitacao_id = $1 AND lic.base <> 'TOTAL_LOTE'
          AND i.status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO')
          AND (EXISTS (SELECT 1 FROM lances l WHERE l.item_id = i.id AND l.cancelado = false AND l.fornecedor_id IS NOT NULL)
               OR (lic.modalidade = 'CONCURSO' AND EXISTS (SELECT 1 FROM concurso_trabalhos t WHERE t.licitacao_id = i.licitacao_id AND t.status = 'SUBMETIDO')))
       UNION ALL
       SELECT lt.id::text, 'Lote ' || lt.numero, lt.numero
         FROM lotes_licitacao lt, lic
        WHERE lt.licitacao_id = $1 AND lic.base = 'TOTAL_LOTE'
          AND EXISTS (SELECT 1 FROM itens_licitacao i WHERE i.lote_id = lt.id AND i.status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO'))
          AND EXISTS (SELECT 1 FROM lances l WHERE l.lote_id = lt.id AND l.item_id IS NULL AND l.cancelado = false AND l.fornecedor_id IS NOT NULL)
     )
     SELECT u.rotulo FROM unidades u
      WHERE NOT EXISTS (
        SELECT 1 FROM licitantes_unidade lu WHERE lu.unidade_id::text = u.unidade_id AND lu.situacao IN ('ACEITO','VENCEDOR'))
      ORDER BY u.ordem`,
    [licitacaoId],
  );
  return rows.map((r) => String(r.rotulo));
}
