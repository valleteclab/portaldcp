import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { EntityManager } from 'typeorm';
import { diretorioDeGravacao } from '../common/arquivos/arquivos';
import { gerarAvisoDispensaPdf } from '../licitacoes/aviso-dispensa-pdf';

/**
 * ============================================================================
 * AVISO DE CONTRATAÇÃO DIRETA — documento REAL do processo
 * (Lei 14.133/2021 art. 75 §3º; IN SEGES 67/2021 arts. 6º e 7º)
 * ============================================================================
 *
 * O aviso da dispensa eletrônica é GERADO pelo sistema a partir dos dados do
 * processo (órgão, objeto, itens, prazos) e GUARDADO como documento da
 * licitação (`documentos_licitacao`, tipo AVISO_LICITACAO), com versão e
 * SHA-256 — deixa de ser um PDF montado só na hora do envio:
 *  - antes de divulgar, o órgão gera a prévia (versão RASCUNHO) e confere o
 *    arquivo (pré-condição `avisoContratacaoDiretaGerado` do PUBLICAR);
 *  - o PUBLICAR (re)gera o aviso com o cronograma publicado e marca essa
 *    versão como PUBLICADA — é EXATAMENTE esse arquivo que a fila envia ao
 *    PNCP (pncp-envios `documentoObrigatorio`);
 *  - se a confirmação do PNCP chega depois e o cronograma é estendido para o
 *    mínimo legal, uma nova versão PUBLICADA é gerada (a anterior fica
 *    SUBSTITUIDA — histórico) e segue ao PNCP como documento da compra.
 * Sem injeção de dependência (usado dentro da transação dos atos).
 */

export interface AvisoVigenteMeta {
  documento_id: string;
  versao: number;
  status: string;
  titulo: string | null;
  nome_original: string | null;
  caminho: string | null;
  hash: string | null;
  tamanho_bytes: number | null;
  created_at: Date | null;
}

const TIPO_AVISO = 'AVISO_LICITACAO';

/** Aviso vigente (versão mais recente não substituída/revogada); null se nunca gerado. */
export async function avisoContratacaoVigenteSql(m: EntityManager, licitacaoId: string): Promise<AvisoVigenteMeta | null> {
  const [d] = await m.query(
    `SELECT id::text AS documento_id, versao, status::text AS status, titulo, nome_original, caminho_arquivo AS caminho,
            hash_arquivo AS hash, tamanho_bytes, created_at
       FROM documentos_licitacao
      WHERE licitacao_id::text = $1 AND tipo::text = $2 AND status::text NOT IN ('SUBSTITUIDO','REVOGADO')
      ORDER BY versao DESC, created_at DESC LIMIT 1`,
    [licitacaoId, TIPO_AVISO],
  );
  if (!d) return null;
  return { ...d, versao: Number(d.versao) || 1, tamanho_bytes: d.tamanho_bytes != null ? Number(d.tamanho_bytes) : null };
}

/** Versões do aviso (mais nova primeiro) — para a tela (histórico, download). */
export async function versoesAvisoSql(m: EntityManager, licitacaoId: string): Promise<any[]> {
  return m.query(
    `SELECT id::text AS id, versao, titulo, nome_original, hash_arquivo AS hash, status::text AS status, tamanho_bytes,
            data_publicacao, enviado_pncp, data_envio_pncp, descricao, usuario_upload_nome, created_at
       FROM documentos_licitacao
      WHERE licitacao_id::text = $1 AND tipo::text = $2
      ORDER BY versao DESC, created_at DESC`,
    [licitacaoId, TIPO_AVISO],
  );
}

export interface OpcoesGerarAviso {
  /** Cronograma a imprimir (prévia do formulário de divulgação); padrão: o gravado. */
  cronograma?: Partial<Record<'data_publicacao_edital' | 'data_limite_impugnacao' | 'data_inicio_acolhimento' | 'data_fim_acolhimento' | 'data_abertura_sessao', Date | string | null>>;
  /** Licitação já carregada/alterada na transação (PUBLICAR/CONFIRMAR): usa estes dados. */
  licitacao?: Record<string, any>;
  publicar?: boolean;
  motivo?: string | null;
  autor?: { id?: string | null; nome?: string | null };
}

/**
 * Gera o PDF do aviso com os dados ATUAIS e grava a nova versão. `publicar`:
 * a versão nasce PUBLICADA/pública e as anteriores ficam SUBSTITUIDAS; sem
 * ele, nasce RASCUNHO (prévia) e só as prévias anteriores são substituídas.
 */
export async function gerarAvisoContratacaoSql(m: EntityManager, licitacaoId: string, o: OpcoesGerarAviso = {}): Promise<AvisoVigenteMeta> {
  const [base] = await m.query(
    `SELECT l.*, o.nome AS orgao_nome, COALESCE(NULLIF(o.pncp_cnpj_orgao, ''), o.cnpj) AS orgao_cnpj
       FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id::text = $1`,
    [licitacaoId],
  );
  if (!base) throw new Error(`Licitação ${licitacaoId} não encontrada`);
  const itens: any[] = await m.query(
    `SELECT numero_item, descricao_resumida, descricao_detalhada, unidade_medida::text AS unidade_medida, quantidade,
            valor_unitario_estimado, valor_total_estimado
       FROM itens_licitacao WHERE licitacao_id::text = $1 AND COALESCE(status::text, '') <> 'CANCELADO' ORDER BY numero_item`,
    [licitacaoId],
  );
  const lic: Record<string, any> = { ...base, ...(o.licitacao ?? {}) };
  for (const [k, v] of Object.entries(o.cronograma ?? {})) if (v) lic[k] = new Date(v as any);
  const buffer = gerarAvisoDispensaPdf({
    orgao_nome: base.orgao_nome || 'Órgão',
    orgao_cnpj: String(base.orgao_cnpj || '').replace(/\D/g, '') || undefined,
    licitacao: lic,
    itens,
    url_sistema: process.env.FRONTEND_URL || undefined,
  });

  const [{ ultima }] = await m.query(
    `SELECT COALESCE(MAX(versao), 0) AS ultima FROM documentos_licitacao WHERE licitacao_id::text = $1 AND tipo::text = $2`,
    [licitacaoId, TIPO_AVISO],
  );
  const versao = Number(ultima) + 1;
  const anterior = await avisoContratacaoVigenteSql(m, licitacaoId);
  await m.query(
    `UPDATE documentos_licitacao SET status = 'SUBSTITUIDO', updated_at = NOW()
      WHERE licitacao_id::text = $1 AND tipo::text = $2 AND status::text ${o.publicar ? "<> 'SUBSTITUIDO'" : "= 'RASCUNHO'"}`,
    [licitacaoId, TIPO_AVISO],
  );

  const dir = join(diretorioDeGravacao('editais'), licitacaoId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const nomeArquivo = `aviso-contratacao-direta-v${versao}-${randomUUID()}.pdf`;
  const caminho = join(dir, nomeArquivo);
  writeFileSync(caminho, buffer);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const agora = new Date();
  const [salvo] = await m.query(
    `INSERT INTO documentos_licitacao (id, licitacao_id, tipo, titulo, descricao, nome_arquivo, nome_original, caminho_arquivo, mime_type,
                                       tamanho_bytes, hash_arquivo, versao, documento_anterior_id, status, publico, data_documento,
                                       data_publicacao, usuario_upload_id, usuario_upload_nome, enviado_pncp, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'application/pdf', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false, NOW(), NOW())
     RETURNING id::text AS id`,
    [
      licitacaoId,
      TIPO_AVISO,
      `Aviso de contratação direta — ${base.numero_processo ?? ''} (v${versao})`.trim(),
      o.motivo ?? (o.publicar ? 'Versão divulgada (enviada ao PNCP)' : 'Prévia gerada antes da divulgação'),
      nomeArquivo,
      `aviso-contratacao-direta-v${versao}.pdf`,
      caminho,
      buffer.length,
      hash,
      versao,
      anterior?.documento_id ?? null,
      o.publicar ? 'PUBLICADO' : 'RASCUNHO',
      !!o.publicar,
      agora,
      o.publicar ? agora : null,
      o.autor?.id ?? null,
      o.autor?.nome ?? (o.publicar ? 'Sistema' : null),
    ],
  );
  const linhas = Array.isArray(salvo) ? salvo : [salvo];
  return {
    documento_id: String(linhas[0]?.id ?? salvo?.id),
    versao,
    status: o.publicar ? 'PUBLICADO' : 'RASCUNHO',
    titulo: null,
    nome_original: `aviso-contratacao-direta-v${versao}.pdf`,
    caminho,
    hash,
    tamanho_bytes: buffer.length,
    created_at: agora,
  };
}

/** PUBLICAR (na transação do ato): aviso gerado com o cronograma publicado, versão PUBLICADA. */
export async function publicarAvisoContratacaoSql(m: EntityManager, lic: Record<string, any>, motivo?: string): Promise<AvisoVigenteMeta> {
  const dados: Record<string, any> = {};
  for (const c of ['data_publicacao_edital', 'data_limite_impugnacao', 'data_inicio_acolhimento', 'data_fim_acolhimento', 'data_abertura_sessao', 'data_divulgacao_oficial']) {
    if (lic[c] !== undefined) dados[c] = lic[c];
  }
  return gerarAvisoContratacaoSql(m, String(lic.id), { licitacao: dados, publicar: true, motivo });
}
