/**
 * PLANILHA-MODELO DA PROPOSTA (dono, 10/11/2026 — como a BLL): para quem não
 * quer digitar a proposta na tela. A planilha sai com os itens da licitação já
 * preenchidos; o fornecedor informa valor unitário, marca e modelo, e importa
 * na tela da proposta — onde confere tudo antes de enviar.
 *
 * As colunas e a linha de cabeçalho são o CONTRATO da importação
 * (frontend/src/lib/planilha-proposta.ts): mudar aqui exige mudar lá.
 */
import { NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { EntityManager } from 'typeorm';
import { licitacaoEhPublica } from '../licitacoes/licitacao-visao.util';

export const COLUNAS_PLANILHA_PROPOSTA = ['Item', 'Lote', 'Descrição', 'Quantidade', 'Unidade', 'Valor de referência (R$)', 'Valor unitário (R$)', 'Marca', 'Modelo'] as const;
export const ABA_PLANILHA_PROPOSTA = 'Proposta';

const ehUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function planilhaModeloDaProposta(m: EntityManager, licitacaoId: string): Promise<{ nome: string; conteudo: Buffer }> {
  if (!ehUuid(licitacaoId)) throw new NotFoundException('Licitação não encontrada');
  const [lic] = await m.query(
    `SELECT l.id, l.fase::text AS fase, l.data_publicacao_edital, l.numero_processo, l.objeto, l.sigilo_orcamento, o.nome AS orgao
       FROM licitacoes l LEFT JOIN orgaos o ON o.id = l.orgao_id WHERE l.id = $1`,
    [licitacaoId],
  );
  if (!lic || !licitacaoEhPublica(lic)) throw new NotFoundException('Licitação não encontrada');
  const sigiloso = lic.sigilo_orcamento === 'SIGILOSO';
  const itens: any[] = await m.query(
    `SELECT i.numero_item, lt.numero AS lote, i.descricao_resumida, i.quantidade, i.unidade_medida, i.valor_unitario_estimado
       FROM itens_licitacao i LEFT JOIN lotes_licitacao lt ON lt.id = i.lote_id
      WHERE i.licitacao_id = $1 AND i.status::text NOT IN ('DESERTO','FRACASSADO','CANCELADO')
      ORDER BY i.numero_item`,
    [licitacaoId],
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Portal DCP';
  const ws = wb.addWorksheet(ABA_PLANILHA_PROPOSTA, { views: [{ state: 'frozen', ySplit: 5 }] });
  ws.columns = [{ width: 7 }, { width: 7 }, { width: 60 }, { width: 12 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 24 }, { width: 24 }];

  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = `Proposta — processo ${lic.numero_processo ?? ''}${lic.orgao ? ` — ${lic.orgao}` : ''}`;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = String(lic.objeto ?? '');
  ws.getCell('A2').alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(2).height = 30;
  ws.mergeCells('A3:I3');
  ws.getCell('A3').value =
    'Preencha só as colunas amarelas: valor unitário (em reais), marca e modelo. Deixe em branco o item que não for cotar. Não altere as outras colunas nem a ordem. Depois, importe este arquivo na tela da proposta e confira antes de enviar.';
  ws.getCell('A3').alignment = { wrapText: true, vertical: 'top' };
  ws.getCell('A3').font = { italic: true, color: { argb: 'FF475569' } };
  ws.getRow(3).height = 42;

  const cab = ws.getRow(5);
  COLUNAS_PLANILHA_PROPOSTA.forEach((t, i) => {
    const c = cab.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  cab.height = 30;

  itens.forEach((it, k) => {
    const r = ws.getRow(6 + k);
    r.getCell(1).value = Number(it.numero_item);
    r.getCell(2).value = it.lote == null ? null : Number(it.lote);
    r.getCell(3).value = String(it.descricao_resumida ?? '');
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(4).value = Number(it.quantidade);
    r.getCell(5).value = it.unidade_medida ?? '';
    r.getCell(6).value = sigiloso || it.valor_unitario_estimado == null ? null : Number(it.valor_unitario_estimado);
    r.getCell(6).numFmt = '#,##0.00';
    for (const col of [7, 8, 9]) {
      const c = r.getCell(col);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
      c.protection = { locked: false };
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }
    r.getCell(7).numFmt = '#,##0.00';
    r.getCell(7).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true, showErrorMessage: true, error: 'Informe um valor em reais (número).' };
  });
  if (sigiloso) ws.getColumn(6).hidden = true;
  // Só as células amarelas ficam editáveis (proteção sem senha: evita apagar por engano)
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true });

  const conteudo = Buffer.from(await wb.xlsx.writeBuffer());
  const nome = `proposta-modelo-${String(lic.numero_processo ?? 'licitacao').replace(/[^0-9A-Za-z]+/g, '-')}.xlsx`;
  return { nome, conteudo };
}
