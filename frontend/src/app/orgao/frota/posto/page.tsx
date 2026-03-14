'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Fuel, Search, CheckCircle, XCircle, Loader2, FileText,
  Gauge, BarChart3, Clock, User, Car, Droplets, DollarSign,
  RefreshCw, Download,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

// ============ TIPOS ============

interface Contrato {
  id: string
  numero_contrato: string
  fornecedor_nome: string
  preco_litro: number
  limite_litros_mensal: number
  data_inicio: string
  data_fim: string
}

interface Requisicao {
  id: string
  codigo: string
  solicitante_nome: string
  solicitante_cargo?: string
  veiculo_placa: string
  veiculo_modelo?: string
  tipo_combustivel: string
  quantidade_autorizada: number
  quantidade_abastecida?: number
  finalidade: string
  status: string
  data_requisicao: string
  data_abastecimento?: string
  valor_total?: number
  contrato?: Contrato
}

interface Dashboard {
  mes: string
  contrato: Contrato | null
  total_litros: number
  total_valor: number
  total_autorizacoes_atendidas: number
  total_autorizacoes_pendentes: number
  preco_litro: number
  limite_mensal: number
  percentual_usado: number
  litros_restantes: number
  por_solicitante: { nome: string; litros: number; valor: number }[]
  requisicoes: Requisicao[]
}

// ============ HELPERS ============

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtLitros = (v: number, dec = 3) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} L`
const fmtData = (d: string) => {
  if (!d) return '—'
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')} · ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'ABASTECIDO': return <Badge className="bg-green-100 text-green-800 border-green-300">✓ Abastecido</Badge>
    case 'AUTORIZADO': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">⏳ Autorizado</Badge>
    case 'PENDENTE': return <Badge className="bg-gray-100 text-gray-700 border-gray-300">Pendente</Badge>
    case 'NEGADO': return <Badge className="bg-red-100 text-red-800 border-red-300">Negado</Badge>
    case 'CANCELADO': return <Badge variant="secondary">Cancelado</Badge>
    default: return <Badge>{status}</Badge>
  }
}

const initialsColor = (nome: string) => {
  const cores = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500']
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash)
  return cores[Math.abs(hash) % cores.length]
}

const initials = (nome: string) => nome.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('')

export default function PainelPostoPage() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [codigoInput, setCodigoInput] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [reqVerificada, setReqVerificada] = useState<Requisicao | null>(null)
  const [erroVerificacao, setErroVerificacao] = useState('')
  const codigoRef = useRef<HTMLInputElement>(null)

  const [modalConfirmar, setModalConfirmar] = useState(false)
  const [qtdAbastecida, setQtdAbastecida] = useState('')
  const [kmHodometro, setKmHodometro] = useState('')
  const [atendenteNome, setAtendenteNome] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  // Busca + filtros da tabela
  const [search, setSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('TODOS')
  const [pagina, setPagina] = useState(1)
  const ITENS_POR_PAGINA = 7

  // ============ CARREGAR =============

  const carregarDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const res = await authFetch(`${API_URL}/api/frota/dashboard-posto?mes=${mes}`)
      if (res.ok) setDashboard(await res.json())
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [mes])

  useEffect(() => { carregarDashboard() }, [carregarDashboard])

  // ============ VERIFICAR CÓDIGO =============

  const verificarCodigo = async () => {
    const codigo = codigoInput.trim().toUpperCase()
    if (!codigo) return
    setVerificando(true); setErroVerificacao(''); setReqVerificada(null)
    try {
      const res = await authFetch(`${API_URL}/api/frota/requisicoes/verificar/${codigo}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setErroVerificacao(e.message || 'Código não encontrado')
        return
      }
      const req: Requisicao = await res.json()
      if (req.status !== 'AUTORIZADO') {
        const msg = req.status === 'ABASTECIDO'
          ? 'Esta autorização já foi utilizada.'
          : `Esta autorização está com status: ${req.status}`
        setErroVerificacao(msg)
        return
      }
      setReqVerificada(req)
      setQtdAbastecida(String(req.quantidade_autorizada))
    } finally {
      setVerificando(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') verificarCodigo()
  }

  const limparVerificacao = () => {
    setReqVerificada(null); setErroVerificacao(''); setCodigoInput('')
    setQtdAbastecida(''); setKmHodometro('')
    codigoRef.current?.focus()
  }

  // ============ CONFIRMAR ABASTECIMENTO =============

  const confirmarAbastecimento = async () => {
    if (!reqVerificada) return
    setConfirmando(true)
    try {
      const res = await authFetch(`${API_URL}/api/frota/requisicoes/${reqVerificada.id}/confirmar-abastecimento`, {
        method: 'PUT',
        body: JSON.stringify({
          quantidade_abastecida: parseFloat(qtdAbastecida) || 0,
          km_hodometro: kmHodometro ? parseFloat(kmHodometro) : undefined,
          atendente_nome: atendenteNome || undefined,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao confirmar'); return }
      setModalConfirmar(false)
      limparVerificacao()
      carregarDashboard(true)
    } finally { setConfirmando(false) }
  }

  // ============ DOWNLOAD CSV SIGA =============

  const downloadSiga = async () => {
    const res = await authFetch(`${API_URL}/api/frota/relatorio/siga?mes=${mes}`)
    if (!res.ok) { alert('Erro ao gerar relatório'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `SIGA_COMBUSTIVEL_${mes}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ============ TABELA =============

  const requisicoesFiltradas = (dashboard?.requisicoes || []).filter(r => {
    const matchStatus = filtroStatus === 'TODOS' || r.status === filtroStatus
    const matchSearch = !search || [r.codigo, r.solicitante_nome, r.veiculo_placa]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
    return matchStatus && matchSearch
  })
  const totalPaginas = Math.ceil(requisicoesFiltradas.length / ITENS_POR_PAGINA)
  const paginaAtual = requisicoesFiltradas.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA)
  const totalMes = { litros: 0, valor: 0 }
  requisicoesFiltradas.filter(r => r.status === 'ABASTECIDO').forEach(r => {
    totalMes.litros += Number(r.quantidade_abastecida || 0)
    totalMes.valor += Number(r.valor_total || 0)
  })

  // ============ RENDER =============

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
    </div>
  )

  const d = dashboard
  const percento = Math.min(d?.percentual_usado || 0, 100)
  const barColor = percento >= 90 ? 'bg-red-500' : percento >= 70 ? 'bg-orange-500' : 'bg-orange-400'

  return (
    <div className="space-y-6 p-6 max-w-[1400px]">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Fuel className="w-6 h-6 text-orange-500" />
            Painel do Posto — Controle de Abastecimento
          </h1>
          {d?.contrato ? (
            <p className="text-sm text-gray-500 mt-0.5">
              Contrato nº {d.contrato.numero_contrato} · {d.contrato.fornecedor_nome} · Validade: {d.contrato.data_fim?.split('T')[0].split('-').reverse().join('/')}
            </p>
          ) : (
            <p className="text-sm text-orange-500 mt-0.5">Nenhum contrato ativo. <a href="/orgao/frota/contratos" className="underline">Cadastrar contrato</a></p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="ghost" size="sm" onClick={() => carregarDashboard(true)} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />Atualizar
          </Button>
          <Input type="month" className="w-36 text-sm" value={mes} onChange={e => setMes(e.target.value)} />
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-orange-400">
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Droplets className="w-3.5 h-3.5" />Total Abastecido ({d?.mes?.slice(5, 7) ? `${d.mes.slice(5, 7)}/${d.mes.slice(0, 4)}`.replace(/^0/, '') : ''})</p>
            <p className="text-3xl font-bold">{fmtLitros(d?.total_litros || 0, 0).replace(' L', ' L')}</p>
            {d?.limite_mensal ? <p className="text-xs text-gray-400 mt-0.5">De {fmtLitros(d.limite_mensal, 0)} contratados</p> : null}
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-400">
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />Autorizações Atendidas</p>
            <p className="text-3xl font-bold">{d?.total_autorizacoes_atendidas || 0}</p>
            <p className="text-xs text-gray-400 mt-0.5">Neste mês</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-green-500">
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />Valor Faturado ({d?.mes?.slice(5, 7) ? `${d.mes.slice(5, 7)}/${d.mes.slice(0, 4)}` : ''})</p>
            <p className="text-3xl font-bold">{fmt(d?.total_valor || 0)}</p>
            {d?.preco_litro ? <p className="text-xs text-gray-400 mt-0.5">A preço de {fmt(d.preco_litro)}/L</p> : null}
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-purple-400">
          <CardContent className="pt-4">
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" />% do Contrato Usado</p>
            <p className="text-3xl font-bold">{percento.toFixed(0)}%</p>
            {d?.litros_restantes !== undefined && d.litros_restantes > 0
              ? <p className="text-xs text-gray-400 mt-0.5">{fmtLitros(d.litros_restantes, 0)} restantes</p>
              : <p className="text-xs text-gray-400 mt-0.5">—</p>}
          </CardContent>
        </Card>
      </div>

      {/* Conteúdo principal: Verificação + Medição */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Verificar Autorização */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4 text-orange-500" />Verificar Autorização
                </h2>
                <span className="text-xs text-gray-400">Digite o código ou escaneie o QR</span>
              </div>

              <div>
                <Label className="text-sm">Código da autorização *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    ref={codigoRef}
                    placeholder="REQ-2026-0001"
                    value={codigoInput}
                    onChange={e => { setCodigoInput(e.target.value.toUpperCase()); setErroVerificacao(''); setReqVerificada(null) }}
                    onKeyDown={handleKeyDown}
                    className="font-mono"
                  />
                  <Button onClick={verificarCodigo} disabled={verificando || !codigoInput.trim()} className="bg-orange-500 hover:bg-orange-600 shrink-0">
                    {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" />Verificar</>}
                  </Button>
                </div>
              </div>

              {/* Erro */}
              {erroVerificacao && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
                  <XCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium">{erroVerificacao}</p>
                </div>
              )}

              {/* Resultado válido */}
              {reqVerificada && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Autorização Válida!</span>
                    <span className="font-mono text-sm ml-1">{reqVerificada.codigo}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Solicitante</p>
                      <p className="font-semibold text-sm">{reqVerificada.solicitante_nome}</p>
                      {reqVerificada.solicitante_cargo && <p className="text-xs text-gray-400">{reqVerificada.solicitante_cargo}</p>}
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Veículo / Placa</p>
                      <p className="font-semibold font-mono text-sm">{reqVerificada.veiculo_placa}</p>
                      {reqVerificada.veiculo_modelo && <p className="text-xs text-gray-400">{reqVerificada.veiculo_modelo}</p>}
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Combustível</p>
                      <p className="font-semibold text-sm">{reqVerificada.tipo_combustivel}</p>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Qtd. Autorizada</p>
                      <p className="font-bold text-orange-600 text-lg">{fmtLitros(reqVerificada.quantidade_autorizada)}</p>
                    </div>
                  </div>
                  {reqVerificada.finalidade && (
                    <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Finalidade</p>
                      <p className="text-sm">{reqVerificada.finalidade}</p>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={() => setModalConfirmar(true)}>
                      <Fuel className="w-4 h-4 mr-2" />Confirmar Abastecimento
                    </Button>
                    <Button variant="outline" onClick={limparVerificacao}>Cancelar</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Painel Lateral */}
        <div className="space-y-4">
          {/* Medição do Contrato */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />Medição do Contrato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {d?.contrato ? (
                <div className="bg-orange-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">
                    VALOR APURADO — {d.mes?.slice(5, 7)}/{d.mes?.slice(0, 4)}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{fmt(d.total_valor)}</p>
                  <p className="text-xs text-gray-500">{fmtLitros(d.total_litros)} × {fmt(d.preco_litro)}/L</p>
                  <div className="space-y-1">
                    <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${percento}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{fmtLitros(d.total_litros, 0)} abastecidos</span>
                      <span>Limite: {fmtLitros(d.limite_mensal, 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Sem contrato ativo</p>
              )}
              <Button size="sm" variant="outline" className="w-full" onClick={downloadSiga}>
                <Download className="w-4 h-4 mr-2" />Gerar Relatório SIGA
              </Button>
            </CardContent>
          </Card>

          {/* Por Solicitante */}
          {(d?.por_solicitante?.length || 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />Por Solicitante
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Solicitante</TableHead>
                      <TableHead className="text-right">Litros</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d!.por_solicitante.slice(0, 6).map(s => (
                      <TableRow key={s.nome} className="text-xs">
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-6 h-6 rounded-full ${initialsColor(s.nome)} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>
                              {initials(s.nome)}
                            </span>
                            <span className="truncate max-w-[100px]">{s.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 text-right font-semibold text-orange-600">
                          {fmtLitros(s.litros, 0)}
                        </TableCell>
                        <TableCell className="py-1.5 text-right">{fmt(s.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Registro de Abastecimentos */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              Registro de Abastecimentos — {d?.mes?.slice(5, 7)}/{d?.mes?.slice(0, 4)}
            </h3>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Buscar solicitante, código, placa..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPagina(1) }}
                className="w-52 text-sm"
              />
              <select
                className="border rounded-md px-2 py-1.5 text-sm text-gray-700"
                value={filtroStatus}
                onChange={e => { setFiltroStatus(e.target.value); setPagina(1) }}
              >
                <option value="TODOS">Todos</option>
                <option value="ABASTECIDO">Abastecidos</option>
                <option value="AUTORIZADO">Autorizados</option>
                <option value="PENDENTE">Pendentes</option>
              </select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="text-xs uppercase text-gray-500">
                <TableHead>Código</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Valor (R$)</TableHead>
                <TableHead>Data / Hora</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">Nenhum registro encontrado</TableCell></TableRow>
              )}
              {paginaAtual.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-mono text-blue-600 font-medium text-sm">{r.codigo}</p>
                    <p className="text-xs text-gray-400">{fmtData(r.created_at as any)}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-7 h-7 rounded-full ${initialsColor(r.solicitante_nome)} text-white flex items-center justify-center text-[11px] font-bold shrink-0`}>
                        {initials(r.solicitante_nome)}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{r.solicitante_nome}</p>
                        {r.solicitante_cargo && <p className="text-xs text-gray-400">{r.solicitante_cargo}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-semibold">{r.veiculo_placa}</TableCell>
                  <TableCell className="text-sm">{r.tipo_combustivel}</TableCell>
                  <TableCell className="text-right font-semibold text-orange-600">
                    {r.status === 'ABASTECIDO'
                      ? fmtLitros(r.quantidade_abastecida || 0)
                      : <span className="text-gray-400">{fmtLitros(r.quantidade_autorizada)} <span className="text-xs font-normal">(aut.)</span></span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'ABASTECIDO' ? fmt(r.valor_total || 0) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {r.status === 'ABASTECIDO' && r.data_abastecimento ? fmtData(r.data_abastecimento) : '—'}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Total + paginação */}
          {requisicoesFiltradas.filter(r => r.status === 'ABASTECIDO').length > 0 && (
            <div className="flex justify-end border-t pt-2">
              <div className="flex gap-6 text-sm font-semibold text-gray-700">
                <span>TOTAL DO MÊS: <span className="text-orange-600">{fmtLitros(totalMes.litros, 0)}</span></span>
                <span><span className="text-green-700">{fmt(totalMes.valor)}</span></span>
              </div>
            </div>
          )}

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Mostrando {(pagina - 1) * ITENS_POR_PAGINA + 1}–{Math.min(pagina * ITENS_POR_PAGINA, requisicoesFiltradas.length)} de {requisicoesFiltradas.length} registros</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="w-7 h-7 p-0" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>‹</Button>
                {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => i + 1).map(p => (
                  <Button key={p} size="sm" className={`w-7 h-7 p-0 ${p === pagina ? 'bg-orange-500 text-white hover:bg-orange-600' : 'variant-outline'}`}
                    onClick={() => setPagina(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="sm" className="w-7 h-7 p-0" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>›</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Confirmar Abastecimento */}
      <Dialog open={modalConfirmar} onOpenChange={setModalConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-green-600" />Confirmar Abastecimento
            </DialogTitle>
            <DialogDescription>
              {reqVerificada && `${reqVerificada.codigo} · ${reqVerificada.solicitante_nome} · ${reqVerificada.veiculo_placa}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qtd. Abastecida (litros) *</Label>
                <Input
                  type="number" step="0.001" min="0"
                  placeholder="0,000"
                  value={qtdAbastecida}
                  onChange={e => setQtdAbastecida(e.target.value)}
                />
                {reqVerificada && (
                  <p className="text-xs text-gray-400">Autorizado: {fmtLitros(reqVerificada.quantidade_autorizada)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>KM Hodômetro</Label>
                <Input type="number" min="0" placeholder="0"
                  value={kmHodometro} onChange={e => setKmHodometro(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nome do Atendente</Label>
              <Input placeholder="Atendente responsável"
                value={atendenteNome} onChange={e => setAtendenteNome(e.target.value)} />
            </div>
            {reqVerificada?.contrato && qtdAbastecida && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <span className="text-gray-500">Valor a faturar: </span>
                <span className="font-bold text-green-700">
                  {fmt((parseFloat(qtdAbastecida) || 0) * Number(reqVerificada.contrato.preco_litro))}
                </span>
                <span className="text-gray-400 ml-1">({fmtLitros(parseFloat(qtdAbastecida) || 0)} × {fmt(reqVerificada.contrato.preco_litro)}/L)</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalConfirmar(false)}>Cancelar</Button>
            <Button onClick={confirmarAbastecimento} disabled={confirmando || !qtdAbastecida}
              className="bg-green-600 hover:bg-green-700">
              {confirmando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Abastecimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
