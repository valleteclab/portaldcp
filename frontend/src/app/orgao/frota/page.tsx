'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Car, Fuel, Wrench, Plus, Pencil, Trash2, Search, Loader2,
  TrendingUp, DollarSign, Droplets, AlertTriangle,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

// ============ TIPOS ============

const TIPOS_VEICULO = ['CARRO', 'CAMINHONETE', 'CAMINHAO', 'ONIBUS', 'MOTO', 'OUTRO']
const TIPOS_COMBUSTIVEL = ['GASOLINA', 'ETANOL', 'DIESEL', 'FLEX', 'GNV', 'ELETRICO']
const TIPOS_MANUTENCAO = ['PREVENTIVA', 'CORRETIVA', 'REVISAO', 'PNEU', 'OUTRO']

interface Veiculo {
  id: string
  placa: string
  modelo: string
  marca: string
  ano: number
  tipo: string
  tipo_combustivel: string
  cor?: string
  km_atual?: number
  responsavel?: string
  ativo: boolean
}

interface Abastecimento {
  id: string
  veiculo_id: string
  veiculo?: { placa: string; modelo: string; marca: string }
  data: string
  quantidade_litros: number
  valor_litro: number
  valor_total: number
  km_hodometro?: number
  tipo_combustivel: string
  posto?: string
  motorista?: string
  nota_fiscal?: string
  observacoes?: string
}

interface Manutencao {
  id: string
  veiculo_id: string
  veiculo?: { placa: string; modelo: string; marca: string }
  data: string
  tipo: string
  descricao: string
  valor: number
  km_hodometro?: number
  prestador?: string
  nota_fiscal?: string
  observacoes?: string
}

interface Resumo {
  total_veiculos: number
  total_abastecimentos: number
  total_litros: number
  valor_abastecimentos: number
  valor_manutencoes: number
  valor_total: number
}

interface RequisicaoAbastecida {
  id: string; codigo: string; solicitante_nome: string; solicitante_cargo?: string
  veiculo_placa: string; veiculo_modelo?: string; tipo_combustivel: string
  quantidade_abastecida?: number; finalidade: string
  data_requisicao: string; data_abastecimento?: string; valor_total?: number
}

// ============ HELPERS ============

const formatarMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const formatarData = (d: string) => {
  if (!d) return '-'
  const [ano, mes, dia] = d.split('T')[0].split('-')
  return `${dia}/${mes}/${ano}`
}

const labelTipo: Record<string, string> = {
  CARRO: 'Carro', CAMINHONETE: 'Caminhonete', CAMINHAO: 'Caminhão',
  ONIBUS: 'Ônibus', MOTO: 'Moto', OUTRO: 'Outro',
  GASOLINA: 'Gasolina', ETANOL: 'Etanol', DIESEL: 'Diesel',
  FLEX: 'Flex', GNV: 'GNV', ELETRICO: 'Elétrico',
  PREVENTIVA: 'Preventiva', CORRETIVA: 'Corretiva',
  REVISAO: 'Revisão', PNEU: 'Pneu', OUTRO2: 'Outro',
}

// ============ ESTADO INICIAL ============

const veiculoVazio = {
  placa: '', modelo: '', marca: '', ano: new Date().getFullYear(),
  tipo: 'CARRO', tipo_combustivel: 'FLEX', cor: '', km_atual: '',
  responsavel: '', observacoes: '',
}

const abastecimentoVazio = {
  veiculo_id: '', data: new Date().toISOString().split('T')[0],
  quantidade_litros: '', valor_litro: '', valor_total: '',
  km_hodometro: '', tipo_combustivel: 'GASOLINA', posto: '',
  motorista: '', nota_fiscal: '', observacoes: '',
}

const manutencaoVazia = {
  veiculo_id: '', data: new Date().toISOString().split('T')[0],
  tipo: 'PREVENTIVA', descricao: '', valor: '', km_hodometro: '',
  prestador: '', nota_fiscal: '', observacoes: '',
}

// ============ PÁGINA ============

export default function FrotaPage() {
  const [tab, setTab] = useState('veiculos')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7))
  const [filtroVeiculoId, setFiltroVeiculoId] = useState('')

  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([])
  const [requisicoesAbastecidas, setRequisicoesAbastecidas] = useState<RequisicaoAbastecida[]>([])
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)

  // Modais
  const [modalVeiculo, setModalVeiculo] = useState(false)
  const [editandoVeiculo, setEditandoVeiculo] = useState<Veiculo | null>(null)
  const [formVeiculo, setFormVeiculo] = useState(veiculoVazio)

  const [modalAbastecimento, setModalAbastecimento] = useState(false)
  const [editandoAbastecimento, setEditandoAbastecimento] = useState<Abastecimento | null>(null)
  const [formAbastecimento, setFormAbastecimento] = useState(abastecimentoVazio)

  const [modalManutencao, setModalManutencao] = useState(false)
  const [editandoManutencao, setEditandoManutencao] = useState<Manutencao | null>(null)
  const [formManutencao, setFormManutencao] = useState(manutencaoVazia)

  // ============ CARREGAR DADOS ============

  const carregarVeiculos = useCallback(async () => {
    const params = search ? `?search=${encodeURIComponent(search)}` : ''
    const res = await authFetch(`${API_URL}/api/frota/veiculos${params}`)
    if (res.ok) setVeiculos(await res.json())
  }, [search])

  const carregarAbastecimentos = useCallback(async () => {
    const params = new URLSearchParams()
    if (filtroVeiculoId) params.set('veiculo_id', filtroVeiculoId)
    if (filtroMes) {
      const [ano, mes] = filtroMes.split('-')
      params.set('data_inicio', `${ano}-${mes}-01`)
      params.set('data_fim', `${ano}-${mes}-31`)
    }
    const res = await authFetch(`${API_URL}/api/frota/abastecimentos?${params}`)
    if (res.ok) setAbastecimentos(await res.json())
  }, [filtroVeiculoId, filtroMes])

  const carregarRequisicoesAbastecidas = useCallback(async () => {
    const params = new URLSearchParams({ status: 'ABASTECIDO' })
    if (filtroMes) params.set('mes', filtroMes)
    const res = await authFetch(`${API_URL}/api/frota/requisicoes?${params}`)
    if (res.ok) setRequisicoesAbastecidas(await res.json())
  }, [filtroMes])

  const carregarManutencoes = useCallback(async () => {
    const params = new URLSearchParams()
    if (filtroVeiculoId) params.set('veiculo_id', filtroVeiculoId)
    if (filtroMes) {
      const [ano, mes] = filtroMes.split('-')
      params.set('data_inicio', `${ano}-${mes}-01`)
      params.set('data_fim', `${ano}-${mes}-31`)
    }
    const res = await authFetch(`${API_URL}/api/frota/manutencoes?${params}`)
    if (res.ok) setManutencoes(await res.json())
  }, [filtroVeiculoId, filtroMes])

  const carregarResumo = useCallback(async () => {
    const params = filtroMes ? `?mes=${filtroMes}` : ''
    const res = await authFetch(`${API_URL}/api/frota/resumo${params}`)
    if (res.ok) setResumo(await res.json())
  }, [filtroMes])

  useEffect(() => {
    setLoading(true)
    Promise.all([carregarVeiculos(), carregarAbastecimentos(), carregarRequisicoesAbastecidas(), carregarManutencoes(), carregarResumo()])
      .finally(() => setLoading(false))
  }, [carregarVeiculos, carregarAbastecimentos, carregarRequisicoesAbastecidas, carregarManutencoes, carregarResumo])

  const recarregar = () => {
    carregarVeiculos()
    carregarAbastecimentos()
    carregarRequisicoesAbastecidas()
    carregarManutencoes()
    carregarResumo()
  }

  // ============ VEÍCULOS ============

  const abrirModalVeiculo = (v?: Veiculo) => {
    if (v) {
      setEditandoVeiculo(v)
      setFormVeiculo({
        placa: v.placa, modelo: v.modelo, marca: v.marca, ano: v.ano,
        tipo: v.tipo, tipo_combustivel: v.tipo_combustivel, cor: v.cor || '',
        km_atual: v.km_atual?.toString() || '', responsavel: v.responsavel || '', observacoes: '',
      })
    } else {
      setEditandoVeiculo(null)
      setFormVeiculo(veiculoVazio)
    }
    setModalVeiculo(true)
  }

  const salvarVeiculo = async () => {
    setActionLoading(true)
    try {
      const payload = {
        ...formVeiculo,
        ano: Number(formVeiculo.ano),
        km_atual: formVeiculo.km_atual ? Number(formVeiculo.km_atual) : undefined,
      }
      const url = editandoVeiculo
        ? `${API_URL}/api/frota/veiculos/${editandoVeiculo.id}`
        : `${API_URL}/api/frota/veiculos`
      const res = await authFetch(url, {
        method: editandoVeiculo ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao salvar'); return }
      setModalVeiculo(false)
      recarregar()
    } finally { setActionLoading(false) }
  }

  const excluirVeiculo = async (id: string, placa: string) => {
    if (!confirm(`Excluir o veículo ${placa}? Todos os registros associados serão removidos.`)) return
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/frota/veiculos/${id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao excluir'); return }
      recarregar()
    } finally { setActionLoading(false) }
  }

  // ============ ABASTECIMENTOS ============

  const abrirModalAbastecimento = (a?: Abastecimento) => {
    if (a) {
      setEditandoAbastecimento(a)
      setFormAbastecimento({
        veiculo_id: a.veiculo_id, data: a.data?.split('T')[0] || '',
        quantidade_litros: a.quantidade_litros?.toString() || '',
        valor_litro: a.valor_litro?.toString() || '',
        valor_total: a.valor_total?.toString() || '',
        km_hodometro: a.km_hodometro?.toString() || '',
        tipo_combustivel: a.tipo_combustivel, posto: a.posto || '',
        motorista: a.motorista || '', nota_fiscal: a.nota_fiscal || '', observacoes: a.observacoes || '',
      })
    } else {
      setEditandoAbastecimento(null)
      setFormAbastecimento(abastecimentoVazio)
    }
    setModalAbastecimento(true)
  }

  const calcularValorTotal = (qtd: string, vlr: string) => {
    const q = parseFloat(qtd) || 0
    const v = parseFloat(vlr) || 0
    return (q * v).toFixed(2)
  }

  const salvarAbastecimento = async () => {
    setActionLoading(true)
    try {
      const payload = {
        ...formAbastecimento,
        quantidade_litros: parseFloat(formAbastecimento.quantidade_litros) || 0,
        valor_litro: parseFloat(formAbastecimento.valor_litro) || 0,
        valor_total: parseFloat(formAbastecimento.valor_total) || 0,
        km_hodometro: formAbastecimento.km_hodometro ? parseFloat(formAbastecimento.km_hodometro) : undefined,
      }
      const url = editandoAbastecimento
        ? `${API_URL}/api/frota/abastecimentos/${editandoAbastecimento.id}`
        : `${API_URL}/api/frota/abastecimentos`
      const res = await authFetch(url, {
        method: editandoAbastecimento ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao salvar'); return }
      setModalAbastecimento(false)
      recarregar()
    } finally { setActionLoading(false) }
  }

  const excluirAbastecimento = async (id: string) => {
    if (!confirm('Excluir este abastecimento?')) return
    await authFetch(`${API_URL}/api/frota/abastecimentos/${id}`, { method: 'DELETE' })
    recarregar()
  }

  // ============ MANUTENÇÕES ============

  const abrirModalManutencao = (m?: Manutencao) => {
    if (m) {
      setEditandoManutencao(m)
      setFormManutencao({
        veiculo_id: m.veiculo_id, data: m.data?.split('T')[0] || '',
        tipo: m.tipo, descricao: m.descricao, valor: m.valor?.toString() || '',
        km_hodometro: m.km_hodometro?.toString() || '',
        prestador: m.prestador || '', nota_fiscal: m.nota_fiscal || '', observacoes: m.observacoes || '',
      })
    } else {
      setEditandoManutencao(null)
      setFormManutencao(manutencaoVazia)
    }
    setModalManutencao(true)
  }

  const salvarManutencao = async () => {
    setActionLoading(true)
    try {
      const payload = {
        ...formManutencao,
        valor: parseFloat(formManutencao.valor) || 0,
        km_hodometro: formManutencao.km_hodometro ? parseFloat(formManutencao.km_hodometro) : undefined,
      }
      const url = editandoManutencao
        ? `${API_URL}/api/frota/manutencoes/${editandoManutencao.id}`
        : `${API_URL}/api/frota/manutencoes`
      const res = await authFetch(url, {
        method: editandoManutencao ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao salvar'); return }
      setModalManutencao(false)
      recarregar()
    } finally { setActionLoading(false) }
  }

  const excluirManutencao = async (id: string) => {
    if (!confirm('Excluir esta manutenção?')) return
    await authFetch(`${API_URL}/api/frota/manutencoes/${id}`, { method: 'DELETE' })
    recarregar()
  }

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="w-7 h-7 text-blue-600" />
            Controle de Frota e Combustível
          </h1>
          <p className="text-gray-500 mt-1">Gerencie veículos, abastecimentos e manutenções</p>
        </div>
        <div className="flex gap-2 items-center">
          <Label>Mês</Label>
          <Input
            type="month" className="w-40"
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
          />
        </div>
      </div>

      {/* Cards de Resumo */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-blue-600 mb-1"><Car className="w-4 h-4" /><span className="text-xs font-medium">Veículos</span></div>
              <p className="text-2xl font-bold">{resumo.total_veiculos}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-green-600 mb-1"><Fuel className="w-4 h-4" /><span className="text-xs font-medium">Abastec.</span></div>
              <p className="text-2xl font-bold">{resumo.total_abastecimentos}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-cyan-600 mb-1"><Droplets className="w-4 h-4" /><span className="text-xs font-medium">Litros</span></div>
              <p className="text-2xl font-bold">{resumo.total_litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-green-700 mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs font-medium">Combustível</span></div>
              <p className="text-lg font-bold">{formatarMoeda(resumo.valor_abastecimentos)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-orange-600 mb-1"><Wrench className="w-4 h-4" /><span className="text-xs font-medium">Manutenção</span></div>
              <p className="text-lg font-bold">{formatarMoeda(resumo.valor_manutencoes)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-purple-600 mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs font-medium">Total</span></div>
              <p className="text-lg font-bold">{formatarMoeda(resumo.valor_total)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="veiculos"><Car className="w-4 h-4 mr-1" />Veículos</TabsTrigger>
          <TabsTrigger value="abastecimentos"><Fuel className="w-4 h-4 mr-1" />Abastecimentos</TabsTrigger>
          <TabsTrigger value="manutencoes"><Wrench className="w-4 h-4 mr-1" />Manutenções</TabsTrigger>
        </TabsList>

        {/* ===== ABA VEÍCULOS ===== */}
        <TabsContent value="veiculos" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-9" placeholder="Buscar por placa, modelo ou marca..."
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={() => abrirModalVeiculo()}>
              <Plus className="w-4 h-4 mr-2" />Novo Veículo
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placa</TableHead>
                    <TableHead>Modelo / Marca</TableHead>
                    <TableHead>Ano</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Combustível</TableHead>
                    <TableHead>KM Atual</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {veiculos.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">Nenhum veículo cadastrado</TableCell></TableRow>
                  )}
                  {veiculos.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono font-bold">{v.placa}</TableCell>
                      <TableCell>{v.modelo} <span className="text-gray-400">({v.marca})</span></TableCell>
                      <TableCell>{v.ano}</TableCell>
                      <TableCell>{labelTipo[v.tipo] || v.tipo}</TableCell>
                      <TableCell>{labelTipo[v.tipo_combustivel] || v.tipo_combustivel}</TableCell>
                      <TableCell>{v.km_atual ? `${Number(v.km_atual).toLocaleString('pt-BR')} km` : '-'}</TableCell>
                      <TableCell>{v.responsavel || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={v.ativo ? 'default' : 'secondary'}>
                          {v.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => abrirModalVeiculo(v)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => excluirVeiculo(v.id, v.placa)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ABA ABASTECIMENTOS ===== */}
        <TabsContent value="abastecimentos" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={filtroVeiculoId || '_todos'} onValueChange={v => setFiltroVeiculoId(v === '_todos' ? '' : v)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Todos os veículos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_todos">Todos os veículos</SelectItem>
                {veiculos.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button onClick={() => abrirModalAbastecimento()}>
              <Plus className="w-4 h-4 mr-2" />Novo Abastecimento
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Combustível</TableHead>
                    <TableHead>Litros</TableHead>
                    <TableHead>Valor/L</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>KM</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {abastecimentos.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">Nenhum abastecimento registrado</TableCell></TableRow>
                  )}
                  {abastecimentos.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{formatarData(a.data)}</TableCell>
                      <TableCell className="font-mono">{a.veiculo?.placa || '-'} <span className="text-gray-400 font-sans text-xs">{a.veiculo?.modelo}</span></TableCell>
                      <TableCell><Badge variant="outline">{labelTipo[a.tipo_combustivel] || a.tipo_combustivel}</Badge></TableCell>
                      <TableCell>{Number(a.quantidade_litros).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L</TableCell>
                      <TableCell>{formatarMoeda(a.valor_litro)}</TableCell>
                      <TableCell className="font-semibold">{formatarMoeda(a.valor_total)}</TableCell>
                      <TableCell>{a.km_hodometro ? `${Number(a.km_hodometro).toLocaleString('pt-BR')} km` : '-'}</TableCell>
                      <TableCell>{a.motorista || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => abrirModalAbastecimento(a)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => excluirAbastecimento(a.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Totais */}
          {abastecimentos.length > 0 && (
            <div className="flex justify-end gap-6 text-sm text-gray-600 px-2">
              <span>Total litros: <strong>{abastecimentos.reduce((s, a) => s + Number(a.quantidade_litros), 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L</strong></span>
              <span>Total gasto: <strong className="text-green-700">{formatarMoeda(abastecimentos.reduce((s, a) => s + Number(a.valor_total), 0))}</strong></span>
            </div>
          )}

          {/* Abastecimentos via Requisição */}
          {requisicoesAbastecidas.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Fuel className="w-4 h-4 text-green-600" />
                Abastecimentos via Requisição ({requisicoesAbastecidas.length})
              </h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs uppercase text-gray-500">
                        <TableHead>Código</TableHead>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Combustível</TableHead>
                        <TableHead className="text-right">Litros</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Data Abastecimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisicoesAbastecidas.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-blue-600 text-sm font-medium">{r.codigo}</TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{r.solicitante_nome}</p>
                            {r.solicitante_cargo && <p className="text-xs text-gray-400">{r.solicitante_cargo}</p>}
                          </TableCell>
                          <TableCell className="font-mono font-semibold">{r.veiculo_placa}</TableCell>
                          <TableCell><Badge variant="outline">{labelTipo[r.tipo_combustivel] || r.tipo_combustivel}</Badge></TableCell>
                          <TableCell className="text-right font-semibold text-orange-600">
                            {Number(r.quantidade_abastecida || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-700">
                            {formatarMoeda(Number(r.valor_total || 0))}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {r.data_abastecimento ? formatarData(r.data_abastecimento) : formatarData(r.data_requisicao)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <div className="flex justify-end gap-6 text-sm text-gray-600 px-2 mt-2">
                <span>Total: <strong>{requisicoesAbastecidas.reduce((s, r) => s + Number(r.quantidade_abastecida || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 })} L</strong></span>
                <span><strong className="text-green-700">{formatarMoeda(requisicoesAbastecidas.reduce((s, r) => s + Number(r.valor_total || 0), 0))}</strong></span>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== ABA MANUTENÇÕES ===== */}
        <TabsContent value="manutencoes" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={filtroVeiculoId || '_todos'} onValueChange={v => setFiltroVeiculoId(v === '_todos' ? '' : v)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Todos os veículos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_todos">Todos os veículos</SelectItem>
                {veiculos.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button onClick={() => abrirModalManutencao()}>
              <Plus className="w-4 h-4 mr-2" />Nova Manutenção
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>KM</TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manutencoes.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">Nenhuma manutenção registrada</TableCell></TableRow>
                  )}
                  {manutencoes.map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{formatarData(m.data)}</TableCell>
                      <TableCell className="font-mono">{m.veiculo?.placa || '-'} <span className="text-gray-400 font-sans text-xs">{m.veiculo?.modelo}</span></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          m.tipo === 'CORRETIVA' ? 'border-red-300 text-red-700' :
                          m.tipo === 'PREVENTIVA' ? 'border-green-300 text-green-700' : ''
                        }>
                          {labelTipo[m.tipo] || m.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{m.descricao}</TableCell>
                      <TableCell className="font-semibold">{formatarMoeda(m.valor)}</TableCell>
                      <TableCell>{m.km_hodometro ? `${Number(m.km_hodometro).toLocaleString('pt-BR')} km` : '-'}</TableCell>
                      <TableCell>{m.prestador || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => abrirModalManutencao(m)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => excluirManutencao(m.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {manutencoes.length > 0 && (
            <div className="flex justify-end text-sm text-gray-600 px-2">
              <span>Total gasto: <strong className="text-orange-700">{formatarMoeda(manutencoes.reduce((s, m) => s + Number(m.valor), 0))}</strong></span>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== MODAL VEÍCULO ===== */}
      <Dialog open={modalVeiculo} onOpenChange={setModalVeiculo}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoVeiculo ? 'Editar Veículo' : 'Novo Veículo'}</DialogTitle>
            <DialogDescription>Preencha os dados do veículo</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Placa *</Label>
              <Input
                placeholder="ABC-1234" value={formVeiculo.placa}
                onChange={e => setFormVeiculo({ ...formVeiculo, placa: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label>Modelo *</Label>
              <Input value={formVeiculo.modelo} onChange={e => setFormVeiculo({ ...formVeiculo, modelo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Marca *</Label>
              <Input value={formVeiculo.marca} onChange={e => setFormVeiculo({ ...formVeiculo, marca: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Ano *</Label>
              <Input type="number" min={1990} max={2030} value={formVeiculo.ano}
                onChange={e => setFormVeiculo({ ...formVeiculo, ano: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={formVeiculo.tipo} onValueChange={v => setFormVeiculo({ ...formVeiculo, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_VEICULO.map(t => <SelectItem key={t} value={t}>{labelTipo[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Combustível *</Label>
              <Select value={formVeiculo.tipo_combustivel} onValueChange={v => setFormVeiculo({ ...formVeiculo, tipo_combustivel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_COMBUSTIVEL.map(t => <SelectItem key={t} value={t}>{labelTipo[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Input value={formVeiculo.cor} onChange={e => setFormVeiculo({ ...formVeiculo, cor: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>KM Atual</Label>
              <Input type="number" min={0} value={formVeiculo.km_atual}
                onChange={e => setFormVeiculo({ ...formVeiculo, km_atual: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Responsável</Label>
              <Input value={formVeiculo.responsavel} onChange={e => setFormVeiculo({ ...formVeiculo, responsavel: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalVeiculo(false)}>Cancelar</Button>
            <Button onClick={salvarVeiculo} disabled={actionLoading || !formVeiculo.placa || !formVeiculo.modelo || !formVeiculo.marca}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editandoVeiculo ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL ABASTECIMENTO ===== */}
      <Dialog open={modalAbastecimento} onOpenChange={setModalAbastecimento}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoAbastecimento ? 'Editar Abastecimento' : 'Novo Abastecimento'}</DialogTitle>
            <DialogDescription>Registre os dados do abastecimento</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Veículo *</Label>
              <Select value={formAbastecimento.veiculo_id} onValueChange={v => setFormAbastecimento({ ...formAbastecimento, veiculo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o veículo" /></SelectTrigger>
                <SelectContent>
                  {veiculos.filter(v => v.ativo).map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo} ({v.marca})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={formAbastecimento.data}
                onChange={e => setFormAbastecimento({ ...formAbastecimento, data: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo Combustível *</Label>
              <Select value={formAbastecimento.tipo_combustivel} onValueChange={v => setFormAbastecimento({ ...formAbastecimento, tipo_combustivel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_COMBUSTIVEL.map(t => <SelectItem key={t} value={t}>{labelTipo[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>KM Hodômetro</Label>
              <Input type="number" min={0} placeholder="0"
                value={formAbastecimento.km_hodometro}
                onChange={e => setFormAbastecimento({ ...formAbastecimento, km_hodometro: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Quantidade (litros) *</Label>
              <Input type="number" step="0.001" min="0" placeholder="0,000"
                value={formAbastecimento.quantidade_litros}
                onChange={e => {
                  const qtd = e.target.value
                  const total = calcularValorTotal(qtd, formAbastecimento.valor_litro)
                  setFormAbastecimento({ ...formAbastecimento, quantidade_litros: qtd, valor_total: total })
                }} />
            </div>
            <div className="space-y-2">
              <Label>Valor por Litro (R$) *</Label>
              <Input type="number" step="0.0001" min="0" placeholder="0,0000"
                value={formAbastecimento.valor_litro}
                onChange={e => {
                  const vlr = e.target.value
                  const total = calcularValorTotal(formAbastecimento.quantidade_litros, vlr)
                  setFormAbastecimento({ ...formAbastecimento, valor_litro: vlr, valor_total: total })
                }} />
            </div>
            <div className="space-y-2">
              <Label>Valor Total (R$) *</Label>
              <Input type="number" step="0.01" min="0"
                value={formAbastecimento.valor_total}
                onChange={e => setFormAbastecimento({ ...formAbastecimento, valor_total: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Posto</Label>
              <Input value={formAbastecimento.posto}
                onChange={e => setFormAbastecimento({ ...formAbastecimento, posto: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Motorista</Label>
              <Input value={formAbastecimento.motorista}
                onChange={e => setFormAbastecimento({ ...formAbastecimento, motorista: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nota Fiscal</Label>
              <Input value={formAbastecimento.nota_fiscal}
                onChange={e => setFormAbastecimento({ ...formAbastecimento, nota_fiscal: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={formAbastecimento.observacoes}
                onChange={e => setFormAbastecimento({ ...formAbastecimento, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAbastecimento(false)}>Cancelar</Button>
            <Button onClick={salvarAbastecimento} disabled={
              actionLoading || !formAbastecimento.veiculo_id || !formAbastecimento.data ||
              !formAbastecimento.quantidade_litros || !formAbastecimento.valor_litro
            }>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editandoAbastecimento ? 'Salvar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== MODAL MANUTENÇÃO ===== */}
      <Dialog open={modalManutencao} onOpenChange={setModalManutencao}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoManutencao ? 'Editar Manutenção' : 'Nova Manutenção'}</DialogTitle>
            <DialogDescription>Registre os dados da manutenção do veículo</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Veículo *</Label>
              <Select value={formManutencao.veiculo_id} onValueChange={v => setFormManutencao({ ...formManutencao, veiculo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o veículo" /></SelectTrigger>
                <SelectContent>
                  {veiculos.filter(v => v.ativo).map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo} ({v.marca})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={formManutencao.data}
                onChange={e => setFormManutencao({ ...formManutencao, data: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={formManutencao.tipo} onValueChange={v => setFormManutencao({ ...formManutencao, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_MANUTENCAO.map(t => <SelectItem key={t} value={t}>{labelTipo[t] || t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00"
                value={formManutencao.valor}
                onChange={e => setFormManutencao({ ...formManutencao, valor: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Troca de óleo e filtro"
                value={formManutencao.descricao}
                onChange={e => setFormManutencao({ ...formManutencao, descricao: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>KM Hodômetro</Label>
              <Input type="number" min={0}
                value={formManutencao.km_hodometro}
                onChange={e => setFormManutencao({ ...formManutencao, km_hodometro: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Prestador</Label>
              <Input placeholder="Nome da oficina/prestador"
                value={formManutencao.prestador}
                onChange={e => setFormManutencao({ ...formManutencao, prestador: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nota Fiscal</Label>
              <Input value={formManutencao.nota_fiscal}
                onChange={e => setFormManutencao({ ...formManutencao, nota_fiscal: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={formManutencao.observacoes}
                onChange={e => setFormManutencao({ ...formManutencao, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalManutencao(false)}>Cancelar</Button>
            <Button onClick={salvarManutencao} disabled={
              actionLoading || !formManutencao.veiculo_id || !formManutencao.data ||
              !formManutencao.descricao || !formManutencao.valor
            }>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editandoManutencao ? 'Salvar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
