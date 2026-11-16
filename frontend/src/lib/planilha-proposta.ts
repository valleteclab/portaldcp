/**
 * IMPORTAÇÃO DA PROPOSTA POR PLANILHA (dono, 10/11/2026 — como a BLL). Lê a
 * planilha-modelo baixada do sistema (backend/src/propostas/planilha-modelo.ts
 * — as colunas de lá são o contrato daqui) e devolve, por número do item, o
 * valor unitário, a marca e o modelo. Nada é gravado: a tela preenche o
 * formulário e o fornecedor confere antes de enviar.
 */
import * as XLSX from 'xlsx'

export interface LinhaPlanilhaProposta {
  numero: number
  valorUnitario: number | null
  marca: string
  modelo: string
}

export interface LeituraPlanilhaProposta {
  linhas: LinhaPlanilhaProposta[]
  /** Problemas que o fornecedor precisa saber (linha ignorada, valor inválido…). */
  avisos: string[]
}

const semAcento = (t: unknown) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** "1.234,56", "R$ 1.234,56", "1234.56" ou número → número; vazio → null; inválido → NaN. */
export function lerValorDaPlanilha(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const t = String(v).replace(/r\$/i, '').replace(/\s/g, '')
  if (!t) return null
  // Com vírgula: formato brasileiro (ponto = milhar). Sem vírgula: ponto = decimal.
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** Lê as linhas já convertidas em matriz (separado da leitura do arquivo para poder testar). */
export function lerMatrizDaProposta(matriz: unknown[][]): LeituraPlanilhaProposta {
  const avisos: string[] = []
  const iCab = matriz.findIndex((l) => {
    const c = (l ?? []).map(semAcento)
    return c.includes('item') && c.some((x) => x.startsWith('valor unitario'))
  })
  if (iCab < 0) {
    return { linhas: [], avisos: ['Não encontrei as colunas "Item" e "Valor unitário (R$)". Use a planilha-modelo baixada desta licitação.'] }
  }
  const cab = matriz[iCab].map(semAcento)
  const col = (inicio: string) => cab.findIndex((x) => x === inicio || x.startsWith(inicio))
  const cItem = col('item')
  const cValor = col('valor unitario')
  const cMarca = col('marca')
  const cModelo = col('modelo')

  const linhas: LinhaPlanilhaProposta[] = []
  const vistos = new Set<number>()
  for (let i = iCab + 1; i < matriz.length; i++) {
    const l = matriz[i] ?? []
    const bruto = l[cItem]
    if (bruto === null || bruto === undefined || String(bruto).trim() === '') continue
    const numero = Number(String(bruto).trim())
    if (!Number.isInteger(numero) || numero <= 0) {
      avisos.push(`Linha ${i + 1}: "${String(bruto)}" não é um número de item — linha ignorada.`)
      continue
    }
    if (vistos.has(numero)) {
      avisos.push(`Linha ${i + 1}: o item ${numero} aparece mais de uma vez — vale a primeira.`)
      continue
    }
    vistos.add(numero)
    let valor = lerValorDaPlanilha(l[cValor])
    if (valor !== null && (Number.isNaN(valor) || valor < 0)) {
      avisos.push(`Item ${numero}: o valor unitário "${String(l[cValor])}" não é um valor em reais — item sem valor.`)
      valor = null
    }
    linhas.push({
      numero,
      valorUnitario: valor === null ? null : Math.round(valor * 10000) / 10000,
      marca: cMarca >= 0 ? String(l[cMarca] ?? '').trim() : '',
      modelo: cModelo >= 0 ? String(l[cModelo] ?? '').trim() : '',
    })
  }
  if (!linhas.length) avisos.push('A planilha não tem nenhum item preenchido.')
  return { linhas, avisos }
}

/** Lê o arquivo (.xlsx, .xls ou .csv) escolhido pelo fornecedor. */
export async function lerPlanilhaDaProposta(arquivo: File): Promise<LeituraPlanilhaProposta> {
  try {
    const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' })
    const aba = wb.SheetNames.find((n) => semAcento(n) === 'proposta') ?? wb.SheetNames[0]
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, blankrows: true, defval: null })
    return lerMatrizDaProposta(matriz)
  } catch {
    return { linhas: [], avisos: ['Não foi possível ler o arquivo. Envie a planilha-modelo no formato .xlsx.'] }
  }
}
