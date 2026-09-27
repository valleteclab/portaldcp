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
  const faixa = proximaFaixaDeFolhas(await ultimaFolha(m, licitacaoId, { documentoId }), paginas);
  await m.query(
    `UPDATE documentos_fase_interna SET folha_inicial = $2, folha_final = $3, total_paginas = $4 WHERE id::text = $1`,
    [documentoId, faixa.folha_inicial, faixa.folha_final, Math.max(1, Math.floor(paginas) || 1)],
  );
  return faixa;
}


/**
 * Última folha já atribuída no processo: peças (`documentos_fase_interna`),
 * despachos de tramitação (`tramitacoes_processo` — espinha da tramitação) e
 * despachos das etapas de registro (`despachos_fase_interna` — F3), que
 * dividem a MESMA sequência de folhas. `excluir`: o próprio registro.
 */
export async function ultimaFolha(
  m: EntityManager,
  licitacaoId: string,
  excluir: { documentoId?: string; tramitacaoId?: string; despachoId?: string } = {},
): Promise<number | null> {
  const [{ ultima }] = await m.query(
    `SELECT GREATEST(
       (SELECT MAX(folha_final) FROM documentos_fase_interna WHERE licitacao_id::text = $1 AND id::text <> $2),
       (SELECT MAX(folha_final) FROM tramitacoes_processo WHERE licitacao_id::text = $1 AND id::text <> $3),
       (SELECT MAX(folha_final) FROM despachos_fase_interna WHERE licitacao_id::text = $1 AND id::text <> $4)
     ) AS ultima`,
    [licitacaoId, excluir.documentoId ?? '', excluir.tramitacaoId ?? '', excluir.despachoId ?? ''],
  );
  return ultima === null || ultima === undefined ? null : Number(ultima);
}

/**
 * Folhas do DESPACHO de uma tramitação (espinha): próxima faixa da sequência
 * do processo. Trava a licitação (FOR UPDATE) — chamar dentro de transação.
 */
export async function atribuirFolhasDespacho(m: EntityManager, licitacaoId: string, tramitacaoId: string, paginas: number) {
  await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
  const faixa = proximaFaixaDeFolhas(await ultimaFolha(m, licitacaoId, { tramitacaoId }), paginas);
  await m.query(
    `UPDATE tramitacoes_processo SET folha_inicial = $2, folha_final = $3, despacho_paginas = $4 WHERE id::text = $1`,
    [tramitacaoId, faixa.folha_inicial, faixa.folha_final, Math.max(1, Math.floor(paginas) || 1)],
  );
  return faixa;
}

/**
 * Folhas do DESPACHO de uma etapa de registro (F3): próxima faixa da mesma
 * sequência. Trava a licitação (FOR UPDATE) — chamar dentro de transação.
 */
export async function atribuirFolhasDespachoEtapa(m: EntityManager, licitacaoId: string, despachoId: string, paginas: number) {
  await m.query(`SELECT id FROM licitacoes WHERE id::text = $1 FOR UPDATE`, [licitacaoId]);
  const faixa = proximaFaixaDeFolhas(await ultimaFolha(m, licitacaoId, { despachoId }), paginas);
  await m.query(
    `UPDATE despachos_fase_interna SET folha_inicial = $2, folha_final = $3, paginas = $4 WHERE id::text = $1`,
    [despachoId, faixa.folha_inicial, faixa.folha_final, Math.max(1, Math.floor(paginas) || 1)],
  );
  return faixa;
}
