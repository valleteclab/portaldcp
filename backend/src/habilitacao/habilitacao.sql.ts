import type { ExecutorSql } from '../disputa-v2/migracao-lances';
import { chaveModeloPadrao, modeloExigencias } from './modelos-exigencias';
import { DocumentoCadastro, Exigencia, StatusHabilitacao } from './regras-habilitacao';

/**
 * Funções SQL SEM injeção de dependência — usadas pelo serviço, pela
 * máquina de estados (pré-condições do INICIAR_DISPUTA na inversão e do
 * ADJUDICAR) e pela migração de boot, sem ciclo de módulos.
 */

const lerExigencia = (r: any): Exigencia & { modelo?: string | null } => ({
  id: String(r.id),
  categoria: String(r.categoria),
  descricao: String(r.descricao),
  base_legal: r.base_legal ?? null,
  obrigatorio: !!r.obrigatorio,
  aceita_registro_cadastral: !!r.aceita_registro_cadastral,
  tipos_documento_cadastro: Array.isArray(r.tipos_documento_cadastro) ? r.tipos_documento_cadastro : [],
  exige_validade: !!r.exige_validade,
  ordem: Number(r.ordem ?? 0),
  modelo: r.modelo ?? null,
});

export async function exigenciasDaLicitacaoSql(db: ExecutorSql, licitacaoId: string): Promise<Array<Exigencia & { modelo?: string | null }>> {
  const rows: any[] = await db.query(
    `SELECT * FROM exigencias_habilitacao WHERE licitacao_id = $1 ORDER BY ordem, created_at`,
    [licitacaoId],
  );
  return rows.map(lerExigencia);
}

/** Insere as exigências (substitui a lista inteira). */
export async function gravarExigenciasSql(
  db: ExecutorSql,
  licitacaoId: string,
  lista: Array<Omit<Exigencia, 'id'> & { id?: string | null; modelo?: string | null }>,
): Promise<void> {
  await db.query(`DELETE FROM exigencias_habilitacao WHERE licitacao_id = $1`, [licitacaoId]);
  let ordem = 0;
  for (const e of lista) {
    ordem++;
    await db.query(
      `INSERT INTO exigencias_habilitacao
         (id, licitacao_id, ordem, categoria, descricao, base_legal, obrigatorio, aceita_registro_cadastral,
          tipos_documento_cadastro, exige_validade, modelo, created_at, updated_at)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, now(), now())`,
      [
        e.id ?? null,
        licitacaoId,
        ordem,
        e.categoria,
        e.descricao,
        e.base_legal ?? null,
        e.obrigatorio !== false,
        !!e.aceita_registro_cadastral,
        JSON.stringify(e.tipos_documento_cadastro ?? []),
        !!e.exige_validade,
        e.modelo ?? null,
      ],
    );
  }
}

/**
 * Garante as exigências da licitação: sem nenhuma, grava o MODELO PADRÃO do
 * objeto/modalidade (idempotente; trava por licitação). Usado na convocação,
 * na inversão, na leitura e na migração de boot — nunca há habilitação sem
 * exigências.
 */
export async function garantirExigenciasSql(db: ExecutorSql, licitacaoId: string): Promise<{ criadas: number }> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`exigencias-habilitacao:${licitacaoId}`]);
  const [{ n }] = await db.query(`SELECT COUNT(*)::int AS n FROM exigencias_habilitacao WHERE licitacao_id = $1`, [licitacaoId]);
  if (Number(n) > 0) return { criadas: 0 };
  const [lic] = await db.query(
    `SELECT modalidade::text AS modalidade, tipo_contratacao::text AS tipo FROM licitacoes WHERE id = $1`,
    [licitacaoId],
  );
  if (!lic) return { criadas: 0 };
  const chave = chaveModeloPadrao(lic.modalidade, lic.tipo);
  const modelo = modeloExigencias(chave).map((e) => ({
    categoria: e.categoria,
    descricao: e.descricao,
    base_legal: e.base_legal ?? null,
    obrigatorio: e.obrigatorio !== false,
    aceita_registro_cadastral: e.aceita_registro_cadastral !== false && (e.tipos_documento_cadastro ?? []).length > 0,
    tipos_documento_cadastro: e.tipos_documento_cadastro ?? [],
    exige_validade: !!e.exige_validade,
    ordem: e.ordem ?? 0,
    modelo: chave,
  }));
  await gravarExigenciasSql(db, licitacaoId, modelo);
  return { criadas: modelo.length };
}

/** Documentos do registro cadastral do fornecedor + situação do cadastro. */
export async function documentosCadastroSql(
  db: ExecutorSql,
  fornecedorId: string,
): Promise<{ documentos: DocumentoCadastro[]; statusCadastro: string | null }> {
  const docs: any[] = await db.query(
    `SELECT id::text AS id, tipo::text AS tipo, status::text AS status, to_char(data_validade, 'YYYY-MM-DD') AS data_validade,
            to_char(data_emissao, 'YYYY-MM-DD') AS data_emissao, numero_documento, nome_arquivo, caminho_arquivo, created_at
       FROM fornecedor_documentos WHERE fornecedor_id::text = $1`,
    [fornecedorId],
  );
  const [f] = await db.query(`SELECT status::text AS status FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
  return { documentos: docs, statusCadastro: f?.status ?? null };
}

/**
 * INVERSÃO DE FASES (Lei 14.133 art. 17 §1º) — pré-condição do INICIAR_DISPUTA:
 * licitantes com proposta apta cuja habilitação ainda NÃO foi julgada
 * HABILITADO (os inabilitados têm a proposta desclassificada e já não são
 * aptos). Vazio fora da inversão.
 */
export async function habilitacaoPreviaPendenteSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const [lic] = await db.query(`SELECT COALESCE(inversao_fases, false) AS inversao FROM licitacoes WHERE id = $1`, [licitacaoId]);
  if (!lic?.inversao) return [];
  const rows: any[] = await db.query(
    `SELECT COALESCE(f.razao_social, p.fornecedor_id::text) AS nome
       FROM propostas p
       LEFT JOIN fornecedores f ON f.id::text = p.fornecedor_id::text
      WHERE p.licitacao_id = $1 AND p.status::text IN ('ENVIADA','RECEBIDA','EM_ANALISE','CLASSIFICADA')
        AND NOT EXISTS (
          SELECT 1 FROM habilitacoes_licitante h
           WHERE h.licitacao_id = p.licitacao_id AND h.fornecedor_id = p.fornecedor_id::text AND h.status = $2)
      ORDER BY 1`,
    [licitacaoId, StatusHabilitacao.HABILITADO],
  );
  return rows.map((r) => String(r.nome));
}

/**
 * ADJUDICAR / DECIDIR_RECURSOS — unidades com proposta ACEITA cujo licitante
 * ainda não foi HABILITADO (o vencedor final nunca é quem não passou pela
 * habilitação — plano E4, fim do B3). Rótulos "Item N"/"Lote N".
 */
export async function unidadesSemHabilitadoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const rows: any[] = await db.query(
    `SELECT DISTINCT lu.unidade_id,
            CASE WHEN lu.tipo_unidade = 'LOTE' THEN 'Lote ' || lt.numero ELSE 'Item ' || i.numero_item END AS rotulo,
            COALESCE(lt.numero, i.numero_item) AS ordem
       FROM licitantes_unidade lu
       LEFT JOIN itens_licitacao i ON lu.tipo_unidade = 'ITEM' AND i.id::text = lu.unidade_id::text
       LEFT JOIN lotes_licitacao lt ON lu.tipo_unidade = 'LOTE' AND lt.id::text = lu.unidade_id::text
      WHERE lu.licitacao_id = $1 AND lu.situacao = 'ACEITO'
        AND NOT EXISTS (
          SELECT 1 FROM licitantes_unidade x
           WHERE x.unidade_id = lu.unidade_id AND x.situacao IN ('HABILITADO','VENCEDOR'))
      ORDER BY 3`,
    [licitacaoId],
  );
  return rows.map((r) => String(r.rotulo));
}
