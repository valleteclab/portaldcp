/**
 * TERMO DE ATESTO DA NOTA FISCAL DE FORNECIMENTO — PDF gerado pelo sistema para
 * colher as assinaturas de quem confere e autoriza o pagamento da nota: dados
 * da nota, da ordem, do contrato, do fornecedor, os itens e a situação do
 * recebimento. A ÚLTIMA página é só de assinaturas: cada signatário tem um
 * quadro em posição fixa, onde o assinador carimba a assinatura eletrônica.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const MAX_SIGNATARIOS_TERMO = 10;

/** Posição relativa (0-1) do quadro do signatário nº `i` (0-based) na última página. */
export function posicaoAssinaturaTermo(i: number): { pos_x: number; pos_y: number } {
  return { pos_x: i % 2 === 0 ? 0.08 : 0.54, pos_y: 0.16 + Math.floor(i / 2) * 0.14 };
}

export interface DadosTermoAtesto {
  orgao: { nome: string; cnpj?: string | null; cidade?: string | null; uf?: string | null };
  nota: { numero: string | null; serie: string | null; chave_acesso: string | null; data_emissao: Date | string | null; valor_total: number | string | null };
  ordem: { numero: string; descricao?: string | null };
  contrato: { numero?: string | null; objeto?: string | null };
  fornecedor: { razao_social: string; cpf_cnpj?: string | null };
  itens: Array<{ descricao: string; unidade?: string | null; quantidade: number; valor_unitario: number; valor_total: number }>;
  /** Frase pronta sobre o recebimento do material (ex.: "Material recebido e aceito em ..."). */
  situacao_recebimento: string;
  signatarios: Array<{ nome: string; papel?: string | null }>;
  emitido_por: string;
  emitido_em: Date;
}

const moeda = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qtd = (v: any) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const doc = (v: any) => {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(v || '—');
};
const data = (d: Date | string | null | undefined, comHora = false) => {
  if (!d) return '—';
  // Data pura (AAAA-MM-DD) não passa por fuso: não pode voltar um dia.
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.slice(0, 10)) && !comHora) {
    const [a, m, dia] = d.slice(0, 10).split('-');
    return `${dia}/${m}/${a}`;
  }
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

/** Gera o termo. Devolve o PDF e o número da última página (a das assinaturas). */
export function gerarTermoAtestoPdf(d: DadosTermoAtesto): { buffer: Buffer; ultimaPagina: number } {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const L = pdf.internal.pageSize.getWidth();
  const A = pdf.internal.pageSize.getHeight();
  const M = 48;
  let y = 56;

  pdf.setFont('helvetica', 'bold').setFontSize(12);
  pdf.text(String(d.orgao.nome || '').toUpperCase(), L / 2, y, { align: 'center', maxWidth: L - 2 * M });
  y += 16;
  pdf.setFont('helvetica', 'normal').setFontSize(9);
  const sub = [d.orgao.cnpj ? `CNPJ ${doc(d.orgao.cnpj)}` : null, [d.orgao.cidade, d.orgao.uf].filter(Boolean).join('/') || null].filter(Boolean).join(' · ');
  if (sub) { pdf.text(sub, L / 2, y, { align: 'center' }); y += 14; }
  y += 10;
  pdf.setFont('helvetica', 'bold').setFontSize(13);
  pdf.text('TERMO DE ATESTO DE NOTA FISCAL DE FORNECIMENTO', L / 2, y, { align: 'center' });
  y += 20;

  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130, fillColor: [243, 244, 246] } },
    body: [
      ['Nota fiscal', `nº ${d.nota.numero || 's/n'}${d.nota.serie ? ` · série ${d.nota.serie}` : ''} · emitida em ${data(d.nota.data_emissao as any)}`],
      ['Chave de acesso', d.nota.chave_acesso || '—'],
      ['Valor da nota', moeda(d.nota.valor_total)],
      ['Fornecedor', `${d.fornecedor.razao_social} · ${doc(d.fornecedor.cpf_cnpj)}`],
      ['Ordem de fornecimento', `${d.ordem.numero}${d.ordem.descricao ? ` — ${String(d.ordem.descricao).slice(0, 200)}` : ''}`],
      ['Contrato', `${d.contrato.numero || '—'}${d.contrato.objeto ? ` — ${String(d.contrato.objeto).slice(0, 240)}` : ''}`],
      ['Recebimento', d.situacao_recebimento],
    ],
  });
  y = (pdf as any).lastAutoTable.finalY + 18;

  pdf.setFont('helvetica', 'bold').setFontSize(10);
  pdf.text('Itens da nota fiscal', M, y);
  autoTable(pdf, {
    startY: y + 6,
    margin: { left: M, right: M },
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 58, 138] },
    head: [['#', 'Descrição', 'Un.', 'Qtd.', 'Valor unit.', 'Total']],
    body: d.itens.length
      ? d.itens.map((it, i) => [String(i + 1), it.descricao, it.unidade || '—', qtd(it.quantidade), moeda(it.valor_unitario), moeda(it.valor_total)])
      : [['—', 'Itens não informados no arquivo da nota', '', '', '', '']],
    columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 36 }, 3: { cellWidth: 48, halign: 'right' }, 4: { cellWidth: 70, halign: 'right' }, 5: { cellWidth: 74, halign: 'right' } },
  });
  y = (pdf as any).lastAutoTable.finalY + 20;

  const texto =
    `Atestamos que os bens descritos na nota fiscal acima, referentes à ordem de fornecimento ${d.ordem.numero}, ` +
    `foram conferidos e correspondem ao que foi contratado, nas quantidades e nos valores indicados, ` +
    `estando a despesa em condições de seguir para liquidação e pagamento (Lei nº 4.320/1964, art. 63; Lei nº 14.133/2021, art. 140).`;
  pdf.setFont('helvetica', 'normal').setFontSize(10);
  const linhas = pdf.splitTextToSize(texto, L - 2 * M);
  if (y + linhas.length * 13 > A - 70) { pdf.addPage(); y = 64; }
  pdf.text(linhas, M, y);

  // ── Página de assinaturas (sempre a última) ──
  pdf.addPage();
  pdf.setFont('helvetica', 'bold').setFontSize(12);
  pdf.text('ASSINATURAS', L / 2, 64, { align: 'center' });
  pdf.setFont('helvetica', 'normal').setFontSize(9);
  pdf.text(
    `Termo de atesto da nota fiscal nº ${d.nota.numero || 's/n'} — ordem ${d.ordem.numero}. Assinaturas eletrônicas colhidas pelo sistema.`,
    L / 2, 80, { align: 'center', maxWidth: L - 2 * M },
  );
  d.signatarios.slice(0, MAX_SIGNATARIOS_TERMO).forEach((s, i) => {
    const p = posicaoAssinaturaTermo(i);
    const x = p.pos_x * L;
    const base = p.pos_y * A + 55 + 12; // abaixo do quadro do carimbo (55 pt)
    pdf.setDrawColor(120).line(x, base - 8, x + 220, base - 8);
    pdf.setFont('helvetica', 'bold').setFontSize(9);
    pdf.text(String(s.nome).slice(0, 48), x, base + 4);
    if (s.papel) {
      pdf.setFont('helvetica', 'normal').setFontSize(8);
      pdf.text(String(s.papel).slice(0, 56), x, base + 15);
    }
  });

  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(110);
    pdf.text(`Gerado no sistema por ${d.emitido_por} em ${data(d.emitido_em, true)} · página ${p} de ${total}`, L / 2, A - 24, { align: 'center' });
    pdf.setTextColor(0);
  }
  return { buffer: Buffer.from(pdf.output('arraybuffer')), ultimaPagina: total };
}
