/**
 * ============================================================================
 * GERAÇÃO DE PDF — BOLETIM DE MEDIÇÃO
 * ============================================================================
 *
 * Gera o Boletim de Medição em PDF seguindo o modelo do órgão.
 * Inclui blocos de assinatura eletrônica no estilo gov.br.
 *
 * ============================================================================
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ---- Interfaces ----

export interface ItemMedicaoPdf {
  numero: number
  descricao: string
  unidade: string
  quantidade_no_periodo: number
  /** Quantidade acumulada em medições ANTERIORES aprovadas (ItemCronograma.quantidade_medida) */
  quantidade_acumulada_aprovada: number
  quantidade_total_contrato: number
  valor_no_periodo: number
  valor_unitario: number
  /** Valor financeiro acumulado ANTES desta medição. Se definido, substitui quantidade_acumulada_aprovada × valor_unitario. */
  valor_acumulado_anterior?: number
  /** Valor total ORIGINAL do item no contrato. Se definido, substitui quantidade_total_contrato × valor_unitario. */
  valor_total_item?: number
}

export interface ItemContratadoPdf {
  numero: number
  descricao: string
  unidade: string
  quantidade: number
  valor_unitario: number
  valor_total: number
}

export interface EtapaMedicaoPdf {
  numero: number
  descricao: string
  percentual_fisico: number
  percentual_executado_anterior: number
  percentual_executado_atual: number
  valor_previsto: number
  valor_medido: number
}

export interface DiscriminacaoPdf {
  numero: number
  descricao: string
  valor: number
  percentual: number
}

export interface DadosMedicaoPdf {
  // Contrato
  numero_contrato: string
  objeto_contrato: string
  orgao_nome: string
  fornecedor_nome: string
  fornecedor_cnpj: string
  valor_total_contrato?: number
  data_vigencia_inicio?: string   // data início vigência do contrato (para cálculo fiscal)
  data_vigencia_fim?: string      // data fim vigência do contrato (para cálculo fiscal)
  // Medição
  numero_medicao: number
  periodo_inicio: string
  periodo_fim: string
  competencia?: string          // ex: FEVEREIRO/2026 (gerado automaticamente se omitido)
  valor_medido: number
  nota_fiscal_numero?: string
  nota_fiscal_valor?: number
  // Itens de medição (item_cronograma)
  itens?: ItemMedicaoPdf[]
  // Itens contratados (planilha completa)
  itens_contratados?: ItemContratadoPdf[]
  // Etapas de obra
  etapas?: EtapaMedicaoPdf[]
  // Discriminação das despesas
  discriminacoes?: DiscriminacaoPdf[]
  // Assinaturas
  assinatura_fornecedor?: {
    nome: string
    cnpj: string
    cargo?: string
    data_hora: string
    codigo_validacao?: string      // código formatado XXXX-XXXX-XXXX-XXXX
  }
  assinatura_fiscal?: {
    nome: string
    cpf?: string
    cargo?: string
    data_hora: string
    codigo_validacao?: string      // código formatado XXXX-XXXX-XXXX-XXXX
  }
  url_validacao?: string           // ex: portaldcp.com.br/validar-documento
}

// ---- Helpers ----

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string): string {
  if (!d) return '-'
  const p = d.split('T')[0].split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d
}

function fmtCnpj(cnpj: string): string {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14) return cnpj
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

/** Diferença em dias usando ANO COMERCIAL (360 dias = 12 meses x 30 dias) */
function diasEntreDatasComercial(data1: string, data2: string): number {
  const d1 = new Date(data1)
  const d2 = new Date(data2)
  
  // Usar UTC para evitar problemas de timezone
  const ano1 = d1.getUTCFullYear()
  const mes1 = d1.getUTCMonth()
  const dia1 = d1.getUTCDate()
  
  const ano2 = d2.getUTCFullYear()
  const mes2 = d2.getUTCMonth()
  const dia2 = d2.getUTCDate()
  
  let dias = 0
  
  // Se mesmo mês
  if (ano1 === ano2 && mes1 === mes2) {
    dias = Math.min(dia2 - dia1 + 1, 30)
  } else {
    // Dias no primeiro mês (ano comercial)
    const diasPrimeiroMes = Math.min(30 - dia1 + 1, 30)
    
    // Meses completos no meio
    let mesesCompletos = 0
    if (ano2 > ano1 || mes2 > mes1 + 1) {
      mesesCompletos = (ano2 - ano1) * 12 + (mes2 - mes1 - 1)
    }
    
    // Dias no último mês (ano comercial)
    const diasUltimoMes = Math.min(dia2, 30)
    
    dias = diasPrimeiroMes + (mesesCompletos * 30) + diasUltimoMes
  }
  
  return Math.min(dias, 360)
}

function diasEntreDatas(data1: string, data2: string): number {
  const d1 = new Date(data1)
  const d2 = new Date(data2)
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

/** Formata dias como "X mês/meses [e Y dia/dias]" */
function fmtTempo(dias: number): string {
  if (dias <= 0) return '0 dias'
  const m = Math.floor(dias / 30)
  const d = dias % 30
  const pM = m === 1 ? '1 mês' : m > 1 ? `${m} meses` : ''
  const pD = d === 1 ? '1 dia' : d > 1 ? `${d} dias` : ''
  if (pM && pD) return `${pM} e ${pD}`
  return pM || pD || '0 dias'
}

/** Deriva "FEVEREIRO/2026" a partir de uma data ISO */
export function derivarCompetencia(periodoInicio: string): string {
  if (!periodoInicio) return ''
  const d = new Date(periodoInicio + 'T00:00:00')
  const meses = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
                 'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']
  return `${meses[d.getMonth()]}/${d.getFullYear()}`
}

/**
 * Desenha o quadro de assinaturas eletrônicas no estilo OS/OF (Lei 14.063/2020).
 * Retorna a altura total desenhada.
 */
function desenharQuadroAssinaturas(
  doc: jsPDF,
  y: number,
  mX: number,
  W: number,
  assinaturas: Array<{
    titulo: string
    cor: [number, number, number]
    nome: string
    identificacao: string
    cargo: string
    dataHora: string
    pendente: boolean
    codigoValidacao?: string
  }>,
  urlValidacao?: string,
): number {
  const contentW = W - 2 * mX
  let dy = 0

  // ── Linha separadora ────────────────────────────────────────────────────────
  doc.setDrawColor(107, 114, 128)
  doc.setLineWidth(0.8)
  doc.line(mX, y + dy, W - mX, y + dy)
  dy += 5

  // ── Título do quadro ──────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(30, 64, 175)
  doc.text('QUADRO DE ASSINATURAS ELETRÔNICAS', W / 2, y + dy, { align: 'center' })
  dy += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(55, 65, 81)
  doc.text(
    'Este documento foi assinado eletronicamente em conformidade com a Lei nº 14.063/2020.',
    W / 2, y + dy, { align: 'center' },
  )
  dy += 6

  // ── Caixas por assinante ────────────────────────────────────────────────
  const boxW = (contentW - 6) / 2
  const assinantesArr = assinaturas.slice(0, 2)

  let maxBoxH = 0
  const boxesInfo: { x: number; boxH: number }[] = []

  for (let i = 0; i < assinantesArr.length; i++) {
    const a = assinantesArr[i]
    const bx = mX + i * (boxW + 6)
    const pendente = a.pendente
    const boxH = pendente ? 22 : 38
    maxBoxH = Math.max(maxBoxH, boxH)
    boxesInfo.push({ x: bx, boxH })

    // Fundo + borda
    doc.setFillColor(249, 250, 251)
    doc.setDrawColor(a.cor[0], a.cor[1], a.cor[2])
    doc.setLineWidth(0.4)
    doc.rect(bx, y + dy, boxW, boxH, 'FD')

    // Header colorido
    doc.setFillColor(a.cor[0], a.cor[1], a.cor[2])
    doc.rect(bx, y + dy, boxW, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(255, 255, 255)
    doc.text(a.titulo, bx + boxW / 2, y + dy + 4, { align: 'center' })

    if (pendente) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(6.5)
      doc.setTextColor(156, 163, 175)
      doc.text('Pendente de assinatura', bx + boxW / 2, y + dy + 6 + 8, { align: 'center' })
    } else {
      let ly = y + dy + 6 + 5
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(17, 24, 39)
      const linhasNome = doc.splitTextToSize(a.nome, boxW - 6)
      doc.text(linhasNome.slice(0, 2), bx + 3, ly)
      ly += linhasNome.slice(0, 2).length * 4

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(55, 65, 81)
      if (a.cargo) { doc.text(a.cargo, bx + 3, ly); ly += 3.5 }
      if (a.identificacao) { doc.text(a.identificacao, bx + 3, ly); ly += 3.5 }
      doc.text(`Data/Hora: ${a.dataHora}`, bx + 3, ly); ly += 3.5

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      doc.setTextColor(22, 163, 74)
      doc.text('✓  Assinatura eletrônica válida', bx + 3, ly)
    }
  }
  dy += maxBoxH + 5

  // ── Rodapé: URL de verificação + código ─────────────────────────────────
  doc.setDrawColor(156, 163, 175)
  doc.setLineWidth(0.4)
  doc.line(mX, y + dy, W - mX, y + dy)
  dy += 4

  const baseUrl = urlValidacao || 'portaldcp.com.br/validar-documento'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(17, 24, 39)
  doc.text('VERIFICAR AUTENTICIDADE:', mX, y + dy)
  dy += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(55, 65, 81)
  doc.text(`Acesse: ${baseUrl}`, mX, y + dy)
  dy += 4

  // Códigos dos assinantes
  const codigosValidos = assinantesArr.filter(a => !a.pendente && a.codigoValidacao)
  if (codigosValidos.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(37, 99, 235)
    for (const a of codigosValidos) {
      doc.text(`Código (${a.titulo.split('—')[1]?.trim() || a.titulo}): ${a.codigoValidacao}`, mX, y + dy)
      dy += 4
    }
  }

  return dy
}

// ---- Função principal ----

export function gerarPdfMedicao(dados: DadosMedicaoPdf): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const mX = 10   // margem lateral reduzida para caber a tabela
  let y = 10

  const competencia = dados.competencia || derivarCompetencia(dados.periodo_inicio)

  // =========================================================
  // CABEÇALHO
  // =========================================================
  const hCab = 20
  doc.setFillColor(22, 60, 100)
  doc.rect(mX, y, W - 2 * mX, hCab, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('BOLETIM DE MEDIÇÃO', W / 2, y + 6, { align: 'center' })
  doc.setFontSize(7.5)
  doc.text('RELATÓRIO DE ATIVIDADES / MEDIÇÃO DE EXECUÇÃO DE SERVIÇOS PRESTADOS', W / 2, y + 12, { align: 'center' })
  doc.setFontSize(8)
  doc.text(`Nº ${String(dados.numero_medicao).padStart(3, '0')}`, W / 2, y + 18, { align: 'center' })
  y += hCab + 5

  // =========================================================
  // INFORMAÇÕES DO CONTRATO
  // =========================================================
  const infoX2 = mX + 22
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(8)

  const linhaInfo = (label: string, valor: string, negrito = true) => {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, mX, y)
    doc.setFont('helvetica', negrito ? 'normal' : 'bold')
    doc.text(valor, infoX2, y)
    y += 5
  }

  linhaInfo('ÓRGÃO', dados.orgao_nome)
  linhaInfo('CONTRATO', dados.numero_contrato)

  // Objeto pode ser longo — quebrar em até 3 linhas
  doc.setFont('helvetica', 'bold')
  doc.text('OBJETO:', mX, y)
  doc.setFont('helvetica', 'normal')
  const linhasObj = doc.splitTextToSize(dados.objeto_contrato, W - mX - infoX2 - 2)
  doc.text(linhasObj.slice(0, 3), infoX2, y)
  y += Math.min(linhasObj.length, 3) * 4.5 + 1

  linhaInfo('FORNECEDOR', `${dados.fornecedor_nome}  —  CNPJ: ${fmtCnpj(dados.fornecedor_cnpj)}`)

  // Período + NF na mesma linha
  doc.setFont('helvetica', 'bold')
  doc.text('PERÍODO:', mX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${fmtData(dados.periodo_inicio)} a ${fmtData(dados.periodo_fim)}`, infoX2, y)
  if (dados.nota_fiscal_numero) {
    const nfX = W / 2
    doc.setFont('helvetica', 'bold')
    doc.text('NF:', nfX, y)
    doc.setFont('helvetica', 'normal')
    doc.text(`${dados.nota_fiscal_numero}${dados.nota_fiscal_valor ? `  —  ${fmt(dados.nota_fiscal_valor)}` : ''}`, nfX + 8, y)
  }
  y += 5

  // Competência
  if (competencia) {
    doc.setFont('helvetica', 'bold')
    doc.text('COMPETÊNCIA:', mX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(22, 60, 100)
    doc.text(competencia, infoX2, y)
    doc.setTextColor(0, 0, 0)
    y += 5
  }
  y += 3

  // =========================================================
  // DISCRIMINAÇÃO DAS DESPESAS
  // =========================================================
  if (dados.discriminacoes && dados.discriminacoes.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('DISCRIMINAÇÃO DAS DESPESAS', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    const totalDisc = dados.discriminacoes.reduce((s, d) => s + d.valor, 0)

    autoTable(doc, {
      startY: y,
      head: [[
        { content: 'Item', styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
        { content: 'Discriminação', styles: { fontStyle: 'bold' as const } },
        { content: 'Valor R$', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
        { content: '%', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      ]],
      body: [
        ...dados.discriminacoes.map(d => [
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
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // =========================================================
  // ITENS CONTRATADOS (planilha completa)
  // =========================================================
  if (dados.itens_contratados && dados.itens_contratados.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('ITENS CONTRATADOS', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    const totalItens = dados.itens_contratados.reduce((s, ic) => s + ic.valor_total, 0)

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
        ...dados.itens_contratados.map(ic => [
          { content: ic.numero, styles: { halign: 'center' as const } },
          ic.descricao,
          { content: ic.unidade, styles: { halign: 'center' as const } },
          { content: ic.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 }), styles: { halign: 'right' as const } },
          { content: fmt(ic.valor_unitario), styles: { halign: 'right' as const } },
          { content: fmt(ic.valor_total), styles: { halign: 'right' as const } },
        ]),
        [
          { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
          { content: fmt(totalItens), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: [230, 230, 230] as [number,number,number] } },
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, lineWidth: 0.2, lineColor: [200, 200, 200] as [number,number,number] },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 74 }, 2: { cellWidth: 18 }, 3: { cellWidth: 22 }, 4: { cellWidth: 30 }, 5: { cellWidth: 32 } },
      margin: { left: mX, right: mX },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // =========================================================
  // EXECUÇÃO FISCAL / FINANCEIRA (item_cronograma)
  // =========================================================
  if (dados.itens && dados.itens.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('EXECUÇÃO FISCAL / FINANCEIRA', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

    const fCor: [number,number,number]    = [0, 70, 140]     // azul fiscal
    const fCorSub: [number,number,number] = [60, 120, 185]   // azul fiscal (subheader)
    const fCor2: [number,number,number]    = [0, 110, 55]    // verde financeiro
    const fCor2Sub: [number,number,number] = [50, 150, 85]   // verde financeiro (subheader)

    const head: import('jspdf-autotable').RowInput[] = [
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
    ]

    // --- Execução Fiscal (tempo) — igual para todos os itens ---
    // USAR ANO COMERCIAL DE 360 DIAS (12 meses x 30 dias)
    const diasPeriodo = Math.max(1, diasEntreDatasComercial(dados.periodo_inicio, dados.periodo_fim))
    const diasAte = dados.data_vigencia_inicio
      ? Math.max(0, diasEntreDatasComercial(dados.data_vigencia_inicio, dados.periodo_fim))
      : 0
    const diasRestante = dados.data_vigencia_fim
      ? Math.max(0, diasEntreDatasComercial(dados.periodo_fim, dados.data_vigencia_fim))
      : 0
    const txtFiscalNoPeriodo   = fmtTempo(diasPeriodo)
    const txtFiscalAtePeriodo  = diasAte > 0 ? fmtTempo(diasAte) : '-'
    const txtFiscalAExecutar   = fmtTempo(diasRestante)

    let totalNoPeriodo = 0, totalAteoPeriodo = 0, totalAExecutar = 0

    const body: any[][] = dados.itens.map(item => {
      // Usar valor_acumulado_anterior se disponível (contratos migrados)
      const vlrAcumAnterior = item.valor_acumulado_anterior !== undefined
        ? item.valor_acumulado_anterior
        : item.quantidade_acumulada_aprovada * item.valor_unitario
      const vlrTotal = item.valor_total_item !== undefined
        ? item.valor_total_item
        : item.quantidade_total_contrato * item.valor_unitario
      const vlrNoPeriodo = item.valor_no_periodo
      const vlrAtePeriodo = vlrAcumAnterior + vlrNoPeriodo
      const vlrAExecutar = Math.max(0, vlrTotal - vlrAtePeriodo)

      totalNoPeriodo += vlrNoPeriodo
      totalAteoPeriodo += vlrAtePeriodo
      totalAExecutar += vlrAExecutar

      return [
        { content: item.numero, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: item.descricao, styles: { fontSize: 6 } },
        { content: txtFiscalNoPeriodo, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: txtFiscalAtePeriodo, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: txtFiscalAExecutar, styles: { halign: 'center' as const, fontSize: 6 } },
        { content: fmt(vlrNoPeriodo), styles: { halign: 'right' as const, fontSize: 6 } },
        { content: fmt(vlrAtePeriodo), styles: { halign: 'right' as const, fontSize: 6 } },
        { content: fmt(vlrAExecutar), styles: { halign: 'right' as const, fontSize: 6 } },
      ]
    })

    body.push([
      { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmt(totalNoPeriodo), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmt(totalAteoPeriodo), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
      { content: fmt(totalAExecutar), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 6.5, fillColor: [230, 230, 230] as [number,number,number] } },
    ])

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: 1.5, lineWidth: 0.2, lineColor: [190, 190, 190] as [number,number,number], overflow: 'linebreak' },
      headStyles: { fillColor: [22, 60, 100] as [number,number,number], textColor: [255, 255, 255] as [number,number,number] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 50 },
        2: { cellWidth: 20 },
        3: { cellWidth: 21 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 24 },
        7: { cellWidth: 25 },
      },
      margin: { left: mX, right: mX },
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // =========================================================
  // ETAPAS DE OBRA
  // =========================================================
  if (dados.etapas && dados.etapas.length > 0) {
    doc.setFillColor(22, 60, 100)
    doc.rect(mX, y, W - 2 * mX, 6, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('PLANILHA ORÇAMENTÁRIA — ETAPAS', W / 2, y + 4, { align: 'center' })
    y += 6
    doc.setTextColor(0, 0, 0)

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
      body: dados.etapas.map(e => [
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
    })
    y = (doc as any).lastAutoTable.finalY + 5
  }

  // =========================================================
  // RESUMO — apenas VALOR DA MEDIÇÃO (sem acumulado/% físico)
  // =========================================================
  if (y + 14 > H - 30) { doc.addPage(); y = 15 }

  doc.setFillColor(235, 245, 255)
  doc.setDrawColor(22, 60, 100)
  doc.setLineWidth(0.4)
  doc.rect(mX, y, W - 2 * mX, 14, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  doc.text('VALOR DA MEDIÇÃO:', mX + 4, y + 5.5)
  doc.setFontSize(13)
  doc.setTextColor(22, 60, 100)
  doc.text(fmt(dados.valor_medido), mX + 4, y + 12)
  y += 18

  // =========================================================
  // ASSINATURAS (estilo OS/OF — Lei 14.063/2020)
  // =========================================================
  if (y + 70 > H - 10) { doc.addPage(); y = 15 }

  const aForn = dados.assinatura_fornecedor
  const aFisc = dados.assinatura_fiscal

  const altQuadro = desenharQuadroAssinaturas(
    doc, y, mX, W,
    [
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
    ],
    dados.url_validacao,
  )

  y += altQuadro + 6

  // =========================================================
  // RODAPÉ em todas as páginas
  // =========================================================
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(5.5)
    doc.setTextColor(160, 160, 160)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Portal DCP  |  Boletim de Medição Nº ${dados.numero_medicao}  |  Contrato: ${dados.numero_contrato}  |  Competência: ${competencia}  |  Página ${i}/${pages}`,
      W / 2, H - 5, { align: 'center' },
    )
  }

  const nomeArq = `BM_${dados.numero_contrato.replace(/[/\\]/g, '-')}_${String(dados.numero_medicao).padStart(3, '0')}_${competencia.replace('/', '-')}.pdf`
  doc.save(nomeArq)
}
