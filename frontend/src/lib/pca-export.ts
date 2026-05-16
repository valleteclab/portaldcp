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
}

export interface PcaExportData {
  ano_exercicio: number
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
    'Grupo Contratação Codigo': item.codigo_grupo || '',
    'Grupo Contratação Nome': item.nome_grupo || '',
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
