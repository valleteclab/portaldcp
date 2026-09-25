/**
 * ============================================================================
 * STATUS AUTOMÁTICO DA DEMANDA E DO ITEM DO PCA (plano E6 item 5)
 * ============================================================================
 *
 * Funções SQL SEM injeção de dependência (o portal de assinaturas e o
 * cadastro da licitação chamam sem importar o módulo de resultado):
 *
 *  - processo criado a partir da demanda / vinculado ao item do PCA →
 *    demanda EM_CONTRATACAO (se APROVADA/CONSOLIDADA) e item do PCA
 *    LICITACAO_INICIADA (se PLANEJADO/EM_PREPARACAO);
 *  - contrato assinado por todas as partes (ou ata gerada — gancho da ARP) →
 *    demanda CONTRATADA e item do PCA CONTRATADO.
 *
 * Nunca rebaixa um status (só avança a partir dos de origem listados) e nunca
 * toca demanda REJEITADA ou item CANCELADO/ADIADO. Idempotentes.
 *
 * Os valores EM_CONTRATACAO/CONTRATADA do enum da demanda são criados pelo
 * synchronize (produção) ou pela migration 20261005000007-ResultadoUnico; as
 * funções são "melhor esforço" (o chamador captura a falha e só registra).
 */
export interface ExecutorSqlResultado {
  query(sql: string, params?: any[]): Promise<any>;
}

const afetadas = (r: any): number => Number(Array.isArray(r) ? (r[1] ?? 0) : (r?.affected ?? 0)) || 0;

export async function marcarContratacaoIniciada(
  db: ExecutorSqlResultado,
  licitacaoId: string,
): Promise<{ demanda: number; itemPca: number }> {
  const demanda = await db.query(
    `UPDATE demandas d SET status = 'EM_CONTRATACAO', updated_at = now()
       FROM licitacoes l
      WHERE l.id = $1 AND l.demanda_id::text = d.id::text AND d.status::text IN ('APROVADA','CONSOLIDADA')`,
    [licitacaoId],
  );
  const itemPca = await db.query(
    `UPDATE itens_pca i SET status = 'LICITACAO_INICIADA', updated_at = now()
       FROM licitacoes l
      WHERE l.id = $1 AND l.item_pca_id::text = i.id::text AND i.status::text IN ('PLANEJADO','EM_PREPARACAO')`,
    [licitacaoId],
  );
  return { demanda: afetadas(demanda), itemPca: afetadas(itemPca) };
}

export async function marcarContratado(
  db: ExecutorSqlResultado,
  licitacaoId: string,
): Promise<{ demanda: number; itemPca: number }> {
  const demanda = await db.query(
    `UPDATE demandas d SET status = 'CONTRATADA', updated_at = now()
       FROM licitacoes l
      WHERE l.id = $1 AND l.demanda_id::text = d.id::text
        AND d.status::text IN ('APROVADA','CONSOLIDADA','EM_CONTRATACAO')`,
    [licitacaoId],
  );
  const itemPca = await db.query(
    `UPDATE itens_pca i SET status = 'CONTRATADO', updated_at = now()
       FROM licitacoes l
      WHERE l.id = $1 AND l.item_pca_id::text = i.id::text
        AND i.status::text IN ('PLANEJADO','EM_PREPARACAO','LICITACAO_INICIADA')`,
    [licitacaoId],
  );
  return { demanda: afetadas(demanda), itemPca: afetadas(itemPca) };
}
