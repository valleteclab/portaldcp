/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtDataHoraBrasilia } from '../resultado/formalizacao/termo-resultado-pdf';

/**
 * Termo simples (leilão: termo de arrematação; concurso: termo de premiação e
 * de cessão de direitos) — cabeçalho do órgão, título, parágrafos, quadro,
 * assinaturas e rodapé com data de geração (horário de Brasília).
 */
export interface DadosTermoSimples {
  orgao: { nome: string; cnpj?: string | null };
  titulo: string;
  subtitulo?: string | null;
  paragrafos: string[];
  quadro?: { cabecalho: string[]; linhas: Array<Array<string>> } | null;
  assinaturas: Array<{ nome: string; papel: string }>;
  rodape?: string | null;
}

export const fmtMoeda = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export const fmtDocumento = (v: any) => {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(v || '—');
};

export function gerarTermoSimplesPdf(d: DadosTermoSimples): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mX = 18;
  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(String(d.orgao.nome || 'ÓRGÃO').toUpperCase(), W / 2, y, { align: 'center', maxWidth: W - 2 * mX });
  y += 6;
  if (d.orgao.cnpj) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`CNPJ ${fmtDocumento(d.orgao.cnpj)}`, W / 2, y, { align: 'center' });
    y += 8;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(d.titulo, W / 2, y, { align: 'center' });
  y += 6;
  if (d.subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(d.subtitulo, W / 2, y, { align: 'center', maxWidth: W - 2 * mX });
    y += 8;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const p of d.paragrafos) {
    const linhas = doc.splitTextToSize(p, W - 2 * mX);
    if (y + linhas.length * 5 > H - 30) {
      doc.addPage();
      y = 20;
    }
    doc.text(linhas, mX, y);
    y += linhas.length * 5 + 3;
  }
  if (d.quadro && d.quadro.linhas.length) {
    autoTable(doc, {
      startY: y,
      head: [d.quadro.cabecalho],
      body: d.quadro.linhas,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [19, 81, 180] },
      margin: { left: mX, right: mX },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  if (y > H - 60) {
    doc.addPage();
    y = 30;
  }
  y += 10;
  const larg = (W - 2 * mX) / Math.max(1, d.assinaturas.length);
  d.assinaturas.forEach((a, i) => {
    const cx = mX + larg * i + larg / 2;
    doc.line(cx - larg / 2 + 5, y, cx + larg / 2 - 5, y);
    doc.setFontSize(9);
    doc.text(a.nome, cx, y + 5, { align: 'center', maxWidth: larg - 6 });
    doc.setFontSize(8);
    doc.text(a.papel, cx, y + 10, { align: 'center', maxWidth: larg - 6 });
  });
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.text(d.rodape ?? `Gerado em ${fmtDataHoraBrasilia(new Date())} (horário de Brasília)`, mX, H - 6);
    doc.text(`Página ${p} de ${paginas}`, W - mX, H - 6, { align: 'right' });
  }
  return Buffer.from(doc.output('arraybuffer'));
}
