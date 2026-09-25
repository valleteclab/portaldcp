import type { EntityManager } from 'typeorm';

/**
 * Consultas da PUBLICAÇÃO (plano E7a) sem injeção de dependência — usadas
 * pelas pré-condições da máquina de estados (TransicoesService.consultas) e
 * pelos serviços da publicação. Mesmo padrão de `habilitacao.sql.ts`.
 */

export interface EditalVigenteMeta {
  origem: 'DOCUMENTOS_LICITACAO' | 'FASE_INTERNA';
  documento_id: string;
  tipo: string;
  versao: number;
  titulo: string | null;
  nome_original: string | null;
  caminho: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  hash: string | null;
  status: string | null;
  created_at: Date | null;
}

/**
 * Edital vigente: a versão mais recente do documento da licitação (EDITAL ou
 * EDITAL_RETIFICADO, não substituído/revogado) ou, sem ele, o "Edital
 * aprovado" (EA) da fase interna que tenha arquivo.
 */
export async function editalVigenteSql(m: EntityManager, licitacaoId: string): Promise<EditalVigenteMeta | null> {
  const [d] = await m.query(
    `SELECT id::text AS documento_id, tipo::text AS tipo, versao, titulo, nome_original, caminho_arquivo AS caminho,
            mime_type, tamanho_bytes, hash_arquivo AS hash, status::text AS status, created_at
       FROM documentos_licitacao
      WHERE licitacao_id::text = $1 AND tipo::text IN ('EDITAL','EDITAL_RETIFICADO')
        AND status::text NOT IN ('SUBSTITUIDO','REVOGADO')
      ORDER BY versao DESC, created_at DESC
      LIMIT 1`,
    [licitacaoId],
  );
  if (d) return { origem: 'DOCUMENTOS_LICITACAO', ...d, versao: Number(d.versao) || 1, tamanho_bytes: d.tamanho_bytes != null ? Number(d.tamanho_bytes) : null };
  const [f] = await m.query(
    `SELECT id::text AS documento_id, tipo::text AS tipo, titulo, nome_arquivo AS nome_original,
            COALESCE(NULLIF(arquivo_pdf_path, ''), NULLIF(caminho_arquivo, '')) AS caminho,
            tipo_mime AS mime_type, tamanho_bytes, hash_arquivo AS hash, status::text AS status, created_at
       FROM documentos_fase_interna
      WHERE licitacao_id::text = $1 AND tipo::text = 'EA'
        AND COALESCE(NULLIF(arquivo_pdf_path, ''), NULLIF(caminho_arquivo, '')) IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1`,
    [licitacaoId],
  );
  if (!f) return null;
  return { origem: 'FASE_INTERNA', ...f, versao: 1, tamanho_bytes: f.tamanho_bytes != null ? Number(f.tamanho_bytes) : null };
}

/** Impugnações ACOLHIDAS que alteram o edital e ainda não foram atendidas por retificação. */
export async function impugnacoesSemRetificacaoSql(m: EntityManager, licitacaoId: string): Promise<string[]> {
  const rows: any[] = await m.query(
    `SELECT id::text AS id, COALESCE(nome_impugnante, 'impugnante') AS nome, data_resposta
       FROM impugnacoes
      WHERE licitacao_id::text = $1 AND altera_edital = true AND retificacao_id IS NULL
        AND status IN ('DEFERIDA','PARCIALMENTE_DEFERIDA')
      ORDER BY data_resposta NULLS LAST, created_at`,
    [licitacaoId],
  );
  return rows.map((r) => `impugnação ${String(r.id).slice(0, 8)} (${r.nome})`);
}

/** Propostas que aguardam confirmação depois de retificação (e o prazo = fim do recebimento). */
export async function propostasAguardandoConfirmacaoSql(m: EntityManager, licitacaoId: string): Promise<number> {
  const [r] = await m.query(
    `SELECT COUNT(*)::int AS total FROM propostas
      WHERE licitacao_id::text = $1 AND requer_confirmacao = true
        AND status::text NOT IN ('RASCUNHO','DESCLASSIFICADA','CANCELADA')`,
    [licitacaoId],
  );
  return Number(r?.total ?? 0);
}

/**
 * Fim do novo prazo de recebimento sem confirmação: a proposta não confirmada
 * sai da disputa (CANCELADA, com o motivo). Chamado no ENCERRAR_ACOLHIMENTO
 * (prazo já alcançado) e, por segurança, antes de abrir a sessão/julgar.
 */
export async function excluirPropostasNaoConfirmadasSql(m: EntityManager, licitacaoId: string): Promise<number> {
  const r = await m.query(
    `UPDATE propostas
        SET status = 'CANCELADA',
            motivo_desclassificacao = 'Proposta não confirmada no novo prazo aberto pela retificação do edital (Lei 14.133/2021, art. 55, §1º).',
            updated_at = NOW()
      WHERE licitacao_id::text = $1 AND requer_confirmacao = true
        AND status::text NOT IN ('RASCUNHO','DESCLASSIFICADA','CANCELADA')
      RETURNING id`,
    [licitacaoId],
  );
  const linhas = Array.isArray(r?.[0]) ? r[0] : r;
  return Array.isArray(linhas) ? linhas.length : 0;
}

export interface IntencaoExtincaoAberta {
  id: string;
  tipo: 'REVOGAR' | 'ANULAR';
  prazo_fim: Date;
  aberta_em: Date;
}

/** Intenção de revogar/anular ABERTA (no máximo uma por licitação). */
export async function intencaoExtincaoAbertaSql(m: EntityManager, licitacaoId: string): Promise<IntencaoExtincaoAberta | null> {
  const [r] = await m.query(
    `SELECT id::text AS id, tipo, prazo_fim, aberta_em FROM extincoes_licitacao
      WHERE licitacao_id::text = $1 AND status = 'ABERTA'
      ORDER BY created_at DESC LIMIT 1`,
    [licitacaoId],
  );
  return r ? { id: r.id, tipo: r.tipo, prazo_fim: new Date(r.prazo_fim), aberta_em: new Date(r.aberta_em) } : null;
}

/** REVOGAR/ANULAR praticado: fecha a intenção do mesmo tipo. */
export async function concluirExtincaoSql(m: EntityManager, licitacaoId: string, tipo: 'REVOGAR' | 'ANULAR'): Promise<void> {
  await m.query(
    `UPDATE extincoes_licitacao SET status = 'CONCLUIDA', concluida_em = NOW(), updated_at = NOW()
      WHERE licitacao_id::text = $1 AND status = 'ABERTA' AND tipo = $2`,
    [licitacaoId, tipo],
  );
}

/**
 * PUBLICAR (na transação do ato): o edital vigente da licitação passa a
 * PUBLICADO e público (é o documento divulgado — art. 54). Rascunhos
 * anteriores do edital ficam SUBSTITUIDO.
 */
export async function marcarEditalPublicadoSql(m: EntityManager, licitacaoId: string): Promise<void> {
  const vigente = await editalVigenteSql(m, licitacaoId);
  if (!vigente || vigente.origem !== 'DOCUMENTOS_LICITACAO') return;
  await m.query(
    `UPDATE documentos_licitacao SET status = 'PUBLICADO', publico = true,
            data_publicacao = COALESCE(data_publicacao, NOW()), updated_at = NOW()
      WHERE id::text = $1`,
    [vigente.documento_id],
  );
  await m.query(
    `UPDATE documentos_licitacao SET status = 'SUBSTITUIDO', updated_at = NOW()
      WHERE licitacao_id::text = $1 AND tipo::text IN ('EDITAL','EDITAL_RETIFICADO')
        AND id::text <> $2 AND status::text = 'RASCUNHO'`,
    [licitacaoId, vigente.documento_id],
  );
}
