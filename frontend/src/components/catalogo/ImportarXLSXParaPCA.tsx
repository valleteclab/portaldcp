'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Save, Upload, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { API_URL, authFetch } from '@/lib/api'

interface ItemXlsx {
  numero_item: number
  categoria: string
  catalogo_utilizado: string
  classificacao_catalogo: string
  codigo_classe: string
  nome_classe: string
  codigo_pdm: string
  nome_pdm: string
  codigo_item: string
  descricao: string
  unidade_medida: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  valor_orcamentario: number
  renovacao_contrato: string
  data_desejada: string
  unidade_requisitante: string
  grupo_codigo: string
  grupo_nome: string
  selecionado: boolean
}

interface Props {
  pcaId: string
  onImportSuccess?: (count: number) => void
}

const CATEGORIAS_MAP: Record<string, string> = {
  '1-material': 'MATERIAL',
  '2-serviço': 'SERVICO',
  '2-servico': 'SERVICO',
  '3-obras': 'OBRA',
  '4-serviços de engenharia': 'SERVICO_ENGENHARIA',
  '4-servicos de engenharia': 'SERVICO_ENGENHARIA',
  '5-soluções de tic': 'SOLUCAO_TIC',
  '5-solucoes de tic': 'SOLUCAO_TIC',
  '6-locação de imóveis': 'LOCACAO_IMOVEL',
  '6-locacao de imoveis': 'LOCACAO_IMOVEL',
  '7-alienação/concessão/permissão': 'ALIENACAO',
  '7-alienacao/concessao/permissao': 'ALIENACAO',
  '8-obras e serviços de engenharia': 'SERVICO_ENGENHARIA',
  '8-obras e servicos de engenharia': 'SERVICO_ENGENHARIA',
}

function normalizarTexto(valor: unknown): string {
  return String(valor ?? '').trim()
}

function numero(valor: unknown): number {
  if (typeof valor === 'number') return valor
  return Number(String(valor ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0
}

function dataParaIso(valor: unknown): string | null {
  if (!valor) return null
  if (typeof valor === 'number') {
    const parsed = XLSX.SSF.parse_date_code(valor)
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  const texto = String(valor)
  const br = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  const iso = texto.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  return null
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function get(row: Record<string, unknown>, key: string) {
  return row[key]
}

export function ImportarXLSXParaPCA({ pcaId, onImportSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [itens, setItens] = useState<ItemXlsx[]>([])
  const [erro, setErro] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ importados: number; duplicados: number; erros: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selecionados = itens.filter((item) => item.selecionado)

  const processarArquivo = async (file: File) => {
    setErro('')
    setResultado(null)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
      const sheetName = workbook.SheetNames.includes('Itens PCA') ? 'Itens PCA' : workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      const processados = rows.map((row, index) => {
        const valorUnitario = numero(get(row, 'Valor Unitário Estimado (R$)*'))
        const quantidade = numero(get(row, 'Quantidade Estimada*')) || 1
        const valorTotal = numero(get(row, 'Valor Total Estimado (R$)*')) || valorUnitario * quantidade

        return {
          numero_item: numero(get(row, 'Numero Item*')) || index + 1,
          categoria: normalizarTexto(get(row, 'Categoria do Item*')),
          catalogo_utilizado: normalizarTexto(get(row, 'Catálogo Utilizado*')),
          classificacao_catalogo: normalizarTexto(get(row, 'Classificação do Catálogo*')),
          codigo_classe: normalizarTexto(get(row, 'Código da Classificação Superior (Classe/Grupo)*')),
          nome_classe: normalizarTexto(get(row, 'Classificacao Superior Nome*')),
          codigo_pdm: normalizarTexto(get(row, 'Código do PDM do Item')),
          nome_pdm: normalizarTexto(get(row, 'Nome do PDM do Item')),
          codigo_item: normalizarTexto(get(row, 'Código do Item')),
          descricao: normalizarTexto(get(row, 'Descrição do Item')),
          unidade_medida: normalizarTexto(get(row, 'Unidade de Fornecimento')) || 'UN',
          quantidade,
          valor_unitario: valorUnitario,
          valor_total: valorTotal,
          valor_orcamentario: numero(get(row, 'Valor orçamentário estimado para o exercício (R$)*')) || valorTotal,
          renovacao_contrato: normalizarTexto(get(row, 'Renovação Contrato*')),
          data_desejada: normalizarTexto(get(row, 'Data Desejada*')),
          unidade_requisitante: normalizarTexto(get(row, 'Unidade Requisitante')),
          grupo_codigo: normalizarTexto(get(row, 'Grupo Contratação Codigo')),
          grupo_nome: normalizarTexto(get(row, 'Grupo Contratação Nome')),
          selecionado: true,
        }
      }).filter((item) => item.descricao)

      if (processados.length === 0) {
        setErro('Nenhum item encontrado na planilha. Verifique se o arquivo está no modelo do PNCP.')
        return
      }

      setItens(processados)
    } catch (error) {
      console.error(error)
      setErro('Não foi possível ler o arquivo XLSX.')
    }
  }

  const importar = async () => {
    if (selecionados.length === 0) return
    setImportando(true)
    setErro('')

    const itensParaImportar = selecionados.map((item) => {
      const categoriaKey = item.categoria.toLowerCase()
      const categoria = CATEGORIAS_MAP[categoriaKey] || 'SERVICO'
      const classificacao = item.classificacao_catalogo.toLowerCase().includes('material') ? 'MATERIAL' : 'SERVICO'

      return {
        categoria,
        descricao_objeto: item.descricao,
        codigo_item_catalogo: item.codigo_item || null,
        descricao_item_catalogo: item.descricao,
        quantidade_estimada: item.quantidade,
        valor_unitario_estimado: item.valor_unitario,
        valor_estimado: item.valor_total,
        unidade_medida: item.unidade_medida,
        trimestre_previsto: 1,
        prioridade: 3,
        unidade_requisitante: item.unidade_requisitante,
        justificativa: `Importado do XLSX PNCP - ${item.descricao.substring(0, 100)}`,
        catalogo_utilizado: item.catalogo_utilizado.includes('CNBS') ? 'COMPRASGOV' : 'OUTROS',
        classificacao_catalogo: classificacao,
        codigo_classe: item.codigo_classe || null,
        nome_classe: item.nome_classe || null,
        codigo_pdm: item.codigo_pdm || null,
        nome_pdm: item.nome_pdm || null,
        codigo_grupo: item.grupo_codigo || null,
        nome_grupo: item.grupo_nome || null,
        renovacao_contrato: item.renovacao_contrato.toLowerCase().includes('sim') ? 'SIM' : 'NAO',
        data_desejada_contratacao: dataParaIso(item.data_desejada),
        valor_orcamentario_exercicio: item.valor_orcamentario,
      }
    })

    try {
      const response = await authFetch(`${API_URL}/api/pca/${pcaId}/importar-itens`, {
        method: 'POST',
        body: JSON.stringify({ itens: itensParaImportar }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Erro ao importar XLSX')

      setResultado({
        importados: data.importados || 0,
        duplicados: data.duplicados || 0,
        erros: data.erros || 0,
      })
      if (data.importados > 0) onImportSuccess?.(data.importados)
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao importar XLSX')
    } finally {
      setImportando(false)
    }
  }

  const fechar = () => {
    setOpen(false)
    setItens([])
    setErro('')
    setResultado(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
          <FileSpreadsheet className="h-4 w-4" />
          PCA PNCP (XLSX)
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
            Importar XLSX do PCA
          </DialogTitle>
          <DialogDescription>
            Use a planilha no modelo PNCP para alimentar a página pública do PCA no Portal DCP.
          </DialogDescription>
        </DialogHeader>

        {!resultado ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              O arquivo deve ter a aba <strong>Itens PCA</strong> e as colunas do modelo PNCP, como o XLSX exportado pelo sistema.
            </div>

            {erro && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />
                {erro}
              </div>
            )}

            {itens.length === 0 ? (
              <button
                className="relative flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-emerald-400 hover:bg-slate-50"
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) processarArquivo(file)
                  }}
                />
                <Upload className="h-12 w-12 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-800">Selecionar arquivo XLSX</p>
                  <p className="mt-1 text-sm text-slate-500">Modelo: PCA_2026_Itens_PNCP.xlsx</p>
                </div>
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between border-b pb-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={itens.every((item) => item.selecionado)}
                      onCheckedChange={() => {
                        const todos = itens.every((item) => item.selecionado)
                        setItens((atual) => atual.map((item) => ({ ...item, selecionado: !todos })))
                      }}
                    />
                    {selecionados.length} de {itens.length} item(ns) selecionado(s)
                  </label>
                  <span className="text-sm text-slate-600">
                    Total selecionado: {moeda(selecionados.reduce((acc, item) => acc + item.valor_total, 0))}
                  </span>
                </div>

                <ScrollArea className="min-h-0 flex-1 rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-32">Categoria</TableHead>
                        <TableHead className="w-24">Qtd</TableHead>
                        <TableHead className="w-32 text-right">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item, index) => (
                        <TableRow key={`${item.numero_item}-${index}`}>
                          <TableCell>
                            <Checkbox
                              checked={item.selecionado}
                              onCheckedChange={() => {
                                setItens((atual) => atual.map((row, i) => i === index ? { ...row, selecionado: !row.selecionado } : row))
                              }}
                            />
                          </TableCell>
                          <TableCell>{item.numero_item}</TableCell>
                          <TableCell>
                            <p className="line-clamp-2 text-sm">{item.descricao}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.unidade_requisitante || 'Sem unidade requisitante'}</p>
                          </TableCell>
                          <TableCell>{item.categoria || '-'}</TableCell>
                          <TableCell>{item.quantidade} {item.unidade_medida}</TableCell>
                          <TableCell className="text-right font-mono">{moeda(item.valor_total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="outline" onClick={() => setItens([])}>
                    Trocar arquivo
                  </Button>
                  <Button onClick={importar} disabled={importando || selecionados.length === 0}>
                    {importando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Importar para o PCA
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-5 py-10 text-center">
            {resultado.erros > 0 ? (
              <XCircle className="h-16 w-16 text-red-600" />
            ) : (
              <CheckCircle2 className="h-16 w-16 text-emerald-600" />
            )}
            <div>
              <h3 className="text-xl font-semibold">Importação concluída</h3>
              <p className="mt-2 text-slate-600">
                {resultado.importados} importado(s), {resultado.duplicados} duplicado(s), {resultado.erros} erro(s).
              </p>
            </div>
            <Button onClick={fechar}>Concluir</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
