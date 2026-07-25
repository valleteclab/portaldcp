/**
 * ATA DA DISPENSA ELETRÔNICA (art. 75, §3º, Lei 14.133/2021) — PDF.
 * Registro formal da sessão: propostas, fase de lances (histórico completo),
 * mensagens (chat) e resultado por item. Gerada sob demanda a partir dos
 * registros do banco — sempre fiel ao estado do processo.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtMoeda = (v: any) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataHora = (d: any) =>
  d ? new Date(d).toLocaleString('pt-BR') : '—';

export interface DadosAtaDispensa {
  orgao_nome: string;
  licitacao: any;
  itens: any[];
  propostas: any[]; // { razao_social, cpf_cnpj, valor_total_proposta, status, data_envio, motivo_desclassificacao? }
  lances: any[]; // { created_at, numero_item, razao_social, valor_unitario }
  mensagens: any[]; // { created_at, autor_tipo, autor_nome, mensagem }
}

export function gerarAtaDispensaPdf(dados: DadosAtaDispensa): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const mX = 14;
  let y = 16;

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(dados.orgao_nome || 'ÓRGÃO', W / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(13);
  doc.text('ATA DA DISPENSA ELETRÔNICA', W / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Processo ${dados.licitacao.numero_processo || '—'} · Art. 75, §3º, Lei nº 14.133/2021`,
    W / 2,
    y,
    { align: 'center' },
  );
  y += 8;

  // Dados do procedimento
  const lic = dados.licitacao;
  const linhas: Array<[string, string]> = [
    ['Objeto', String(lic.objeto || '—')],
    ['Valor total estimado', fmtMoeda(lic.valor_total_estimado)],
    ['Publicação do aviso', fmtDataHora(lic.data_publicacao_edital)],
    ['Fim do recebimento de propostas', fmtDataHora(lic.data_fim_acolhimento || lic.data_abertura_sessao)],
  ];
  if (lic.dispensa_lances_inicio) {
    linhas.push(['Fase de lances', `${fmtDataHora(lic.dispensa_lances_inicio)} a ${fmtDataHora(lic.dispensa_lances_fim)}`]);
  } else {
    linhas.push(['Fase de lances', 'Não realizada (julgamento direto das propostas)']);
  }
  if (lic.data_homologacao) {
    linhas.push(['Homologação', `${fmtDataHora(lic.data_homologacao)} — ${fmtMoeda(lic.valor_homologado)}`]);
  }
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    body: linhas,
    margin: { left: mX, right: mX },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Propostas recebidas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('1. PROPOSTAS RECEBIDAS', mX, y);
  y += 2;
  autoTable(doc, {
    startY: y + 2,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.5 },
    head: [['Fornecedor', 'CNPJ', 'Enviada em', 'Valor global', 'Situação']],
    body: dados.propostas.map((p) => [
      p.razao_social || '—',
      p.cpf_cnpj || '—',
      fmtDataHora(p.data_envio),
      fmtMoeda(p.valor_total_proposta),
      p.status + (p.motivo_desclassificacao ? ` — Motivo: ${p.motivo_desclassificacao}` : ''),
    ]),
    margin: { left: mX, right: mX },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Fase de lances (histórico)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('2. FASE DE LANCES', mX, y);
  y += 2;
  if (dados.lances.length > 0) {
    autoTable(doc, {
      startY: y + 2,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 1.5 },
      head: [['Data/hora', 'Item', 'Fornecedor', 'Valor unitário']],
      body: dados.lances.map((l) => [
        fmtDataHora(l.created_at),
        String(l.numero_item ?? '—'),
        l.razao_social || '—',
        fmtMoeda(l.valor_unitario),
      ]),
      margin: { left: mX, right: mX },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Não houve fase de lances.', mX, y + 5);
    y += 10;
  }

  // Resultado por item
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('3. RESULTADO POR ITEM (MENOR PREÇO)', mX, y);
  y += 2;
  autoTable(doc, {
    startY: y + 2,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.5 },
    head: [['Item', 'Descrição', 'Qtd', 'Vencedor', 'Vl. unit. final', 'Vl. total']],
    body: dados.itens.map((i) => [
      String(i.numero_item ?? '—'),
      String(i.descricao || '').slice(0, 60),
      String(Number(i.quantidade || 0).toLocaleString('pt-BR')),
      i.fornecedor_vencedor_nome || 'SEM VENCEDOR',
      i.valor_unitario_homologado != null ? fmtMoeda(i.valor_unitario_homologado) : '—',
      i.valor_total_homologado != null ? fmtMoeda(i.valor_total_homologado) : '—',
    ]),
    margin: { left: mX, right: mX },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Mensagens da sessão
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('4. MENSAGENS DA SESSÃO (CHAT)', mX, y);
  y += 2;
  if (dados.mensagens.length > 0) {
    autoTable(doc, {
      startY: y + 2,
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 1.4 },
      head: [['Data/hora', 'Autor', 'Mensagem']],
      body: dados.mensagens.map((m) => [
        fmtDataHora(m.created_at),
        `${m.autor_tipo === 'ORGAO' ? '[Órgão] ' : ''}${m.autor_nome || '—'}`,
        String(m.mensagem || ''),
      ]),
      columnStyles: { 2: { cellWidth: 100 } },
      margin: { left: mX, right: mX },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Não houve mensagens registradas.', mX, y + 5);
    y += 10;
  }

  // Encerramento
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const rodape =
    `Ata gerada eletronicamente pelo Portal DCP em ${fmtDataHora(new Date())}, a partir dos registros ` +
    `da sessão (propostas, lances e mensagens gravados com data e hora). Documento fiel aos autos do processo.`;
  const linhasRodape = doc.splitTextToSize(rodape, W - mX * 2);
  doc.text(linhasRodape, mX, y + 4);

  return Buffer.from(doc.output('arraybuffer'));
}
