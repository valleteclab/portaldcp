/**
 * BOLETIM DE MEDIÇÃO DE OBRA — MODELO 2 (jsPDF)
 *
 * Ordem de leitura: A) resumo do contrato, B) situação de todas as etapas,
 * C) itens medidos no período (quantidades), D) valor a pagar, E) assinaturas
 * e, sempre, o ANEXO com a composição completa das etapas.
 * Usa os mesmos dados e assinaturas do boletim oficial; não o substitui.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as QRCode from 'qrcode';
import { desenharQuadroAssinaturas } from './medicao-pdf-jspdf';
import {
  itensMedidosDaEtapa,
  LinhaEtapaV2,
  resumoContrato,
  ResumoV2,
  valorAPagar,
} from '../contratos/boletim-obra-v2.util';

type RGB = [number, number, number];
const NAVY: RGB = [31, 58, 95];
const INK: RGB = [22, 32, 43];
const MUTED: RGB = [91, 103, 115];
const LINE: RGB = [217, 222, 227];
const EXEC: RGB = [46, 122, 94];
const EXEC_SOFT: RGB = [220, 239, 230];
const PERIOD: RGB = [199, 129, 26];
const PERIOD_SOFT: RGB = [251, 235, 210];
const SALDO: RGB = [197, 204, 211];
const HEAD_BG: RGB = [238, 241, 244];

/** Formatação pt-BR sem depender do ICU do Node (em imagem enxuta vira en-US). */
export function numeroBR(v: number, casasMin = 2, casasMax = casasMin): string {
  const n = Number(v) || 0;
  let s = Math.abs(n).toFixed(casasMax);
  if (casasMax > casasMin) {
    const [int, dec = ''] = s.split('.');
    const d = dec.replace(/0+$/, '').padEnd(casasMin, '0');
    s = d ? `${int}.${d}` : int;
  }
  const [inteiro, decimal] = s.split('.');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${milhar}${decimal ? `,${decimal}` : ''}`;
}
const brl = (v: number) => `R$ ${numeroBR(v)}`;
const pct = (v: number) => `${numeroBR(v)}%`;
const qtd = (v: number) => numeroBR(v, 0, 2);

function fmtData(d: any): string {
  if (!d) return '-';
  const s = d instanceof Date ? d.toISOString() : String(d);
  const p = s.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}
function fmtCnpj(cnpj: string): string {
  const c = String(cnpj || '').replace(/\D/g, '');
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : cnpj || '-';
}

export interface DadosBoletimObraV2 {
  dados: any; // retorno de montarDadosPdfFrontend
  linhas: LinhaEtapaV2[];
}

export async function gerarBoletimObraV2Pdf({ dados, linhas }: DadosBoletimObraV2): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mX = 10;
  const CW = W - 2 * mX;
  let y = 12;

  const resumo: ResumoV2 = resumoContrato(linhas, dados.valor_total_contrato);
  const numero = String(dados.numero_medicao).padStart(3, '0');
  const contratoNumero = dados.numero_contrato ?? dados.contrato_numero ?? '-';
  const rotulo = String(dados.tipo_instrumento || 'CONTRATO').toUpperCase() === 'ATA' ? 'Ata' : 'Contrato';

  const garantirEspaco = (alt: number) => {
    if (y + alt > H - 14) {
      doc.addPage();
      y = 14;
    }
  };
  const tituloBloco = (letra: string, titulo: string, dica?: string) => {
    garantirEspaco(14);
    doc.setFillColor(...NAVY);
    doc.roundedRect(mX, y - 3.6, 5.5, 5, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(letra, mX + 2.75, y - 0.1, { align: 'center' });
    doc.setTextColor(...NAVY);
    doc.setFontSize(9);
    doc.text(titulo.toUpperCase(), mX + 8, y);
    if (dica) {
      const wT = doc.getTextWidth(titulo.toUpperCase());
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(dica, mX + 8 + wT + 3, y);
    }
    y += 4;
  };

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(`BOLETIM DE MEDIÇÃO Nº ${numero}`, mX, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('Medição de obra', mX, y + 7);

  const meta: Array<[string, string]> = [
    ['Período', `${fmtData(dados.periodo_inicio)} a ${fmtData(dados.periodo_fim)}`],
    ['Competência', String(dados.competencia || '-')],
    ['Nota fiscal', String(dados.nota_fiscal_numero || '-')],
    ['Emissão', fmtData(dados.boletim_data_emissao) !== '-' ? fmtData(dados.boletim_data_emissao) : '-'],
  ];
  let my = y - 1;
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(k, W - mX - 48, my);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(v, W - mX, my, { align: 'right' });
    my += 4;
  }
  y = Math.max(y + 10, my) + 1;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(mX, y, W - mX, y);
  y += 5;

  const linhaInfo = (rot: string, valor: string, maxLinhas = 1) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(rot, mX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    const partes = doc.splitTextToSize(valor, CW - 24).slice(0, maxLinhas);
    if (partes.length === maxLinhas && doc.splitTextToSize(valor, CW - 24).length > maxLinhas) {
      partes[maxLinhas - 1] = String(partes[maxLinhas - 1]).replace(/\s*\S*$/, '') + '…';
    }
    doc.text(partes, mX + 24, y);
    y += 3.6 * partes.length + 0.8;
  };
  linhaInfo('Órgão', String(dados.orgao_nome || '-'));
  linhaInfo(rotulo, String(contratoNumero));
  linhaInfo('Fornecedor', `${dados.fornecedor_nome || '-'} — CNPJ ${fmtCnpj(dados.fornecedor_cnpj)}`);
  linhaInfo('Objeto', String(dados.contrato_objeto || '-').replace(/\s+/g, ' '), 3);
  y += 4;

  // ── A. Resumo ───────────────────────────────────────────────────────────
  tituloBloco('A', 'Resumo da medição', 'em relação ao valor total do contrato');
  const caixas: Array<{ rot: string; valor: number; pct?: number; fundo?: RGB }> = [
    { rot: 'VALOR DO CONTRATO', valor: resumo.valor_contrato, pct: 100 },
    { rot: 'MEDIDO ATÉ A ANTERIOR', valor: resumo.valor_anterior, pct: resumo.pct_anterior },
    { rot: 'ESTA MEDIÇÃO', valor: resumo.valor_periodo, pct: resumo.pct_periodo, fundo: PERIOD_SOFT },
    { rot: 'ACUMULADO', valor: resumo.valor_acumulado, pct: resumo.pct_acumulado, fundo: EXEC_SOFT },
    { rot: 'SALDO A EXECUTAR', valor: resumo.valor_saldo, pct: resumo.pct_saldo },
  ];
  const bw = CW / caixas.length;
  const bh = 17;
  caixas.forEach((c, i) => {
    const bx = mX + i * bw;
    if (c.fundo) {
      doc.setFillColor(...c.fundo);
      doc.rect(bx, y, bw, bh, 'F');
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.rect(bx, y, bw, bh, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...MUTED);
    doc.text(c.rot, bx + 2.5, y + 4.5);
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(brl(c.valor), bx + 2.5, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(pct(c.pct ?? 0), bx + 2.5, y + 14.5);
  });
  y += bh + 3;
  // barra: executado antes | esta medição | saldo
  doc.setFillColor(...SALDO);
  doc.rect(mX, y, CW, 3.2, 'F');
  const wAnt = (CW * Math.min(100, resumo.pct_anterior)) / 100;
  const wPer = (CW * Math.min(100 - resumo.pct_anterior, resumo.pct_periodo)) / 100;
  if (wAnt > 0) {
    doc.setFillColor(...EXEC);
    doc.rect(mX, y, wAnt, 3.2, 'F');
  }
  if (wPer > 0) {
    doc.setFillColor(...PERIOD);
    doc.rect(mX + wAnt, y, wPer, 3.2, 'F');
  }
  y += 6.5;
  const legenda: Array<[RGB, string]> = [
    [EXEC, 'Executado antes'],
    [PERIOD, 'Esta medição'],
    [SALDO, 'Falta executar'],
  ];
  let lx = mX;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (const [cor, txt] of legenda) {
    doc.setFillColor(...cor);
    doc.rect(lx, y - 2.2, 2.6, 2.6, 'F');
    doc.setTextColor(...MUTED);
    doc.text(txt, lx + 4, y);
    lx += doc.getTextWidth(txt) + 11;
  }
  y += 7;

  // ── B. Situação de todas as etapas ──────────────────────────────────────
  tituloBloco('B', 'Situação de todas as etapas', 'em destaque as medidas neste período');
  const cabecalho = { fillColor: HEAD_BG, textColor: MUTED, fontStyle: 'bold' as const, fontSize: 6.3 };
  const direita = { halign: 'right' as const };
  autoTable(doc, {
    startY: y,
    margin: { left: mX, right: mX },
    theme: 'grid',
    head: [
      [
        { content: 'Nº', rowSpan: 2, styles: { ...cabecalho, valign: 'middle' as const } },
        { content: 'ETAPA', rowSpan: 2, styles: { ...cabecalho, valign: 'middle' as const } },
        { content: 'PREVISTO R$', rowSpan: 2, styles: { ...cabecalho, ...direita, valign: 'middle' as const } },
        { content: '% DA ETAPA', colSpan: 3, styles: { ...cabecalho, halign: 'center' as const } },
        { content: 'VALOR R$', colSpan: 3, styles: { ...cabecalho, halign: 'center' as const } },
      ],
      [
        { content: 'ANTERIOR', styles: { ...cabecalho, ...direita } },
        { content: 'PERÍODO', styles: { ...cabecalho, ...direita } },
        { content: 'ACUMULADO', styles: { ...cabecalho, ...direita } },
        { content: 'PERÍODO', styles: { ...cabecalho, ...direita } },
        { content: 'ACUMULADO', styles: { ...cabecalho, ...direita } },
        { content: 'SALDO', styles: { ...cabecalho, ...direita } },
      ],
    ],
    body: [
      ...linhas.map((l) => {
        const fundo = l.medida_no_periodo ? { fillColor: PERIOD_SOFT } : {};
        const per = l.medida_no_periodo ? { textColor: PERIOD, fontStyle: 'bold' as const } : {};
        return [
          { content: String(l.numero), styles: { ...fundo } },
          { content: l.descricao, styles: { ...fundo } },
          { content: numeroBR(l.valor_previsto), styles: { ...fundo, ...direita } },
          { content: pct(l.pct_anterior), styles: { ...fundo, ...direita } },
          { content: l.medida_no_periodo ? pct(l.pct_periodo) : '—', styles: { ...fundo, ...direita, ...per } },
          { content: pct(l.pct_acumulado), styles: { ...fundo, ...direita } },
          { content: l.medida_no_periodo ? numeroBR(l.valor_periodo) : '—', styles: { ...fundo, ...direita, ...per } },
          { content: numeroBR(l.valor_acumulado), styles: { ...fundo, ...direita } },
          { content: numeroBR(l.valor_saldo), styles: { ...fundo, ...direita } },
        ];
      }),
      [
        { content: '', styles: { fillColor: HEAD_BG } },
        { content: 'TOTAL DA OBRA', styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const } },
        { content: numeroBR(linhas.reduce((s, l) => s + l.valor_previsto, 0)), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
        { content: pct(resumo.pct_anterior), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
        { content: pct(resumo.pct_periodo), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
        { content: pct(resumo.pct_acumulado), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
        { content: numeroBR(resumo.valor_periodo), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
        { content: numeroBR(resumo.valor_acumulado), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
        { content: numeroBR(resumo.valor_saldo), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
      ],
    ],
    styles: { fontSize: 6.8, cellPadding: 1.3, lineColor: LINE, lineWidth: 0.2, textColor: INK, overflow: 'linebreak' as const },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 50 },
      2: { cellWidth: 21 },
      3: { cellWidth: 16 },
      4: { cellWidth: 15 },
      5: { cellWidth: 18 },
      6: { cellWidth: 20 },
      7: { cellWidth: 22 },
      8: { cellWidth: 21 },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 2.5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(
    'Percentuais do total calculados sobre o valor do contrato. Etapas fora deste período: acumulado das medições aprovadas anteriores.',
    mX,
    y + 1,
  );
  y += 8;

  // ── C. Itens medidos no período ─────────────────────────────────────────
  const medidas = (dados.etapas || []) as any[];
  if (medidas.length) {
    tituloBloco('C', 'Itens medidos neste período', 'quantidades pelo percentual medido da etapa');
    const body: any[] = [];
    for (const e of medidas.sort((a, b) => Number(a.numero) - Number(b.numero))) {
      const linhasItens = itensMedidosDaEtapa(e, e.itens || []);
      body.push([
        {
          content: `Etapa ${e.numero} · ${e.descricao} — ${pct(e.percentual_executado_atual)} no período`,
          colSpan: 8,
          styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, fontSize: 6.8 },
        },
      ]);
      if (!linhasItens.length) {
        body.push([
          { content: 'Etapa sem itens cadastrados', colSpan: 7, styles: { textColor: MUTED, fontStyle: 'italic' as const } },
          { content: numeroBR(e.valor_medido), styles: direita },
        ]);
        continue;
      }
      for (const it of linhasItens) {
        body.push([
          it.descricao,
          { content: it.unidade || '-', styles: { halign: 'center' as const } },
          { content: qtd(it.qtd_contratada), styles: direita },
          { content: qtd(it.qtd_anterior), styles: direita },
          { content: qtd(it.qtd_periodo), styles: { ...direita, textColor: PERIOD, fontStyle: 'bold' as const } },
          { content: qtd(it.qtd_saldo), styles: direita },
          { content: numeroBR(it.valor_unitario), styles: direita },
          { content: numeroBR(it.valor_periodo), styles: direita },
        ]);
      }
    }
    body.push([
      { content: 'TOTAL MEDIDO NO PERÍODO', colSpan: 7, styles: { fillColor: EXEC_SOFT, fontStyle: 'bold' as const } },
      { content: numeroBR(resumo.valor_periodo), styles: { fillColor: EXEC_SOFT, fontStyle: 'bold' as const, ...direita } },
    ]);
    autoTable(doc, {
      startY: y,
      margin: { left: mX, right: mX },
      theme: 'grid',
      head: [
        [
          { content: 'ITEM', styles: cabecalho },
          { content: 'UN.', styles: { ...cabecalho, halign: 'center' as const } },
          { content: 'QTD. CONTRATADA', styles: { ...cabecalho, ...direita } },
          { content: 'ANTERIOR', styles: { ...cabecalho, ...direita } },
          { content: 'PERÍODO', styles: { ...cabecalho, ...direita } },
          { content: 'SALDO', styles: { ...cabecalho, ...direita } },
          { content: 'PREÇO UNIT. R$', styles: { ...cabecalho, ...direita } },
          { content: 'VALOR PERÍODO R$', styles: { ...cabecalho, ...direita } },
        ],
      ],
      body,
      styles: { fontSize: 6.6, cellPadding: 1.2, lineColor: LINE, lineWidth: 0.2, textColor: INK, overflow: 'linebreak' as const },
      columnStyles: {
        0: { cellWidth: 68 },
        1: { cellWidth: 10 },
        2: { cellWidth: 18 },
        3: { cellWidth: 17 },
        4: { cellWidth: 17 },
        5: { cellWidth: 17 },
        6: { cellWidth: 20 },
        7: { cellWidth: 23 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── D. Valor a pagar ────────────────────────────────────────────────────
  const pagar = valorAPagar(dados.valor_medido ?? resumo.valor_periodo, dados.discriminacoes);
  tituloBloco('D', 'Valor a pagar');
  autoTable(doc, {
    startY: y,
    margin: { left: mX, right: W - mX - 110 },
    theme: 'grid',
    body: [
      [`Valor bruto da medição${dados.nota_fiscal_numero ? ` (NF ${dados.nota_fiscal_numero})` : ''}`, { content: brl(pagar.bruto), styles: direita }],
      ...pagar.descontos.map((d) => [
        `(-) ${d.descricao}${d.percentual ? ` ${numeroBR(d.percentual)}%` : ''}`,
        { content: brl(d.valor), styles: direita },
      ]),
      [
        { content: 'Valor líquido a pagar ao fornecedor', styles: { fillColor: EXEC_SOFT, fontStyle: 'bold' as const } },
        { content: brl(pagar.liquido), styles: { fillColor: EXEC_SOFT, fontStyle: 'bold' as const, ...direita } },
      ],
    ],
    styles: { fontSize: 7.2, cellPadding: 1.5, lineColor: LINE, lineWidth: 0.2, textColor: INK },
    columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 32 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── E. Assinaturas (as mesmas do boletim oficial) ───────────────────────
  let qrDataUrl: string | undefined;
  const codigoQr = dados.assinatura_fiscal?.codigo_validacao || dados.assinatura_fornecedor?.codigo_validacao;
  if (dados.url_validacao && codigoQr) {
    try {
      qrDataUrl = await QRCode.toDataURL(`${dados.url_validacao}/${String(codigoQr).replace(/-/g, '')}`, { width: 200, margin: 1 });
    } catch {
      qrDataUrl = undefined;
    }
  }
  const aForn = dados.assinatura_fornecedor;
  const aFisc = dados.assinatura_fiscal;
  const aEng = dados.assinatura_engenheiro;
  const assinaturas = [
    {
      titulo: 'FORNECEDOR',
      cor: [22, 60, 100] as RGB,
      nome: aForn?.nome || '',
      identificacao: aForn ? `CNPJ: ${fmtCnpj(aForn.cnpj)}` : '',
      cargo: aForn?.cargo || '',
      dataHora: aForn?.data_hora || '',
      pendente: !aForn,
      codigoValidacao: aForn?.codigo_validacao,
      declaracao: 'Declaro para os devidos fins de direito a veracidade das informações constantes neste documento.',
    },
    {
      titulo: 'FISCAL DE CONTRATO',
      cor: [0, 100, 50] as RGB,
      nome: aFisc?.nome || '',
      identificacao: aFisc?.cpf ? `CPF: ${aFisc.cpf}` : '',
      cargo: aFisc?.cargo || '',
      dataHora: aFisc?.data_hora || '',
      pendente: !aFisc,
      codigoValidacao: aFisc?.codigo_validacao,
      declaracao:
        'Declaro que o executor atuou sob minha supervisão e, portanto, ratifico a execução das atividades conforme descrito neste documento.',
    },
    ...(aEng
      ? [
          {
            titulo: 'ENGENHEIRO RESPONSÁVEL TÉCNICO',
            cor: [124, 58, 173] as RGB,
            nome: aEng.nome || '',
            identificacao: aEng.cpf ? `CPF: ${aEng.cpf}` : '',
            cargo: aEng.crea ? `CREA: ${aEng.crea}` : aEng.cargo || '',
            dataHora: '',
            pendente: false,
            codigoValidacao: aEng.codigo_validacao,
          },
        ]
      : []),
  ];
  garantirEspaco(60);
  const altura = desenharQuadroAssinaturas(doc, y, mX, W, assinaturas, dados.url_validacao, qrDataUrl);
  y += altura + 4;

  // ── Anexo: composição completa das etapas (sempre) ──────────────────────
  const contratadas = ((dados.etapas_contratadas || []) as any[]).sort((a, b) => Number(a.numero) - Number(b.numero));
  if (contratadas.length) {
    doc.addPage();
    y = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text('ANEXO — COMPOSIÇÃO DAS ETAPAS', mX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Itens contratados de cada etapa do cronograma · Boletim de Medição Nº ${numero}`, mX, y + 5);
    y += 10;
    const body: any[] = [];
    for (const e of contratadas) {
      body.push([
        { content: `Etapa ${e.numero} · ${e.descricao}`, colSpan: 5, styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const } },
        { content: numeroBR(e.valor_previsto), styles: { fillColor: HEAD_BG, fontStyle: 'bold' as const, ...direita } },
      ]);
      const itens = ((e.itens || []) as any[]).filter((i) => String(i?.descricao || '').trim());
      if (!itens.length) {
        body.push([{ content: 'Sem itens cadastrados na etapa', colSpan: 6, styles: { textColor: MUTED, fontStyle: 'italic' as const } }]);
        continue;
      }
      for (const i of itens) {
        const marcaModelo = [i.marca, i.modelo].map((v: any) => String(v || '').trim()).filter((v: string) => v && v !== '—').join(' / ');
        body.push([
          i.descricao,
          { content: i.unidade || '-', styles: { halign: 'center' as const } },
          { content: qtd(i.quantidade), styles: direita },
          { content: numeroBR(i.valor_unitario), styles: direita },
          { content: marcaModelo || '-', styles: { textColor: MUTED } },
          { content: numeroBR(i.valor_total), styles: direita },
        ]);
      }
    }
    autoTable(doc, {
      startY: y,
      margin: { left: mX, right: mX },
      theme: 'grid',
      head: [
        [
          { content: 'ITEM', styles: cabecalho },
          { content: 'UN.', styles: { ...cabecalho, halign: 'center' as const } },
          { content: 'QUANTIDADE', styles: { ...cabecalho, ...direita } },
          { content: 'PREÇO UNIT. R$', styles: { ...cabecalho, ...direita } },
          { content: 'MARCA / MODELO', styles: cabecalho },
          { content: 'TOTAL R$', styles: { ...cabecalho, ...direita } },
        ],
      ],
      body,
      styles: { fontSize: 6.5, cellPadding: 1.1, lineColor: LINE, lineWidth: 0.2, textColor: INK, overflow: 'linebreak' as const },
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 10 }, 2: { cellWidth: 19 }, 3: { cellWidth: 21 }, 4: { cellWidth: 35 }, 5: { cellWidth: 23 } },
    });
  }

  // ── Rodapé ──────────────────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Portal DCP  |  Boletim de Medição Nº ${dados.numero_medicao} (modelo de obra)  |  ${rotulo}: ${contratoNumero}  |  Competência: ${dados.competencia || '-'}  |  Página ${i}/${paginas}`,
      W / 2,
      H - 5,
      { align: 'center' },
    );
  }
  return Buffer.from(doc.output('arraybuffer'));
}
