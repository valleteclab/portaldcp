import { EntityManager } from 'typeorm';
import { PDFDocument } from 'pdf-lib';
import { proximaFaixaDeFolhas } from './peca-regras';

/** Lê o PDF e devolve o nº de páginas (recusa arquivo que não abre como PDF). */
export async function contarPaginasPdf(buffer: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  return pdf.getPageCount();
}

/**
 * Atribui a PRÓXIMA faixa de folhas dos autos à peça (sequência por processo).
 * Trava a linha da licitação (FOR UPDATE) — chamar dentro de transação.
 */
export async function atribuirFolhas(m: EntityManager, licitacaoId: string, documentoId: string, paginas: number) {
  await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
  const [{ ultima }] = await m.query(
    `SELECT MAX(folha_final) AS ultima FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND id::text <> $2`,
    [licitacaoId, documentoId],
  );
  const faixa = proximaFaixaDeFolhas(ultima === null ? null : Number(ultima), paginas);
  await m.query(
    `UPDATE documentos_fase_interna SET folha_inicial = $2, folha_final = $3, total_paginas = $4 WHERE id::text = $1`,
    [documentoId, faixa.folha_inicial, faixa.folha_final, Math.max(1, Math.floor(paginas) || 1)],
  );
  return faixa;
}

