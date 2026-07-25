'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { 
  Plus, 
  FileText, 
  Calendar, 
  DollarSign,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  Eye,
  Edit,
  Send,
  Users
} from 'lucide-react'

interface ItemAta {
  id: string
  numero_item: number
  descricao: string
  quantidade_registrada: number
  quantidade_saldo: number
  valor_unitario: number
}

interface Ata {
  id: string
  numero_ata: string
  ano: number
  status: string
  objeto: string
  valor_total: number
  valor_utilizado: number
  valor_saldo: number
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  permite_adesao: boolean
  enviado_pncp: boolean
  itens: ItemAta[]
}

import { API_URL, authFetch } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const STATUS_ATA = {
  'VIGENTE': { label: 'Vigente', cor: 'bg-green-100 text-green-800' },
  'ENCERRADA': { label: 'Encerrada', cor: 'bg-gray-100 text-gray-800' },
  'ESGOTADA': { label: 'Esgotada', cor: 'bg-yellow-100 text-yellow-800' },
  'CANCELADA': { label: 'Cancelada', cor: 'bg-red-100 text-red-800' }
}

export default function AtasOrgaoPage() {
  const [atas, setAtas] = useState<Ata[]>([])
  const [atasAVencer, setAtasAVencer] = useState<Ata[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    status: '',
    ano: ''
  })
  const [estatisticas, setEstatisticas] = useState({
    vigentes: 0,
    esgotadas: 0,
    valorTotal: 0,
    aVencer30Dias: 0
  })

  // Nova ata a partir de licitação SRP homologada
  const [modalNovaAta, setModalNovaAta] = useState(false)
  const [licitacoesSrp, setLicitacoesSrp] = useState<Array<{ id: string; numero_processo: string; objeto: string }>>([])
  const [fornecedoresOpt, setFornecedoresOpt] = useState<Array<{ id: string; razao_social: string; cpf_cnpj?: string }>>([])
  const [novaAta, setNovaAta] = useState({ licitacao_id: '', fornecedor_id: '', data_vigencia_inicio: '', data_vigencia_fim: '', valor_total: '' })
  const [salvandoAta, setSalvandoAta] = useState(false)

  const abrirModalNovaAta = async () => {
    setModalNovaAta(true)
    try {
      const [resLic, resForn] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes?limit=200`),
        authFetch(`${API_URL}/api/fornecedores?status=APROVADO`),
      ])
      if (resLic.ok) {
        const j = await resLic.json()
        const lista = Array.isArray(j) ? j : j?.data || []
        setLicitacoesSrp(lista.filter((l: any) => l.srp))
      }
      if (resForn.ok) {
        const lista = await resForn.json()
        setFornecedoresOpt(Array.isArray(lista) ? lista : lista?.data || [])
      }
    } catch { /* selects ficam vazios */ }
  }

  const criarNovaAta = async () => {
    if (!novaAta.licitacao_id || !novaAta.fornecedor_id || !novaAta.data_vigencia_inicio || !novaAta.data_vigencia_fim) {
      alert('Preencha licitação, fornecedor e vigência.')
      return
    }
    setSalvandoAta(true)
    try {
      const forn = fornecedoresOpt.find((f) => f.id === novaAta.fornecedor_id)
      const res = await authFetch(`${API_URL}/api/atas/licitacao/${novaAta.licitacao_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor_id: novaAta.fornecedor_id,
          fornecedor_razao_social: forn?.razao_social,
          fornecedor_cnpj: forn?.cpf_cnpj,
          data_vigencia_inicio: novaAta.data_vigencia_inicio,
          data_vigencia_fim: novaAta.data_vigencia_fim,
          valor_total: novaAta.valor_total ? Number(String(novaAta.valor_total).replace(',', '.')) : undefined,
          status: 'VIGENTE',
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || `HTTP ${res.status}`)
      }
      setModalNovaAta(false)
      setNovaAta({ licitacao_id: '', fornecedor_id: '', data_vigencia_inicio: '', data_vigencia_fim: '', valor_total: '' })
      await carregarDados()
    } catch (e: any) {
      alert(`Erro ao criar ata: ${e.message}`)
    } finally {
      setSalvandoAta(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return

      const orgao = JSON.parse(orgaoData)

      const [atasRes, aVencerRes, statsRes] = await Promise.all([
        authFetch(`${API_URL}/api/atas?orgaoId=${orgao.id}`),
        authFetch(`${API_URL}/api/atas/estatisticas/a-vencer?orgaoId=${orgao.id}&dias=30`),
        authFetch(`${API_URL}/api/atas/estatisticas/status?orgaoId=${orgao.id}`)
      ])

      if (atasRes.ok) {
        const data = await atasRes.json()
        setAtas(data)
        
        // Calcular valor total
        const valorTotal = data.reduce((sum: number, ata: Ata) => sum + Number(ata.valor_total), 0)
        setEstatisticas(prev => ({ ...prev, valorTotal }))
      }
      if (aVencerRes.ok) {
        setAtasAVencer(await aVencerRes.json())
      }
      if (statsRes.ok) {
        const stats = await statsRes.json()
        setEstatisticas(prev => ({
          ...prev,
          vigentes: stats.VIGENTE || 0,
          esgotadas: stats.ESGOTADA || 0,
          aVencer30Dias: atasAVencer.length
        }))
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number) => {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const calcularDiasRestantes = (dataFim: string) => {
    const fim = new Date(dataFim)
    const hoje = new Date()
    return Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  }

  const calcularPercentualSaldo = (total: number, saldo: number) => {
    if (!total) return 0
    return Math.round((saldo / total) * 100)
  }

  const atasFiltradas = atas.filter(ata => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!ata.objeto.toLowerCase().includes(busca) && 
          !ata.numero_ata.toLowerCase().includes(busca) &&
          !ata.fornecedor_razao_social.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.status && ata.status !== filtros.status) return false
    if (filtros.ano && ata.ano !== parseInt(filtros.ano)) return false
    return true
  })

  const anos = [...new Set(atas.map(a => a.ano))].sort((a, b) => b - a)

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando atas...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Atas de Registro de Preço</h1>
          <p className="text-gray-600">Gerencie as atas SRP do órgão</p>
        </div>
        <Button onClick={abrirModalNovaAta}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Ata
        </Button>
      </div>

      {/* Modal: Nova Ata a partir de licitação SRP */}
      <Dialog open={modalNovaAta} onOpenChange={setModalNovaAta}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Ata de Registro de Preço</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-2">A ata é criada a partir de uma licitação SRP. O número é gerado automaticamente.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Licitação (SRP)</label>
              <select
                className="w-full border rounded-md h-9 px-2 text-sm bg-white"
                value={novaAta.licitacao_id}
                onChange={(e) => setNovaAta((p) => ({ ...p, licitacao_id: e.target.value }))}
              >
                <option value="">— selecionar —</option>
                {licitacoesSrp.map((l) => (
                  <option key={l.id} value={l.id}>{l.numero_processo} — {l.objeto?.slice(0, 60)}</option>
                ))}
              </select>
              {licitacoesSrp.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Nenhuma licitação marcada como SRP encontrada.</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500">Fornecedor</label>
              <select
                className="w-full border rounded-md h-9 px-2 text-sm bg-white"
                value={novaAta.fornecedor_id}
                onChange={(e) => setNovaAta((p) => ({ ...p, fornecedor_id: e.target.value }))}
              >
                <option value="">— selecionar —</option>
                {fornecedoresOpt.map((f) => (
                  <option key={f.id} value={f.id}>{f.razao_social}{f.cpf_cnpj ? ` (${f.cpf_cnpj})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Vigência — início</label>
                <Input type="date" value={novaAta.data_vigencia_inicio} onChange={(e) => setNovaAta((p) => ({ ...p, data_vigencia_inicio: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Vigência — fim</label>
                <Input type="date" value={novaAta.data_vigencia_fim} onChange={(e) => setNovaAta((p) => ({ ...p, data_vigencia_fim: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Valor total (opcional)</label>
              <Input inputMode="decimal" placeholder="0,00" value={novaAta.valor_total} onChange={(e) => setNovaAta((p) => ({ ...p, valor_total: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovaAta(false)}>Cancelar</Button>
            <Button onClick={criarNovaAta} disabled={salvandoAta}>{salvandoAta ? 'Criando…' : 'Criar ata'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Atas Vigentes</p>
                <p className="text-2xl font-bold text-green-600">{estatisticas.vigentes}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Esgotadas</p>
                <p className="text-2xl font-bold text-yellow-600">{estatisticas.esgotadas}</p>
              </div>
              <Package className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={atasAVencer.length > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">A Vencer (30 dias)</p>
                <p className="text-2xl font-bold text-yellow-600">{atasAVencer.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Valor Total Registrado</p>
                <p className="text-lg font-bold">{formatarMoeda(estatisticas.valorTotal)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas de Vencimento */}
      {atasAVencer.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="w-5 h-5" />
              Atas a Vencer nos Próximos 30 Dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {atasAVencer.slice(0, 5).map(ata => {
                const dias = calcularDiasRestantes(ata.data_vigencia_fim)
                return (
                  <div key={ata.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div>
                      <p className="font-medium">{ata.numero_ata}</p>
                      <p className="text-sm text-gray-600">{ata.fornecedor_razao_social}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={dias <= 7 ? 'destructive' : 'secondary'}>
                        {dias} dias restantes
                      </Badge>
                      <p className="text-sm text-gray-500 mt-1">
                        Saldo: {formatarMoeda(ata.valor_saldo)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros e Lista */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Atas</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar..."
                  className="pl-10 w-64"
                  value={filtros.busca}
                  onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                />
              </div>
              <Select value={filtros.status || 'all'} onValueChange={(v) => setFiltros({ ...filtros, status: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_ATA).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtros.ano || 'all'} onValueChange={(v) => setFiltros({ ...filtros, ano: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {anos.map(ano => (
                    <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {atasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhuma ata encontrada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {atasFiltradas.map((ata) => {
                const percentualSaldo = calcularPercentualSaldo(Number(ata.valor_total), Number(ata.valor_saldo))
                const diasRestantes = calcularDiasRestantes(ata.data_vigencia_fim)
                
                return (
                  <div key={ata.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={STATUS_ATA[ata.status as keyof typeof STATUS_ATA]?.cor || ''}>
                            {STATUS_ATA[ata.status as keyof typeof STATUS_ATA]?.label || ata.status}
                          </Badge>
                          {ata.permite_adesao && (
                            <Badge variant="outline">
                              <Users className="w-3 h-3 mr-1" />
                              Permite Adesão
                            </Badge>
                          )}
                          {ata.enviado_pncp && (
                            <Badge variant="secondary">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              PNCP
                            </Badge>
                          )}
                        </div>
                        
                        <h3 className="font-semibold text-lg">{ata.numero_ata}</h3>
                        <p className="text-gray-600 text-sm mb-2">{ata.objeto}</p>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {ata.fornecedor_razao_social}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            Vigência: {formatarData(ata.data_vigencia_fim)}
                            {ata.status === 'VIGENTE' && diasRestantes <= 30 && (
                              <Badge variant="secondary" className="ml-1 text-xs">{diasRestantes}d</Badge>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="w-4 h-4" />
                            {ata.itens?.length || 0} itens
                          </span>
                        </div>

                        {/* Barra de Saldo */}
                        <div className="mt-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Saldo: {formatarMoeda(ata.valor_saldo)} ({percentualSaldo}%)</span>
                            <span>Total: {formatarMoeda(ata.valor_total)}</span>
                          </div>
                          <div className="bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                percentualSaldo > 50 ? 'bg-green-500' : 
                                percentualSaldo > 20 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${percentualSaldo}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/orgao/atas/${ata.id}`}>
                            <Eye className="w-4 h-4 mr-1" />
                            Detalhes
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/orgao/atas/${ata.id}/utilizar`}>
                            <Package className="w-4 h-4 mr-1" />
                            Utilizar
                          </Link>
                        </Button>
                        {!ata.enviado_pncp && (
                          <Button variant="outline" size="sm">
                            <Send className="w-4 h-4 mr-1" />
                            PNCP
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
