/**
 * AVISO DE CONTRATAÇÃO DIRETA — Dispensa Eletrônica (art. 75, §3º, Lei 14.133/2021).
 * PDF real anexado ao PNCP na inclusão da compra (substitui o antigo placeholder).
 * Gerado dos dados da licitação: identificação, objeto, itens, prazos e forma
 * de participação.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtMoeda = (v: any) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataHora = (d: any) => (d ? new Date(d).toLocaleString('pt-BR') : '—');

export interface DadosAvisoDispensa {
  orgao_nome: string;
  orgao_cnpj?: string;
  licitacao: any;
  itens: any[];
  /** URL do sistema onde as propostas são recebidas (portal do fornecedor) */
  url_sistema?: string;
}

export function gerarAvisoDispensaPdf(dados: DadosAvisoDispensa): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const mX = 14;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(dados.orgao_nome || 'ÓRGÃO', W / 2, y, { align: 'center' });
  if (dados.orgao_cnpj) {
    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`CNPJ: ${dados.orgao_cnpj}`, W / 2, y, { align: 'center' });
  }
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AVISO DE CONTRATAÇÃO DIRETA', W / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.text('DISPENSA ELETRÔNICA — Art. 75, §3º, da Lei nº 14.133/2021', W / 2, y, { align: 'center' });
  y += 9;

  const lic = dados.licitacao;
  const linhas: Array<[string, string]> = [
    ['Processo', String(lic.numero_processo || '—')],
    ['Objeto', String(lic.objeto || '—')],
    ['Critério de julgamento', 'Menor preço unitário por item'],
    ['Valor total estimado', fmtMoeda(lic.valor_total_estimado)],
    ['Divulgação do aviso', fmtDataHora(lic.data_publicacao_edital)],
    [
      'Recebimento de propostas até',
      fmtDataHora(lic.data_fim_acolhimento || lic.data_abertura_sessao),
    ],
    [
      'Forma de participação',
      `Eletrônica, pelo sistema ${dados.url_sistema || 'Portal DCP'} (cadastro gratuito de fornecedores). Após o prazo, poderá haver fase de lances.`,
    ],
  ];
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    body: linhas,
    margin: { left: mX, right: mX },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('ITENS', mX, y);
  autoTable(doc, {
    startY: y + 2,
    theme: 'striped',
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    head: [['Item', 'Descrição', 'Unid.', 'Qtd', 'Vl. unit. estimado', 'Vl. total estimado']],
    body: (dados.itens || []).map((i) => [
      String(i.numero_item ?? '—'),
      String(i.descricao_resumida || i.descricao_detalhada || '').slice(0, 80),
      String(i.unidade_medida || '—'),
      Number(i.quantidade || 0).toLocaleString('pt-BR'),
      i.valor_unitario_estimado != null ? fmtMoeda(i.valor_unitario_estimado) : '—',
      i.valor_total_estimado != null ? fmtMoeda(i.valor_total_estimado) : '—',
    ]),
    margin: { left: mX, right: mX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const texto =
    'Os interessados deverão encaminhar proposta exclusivamente por meio do sistema indicado, até a data e hora ' +
    'limites deste aviso. As propostas permanecem sigilosas até o encerramento do prazo. O julgamento observará o ' +
    'menor preço unitário por item, podendo o órgão, após o prazo, abrir fase de lances e negociar condições mais ' +
    'vantajosas com o melhor classificado. A homologação e o resultado serão divulgados no PNCP.';
  const linhasTexto = doc.splitTextToSize(texto, W - mX * 2);
  doc.text(linhasTexto, mX, y);
  y += linhasTexto.length * 4.2 + 8;

  doc.setFontSize(8.5);
  doc.text(
    `Aviso gerado eletronicamente pelo Portal DCP em ${fmtDataHora(new Date())}.`,
    mX,
    y,
  );

  return Buffer.from(doc.output('arraybuffer'));
}
