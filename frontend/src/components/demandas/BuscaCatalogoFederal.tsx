'use client'

/**
 * Busca no catálogo federal (CATMAT/CATSER — ComprasGov) para o item da demanda:
 * por termo, por PDM com filtros de características, e a IA traduzindo a
 * necessidade em termos do catálogo.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, Loader2, Plus, Search, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'
import type { ItemSelecionado } from './tipos'

interface PdmComprasGov {
  codigoPdm: number
  nomePdm: string
  codigoClasse?: number
  nomeClasse?: string
}

/** Item como vem de /api/catalogo/itens ou /api/catalogo/comprasgov/pdm/:pdm/itens. */
interface ItemCatalogoFederal {
  id?: string
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  unidade_padrao?: string
  codigo_classe?: string
  nome_classe?: string
  classe?: { codigo?: string; nome?: string }
  codigo_pdm?: string
  nome_pdm?: string
  descricao_detalhada?: string
  sustentavel?: boolean
}

interface FiltroPdm {
  codigo: string
  nome: string
  obrigatoria: boolean
  valores: { codigo: string; nome: string }[]
}

export function BuscaCatalogoFederal({ onSelect }: { onSelect: (item: ItemSelecionado) => void }) {
  const [termo, setTermo] = useState('')
  const [tipo, setTipo] = useState<'all' | 'MATERIAL' | 'SERVICO'>('all')
  const [resultados, setResultados] = useState<ItemCatalogoFederal[]>([])
  const [pdms, setPdms] = useState<PdmComprasGov[]>([])
  const [pdmSelecionado, setPdmSelecionado] = useState<PdmComprasGov | null>(null)
  const [filtros, setFiltros] = useState<FiltroPdm[]>([])
  const [filtrosSelecionados, setFiltrosSelecionados] = useState<Record<string, string>>({})
  const [totalFederal, setTotalFederal] = useState(0)
  const [unidadePdm, setUnidadePdm] = useState<{ siglaUnidadeFornecimento?: string; nomeUnidadeFornecimento?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // IA: traduz a necessidade em termos de busca do catálogo
  const [sugestoesIA, setSugestoesIA] = useState<string[]>([])
  const [buscandoIA, setBuscandoIA] = useState(false)

  const sugerirTermosComIA = async () => {
    const necessidade = termo.trim()
    if (!necessidade || buscandoIA) return
    setBuscandoIA(true)
    try {
      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: [{
            role: 'user',
            content:
              `O catálogo de compras públicas (CATMAT/CATSER) é indexado por nomes curtos de materiais/serviços. ` +
              `O servidor descreveu a necessidade assim: "${necessidade}". ` +
              `Liste até 3 termos de busca prováveis no catálogo (substantivo principal, 1 a 2 palavras cada, singular). ` +
              `Responda APENAS com um JSON array de strings, ex: ["cadeira giratória","poltrona"].`,
          }],
          tipoDocumento: 'catalogo',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const m = String(data.resposta || '').match(/\[[\s\S]*\]/)
      const termos: string[] = m ? JSON.parse(m[0]) : []
      const validos = termos.filter((t) => typeof t === 'string' && t.trim().length > 1).slice(0, 3)
      if (validos.length === 0) throw new Error('sem termos')
      setSugestoesIA(validos)
      setTermo(validos[0]) // dispara a busca automática
    } catch {
      toast('A IA não conseguiu sugerir termos agora — tente buscar por uma palavra-chave simples (ex: "cadeira").')
    } finally {
      setBuscandoIA(false)
    }
  }

  const normalizarBusca = (valor: string) =>
    valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

  const parseCaracteristicas = (item: ItemCatalogoFederal):{ nome: string; valor: string }[] => {
    let caracts: { nome: string; valor: string }[] = []
    if (item.descricao_detalhada) {
      try { caracts = JSON.parse(item.descricao_detalhada) } catch { /* ignore */ }
    }
    if (caracts.length === 0 && item.descricao) {
      const dashIdx = item.descricao.indexOf(' - ')
      if (dashIdx > -1) {
        const caractsStr = item.descricao.slice(dashIdx + 3)
        caracts = caractsStr.split(', ')
          .map((c: string) => {
            const colonIdx = c.indexOf(': ')
            if (colonIdx > -1) return { nome: c.slice(0, colonIdx).trim(), valor: c.slice(colonIdx + 2).trim() }
            return null
          })
          .filter((c: { nome: string; valor: string } | null): c is { nome: string; valor: string } =>
            c !== null && c.nome.length > 0 && c.valor.length > 0
          )
      }
    }
    return caracts
  }

  const carregarItensPdm = useCallback(async (pdm: PdmComprasGov, filtrosAtuais: Record<string, string>) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limite: '100',
        filtros: JSON.stringify(filtrosAtuais),
      })
      const res = await authFetch(`${API_URL}/api/catalogo/comprasgov/pdm/${pdm.codigoPdm}/itens?${params}`)
      if (res.ok) {
        const data = await res.json()
        setResultados(data.itens ?? [])
        setFiltros(data.filtros ?? [])
        setUnidadePdm(data.unidade ?? null)
        setTotalFederal(data.total ?? data.itens?.length ?? 0)
      }
    } catch { /* silencioso */ } finally {
      setLoading(false)
      setBuscado(true)
    }
  }, [])

  const selecionarPdm = useCallback((pdm: PdmComprasGov) => {
    setPdmSelecionado(pdm)
    setFiltrosSelecionados({})
    carregarItensPdm(pdm, {})
  }, [carregarItensPdm])

  const buscar = useCallback(async (t: string, tp: string) => {
    if (t.trim().length < 2) {
      setResultados([])
      setPdms([])
      setPdmSelecionado(null)
      setFiltros([])
      setBuscado(false)
      return
    }
    setLoading(true)
    try {
      setPdmSelecionado(null)
      setFiltros([])
      setFiltrosSelecionados({})
      setUnidadePdm(null)
      setTotalFederal(0)

      if (tp !== 'SERVICO') {
        const paramsPdm = new URLSearchParams({ termo: t, limite: '12' })
        const resPdm = await authFetch(`${API_URL}/api/catalogo/comprasgov/pdms?${paramsPdm}`)
        const pdmsData = resPdm.ok ? await resPdm.json() : []
        setPdms(pdmsData)

        const pdmExato = pdmsData.find((pdm: PdmComprasGov) =>
          normalizarBusca(pdm.nomePdm) === normalizarBusca(t)
        )

        if (pdmExato) {
          setPdmSelecionado(pdmExato)
          await carregarItensPdm(pdmExato, {})
          return
        }
      } else {
        setPdms([])
      }

      const params = new URLSearchParams({ termo: t, limite: '30' })
      if (tp !== 'all') params.set('tipo', tp)
      const res = await authFetch(`${API_URL}/api/catalogo/itens?${params}`)
      if (res.ok) {
        const data = await res.json()
        const itens = Array.isArray(data) ? data : (data.dados ?? [])
        setResultados(itens)
        setTotalFederal(itens.length)
      }
    } catch { /* silencioso */ } finally {
      setLoading(false)
      setBuscado(true)
    }
  }, [carregarItensPdm])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(termo, tipo), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [termo, tipo, buscar])

  useEffect(() => {
    if (!pdmSelecionado) return
    carregarItensPdm(pdmSelecionado, filtrosSelecionados)
  }, [filtrosSelecionados, pdmSelecionado, carregarItensPdm])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            value={termo}
            onChange={e => setTermo(e.target.value)}
            placeholder="Buscar pelo código ou descrição (ex: 446820, computador...)"
            aria-label="Buscar no catálogo federal (CATMAT/CATSER)"
            className="pl-9 h-10"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>
        <Select value={tipo} onValueChange={(v) => setTipo(v as 'all' | 'MATERIAL' | 'SERVICO')}>
          <SelectTrigger className="w-32 sm:w-36 h-10" aria-label="Tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="MATERIAL">Material</SelectItem>
            <SelectItem value="SERVICO">Serviço</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 gap-1.5 text-[#1351b4] border-[#c5d4eb] bg-[#f6f9fd] hover:bg-[#ecf3fc]"
          onClick={sugerirTermosComIA}
          disabled={buscandoIA || termo.trim().length < 3}
          title="Escreva a necessidade com as suas palavras e a IA traduz para os termos do catálogo"
        >
          {buscandoIA ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          IA
        </Button>
      </div>

      {sugestoesIA.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-gray-500">✨ A IA sugeriu buscar por:</span>
          {sugestoesIA.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTermo(s)}
              className={`px-2 py-1 rounded-full border transition-colors ${
                termo === s
                  ? 'bg-[#1351b4] text-white border-[#1351b4]'
                  : 'bg-white text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {pdms.length > 0 && !pdmSelecionado && (
        <div className="border rounded-lg bg-white divide-y max-h-56 overflow-y-auto">
          {pdms.map(pdm => (
            <button
              key={pdm.codigoPdm}
              type="button"
              onClick={() => selecionarPdm(pdm)}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm text-gray-900">PDM: {pdm.codigoPdm} - {pdm.nomePdm}</p>
                  {pdm.nomeClasse && <p className="text-xs text-gray-500 mt-0.5">Classe: {pdm.codigoClasse} - {pdm.nomeClasse}</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      {pdmSelecionado && (
        <div className="border rounded-lg bg-gray-50 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">PDM selecionado</p>
              <p className="text-sm font-semibold text-gray-900">{pdmSelecionado.codigoPdm} - {pdmSelecionado.nomePdm}</p>
              {unidadePdm?.siglaUnidadeFornecimento && (
                <p className="text-xs text-gray-500 mt-1">Unidade: {unidadePdm.nomeUnidadeFornecimento || unidadePdm.siglaUnidadeFornecimento}</p>
              )}
            </div>
            {Object.keys(filtrosSelecionados).length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setFiltrosSelecionados({})}>
                Limpar filtros
              </Button>
            )}
          </div>

          {filtros.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtros.map(filtro => (
                <div key={filtro.codigo} className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">
                    {filtro.nome}{filtro.obrigatoria ? ' *' : ''}
                  </label>
                  <Select
                    value={filtrosSelecionados[filtro.codigo] ?? 'all'}
                    onValueChange={(value) => {
                      setFiltrosSelecionados(prev => {
                        const next = { ...prev }
                        if (value === 'all') delete next[filtro.codigo]
                        else next[filtro.codigo] = value
                        return next
                      })
                    }}
                  >
                    <SelectTrigger className="h-9 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {filtro.valores.map(valor => (
                        <SelectItem key={valor.codigo} value={valor.codigo}>{valor.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {buscado && resultados.length === 0 && !loading && pdms.length === 0 && (
        <div className="text-center py-5 text-gray-600 bg-gray-50 rounded-lg text-sm">
          Nenhum item encontrado. Tente outro termo ou use o &quot;Catálogo do órgão / novo item&quot;.
        </div>
      )}

      {resultados.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">
            Foram encontrados <strong>{totalFederal || resultados.length}</strong> {resultados.length === 1 ? 'resultado' : 'resultados'}
          </p>
          {/* Cabeçalho da tabela */}
          <div className="bg-gray-50 border border-b-0 rounded-t-lg grid grid-cols-[80px_1fr_32px] px-4 py-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome do Material / Serviço</span>
            <span />
          </div>
          <div className="border rounded-b-lg divide-y max-h-96 overflow-y-auto bg-white shadow-sm">
            {resultados.map(item => {
              // Características: JSON em descricao_detalhada ou o texto "PDM - Car1: Val1, Car2: Val2"
              const caracts = parseCaracteristicas(item)
              const nomePdm = item.nome_pdm || ((item.descricao?.indexOf(' - ') ?? -1) > -1 ? item.descricao.split(' - ')[0] : item.descricao)
              const nomeCls = item.classe?.nome || item.nome_classe || ''

              return (
                <button
                  key={item.id || item.codigo}
                  type="button"
                  onClick={() => onSelect({
                    codigo: item.codigo,
                    descricao: item.descricao,
                    tipo: item.tipo,
                    unidade_padrao: item.unidade_padrao,
                    codigo_classe: item.codigo_classe || item.classe?.codigo,
                    nome_classe: item.classe?.nome || item.nome_classe,
                    codigo_pdm: item.codigo_pdm,
                    nome_pdm: item.nome_pdm,
                    descricao_detalhada: item.descricao_detalhada,
                    fonte: 'COMPRASGOV',
                  })}
                  className="w-full grid grid-cols-[80px_1fr_32px] items-start px-4 py-3 hover:bg-blue-50 text-left transition-colors group gap-3"
                >
                  {/* Código */}
                  <div className="pt-0.5">
                    <span className="font-mono text-sm font-semibold text-gray-700">{item.codigo}</span>
                  </div>

                  {/* Descrição estruturada */}
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-gray-900 leading-snug">
                      {nomePdm}
                    </p>
                    {caracts.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {caracts.map((c, i) => (
                          <p key={i} className="text-xs text-gray-600">
                            <span className="text-gray-400">{c.nome}:</span>{' '}
                            <span>{c.valor}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {nomeCls && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          {nomeCls}
                        </span>
                      )}
                      {item.unidade_padrao && (
                        <Badge variant="outline" className="text-xs py-0">{item.unidade_padrao}</Badge>
                      )}
                      {item.sustentavel && (
                        <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">♻ Sustentável</span>
                      )}
                    </div>
                  </div>

                  {/* Ação */}
                  <div className="pt-0.5 flex justify-center">
                    <Plus className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
