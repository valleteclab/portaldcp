/**
 * ============================================================================
 * GERAÇÃO DE PDF — BOLETIM DE MEDIÇÃO (jsPDF)
 * ============================================================================
 *
 * Replica o layout EXATO do frontend (pdf-medicao.ts) no servidor,
 * acrescentando QR Code de validação nas assinaturas.
 *
 * Dependências: jspdf, jspdf-autotable, qrcode
 * ============================================================================
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as QRCode from 'qrcode';

// ---- Helpers (idênticos ao frontend) ----

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(d: string): string {
  if (!d) return '-';
  const p = d.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function fmtCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14) return cnpj;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** Diferença em dias usando ANO COMERCIAL (360 dias = 12 meses x 30 dias) */
function diasEntreDatasComercial(data1: string, data2: string, dataFimContrato?: string): number {
  const d1 = new Date(data1);
  const d2 = new Date(data2);
  const dataFimContratoDate = dataFimContrato ? new Date(dataFimContrato) : null;

  const ano1 = d1.getUTCFullYear();
  const mes1 = d1.getUTCMonth();
  const dia1 = d1.getUTCDate();

  const ano2 = d2.getUTCFullYear();
  const mes2 = d2.getUTCMonth();
  const dia2 = d2.getUTCDate();

  let dias = 0;

  if (ano1 === ano2 && mes1 === mes2) {
    const ehUltimoDiaDoContrato = dataFimContratoDate
      ? ano2 === dataFimContratoDate.getUTCFullYear() &&
        mes2 === dataFimContratoDate.getUTCMonth() &&
        dia2 === dataFimContratoDate.getUTCDate()
      : false;
    dias = Math.min(dia2 - dia1 + (ehUltimoDiaDoContrato ? 0 : 1), 30);
  } else {
    const diasPrimeiroMes = Math.min(30 - dia1 + 1, 30);

    let mesesCompletos = 0;
    if (ano2 > ano1 || mes2 > mes1 + 1) {
      mesesCompletos = (ano2 - ano1) * 12 + (mes2 - mes1 - 1);
    }

    let diasUltimoMes = Math.min(dia2, 30);
    const ehUltimoDiaDoContrato = dataFimContratoDate
      ? ano2 === dataFimContratoDate.getUTCFullYear() &&
        mes2 === dataFimContratoDate.getUTCMonth() &&
        dia2 === dataFimContratoDate.getUTCDate()
      : false;
    if (ehUltimoDiaDoContrato) {
      diasUltimoMes = dia2 - 1;
    }

    dias = diasPrimeiroMes + (mesesCompletos * 30) + diasUltimoMes;
  }

  return Math.max(0, Math.min(dias, 360));
}

/** Formata dias como "X mês/meses [e Y dia/dias]" */
function fmtTempo(dias: number): string {
  if (dias <= 0) return '0 dias';
  const m = Math.floor(dias / 30);
  const d = dias % 30;
  const pM = m === 1 ? '1 mês' : m > 1 ? `${m} meses` : '';
  const pD = d === 1 ? '1 dia' : d > 1 ? `${d} dias` : '';
  if (pM && pD) return `${pM} e ${pD}`;
  return pM || pD || '0 dias';
}

/** Formata quantidade com unidade (ex: 100 h, 50 un) */
function fmtQuantidade(valor: number, unidade: string): string {
  const u = (unidade || 'UN').toUpperCase();
  const suf = u === 'HORA' || u === 'H' ? ' h' : u === 'METROS' || u === 'M' ? ' m' : u === 'LITROS' || u === 'L' ? ' l' : ' un';
  return `${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}${suf}`;
}

/** Deriva "FEVEREIRO/2026" a partir de uma data ISO */
function derivarCompetencia(periodoInicio: string): string {
  if (!periodoInicio) return '';
  const d = new Date(periodoInicio + 'T00:00:00');
  const meses = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
                 'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  return `${meses[d.getMonth()]}/${d.getFullYear()}`;
}

// ---- Quadro de Assinaturas (idêntico ao frontend + QR Code) ----

function desenharQuadroAssinaturas(
  doc: jsPDF,
  y: number,
  mX: number,
  W: number,
  assinaturas: Array<{
    titulo: string;
    cor: [number, number, number];
    nome: string;
    identificacao: string;
    cargo: string;
    dataHora: string;
    pendente: boolean;
    codigoValidacao?: string;
  }>,
  urlValidacao?: string,
  qrDataUrl?: string,
): number {
  const contentW = W - 2 * mX;
  let dy = 0;

  // ── Linha separadora ────────────────────────────────────────────────────────
  doc.setDrawColor(107, 114, 128);
  doc.setLineWidth(0.6);
  doc.line(mX, y + dy, W - mX, y + dy);
  dy += 3.5;

  // ── Título do quadro ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('QUADRO DE ASSINATURAS ELETRÔNICAS', W / 2, y + dy, { align: 'center' });
  dy += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(55, 65, 81);
  doc.text(
    'Este documento foi assinado eletronicamente em conformidade com a Lei nº 14.063/2020.',
    W / 2, y + dy, { align: 'center' },
  );
  dy += 4.5;

  // ── Caixas por assinante ────────────────────────────────────────────────
  const boxW = (contentW - 4) / 2;
  const assinantesArr = assinaturas.slice(0, 2);

  let maxBoxH = 0;
  const boxesInfo: { x: number; boxH: number }[] = [];

  for (let i = 0; i < assinantesArr.length; i++) {
    const a = assinantesArr[i];
    const bx = mX + i * (boxW + 4);

    let boxH: number;
    if (a.pendente) {
      boxH = 18;
    } else {
      const linhasNome = doc.splitTextToSize(a.nome, boxW - 5);
      const numLinhasNome = Math.min(linhasNome.length, 2);
      boxH = 5 + 3.5
        + numLinhasNome * 3.1
        + (a.cargo ? 2.8 : 0)
        + (a.identificacao ? 2.8 : 0)
        + 2.8   // data/hora
        + 2.8   // assinatura válida
        + 2.5;  // padding inferior
    }
    maxBoxH = Math.max(maxBoxH, boxH);
    boxesInfo.push({ x: bx, boxH });

    // Fundo + borda
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(a.cor[0], a.cor[1], a.cor[2]);
    doc.setLineWidth(0.4);
    doc.rect(bx, y + dy, boxW, boxH, 'FD');

    // Header colorido
    doc.setFillColor(a.cor[0], a.cor[1], a.cor[2]);
    doc.rect(bx, y + dy, boxW, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    doc.text(a.titulo, bx + boxW / 2, y + dy + 3.4, { align: 'center' });

    if (a.pendente) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6);
      doc.setTextColor(156, 163, 175);
      doc.text('Pendente de assinatura', bx + boxW / 2, y + dy + 11.5, { align: 'center' });
    } else {
      let ly = y + dy + 8.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(17, 24, 39);
      const linhasNome = doc.splitTextToSize(a.nome, boxW - 5);
      doc.text(linhasNome.slice(0, 2), bx + 3, ly);
      ly += linhasNome.slice(0, 2).length * 3.1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(55, 65, 81);
      if (a.cargo) { doc.text(a.cargo, bx + 3, ly); ly += 2.8; }
      if (a.identificacao) { doc.text(a.identificacao, bx + 3, ly); ly += 2.8; }
      doc.text(`Data/Hora: ${a.dataHora}`, bx + 3, ly); ly += 2.8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(22, 163, 74);
      doc.text('✓  Assinatura eletrônica válida', bx + 3, ly);
    }
  }
  dy += maxBoxH + 3;

  // ── Rodapé: URL de verificação + código + QR Code ─────────────────────────
  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.4);
  doc.line(mX, y + dy, W - mX, y + dy);
  dy += 3;

  const baseUrl = urlValidacao || 'portaldcp.com.br/validar-documento';

  // Se temos QR Code, layout lado a lado (texto à esquerda, QR à direita)
  const qrSize = 22; // mm
  const textAreaW = qrDataUrl ? contentW - qrSize - 4 : contentW;
  const textStartDy = dy;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  doc.setTextColor(17, 24, 39);
  doc.text('VERIFICAR AUTENTICIDADE:', mX, y + dy);
  dy += 3.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.setTextColor(55, 65, 81);
  doc.text(`Acesse: ${baseUrl}`, mX, y + dy);
  dy += 3.2;

  // Códigos dos assinantes
  const codigosValidos = assinantesArr.filter(a => !a.pendente && a.codigoValidacao);
  if (codigosValidos.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.1);
    doc.setTextColor(37, 99, 235);
    for (const a of codigosValidos) {
      doc.text(`Código (${a.titulo.split('—')[1]?.trim() || a.titulo}): ${a.codigoValidacao}`, mX, y + dy);
      dy += 3.2;
    }
  }

  // QR Code à direita
  if (qrDataUrl) {
    const qrX = W - mX - qrSize;
    const qrY = y + textStartDy - 1;
    try {
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    } catch (_e) {
      // Se falhar, apenas ignora o QR
    }
    dy = Math.max(dy, textStartDy + qrSize + 1);
  }

  return dy;
}

// ---- Função principal ----

export async function gerarBoletimMedicaoPdf(
  dados: any,
  codigoValidacaoRaw?: string,
  urlValidacaoBase?: string,
): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mX = 7;
  let y = 8;

  const competencia = dados.competencia || derivarCompetencia(dados.periodo_inicio);

  // Gerar QR Code se temos código de validação
  let qrDataUrl: string | undefined;
  const validacaoUrl = urlValidacaoBase || dados.url_validacao || '';
  if (validacaoUrl && codigoValidacaoRaw) {
    try {
      const urlCompleta = `${validacaoUrl}/${codigoValidacaoRaw}`;
      qrDataUrl = await QRCode.toDataURL(urlCompleta, { width: 200, margin: 1 });
    } catch (_e) {
      // ignora erro de QR
    }
  }

  // =========================================================
  // CABEÇALHO
  // =========================================================
  const hCab = 20;
  doc.setFillColor(22, 60, 100);
  doc.rect(mX, y, W - 2 * mX, hCab, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('BOLETIM DE MEDIÇÃO', W / 2, y + 6, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text('RELATÓRIO DE ATIVIDADES / MEDIÇÃO DE EXECUÇÃO DE SERVIÇOS PRESTADOS', W / 2, y + 12, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`Nº ${String(dados.numero_medicao).padStart(3, '0')}`, W / 2, y + 18, { align: 'center' });
  y += hCab + 5;

  // =========================================================
  // INFORMAÇÕES DO CONTRATO
  // =========================================================
  const infoX2 = mX + 22;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);

  const linhaInfo = (label: string, valor: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, mX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(valor, infoX2, y);
    y += 5;
  };

  linhaInfo('ÓRGÃO', dados.orgao_nome);
  linhaInfo('CONTRATO', dados.numero_contrato);

  // Objeto pode ser longo — quebrar em até 3 linhas
  doc.setFont('helvetica', 'bold');
  doc.text('OBJETO:', mX, y);
  doc.setFont('helvetica', 'normal');
  const linhasObj = doc.splitTextToSize(dados.objeto_contrato, W - mX - infoX2 - 2);
  doc.text(linhasObj.slice(0, 3), infoX2, y);
  y += Math.min(linhasObj.length, 3) * 4.5 + 1;

  linhaInfo('FORNECEDOR', `${dados.fornecedor_nome}  —  CNPJ: ${fmtCnpj(dados.fornecedor_cnpj)}`);

  // Período + NF na mesma linha
  doc.setFont('helvetica', 'bold');
  doc.text('PERÍODO:', mX, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fmtData(dados.periodo_inicio)} a ${fmtData(dados.periodo_fim)}`, infoX2, y);
  if (dados.nota_fiscal_numero) {
    const nfX = W / 2;
    doc.setFont('helvetica', 'bold');
    doc.text('NF:', nfX, y);
    doc.setFont('helvetica', 'normal');
   // doc.text(`${dados.nota_fiscal_numero}${dados.nota_fiscal_valor ? `  —  ${fmt(dados.nota_fiscal_valor)}` : ''}`, nfX + 8, y);
  }
  y += 5;

  // Valor Bruto (= valor da medição)
  linhaInfo('VALOR BRUTO', fmt(dados.valor_medido));

  // Competência
  if (competencia) {
    doc.setFont('helvetica', 'bold');
    doc.text('COMPETÊNCIA:', mX, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 60, 100);
    doc.text(competencia, infoX2, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  }
  y += 3;

  // =========================================================
  // DISCRIMINAÇÃO DAS DESPESAS
  // =========================================================
  if (dados.discriminacoes && dados.discriminacoes.length > 0) {
    doc.setFillColor(22, 60, 100);
    doc.rect(mX, y, W - 2 * mX, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('DISCRIMINAÇÃO DAS DESPESAS', W / 2, y + 4, { align: 'center' });
    y += 6;
    doc.setTextColor(0, 0, 0);

    const totalDisc = dados.discriminacoes.reduce((s: number, d: any) => s + d.valor, 0);

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Item', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Discriminação', styles: { fontStyle: 'bold' as const } },
        { content: 'Valor R$', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        { content: '%', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]],
      body: [
        ...dados.discriminacoes.map((d: any) => [
          { content: d.numero, styles: { halign: 'center' as const } },
          d.descricao,
          { content: fmt(d.valor), styles: { halign: 'right' as const } },
          { content: `${Number(d.percentual || 0).toFixed(2)}%`, styles: { halign: 'right' as const } },
        ]),
        [
          { content: 'TOTAL', colSpan: 2, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
          { content: fmt(totalDisc), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
          { content: '100,00%', styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, lineWidth: 0.2, lineColor: [200, 200, 200] as [number,number,number] },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 30 }, 3: { cellWidth: 18 } },
      margin: { left: mX, right: mX },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // =========================================================
  // ITENS CONTRATADOS (planilha completa)
  // =========================================================
  if (dados.itens_contratados && dados.itens_contratados.length > 0) {
    doc.setFillColor(22, 60, 100);
    doc.rect(mX, y, W - 2 * mX, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('ITENS CONTRATADOS', W / 2, y + 4, { align: 'center' });
    y += 6;
    doc.setTextColor(0, 0, 0);

    const totalItens = dados.itens_contratados.reduce((s: number, ic: any) => s + ic.valor_total, 0);

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Nº', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Descrição', styles: { fontStyle: 'bold' as const } },
        { content: 'Unidade', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Qtd.', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        { content: 'Vl. Unit. (R$)', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        { content: 'Vl. Total (R$)', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]],
      body: [
        ...dados.itens_contratados.map((ic: any) => [
          { content: ic.numero, styles: { halign: 'center' as const } },
          ic.descricao,
          { content: ic.unidade, styles: { halign: 'center' as const } },
          { content: Number(ic.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 4 }), styles: { halign: 'right' as const } },
          { content: fmt(ic.valor_unitario), styles: { halign: 'right' as const } },
          { content: fmt(ic.valor_total), styles: { halign: 'right' as const } },
        ]),
        [
          { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
          { content: fmt(totalItens), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.1, lineWidth: 0.2, lineColor: [200, 200, 200] as [number,number,number], overflow: 'linebreak' as const },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 86 }, 2: { cellWidth: 21 }, 3: { cellWidth: 18 }, 4: { cellWidth: 30 }, 5: { cellWidth: 31 } },
      margin: { left: mX, right: mX },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // =========================================================
  // EXECUÇÃO FISCAL / FINANCEIRA (item_cronograma)
  // =========================================================
  if (dados.itens && dados.itens.length > 0) {
    doc.setFillColor(22, 60, 100);
    doc.rect(mX, y, W - 2 * mX, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('EXECUÇÃO FISCAL / FINANCEIRA', W / 2, y + 4, { align: 'center' });
    y += 6;
    doc.setTextColor(0, 0, 0);

    const fCor: [number,number,number]    = [0, 70, 140];
    const fCorSub: [number,number,number] = [60, 120, 185];
    const fCor2: [number,number,number]    = [0, 110, 55];
    const fCor2Sub: [number,number,number] = [50, 150, 85];

    const head: any[] = [
      [
        { content: 'ITEM\nNº', rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const, fontStyle: 'bold' as const, fontSize: 6 } },
        { content: 'DESCRIÇÃO', rowSpan: 2, styles: { halign: 'left' as const, valign: 'middle' as const, fontStyle: 'bold' as const, fontSize: 6 } },
        { content: 'EXECUÇÃO FISCAL', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: fCor, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'EXECUÇÃO FINANCEIRA', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: fCor2, textColor: [255, 255, 255] as [number,number,number] } },
      ],
      [
        { content: 'NO PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCorSub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'ATÉ O PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCorSub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'A EXECUTAR', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCorSub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'NO PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCor2Sub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'ATÉ O PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCor2Sub, textColor: [255, 255, 255] as [number,number,number] } },
        { content: 'A EXECUTAR', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 5.5, fillColor: fCor2Sub, textColor: [255, 255, 255] as [number,number,number] } },
      ],
    ];

    const porQuantidade = !!(dados as any).execucao_fiscal_por_quantidade;

    let txtFiscalNoPeriodo: string, txtFiscalAtePeriodo: string, txtFiscalAExecutar: string;
    if (porQuantidade) {
      txtFiscalNoPeriodo = txtFiscalAtePeriodo = txtFiscalAExecutar = '';
    } else {
      const diasPeriodo = Math.max(1, diasEntreDatasComercial(dados.periodo_inicio, dados.periodo_fim, dados.data_vigencia_fim));
      txtFiscalNoPeriodo = fmtTempo(diasPeriodo);
      if (dados.execucao_fiscal) {
        txtFiscalAtePeriodo = fmtTempo(dados.execucao_fiscal.dias_executados);
        txtFiscalAExecutar = fmtTempo(dados.execucao_fiscal.dias_restantes);
      } else if (dados.data_vigencia_inicio && dados.data_vigencia_fim) {
        const diasAte = Math.max(0, diasEntreDatasComercial(dados.data_vigencia_inicio, dados.periodo_fim, dados.data_vigencia_fim));
        txtFiscalAtePeriodo = fmtTempo(diasAte);
        txtFiscalAExecutar = fmtTempo(Math.max(0, 360 - diasAte));
      } else {
        txtFiscalAtePeriodo = txtFiscalAExecutar = '-';
      }
    }

    let totalNoPeriodo = 0, totalAteoPeriodo = 0, totalAExecutar = 0;

    const body: any[][] = dados.itens.map((item: any) => {
      const vlrAcumAnterior = item.valor_acumulado_anterior !== undefined
        ? item.valor_acumulado_anterior
        : item.quantidade_acumulada_aprovada * item.valor_unitario;
      const vlrTotal = item.valor_total_item !== undefined
        ? item.valor_total_item
        : item.quantidade_total_contrato * item.valor_unitario;
      const vlrNoPeriodo = item.valor_no_periodo;
      const vlrAtePeriodo = vlrAcumAnterior + vlrNoPeriodo;
      const vlrAExecutar = Math.max(0, vlrTotal - vlrAtePeriodo);

      totalNoPeriodo += vlrNoPeriodo;
      totalAteoPeriodo += vlrAtePeriodo;
      totalAExecutar += vlrAExecutar;

      const un = item.unidade || 'UNIDADE';
      const fiscalNo = porQuantidade ? fmtQuantidade(item.quantidade_no_periodo, un) : txtFiscalNoPeriodo;
      const fiscalAte = porQuantidade ? fmtQuantidade(item.quantidade_ate_periodo ?? (item.quantidade_acumulada_aprovada + item.quantidade_no_periodo), un) : txtFiscalAtePeriodo;
      const fiscalExec = porQuantidade ? fmtQuantidade(item.quantidade_a_executar ?? Math.max(0, item.quantidade_total_contrato - (item.quantidade_ate_periodo ?? item.quantidade_acumulada_aprovada + item.quantidade_no_periodo)), un) : txtFiscalAExecutar;

      return [
        { content: item.numero, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: item.descricao, styles: { fontSize: 6 } },
        { content: fiscalNo, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: fiscalAte, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: fiscalExec, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: fmt(vlrNoPeriodo), styles: { halign: 'right' as const, fontSize: 6 } },
        { content: fmt(vlrAtePeriodo), styles: { halign: 'right' as const, fontSize: 6 } },
        { content: fmt(vlrAExecutar), styles: { halign: 'right' as const, fontSize: 6 } },
      ];
    });

    const totalNoPeriodoExibicao = dados.valor_medido ?? dados.execucao_financeira_totais?.no_periodo ?? totalNoPeriodo;
    const totalAtePeriodoExibicao = dados.execucao_financeira_totais?.ate_periodo ?? totalAteoPeriodo;
    const totalAExecutarExibicao = dados.execucao_financeira_totais?.a_executar ?? totalAExecutar;

    body.push([
      { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmt(totalNoPeriodoExibicao), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmt(totalAtePeriodoExibicao), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmt(totalAExecutarExibicao), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
    ]);

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 5.8, cellPadding: 1.1, lineWidth: 0.2, lineColor: [190, 190, 190] as [number,number,number], overflow: 'linebreak' as const },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 66 },
        2: { cellWidth: 19 },
        3: { cellWidth: 19 },
        4: { cellWidth: 18 },
        5: { cellWidth: 19 },
        6: { cellWidth: 23 },
        7: { cellWidth: 22 },
      },
      margin: { left: mX, right: mX },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // =========================================================
  // ETAPAS DE OBRA
  // =========================================================
  if (dados.etapas && dados.etapas.length > 0) {
    doc.setFillColor(22, 60, 100);
    doc.rect(mX, y, W - 2 * mX, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('PLANILHA ORÇAMENTÁRIA — ETAPAS', W / 2, y + 4, { align: 'center' });
    y += 6;
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Nº', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Descrição', styles: { fontStyle: 'bold' as const } },
        { content: '% Físico', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: '% Anterior', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: '% Medido', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Vl. Medido', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]],
      body: dados.etapas.map((e: any) => [
        { content: e.numero, styles: { halign: 'center' as const } },
        e.descricao,
        { content: `${e.percentual_fisico.toFixed(1)}%`, styles: { halign: 'center' as const } },
        { content: `${e.percentual_executado_anterior.toFixed(1)}%`, styles: { halign: 'center' as const } },
        { content: `${e.percentual_executado_atual.toFixed(1)}%`, styles: { halign: 'center' as const } },
        { content: fmt(e.valor_medido), styles: { halign: 'right' as const } },
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      margin: { left: mX, right: mX },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // =========================================================
  // RESUMO — VALOR DA MEDIÇÃO
  // =========================================================
  if (y + 14 > H - 24) { doc.addPage(); y = 10; }

  doc.setFillColor(235, 245, 255);
  doc.setDrawColor(22, 60, 100);
  doc.setLineWidth(0.4);
  doc.rect(mX, y, W - 2 * mX, 14, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text('VALOR DA MEDIÇÃO:', mX + 4, y + 5.5);
  doc.setFontSize(13);
  doc.setTextColor(22, 60, 100);
  doc.text(fmt(dados.valor_medido), mX + 4, y + 12);
  y += 16;

  // =========================================================
  // ASSINATURAS (estilo OS/OF — Lei 14.063/2020)
  // =========================================================
  if (y + 52 > H - 8) { doc.addPage(); y = 10; }

  const aForn = dados.assinatura_fornecedor;
  const aFisc = dados.assinatura_fiscal;

  const assinaturasArr = [
    {
      titulo: 'FORNECEDOR',
      cor: [22, 60, 100] as [number, number, number],
      nome: aForn?.nome || '',
      identificacao: aForn ? `CNPJ: ${fmtCnpj(aForn.cnpj)}` : '',
      cargo: aForn?.cargo || '',
      dataHora: aForn?.data_hora || '',
      pendente: !aForn,
      codigoValidacao: aForn?.codigo_validacao,
    },
    {
      titulo: 'FISCAL DE CONTRATO',
      cor: [0, 100, 50] as [number, number, number],
      nome: aFisc?.nome || '',
      identificacao: aFisc?.cpf ? `CPF: ${aFisc.cpf}` : '',
      cargo: aFisc?.cargo || '',
      dataHora: aFisc?.data_hora || '',
      pendente: !aFisc,
      codigoValidacao: aFisc?.codigo_validacao,
    },
  ];

  const altQuadro = desenharQuadroAssinaturas(doc, y, mX, W, assinaturasArr, dados.url_validacao, qrDataUrl);
  y += altQuadro + 4;

  // =========================================================
  // PÁGINA EXCLUSIVA DE ASSINATURAS
  // =========================================================
  doc.addPage('a4', 'portrait');
  let yPA = 20;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 60, 100);
  doc.text(
    `BOLETIM DE MEDIÇÃO Nº ${String(dados.numero_medicao).padStart(3, '0')}`,
    W / 2, yPA, { align: 'center' },
  );
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  if (dados.orgao_nome) doc.text(dados.orgao_nome, W / 2, yPA + 6, { align: 'center' });
  doc.text(`Contrato: ${dados.numero_contrato}`, W / 2, yPA + 11, { align: 'center' });
  yPA += 20;
  desenharQuadroAssinaturas(doc, yPA, mX, W, assinaturasArr, dados.url_validacao, qrDataUrl);

  // =========================================================
  // RODAPÉ em todas as páginas
  // =========================================================
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(5.5);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Portal DCP  |  Boletim de Medição Nº ${dados.numero_medicao}  |  Contrato: ${dados.numero_contrato}  |  Competência: ${competencia}  |  Página ${i}/${pages}`,
      W / 2, H - 5, { align: 'center' },
    );
  }

  // Retornar como Buffer
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}
