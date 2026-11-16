/** Consulta sem DI (máquina de estados): vencedores da dispensa sem habilitação registrada como HABILITADO. */
type ExecutorSql = { query: (sql: string, p?: unknown[]) => Promise<any[]> };

export async function vencedoresDispensaSemHabilitacaoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const linhas = await db.query(
    `SELECT DISTINCT COALESCE(i.fornecedor_vencedor_nome, f.razao_social) AS nome
       FROM itens_licitacao i
       JOIN licitacoes l ON l.id = i.licitacao_id AND l.modalidade::text = 'DISPENSA_ELETRONICA'
       LEFT JOIN fornecedores f ON f.id::text = i.fornecedor_vencedor_id::text
      WHERE i.licitacao_id::text = $1 AND i.status::text = 'ADJUDICADO' AND i.fornecedor_vencedor_id IS NOT NULL
        AND COALESCE((SELECT h.resultado FROM habilitacoes_dispensa h
                       WHERE h.licitacao_id::text = i.licitacao_id::text AND h.fornecedor_id::text = i.fornecedor_vencedor_id::text
                       ORDER BY h.created_at DESC LIMIT 1), '') <> 'HABILITADO'`,
    [licitacaoId],
  );
  return linhas.map((l: any) => String(l.nome ?? 'vencedor'));
}

/** Contrapropostas ACEITAS (valor unitário por item e fornecedor) — o rejulgamento as respeita. */
export async function negociacoesAceitasSql(db: ExecutorSql, licitacaoId: string): Promise<Map<string, number>> {
  const linhas = await db.query(
    `SELECT DISTINCT ON (item_licitacao_id, fornecedor_id) item_licitacao_id::text AS item, fornecedor_id::text AS forn, valor_unitario
       FROM negociacoes_dispensa WHERE licitacao_id::text = $1 AND status = 'ACEITA'
      ORDER BY item_licitacao_id, fornecedor_id, respondida_em DESC`,
    [licitacaoId],
  ).catch(() => []);
  return new Map(linhas.map((l: any) => [`${l.item}:${l.forn}`, Number(l.valor_unitario)]));
}
