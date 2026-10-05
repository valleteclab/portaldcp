/**
 * RELATÓRIO FINAL DA COMISSÃO DE INVENTÁRIO (jsPDF) — A4 retrato.
 *
 * Ordem de leitura: identificação dos trabalhos, metodologia, quadro geral,
 * quadro por setor, divergências por tipo, situação geral, recomendações,
 * encerramento e assinaturas com ratificação da autoridade.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DadosRelatorioFinal, recomendacoes } from './relatorio-final.util';

type RGB = [number, number, number];
const INSTIT: RGB = [27, 74, 99];
const INK: RGB = [22, 24, 26];
const MUTED: RGB = [86, 93, 100];
const LINE: RGB = [201, 205, 210];
const ALERTA: RGB = [140, 59, 47];
const HEAD_BG: RGB = [242, 244, 245];

const L = 18;
const R = 192;
const FIM = 297 - 18;

function numeroBR(v: number, casas = 2): string {
  const n = Number(v) || 0;
  const [inteiro, decimal] = Math.abs(n).toFixed(casas).split('.');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const s = decimal ? `${milhar},${decimal}` : milhar;
  return n < 0 ? `-${s}` : s;
}

export interface CabecalhoRelatorio {
  orgao_nome: string;
  inventario_nome: string;
  inventario_ano: number;
  portaria?: string | null;
  processo?: string | null;
  comissao_texto?: string | null;
  membros?: Array<{ nome: string; cargo?: string | null; papel?: string | null }> | null;
  autoridade_nome?: string | null;
  autoridade_cargo?: string | null;
  periodo: string;
  cidade_uf: string;
  data_extenso: string;
}

export function gerarRelatorioFinalPdf(cab: CabecalhoRelatorio, d: DadosRelatorioFinal): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let pagina = 0;

  const rodape = () => {
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(L, FIM, R, FIM);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text(`Relatório Final de Inventário — Exercício ${cab.inventario_ano}`, L, FIM + 4);
    doc.text(`pág. ${pagina}`, R, FIM + 4, { align: 'right' });
  };

  const novaPagina = () => {
    if (pagina > 0) {
      rodape();
      doc.addPage();
    }
    pagina++;
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text(cab.orgao_nome.toUpperCase(), L, 12);
    doc.text(`Exercício ${cab.inventario_ano}`, R, 12, { align: 'right' });
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(L, 14, R, 14);
    return 20;
  };

  /** Garante espaço: se não couber, vira a página. */
  const espaco = (y: number, precisa: number) => (y + precisa > FIM - 4 ? novaPagina() : y);

  const titulo = (y: number, texto: string) => {
    const yy = espaco(y, 10);
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INSTIT);
    doc.text(texto, L, yy);
    return yy + 2.5;
  };

  const paragrafo = (y: number, texto: string, tamanho = 9) => {
    doc.setFont('helvetica', 'normal').setFontSize(tamanho).setTextColor(...INK);
    const linhas = doc.splitTextToSize(texto, R - L);
    const yy = espaco(y, linhas.length * (tamanho * 0.47) + 2);
    doc.text(linhas, L, yy);
    return yy + linhas.length * (tamanho * 0.47) + 3;
  };

  let y = novaPagina();

  // ─── Título ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...INK);
  doc.text('RELATÓRIO FINAL DE INVENTÁRIO DE BENS MÓVEIS', (L + R) / 2, y + 4, { align: 'center' });
  y += 9;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
  doc.text(
    `Exercício ${cab.inventario_ano}${cab.processo ? ` · Processo ${cab.processo}` : ''}`,
    (L + R) / 2,
    y,
    { align: 'center' },
  );
  y += 8;

  // ─── 1. Identificação ────────────────────────────────────────
  y = titulo(y, '1. IDENTIFICAÇÃO DOS TRABALHOS');
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: 210 - R },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 44, fillColor: HEAD_BG, fontStyle: 'bold' } },
    body: [
      ['Modalidade', 'Inventário anual de encerramento de exercício'],
      ['Período de realização', cab.periodo],
      ['Abrangência', `${d.totais.setores} setor(es) · ${numeroBR(d.totais.cadastrados, 0)} bens cadastrados`],
      ['Comissão', cab.portaria ? `Designada pela ${cab.portaria}` : cab.comissao_texto || '—'],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ─── 2. Metodologia ──────────────────────────────────────────
  y = titulo(y, '2. METODOLOGIA');
  y = paragrafo(
    y,
    'A conferência foi física e individualizada, por leitura do QR Code e do chip RFID das plaquetas ' +
      'patrimoniais, registrada em sistema no momento da verificação. Cada setor recebeu acesso próprio e ' +
      'firmou Termo de Conferência ao final, que integra este relatório.',
  );
  y = paragrafo(
    y,
    'Bem pertencente a um setor e localizado em outro foi computado somente após confirmação presencial do ' +
      'conferente, de modo que leituras captadas de ambientes vizinhos não integram os quantitativos. ' +
      (d.totais.descartadas > 0
        ? `${numeroBR(d.totais.descartadas, 0)} leitura(s) foram descartadas por esse critério. `
        : '') +
      'Etiquetas alheias ao patrimônio foram descartadas automaticamente pelo sistema.',
  );

  // ─── 3. Quadro geral ─────────────────────────────────────────
  const t = d.totais;
  const pct = (n: number) => (t.cadastrados ? numeroBR((n / t.cadastrados) * 100, 1) : '0,0');
  y = titulo(y, '3. QUADRO GERAL');
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: 210 - R },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    headStyles: { fillColor: HEAD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: { 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 20 }, 3: { halign: 'right', cellWidth: 34 } },
    head: [['Situação apurada', 'Bens', '%', 'Valor contábil']],
    body: [
      ['Localizados no setor de cadastro', numeroBR(t.conferidos, 0), pct(t.conferidos), numeroBR(t.valor_conferido)],
      ['Localizados em setor diverso', numeroBR(t.em_outro_setor, 0), pct(t.em_outro_setor), '—'],
      ['Não localizados', numeroBR(t.nao_localizados, 0), pct(t.nao_localizados), numeroBR(t.valor_nao_localizado)],
      ['Total cadastrado', numeroBR(t.cadastrados, 0), '100,0', numeroBR(t.valor_cadastrado)],
      ['Encontrados sem cadastro', numeroBR(t.sem_cadastro, 0), '—', 'a avaliar'],
      ['Baixados, porém presentes', numeroBR(t.baixados_presentes, 0), '—', '—'],
    ],
    didParseCell: (c: any) => {
      if (c.section !== 'body') return;
      if (c.row.index === 2 && t.nao_localizados > 0) c.cell.styles.textColor = ALERTA;
      if (c.row.index === 3) {
        c.cell.styles.fontStyle = 'bold';
        c.cell.styles.fillColor = HEAD_BG;
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 3;
  y = paragrafo(
    y,
    'Os bens localizados em setor diverso estão fisicamente presentes e identificados; não constituem perda, ' +
      'e sim pendência de transferência de carga.',
    7.5,
  );

  // ─── 4. Por setor ────────────────────────────────────────────
  y = titulo(y, '4. RESULTADO POR SETOR');
  autoTable(doc, {
    startY: y,
    margin: { left: L, right: 210 - R },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.5, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    headStyles: { fillColor: HEAD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      1: { halign: 'right', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 22 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 26 },
      5: { cellWidth: 22 },
    },
    head: [['Setor', 'Cadastrados', 'Conferidos', 'Em outro setor', 'Não localizados', 'Situação']],
    body: d.por_setor.map((s) => [
      s.setor,
      numeroBR(s.cadastrados, 0),
      numeroBR(s.conferidos, 0),
      numeroBR(s.em_outro_setor, 0),
      numeroBR(s.nao_localizados, 0),
      s.fechado ? 'Finalizado' : 'Em aberto',
    ]),
    didParseCell: (c: any) => {
      if (c.section === 'body' && c.column.index === 5 && c.cell.raw === 'Em aberto') c.cell.styles.textColor = ALERTA;
    },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  if (d.pendentes.length) {
    y = paragrafo(
      y,
      `Ressalva: ${d.pendentes.length === 1 ? 'o setor' : 'os setores'} ${d.pendentes.join(', ')} ` +
        `${d.pendentes.length === 1 ? 'não finalizou' : 'não finalizaram'} a conferência até a emissão deste ` +
        'relatório; os números correspondentes são parciais.',
      8,
    );
  }

  // ─── 5. Divergências ─────────────────────────────────────────
  y = titulo(y, '5. DIVERGÊNCIAS APURADAS');
  if (!d.grupos.length) {
    y = paragrafo(y, 'Não foram apuradas divergências.');
  }
  d.grupos.forEach((g, i) => {
    y = espaco(y, 24);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK);
    doc.text(`5.${i + 1} ${g.titulo} — ${g.linhas.length}`, L, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      margin: { left: L, right: 210 - R },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.3, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      headStyles: { fillColor: HEAD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7 },
      columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 34 }, 3: { cellWidth: 48 } },
      head: [['Tombo', 'Descrição', 'Setor', 'Ocorrência']],
      body: g.linhas.map((l) => [l.tombo, l.descricao, l.setor, l.ocorrencia]),
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  });

  // ─── 6. Situação geral ───────────────────────────────────────
  y = titulo(y, '6. SITUAÇÃO GERAL DO PATRIMÔNIO');
  y = paragrafo(
    y,
    `O índice de localização alcançou ${numeroBR(t.indice_localizacao, 1)}% dos bens cadastrados. ` +
      (t.nao_localizados > 0
        ? `A apuração dos ${numeroBR(t.nao_localizados, 0)} bens não localizados compete a comissão própria, ` +
          'na forma do item 10.6 da Instrução Normativa SEDAP nº 205/1988, não cabendo baixa nesta fase.'
        : 'Não há bens pendentes de localização.'),
  );

  // ─── 7. Recomendações ────────────────────────────────────────
  y = titulo(y, '7. RECOMENDAÇÕES');
  recomendacoes(t).forEach((rec, i) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
    const linhas = doc.splitTextToSize(rec, R - L - 6);
    y = espaco(y, linhas.length * 4.3 + 2);
    doc.text(`${i + 1}.`, L, y);
    doc.text(linhas, L + 6, y);
    y += linhas.length * 4.3 + 2;
  });
  y += 2;

  // ─── 8. Encerramento e assinaturas ───────────────────────────
  const membros = (cab.membros || []).filter((m) => m?.nome);
  const alturaFecho = 36 + Math.ceil(Math.max(membros.length, 1) / 3) * 18 + 34;
  y = espaco(y, alturaFecho);

  y = titulo(y, '8. ENCERRAMENTO');
  y = paragrafo(
    y,
    'Nada mais havendo a consignar, a Comissão encerra os trabalhos do inventário de bens móveis do ' +
      `exercício de ${cab.inventario_ano} e submete este relatório à apreciação e ratificação da autoridade ` +
      'competente, acompanhado dos Termos de Conferência de cada setor.',
  );
  y += 2;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
  doc.text(`${cab.cidade_uf}, ${cab.data_extenso}.`, R, y, { align: 'right' });
  y += 14;

  // Assinaturas da comissão, 3 por linha
  const assinatura = (x: number, larg: number, nome: string, papel: string) => {
    doc.setDrawColor(...INK).setLineWidth(0.3).line(x, y, x + larg, y);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...INK);
    doc.text(nome, x + larg / 2, y + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(papel, x + larg / 2, y + 7.5, { align: 'center' });
  };

  const lista = membros.length ? membros : [{ nome: '', cargo: null, papel: 'Presidente da Comissão' }];
  for (let i = 0; i < lista.length; i += 3) {
    const fatia = lista.slice(i, i + 3);
    const larg = (R - L - (fatia.length - 1) * 8) / fatia.length;
    fatia.forEach((m, j) => {
      const papel = m.papel
        ? String(m.papel).toUpperCase() === 'PRESIDENTE'
          ? 'Presidente da Comissão'
          : String(m.papel)
        : 'Membro';
      assinatura(L + j * (larg + 8), larg, m.nome || '', m.cargo ? `${papel} — ${m.cargo}` : papel);
    });
    y += 18;
  }
  y += 4;

  // Ratificação
  y = espaco(y, 34);
  doc.setDrawColor(...LINE).setLineWidth(0.2).rect(L, y, R - L, 30);
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...INSTIT);
  doc.text('RATIFICAÇÃO', L + 4, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
  doc.text('Aprovo o presente relatório e determino o cumprimento das providências recomendadas.', L + 4, y + 10);
  const largR = 70;
  const xR = (L + R) / 2 - largR / 2;
  doc.setDrawColor(...INK).setLineWidth(0.3).line(xR, y + 22, xR + largR, y + 22);
  doc.setFont('helvetica', 'bold').setFontSize(8);
  doc.text(cab.autoridade_nome || '', xR + largR / 2, y + 26, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
  doc.text(cab.autoridade_cargo || 'Autoridade competente', xR + largR / 2, y + 29, { align: 'center' });

  rodape();
  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer);
}
