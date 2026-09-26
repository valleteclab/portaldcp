import { EntityManager } from 'typeorm';
import * as fs from 'fs';
import { resolverArquivoDeUrl } from '../common/arquivos/arquivos';
import { pecaContaComoPronta, planoNovaVersao } from './peca-regras';
import { atribuirFolhas, contarPaginasPdf } from './folhas-autos';

/**
 * UNIFICAÇÃO "anexei e diz que falta" (Entrega 1).
 *
 * Escolha: a peça da fase interna tem UMA fonte — `documentos_fase_interna`,
 * que o checklist (getInstrucao), o gate dos atos e a pré-publicação já leem.
 * O arquivo de fase interna anexado pelo módulo `documentos` (aba Documentos
 * do processo, `documentos_licitacao`) passa a ser ESPELHADO lá como peça
 * anexada (origem ARQUIVO, status IMPORTADO), apontando para o MESMO arquivo
 * (sem cópia) e marcada com `sistema_origem = 'documentos_licitacao'` +
 * `id_externo` = id do documento (chave de idempotência). Vale para o que já
 * existe (migração de boot) e para cada upload novo (DocumentosService).
 * Preferido a "o checklist ler as duas tabelas" porque mantém um único lugar
 * para versão, data da peça, folhas e assinatura.
 *
 * Regras: só processos na fase interna; só se a peça do tipo ainda não conta
 * como pronta (não sobrescreve trabalho feito — um rascunho vazio vira versão
 * anterior); documento revogado/substituído não entra.
 *
 * Módulo sem injeção de dependência (só EntityManager): o DocumentosModule o
 * chama sem depender do FaseInternaModule.
 */
export const MAPA_TIPO_DOCUMENTOS_LICITACAO: Record<string, string> = {
  ETP: 'ETP',
  TERMO_REFERENCIA: 'TR',
  PROJETO_BASICO: 'PB',
  PESQUISA_PRECOS: 'PP',
  PARECER_JURIDICO: 'PJ',
  MATRIZ_RISCOS: 'AR',
  MAPA_RISCOS: 'AR',
  AUTORIZACAO: 'AA',
  DOTACAO_ORCAMENTARIA: 'DO',
  MINUTA_CONTRATO: 'MC',
};

const FASES_INTERNAS = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA'];

export type ResultadoEspelho = 'ESPELHADO' | 'JA_ESPELHADO' | 'PECA_JA_PRONTA' | 'IGNORADO';

export async function espelharDocumentoLicitacao(m: EntityManager, documentoLicitacaoId: string): Promise<ResultadoEspelho> {
  const [d] = await m.query(
    `SELECT d.id::text AS id, d.licitacao_id::text AS licitacao_id, d.tipo::text AS tipo, d.titulo, d.nome_original,
            d.caminho_arquivo, d.mime_type, d.tamanho_bytes, d.hash_arquivo, d.numero_documento, d.data_documento,
            d.status::text AS status, d.usuario_upload_id, d.created_at, l.fase::text AS fase
       FROM documentos_licitacao d JOIN licitacoes l ON l.id::text = d.licitacao_id::text
      WHERE d.id::text = $1`,
    [documentoLicitacaoId],
  );
  const tipo = d ? MAPA_TIPO_DOCUMENTOS_LICITACAO[d.tipo] : undefined;
  if (!d || !tipo || !FASES_INTERNAS.includes(d.fase) || ['REVOGADO', 'SUBSTITUIDO'].includes(d.status)) return 'IGNORADO';

  const [ja] = await m.query(
    `SELECT 1 FROM documentos_fase_interna WHERE sistema_origem = 'documentos_licitacao' AND id_externo = $1 LIMIT 1`,
    [d.id],
  );
  if (ja) return 'JA_ESPELHADO';

  await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [d.licitacao_id]);
  const [atual] = await m.query(
    `SELECT id::text AS id, tipo::text AS tipo, status::text AS status, versao, caminho_arquivo, arquivo_pdf_path,
            descricao, dados_estruturados, obrigatorio
       FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND tipo::text = $2 AND versao_atual = true LIMIT 1`,
    [d.licitacao_id, tipo],
  );
  if (atual && (pecaContaComoPronta(atual) || atual.dados_estruturados?.nao_se_aplica)) return 'PECA_JA_PRONTA';

  const plano = planoNovaVersao(atual ?? null);
  if (atual) {
    await m.query(`UPDATE documentos_fase_interna SET versao_atual = false, status = 'SUBSTITUIDO' WHERE id::text = $1`, [atual.id]);
  }
  const [novo] = await m.query(
    `INSERT INTO documentos_fase_interna
       (id, licitacao_id, tipo, titulo, descricao, nome_arquivo, caminho_arquivo, tipo_mime, tamanho_bytes, hash_arquivo,
        origem, sistema_origem, id_externo, data_importacao, status, versao, versao_atual, versao_anterior_id,
        obrigatorio, data_documento, numero_peca, criado_por_id, exige_assinatura, totalmente_assinado, publicado_pncp,
        created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
        'ARQUIVO', 'documentos_licitacao', $10, $11, 'IMPORTADO', $12, true, $13,
        $14, $15, $16, $17, false, false, false, now(), now())
     RETURNING id::text AS id`,
    [
      d.licitacao_id,
      tipo,
      String(d.titulo || d.nome_original || tipo).slice(0, 250),
      `Anexado pela aba Documentos do processo${d.numero_documento ? ` — ${d.numero_documento}` : ''}`,
      d.nome_original,
      d.caminho_arquivo,
      d.mime_type,
      d.tamanho_bytes,
      d.hash_arquivo,
      d.id,
      d.created_at,
      plano.versao,
      plano.versao_anterior_id,
      atual?.obrigatorio ?? false,
      d.data_documento,
      d.numero_documento ? String(d.numero_documento).slice(0, 120) : null,
      d.usuario_upload_id,
    ],
  );
  // Folhas dos autos: pelas páginas do PDF, quando legível
  let paginas = 1;
  try {
    const fisico = resolverArquivoDeUrl(d.caminho_arquivo) ?? (fs.existsSync(d.caminho_arquivo) ? d.caminho_arquivo : null);
    if (fisico && String(d.mime_type).includes('pdf')) {
      paginas = await contarPaginasPdf(fs.readFileSync(fisico));
    }
  } catch {
    /* sem páginas legíveis: conta 1 folha */
  }
  await atribuirFolhas(m, d.licitacao_id, novo.id, paginas);
  return 'ESPELHADO';
}

/** Migração de boot: espelha todos os anexos de fase interna ainda não espelhados (idempotente). */
export async function espelharDocumentosLicitacaoExistentes(m: EntityManager): Promise<{ espelhados: number }> {
  const candidatos: Array<{ id: string }> = await m.query(
    `SELECT d.id::text AS id
       FROM documentos_licitacao d JOIN licitacoes l ON l.id::text = d.licitacao_id::text
      WHERE d.tipo::text = ANY($1) AND l.fase::text = ANY($2)
        AND d.status::text NOT IN ('REVOGADO', 'SUBSTITUIDO')
        AND NOT EXISTS (SELECT 1 FROM documentos_fase_interna f WHERE f.sistema_origem = 'documentos_licitacao' AND f.id_externo = d.id::text)
      ORDER BY d.created_at ASC`,
    [Object.keys(MAPA_TIPO_DOCUMENTOS_LICITACAO), FASES_INTERNAS],
  );
  let espelhados = 0;
  for (const c of candidatos) {
    if ((await espelharDocumentoLicitacao(m, c.id)) === 'ESPELHADO') espelhados++;
  }
  return { espelhados };
}
