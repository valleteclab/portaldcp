/**
 * TERMO DE CONFERÊNCIA DE SETOR (jsPDF) — A4 retrato.
 *
 * O documento que o responsável pelo setor assina ao fechar a conferência e
 * leva consigo. Estrutura seguindo a prática dos órgãos (IN SEDAP nº 205/1988):
 * identificação, resultado quantitativo, divergências nomeadas, declaração e
 * assinaturas.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DadosTermoSetor } from './termo-conferencia.util';
import { BrasaoPdf, medidaBrasao } from './brasao-pdf.util';

type RGB = [number, number, number];
const INSTIT: RGB = [27, 74, 99];
const INK: RGB = [22, 24, 26];
const MUTED: RGB = [86, 93, 100];
const LINE: RGB = [201, 205, 210];
const ALERTA: RGB = [140, 59, 47];
const HEAD_BG: RGB = [242, 244, 245];

/** pt-BR sem depender do ICU do Node (a imagem enxuta cai para en-US). */
function numeroBR(v: number, casas = 2): string {
  const n = Number(v) || 0;
  const [inteiro, decimal] = Math.abs(n).toFixed(casas).split('.');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const s = decimal ? `${milhar},${decimal}` : milhar;
  return n < 0 ? `-${s}` : s;
}

export interface CabecalhoTermo {
  orgao_nome: string;
  orgao_cnpj?: string | null;
  comissao?: string | null;
  inventario_nome: string;
  inventario_ano: number;
  setor_nome: string;
  responsavel_nome?: string | null;
  periodo: string;
  emitido_em: string;
  fechado_por?: string | null;
  codigo_verificacao: string;
  brasao?: BrasaoPdf | null;
}

export function gerarTermoConferenciaPdf(cab: CabecalhoTermo, dados: DadosTermoSetor): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18; // margem esquerda
  const R = 192; // limite direito
  let y = 16;

  // ─── Cabeçalho ───────────────────────────────────────────────
  // Com brasão o texto desloca para a direita; sem ele, encosta na margem.
  let xTexto = L;
  if (cab.brasao) {
    const m = medidaBrasao(cab.brasao, 16, 24);
    doc.addImage(cab.brasao.dataUrl, 'PNG', L, y - 2, m.largura, m.altura);
    xTexto = L + m.largura + 5;
  }
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK);
  doc.text(cab.orgao_nome.toUpperCase(), xTexto, y + 2, { maxWidth: R - xTexto });
  let yTexto = y + 7;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
  if (cab.orgao_cnpj) {
    doc.text(`CNPJ ${cab.orgao_cnpj}`, xTexto, yTexto);
    yTexto += 4;
  }
  doc.text(cab.comissao || 'Comissão de Inventário de Bens Móveis', xTexto, yTexto, { maxWidth: R - xTexto });
  y = Math.max(yTexto + 3.5, cab.brasao ? y + 16 : yTexto + 3.5);
  doc.setDrawColor(...INSTIT).setLineWidth(0.6).line(L, y, R, y);
  y += 9;

  // ─── Título ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...INK);
  doc.text('TERMO DE CONFERÊNCIA DE SETOR', (L + R) / 2, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
  doc.text(`${cab.inventario_nome} — Exercício ${cab.inventario_ano}`, (L + R) / 2, y, { align: 'center' });
  y += 7;

  // ─── Identificação ───────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: 210 - R },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 34, fillColor: HEAD_BG, fontStyle: 'bold' },
      1: { cellWidth: 53 },
      2: { cellWidth: 34, fillColor: HEAD_BG, fontStyle: 'bold' },
      3: { cellWidth: 53 },
    },
    body: [
      ['Setor', cab.setor_nome, 'Responsável', cab.responsavel_nome || '—'],
      ['Período da conferência', cab.periodo, 'Emitido em', cab.emitido_em],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Declaração ──────────────────────────────────────────────
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
  const texto = doc.splitTextToSize(
    'Declaro que procedi à conferência física dos bens móveis do setor acima, na forma do art. 94 da ' +
      'Lei nº 4.320/1964 e do item 8 da Instrução Normativa SEDAP nº 205/1988, com os resultados abaixo.',
    R - L,
  );
  doc.text(texto, L, y);
  y += texto.length * 4.2 + 4;

  // ─── Resultado ───────────────────────────────────────────────
  const q = dados.quadro;
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INSTIT);
  doc.text('1. RESULTADO DA CONFERÊNCIA', L, y);
  y += 2.5;
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: 210 - R },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    headStyles: { fillColor: HEAD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: { 1: { halign: 'right', cellWidth: 26 }, 2: { halign: 'right', cellWidth: 36 } },
    head: [['Situação', 'Quantidade', 'Valor contábil']],
    body: [
      ['Bens cadastrados no setor', numeroBR(q.cadastrados, 0), numeroBR(q.valor_cadastrado)],
      ['Conferidos no próprio setor', numeroBR(q.conferidos, 0), numeroBR(q.valor_conferido)],
      ['Localizados em outro setor', numeroBR(q.em_outro_setor, 0), '—'],
      ['Não localizados', numeroBR(q.nao_localizados, 0), numeroBR(q.valor_nao_localizado)],
      ['Encontrados sem cadastro', numeroBR(q.sem_cadastro, 0), 'a avaliar'],
      ['Baixados, porém presentes', numeroBR(q.baixados_presentes, 0), '—'],
    ],
    didParseCell: (d: any) => {
      if (d.section === 'body' && d.row.index === 3 && q.nao_localizados > 0) d.cell.styles.textColor = ALERTA;
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ─── Divergências ────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INSTIT);
  doc.text('2. DIVERGÊNCIAS APURADAS', L, y);
  y += 2.5;
  if (dados.divergencias.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: L, right: 210 - R },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      headStyles: { fillColor: HEAD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 58 } },
      head: [['Tombo', 'Descrição', 'Ocorrência']],
      body: dados.divergencias.map((d) => [d.tombo, d.descricao, d.ocorrencia]),
      didParseCell: (d: any) => {
        if (d.section === 'body' && d.column.index === 2 && String(d.cell.raw).startsWith('Não localizado')) {
          d.cell.styles.textColor = ALERTA;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
    doc.text('Nenhuma divergência apurada neste setor.', L, y + 4);
    y += 9;
  }

  if (dados.descartadas > 0) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    const nota = doc.splitTextToSize(
      `${dados.descartadas} leitura(s) foram descartadas pelo conferente por não corresponderem a bens presentes ` +
        'neste setor (captação do leitor em ambiente vizinho) e não integram os quadros acima.',
      R - L,
    );
    doc.text(nota, L, y + 3);
    y += nota.length * 3.4 + 5;
  }

  // ─── Assinaturas ─────────────────────────────────────────────
  const alturaBloco = 34;
  if (y > 297 - alturaBloco - 18) {
    doc.addPage();
    y = 20;
  } else {
    y = Math.max(y + 6, 297 - alturaBloco - 18);
  }

  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
  const compromisso = doc.splitTextToSize(
    'Comprometo-me a comunicar à Comissão de Inventário qualquer movimentação dos bens relacionados.',
    R - L,
  );
  doc.text(compromisso, L, y);
  y += compromisso.length * 4 + 14;

  const meio = (L + R) / 2;
  const larg = 70;
  doc.setDrawColor(...INK).setLineWidth(0.3);
  doc.line(L + 4, y, L + 4 + larg, y);
  doc.line(R - 4 - larg, y, R - 4, y);
  y += 4;
  doc.setFont('helvetica', 'bold').setFontSize(8);
  doc.text(cab.fechado_por || cab.responsavel_nome || '', L + 4 + larg / 2, y, { align: 'center' });
  doc.text('', R - 4 - larg / 2, y, { align: 'center' });
  y += 3.6;
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
  doc.text('Responsável pelo setor', L + 4 + larg / 2, y, { align: 'center' });
  doc.text('Comissão de Inventário', R - 4 - larg / 2, y, { align: 'center' });

  // ─── Rodapé ──────────────────────────────────────────────────
  const rodape = 297 - 12;
  doc.setDrawColor(...LINE).setLineWidth(0.2).line(L, rodape - 4, R, rodape - 4);
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
  doc.text(`Código de verificação: ${cab.codigo_verificacao}`, L, rodape);
  doc.text(`${cab.setor_nome} — ${cab.inventario_ano}`, R, rodape, { align: 'right' });
  void meio;

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer);
}
