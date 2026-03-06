/**
 * ============================================================================
 * GERAÇÃO DE PDF — BOLETIM DE MEDIÇÃO
 * ============================================================================
 *
 * Gera o Boletim de Medição em PDF seguindo o modelo do órgão.
 * Inclui blocos de assinatura eletrônica do fornecedor e do fiscal.
 *
 * ============================================================================
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface DadosMedicaoPdf {
  // Contrato
  numero_contrato: string
  objeto_contrato: string
  orgao_nome: string
  fornecedor_nome: string
  fornecedor_cnpj: string
  // Medição
  numero_medicao: number
  periodo_inicio: string
  periodo_fim: string
  valor_medido: number
  valor_acumulado?: number
  percentual_fisico?: number
  nota_fiscal_numero?: string
  nota_fiscal_valor?: number
  // Itens (item_cronograma)
  itens?: Array<{
    numero: number
    descricao: string
    unidade: string
    quantidade_total: number
    quantidade_acumulada: number
    quantidade_medida: number
    valor_unitario: number
    valor_medido: number
    // Execução fiscal (dias)
    dias_periodo?: string
    dias_acumulado?: string
    dias_executar?: string
  }>
  // Etapas (obras)
  etapas?: Array<{
    numero: number
    descricao: string
    percentual_fisico: number
    percentual_executado_anterior: number
    percentual_executado_atual: number
    valor_previsto: number
    valor_medido: number
  }>
  // Assinatura fornecedor
  assinatura_fornecedor?: {
    nome: string
    cnpj: string
    cargo?: string
    data_hora: string
    hash?: string
  }
  // Assinatura fiscal
  assinatura_fiscal?: {
    nome: string
    cpf?: string
    cargo?: string
    data_hora: string
    hash?: string
  }
}

function formatarMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: string): string {
  if (!d) return '-'
  const parts = d.split('T')[0].split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

function formatarCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

export function gerarPdfMedicao(dados: DadosMedicaoPdf): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W = doc.internal.pageSize.getWidth()
  const marginX = 14
  let y = 14

  // ============ CABEÇALHO ============
  doc.setFillColor(31, 78, 121)
  doc.rect(marginX, y, W - 2 * marginX, 14, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('BOLETIM DE MEDIÇÃO', W / 2, y + 5.5, { align: 'center' })
  doc.setFontSize(8)
  doc.text(`Nº ${String(dados.numero_medicao).padStart(3, '0')}`, W / 2, y + 10.5, { align: 'center' })
  y += 18

  // ============ INFORMAÇÕES DO CONTRATO ============
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('ÓRGÃO:', marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(dados.orgao_nome, marginX + 14, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.text('CONTRATO:', marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(dados.numero_contrato, marginX + 20, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.text('OBJETO:', marginX, y)
  doc.setFont('helvetica', 'normal')
  const linhasObjeto = doc.splitTextToSize(dados.objeto_contrato, W - 2 * marginX - 16)
  doc.text(linhasObjeto.slice(0, 2), marginX + 16, y)
  y += linhasObjeto.slice(0, 2).length * 4 + 1

  doc.setFont('helvetica', 'bold')
  doc.text('FORNECEDOR:', marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${dados.fornecedor_nome} — CNPJ: ${formatarCnpj(dados.fornecedor_cnpj)}`, marginX + 26, y)
  y += 5

  // Período
  const colMeio = W / 2
  doc.setFont('helvetica', 'bold')
  doc.text('PERÍODO:', marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${formatarData(dados.periodo_inicio)} a ${formatarData(dados.periodo_fim)}`, marginX + 18, y)

  if (dados.nota_fiscal_numero) {
    doc.setFont('helvetica', 'bold')
    doc.text('NF:', colMeio, y)
    doc.setFont('helvetica', 'normal')
    doc.text(`${dados.nota_fiscal_numero}${dados.nota_fiscal_valor ? ` — ${formatarMoeda(dados.nota_fiscal_valor)}` : ''}`, colMeio + 8, y)
  }
  y += 8

  // ============ TABELA DE ITENS (item_cronograma) ============
  if (dados.itens && dados.itens.length > 0) {
    // Título da tabela
    doc.setFillColor(31, 78, 121)
    doc.rect(marginX, y, W - 2 * marginX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text('EXECUÇÃO FISCAL / FINANCEIRA', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    const head: import('jspdf-autotable').RowInput[] = [
      [
        { content: 'ITEM Nº', rowSpan: 2, styles: { halign: 'center' as const, valign: 'middle' as const, fontStyle: 'bold' as const, fontSize: 7 } },
        { content: 'DESCRIÇÃO', rowSpan: 2, styles: { halign: 'left' as const, valign: 'middle' as const, fontStyle: 'bold' as const, fontSize: 7 } },
        { content: 'EXECUÇÃO FISCAL', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 7, fillColor: [220, 235, 250] as [number, number, number] } },
        { content: 'EXECUÇÃO FINANCEIRA', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 7, fillColor: [220, 250, 220] as [number, number, number] } },
      ],
      [
        { content: 'NO PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: [220, 235, 250] as [number, number, number] } },
        { content: 'ATÉ O PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: [220, 235, 250] as [number, number, number] } },
        { content: 'A EXECUTAR', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: [220, 235, 250] as [number, number, number] } },
        { content: 'NO PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: [220, 250, 220] as [number, number, number] } },
        { content: 'ATÉ O PERÍODO', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: [220, 250, 220] as [number, number, number] } },
        { content: 'A EXECUTAR', styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 6, fillColor: [220, 250, 220] as [number, number, number] } },
      ],
    ]

    const totalMedido = dados.itens.reduce((s, i) => s + i.valor_medido, 0)
    const totalAcumulado = dados.itens.reduce((s, i) => s + i.quantidade_acumulada * i.valor_unitario, 0)
    const totalExecutar = dados.itens.reduce((s, i) => s + (i.quantidade_total - i.quantidade_acumulada) * i.valor_unitario - i.valor_medido, 0)

    const body: any[][] = dados.itens.map((item) => {
      const qtdAcumComAtual = item.quantidade_acumulada + item.quantidade_medida
      const qtdExecutar = item.quantidade_total - qtdAcumComAtual
      const vlrAcumComAtual = qtdAcumComAtual * item.valor_unitario
      const vlrExecutar = qtdExecutar * item.valor_unitario
      return [
        { content: item.numero, styles: { halign: 'center' } },
        item.descricao,
        { content: item.dias_periodo || `${item.quantidade_medida} ${item.unidade}`, styles: { halign: 'center' } },
        { content: item.dias_acumulado || `${qtdAcumComAtual.toLocaleString('pt-BR')} ${item.unidade}`, styles: { halign: 'center' } },
        { content: item.dias_executar || `${qtdExecutar.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${item.unidade}`, styles: { halign: 'center' } },
        { content: formatarMoeda(item.valor_medido), styles: { halign: 'right' } },
        { content: formatarMoeda(vlrAcumComAtual), styles: { halign: 'right' } },
        { content: formatarMoeda(Math.max(vlrExecutar, 0)), styles: { halign: 'right' } },
      ]
    })

    // Linha de total
    body.push([
      { content: 'TOTAL', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
      { content: formatarMoeda(totalMedido), styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
      { content: formatarMoeda(totalAcumulado + totalMedido), styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
      { content: formatarMoeda(Math.max(totalExecutar, 0)), styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
    ])

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2, lineWidth: 0.2, lineColor: [180, 180, 180] },
      headStyles: { fillColor: [31, 78, 121], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 60 },
        2: { cellWidth: 20 },
        3: { cellWidth: 22 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 22 },
        7: { cellWidth: 22 },
      },
      margin: { left: marginX, right: marginX },
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ============ TABELA DE ETAPAS (obras) ============
  if (dados.etapas && dados.etapas.length > 0) {
    doc.setFillColor(31, 78, 121)
    doc.rect(marginX, y, W - 2 * marginX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text('PLANILHA ORÇAMENTÁRIA — ETAPAS', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Nº', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Descrição da Etapa', styles: { fontStyle: 'bold' } },
        { content: '% Físico', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: '% Anterior', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: '% Medido', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: 'Valor Medido', styles: { halign: 'right', fontStyle: 'bold' } },
      ]],
      body: dados.etapas.map(e => [
        { content: e.numero, styles: { halign: 'center' } },
        e.descricao,
        { content: `${e.percentual_fisico.toFixed(1)}%`, styles: { halign: 'center' } },
        { content: `${e.percentual_executado_anterior.toFixed(1)}%`, styles: { halign: 'center' } },
        { content: `${e.percentual_executado_atual.toFixed(1)}%`, styles: { halign: 'center' } },
        { content: formatarMoeda(e.valor_medido), styles: { halign: 'right' } },
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [31, 78, 121], textColor: 255 },
      margin: { left: marginX, right: marginX },
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ============ RESUMO FINANCEIRO ============
  doc.setFillColor(240, 248, 255)
  doc.setDrawColor(31, 78, 121)
  doc.setLineWidth(0.3)
  doc.rect(marginX, y, W - 2 * marginX, 12, 'FD')
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('VALOR DA MEDIÇÃO:', marginX + 4, y + 5)
  doc.setFontSize(11)
  doc.setTextColor(31, 78, 121)
  doc.text(formatarMoeda(dados.valor_medido), marginX + 4, y + 11)

  if (dados.valor_acumulado) {
    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)
    doc.text('ACUMULADO:', W / 2, y + 5)
    doc.setFontSize(9)
    doc.text(formatarMoeda(dados.valor_acumulado), W / 2, y + 11)
  }
  if (dados.percentual_fisico != null) {
    doc.setFontSize(8)
    doc.setTextColor(0, 0, 0)
    doc.text('% FÍSICO:', W - marginX - 30, y + 5)
    doc.setFontSize(9)
    doc.text(`${dados.percentual_fisico.toFixed(2)}%`, W - marginX - 30, y + 11)
  }
  y += 18

  // ============ BLOCOS DE ASSINATURA ============
  const larguraBloco = (W - 2 * marginX - 8) / 2
  const alturaBloco = 28

  // Garante espaço na página
  if (y + alturaBloco > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage()
    y = 20
  }

  // --- Assinatura Fornecedor ---
  const xFornec = marginX
  doc.setDrawColor(31, 78, 121)
  doc.setLineWidth(0.3)
  doc.setFillColor(248, 252, 255)
  doc.rect(xFornec, y, larguraBloco, alturaBloco, 'FD')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(31, 78, 121)
  doc.text('ASSINATURA ELETRÔNICA — FORNECEDOR', xFornec + larguraBloco / 2, y + 5, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  if (dados.assinatura_fornecedor) {
    const aF = dados.assinatura_fornecedor
    doc.setFont('helvetica', 'bold')
    doc.text(aF.nome, xFornec + 3, y + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(`CNPJ: ${formatarCnpj(aF.cnpj)}`, xFornec + 3, y + 16)
    if (aF.cargo) doc.text(`Cargo: ${aF.cargo}`, xFornec + 3, y + 20)
    doc.text(`Assinado em: ${aF.data_hora}`, xFornec + 3, y + 24)
    if (aF.hash) {
      doc.setFontSize(5.5)
      doc.setTextColor(100, 100, 100)
      doc.text(`Hash: ${aF.hash}`, xFornec + 3, y + 27)
    }
  } else {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(7)
    doc.text('Pendente de assinatura', xFornec + larguraBloco / 2, y + 17, { align: 'center' })
  }

  // --- Assinatura Fiscal ---
  const xFiscal = xFornec + larguraBloco + 8
  doc.setFillColor(248, 255, 248)
  doc.rect(xFiscal, y, larguraBloco, alturaBloco, 'FD')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 100, 0)
  doc.text('ASSINATURA ELETRÔNICA — FISCAL', xFiscal + larguraBloco / 2, y + 5, { align: 'center' })

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  if (dados.assinatura_fiscal) {
    const aFisc = dados.assinatura_fiscal
    doc.setFont('helvetica', 'bold')
    doc.text(aFisc.nome, xFiscal + 3, y + 11)
    doc.setFont('helvetica', 'normal')
    if (aFisc.cpf) doc.text(`CPF: ${aFisc.cpf}`, xFiscal + 3, y + 16)
    if (aFisc.cargo) doc.text(`Cargo: ${aFisc.cargo}`, xFiscal + 3, y + 20)
    doc.text(`Atestado em: ${aFisc.data_hora}`, xFiscal + 3, y + 24)
    if (aFisc.hash) {
      doc.setFontSize(5.5)
      doc.setTextColor(100, 100, 100)
      doc.text(`Hash: ${aFisc.hash}`, xFiscal + 3, y + 27)
    }
  } else {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(7)
    doc.text('Pendente de assinatura', xFiscal + larguraBloco / 2, y + 17, { align: 'center' })
  }

  y += alturaBloco + 6

  // ============ RODAPÉ ============
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(6)
    doc.setTextColor(150, 150, 150)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Portal DCP — Boletim de Medição Nº ${dados.numero_medicao} — ${dados.numero_contrato} — Página ${i}/${pages}`,
      W / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'center' },
    )
  }

  // Download
  const nomeArquivo = `BM_${dados.numero_contrato.replace(/\//g, '-')}_${String(dados.numero_medicao).padStart(3, '0')}.pdf`
  doc.save(nomeArquivo)
}
