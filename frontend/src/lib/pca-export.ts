import * as XLSX from 'xlsx'

export interface PcaExportItem {
  categoria?: string
  catalogo_utilizado?: string
  classificacao_catalogo?: string
  codigo_classe?: string
  nome_classe?: string
  codigo_pdm?: string
  nome_pdm?: string
  codigo_item_catalogo?: string
  descricao_objeto?: string
  unidade_medida?: string
  quantidade_estimada?: number | string | null
  valor_unitario_estimado?: number | string | null
  valor_estimado?: number | string | null
  valor_orcamentario_exercicio?: number | string | null
  renovacao_contrato?: string
  trimestre_previsto?: number | string | null
  unidade_requisitante?: string
  codigo_grupo?: string
  nome_grupo?: string
  identificador_contratacao?: string
  nome_contratacao?: string
}

export interface PcaExportData {
  ano_exercicio: number
  numero_pca?: string
  codigo_unidade?: string
  nome_unidade?: string
  orgao?: {
    nome?: string
    cnpj?: string
    cidade?: string
    uf?: string
  }
  valor_total_estimado?: number | string | null
  quantidade_itens?: number | string | null
  itens: PcaExportItem[]
}

const categoriaMap: Record<string, string> = {
  MATERIAL: '1-Material',
  SERVICO: '2-Serviço',
  OBRA: '3-Obras',
  SERVICO_ENGENHARIA: '4-Serviços de Engenharia',
  SOLUCAO_TIC: '5-Soluções de TIC',
  TIC: '5-Soluções de TIC',
  LOCACAO_IMOVEL: '6-Locação de Imóveis',
  ALIENACAO: '7-Alienação/Concessão/Permissão',
  OBRA_ENGENHARIA: '8-Obras e Serviços de Engenharia',
}

const catalogoMap: Record<string, string> = {
  COMPRASGOV: '1-CNBS(Catálogo Nacional de Bens e Serviços)',
  OUTROS: '2-Outros',
}

const classificacaoMap: Record<string, string> = {
  MATERIAL: '1-Material',
  SERVICO: '2-Serviço',
}

function numero(valor: number | string | null | undefined): number {
  if (typeof valor === 'string') return Number(valor.replace(',', '.')) || 0
  return Number(valor || 0)
}

function dataDesejada(ano: number, trimestre?: number | string | null): string {
  const trimestreNumero = Number(trimestre) || 1
  const mes = Math.min(Math.max(trimestreNumero, 1), 4) * 3
  return `01/${String(mes).padStart(2, '0')}/${ano}`
}

export function montarDadosExportacaoPca(pca: PcaExportData) {
  return (pca.itens || []).map((item, index) => ({
    'Numero Item*': index + 1,
    'Identificador da Futura Contratação': item.identificador_contratacao || item.codigo_grupo || '',
    'Nome da Futura Contratação': item.nome_contratacao || item.nome_grupo || '',
    'Categoria do Item*': categoriaMap[item.categoria || ''] || '2-Serviço',
    'Catálogo Utilizado*': catalogoMap[item.catalogo_utilizado || 'OUTROS'] || '2-Outros',
    'Classificação do Catálogo*': classificacaoMap[item.classificacao_catalogo || 'SERVICO'] || '2-Serviço',
    'Código da Classificação Superior (Classe/Grupo)*': item.codigo_classe || '',
    'Classificacao Superior Nome*': item.nome_classe || '',
    'Código do PDM do Item': item.codigo_pdm || '',
    'Nome do PDM do Item': item.nome_pdm || '',
    'Código do Item': item.codigo_item_catalogo || '',
    'Descrição do Item': item.descricao_objeto || '',
    'Unidade de Fornecimento': item.unidade_medida || 'UN',
    'Quantidade Estimada*': numero(item.quantidade_estimada) || 1,
    'Valor Unitário Estimado (R$)*': numero(item.valor_unitario_estimado),
    'Valor Total Estimado (R$)*': numero(item.valor_estimado),
    'Valor orçamentário estimado para o exercício (R$)*': numero(item.valor_orcamentario_exercicio || item.valor_estimado),
    'Renovação Contrato*': item.renovacao_contrato === 'SIM' ? '1-Sim' : '2-Não',
    'Data Desejada*': dataDesejada(pca.ano_exercicio, item.trimestre_previsto),
    'Unidade Requisitante': item.unidade_requisitante || '',
    'Grupo Contratação Codigo': item.identificador_contratacao || item.codigo_grupo || '',
    'Grupo Contratação Nome': item.nome_contratacao || item.nome_grupo || '',
  }))
}

export function baixarXlsxPca(pca: PcaExportData, nomeArquivo = `PCA_${pca.ano_exercicio}_Itens_PNCP.xlsx`) {
  const ws = XLSX.utils.json_to_sheet(montarDadosExportacaoPca(pca))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Itens PCA')

  ws['!cols'] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 40 },
    { wch: 25 },
    { wch: 15 },
    { wch: 35 },
    { wch: 15 },
    { wch: 25 },
    { wch: 15 },
    { wch: 60 },
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 25 },
    { wch: 18 },
    { wch: 15 },
    { wch: 30 },
    { wch: 20 },
    { wch: 30 },
  ]

  XLSX.writeFile(wb, nomeArquivo)
}

function formatarMoeda(valor: number | string | null | undefined): string {
  return numero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarNumero(valor: number | string | null | undefined): string {
  return numero(valor).toLocaleString('pt-BR')
}

function formatarCnpj(cnpj?: string): string {
  const limpo = (cnpj || '').replace(/\D/g, '')
  if (limpo.length !== 14) return cnpj || ''
  return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function texto(valor: unknown): string {
  return String(valor ?? '').trim() || '-'
}

export async function baixarPdfPca(pca: PcaExportData, nomeArquivo = `PCA_${pca.ano_exercicio}_Itens.pdf`) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margem = 12
  const orgao = pca.orgao || {}
  const itens = pca.itens || []
  const valorTotal = pca.valor_total_estimado ?? itens.reduce((total, item) => total + numero(item.valor_estimado), 0)
  const quantidadeItens = pca.quantidade_itens ?? itens.length

  doc.setFillColor(7, 29, 65)
  doc.rect(0, 0, pageWidth, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(`Plano de Contratações Anual (PCA) ${pca.ano_exercicio}`, margem, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Emitido pelo Portal DCP em ${new Date().toLocaleString('pt-BR')}`, pageWidth - margem, 13, { align: 'right' })

  doc.setTextColor(7, 29, 65)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(texto(orgao.nome), margem, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(74, 85, 104)
  doc.text(
    [
      orgao.cnpj ? `CNPJ ${formatarCnpj(orgao.cnpj)}` : '',
      [orgao.cidade, orgao.uf].filter(Boolean).join(' - '),
      pca.numero_pca ? `Nº PCA ${pca.numero_pca}` : '',
    ].filter(Boolean).join(' · '),
    margem,
    38,
  )

  autoTable(doc, {
    startY: 45,
    theme: 'plain',
    margin: { left: margem, right: margem },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
    body: [
      ['Ano de exercício', String(pca.ano_exercicio), 'Quantidade de itens', formatarNumero(quantidadeItens)],
      ['Valor total estimado', formatarMoeda(valorTotal), 'Unidade', `${pca.codigo_unidade || '1'} - ${pca.nome_unidade || 'Unidade Principal'}`],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [7, 29, 65] },
      2: { fontStyle: 'bold', textColor: [7, 29, 65] },
    },
  })

  const tableStartY = ((doc as any).lastAutoTable?.finalY || 62) + 6
  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margem, right: margem, bottom: 15 },
    head: [['#', 'Categoria', 'Descrição do item', 'Unidade', 'Qtd.', 'Valor unit.', 'Valor total']],
    body: itens.map((item, index) => [
      String(index + 1),
      categoriaMap[item.categoria || ''] || texto(item.categoria),
      texto(item.descricao_objeto),
      texto(item.unidade_medida || 'UN'),
      formatarNumero(item.quantidade_estimada || 1),
      formatarMoeda(item.valor_unitario_estimado),
      formatarMoeda(item.valor_estimado),
    ]),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.8,
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [217, 221, 227],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [19, 81, 180],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 125 },
      3: { cellWidth: 22 },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: () => {
      const pagina = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(113, 128, 150)
      doc.text(`Página ${pagina}`, pageWidth - margem, pageHeight - 7, { align: 'right' })
      doc.text('Portal DCP - Diário de Compras Públicas', margem, pageHeight - 7)
    },
  })

  doc.save(nomeArquivo)
}
