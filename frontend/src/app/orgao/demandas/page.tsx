'use client'

import { useState, useEffect } from 'react'
import { 
  Plus, 
  FileText, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Package,
  Wrench,
  Eye,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  Building2,
  Calendar,
  AlertCircle,
  ArrowRight,
  Loader2,
  Save,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { BuscaItemCatalogoProprio, BuscaClassificacao } from '@/components/catalogo'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Tipos
interface ItemDemanda {
  id: string
  categoria: 'MATERIAL' | 'SERVICO'
  codigo_classe?: string
  nome_classe?: string
  codigo_item_catalogo?: string
  descricao_objeto: string
  justificativa?: string
  quantidade_estimada: number
  unidade_medida: string
  valor_unitario_estimado?: number
  valor_total_estimado?: number
  trimestre_previsto?: number
  data_desejada_contratacao?: string
  renovacao_contrato: boolean
  prioridade: number
  catalogo_utilizado: string
}

interface Demanda {
  id: string
  orgao_id: string
  ano_referencia: number
  unidade_requisitante: string
  responsavel_nome?: string
  responsavel_email?: string
  responsavel_telefone?: string
  status: 'RASCUNHO' | 'ENVIADA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONSOLIDADA'
  observacoes?: string
  data_envio?: string
  data_aprovacao?: string
  aprovado_por?: string
  motivo_rejeicao?: string
  pca_id?: string
  created_at: string
  itens: ItemDemanda[]
}

interface Estatisticas {
  total: number
  porStatus: { status: string; total: number; valor: number }[]
  porUnidade: { unidade: string; total: number; valor: number }[]
  valorTotal: number
}

// Configuração de status
const STATUS_CONFIG: Record<string, { label: string; cor: string; icon: any }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-800', icon: FileText },
  ENVIADA: { label: 'Enviada', cor: 'bg-blue-100 text-blue-800', icon: Send },
  EM_ANALISE: { label: 'Em Análise', cor: 'bg-yellow-100 text-yellow-800', icon: Clock },
  APROVADA: { label: 'Aprovada', cor: 'bg-green-100 text-green-800', icon: CheckCircle },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-800', icon: XCircle },
  CONSOLIDADA: { label: 'Consolidada', cor: 'bg-purple-100 text-purple-800', icon: CheckCircle }
}

const PRIORIDADE_CONFIG: Record<number, { label: string; cor: string }> = {
  1: { label: 'Muito Alta', cor: 'bg-red-100 text-red-800' },
  2: { label: 'Alta', cor: 'bg-orange-100 text-orange-800' },
  3: { label: 'Média', cor: 'bg-yellow-100 text-yellow-800' },
  4: { label: 'Baixa', cor: 'bg-blue-100 text-blue-800' },
  5: { label: 'Muito Baixa', cor: 'bg-gray-100 text-gray-800' }
}

export default function DemandasPage() {
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null)
  const [loading, setLoading] = useState(true)
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear() + 1)
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS')
  const [filtroUnidade, setFiltroUnidade] = useState<string>('TODAS')
  const [unidades, setUnidades] = useState<string[]>([])
  const [termoBusca, setTermoBusca] = useState('')
  
  // Estados para modais
  const [showNovaDemanda, setShowNovaDemanda] = useState(false)
  const [showDetalhes, setShowDetalhes] = useState(false)
  const [demandaSelecionada, setDemandaSelecionada] = useState<Demanda | null>(null)
  const [demandaExpandida, setDemandaExpandida] = useState<string | null>(null)
  
  // Estado para nova demanda
  const [novaDemanda, setNovaDemanda] = useState({
    unidade_requisitante: '',
    responsavel_nome: '',
    responsavel_email: '',
    responsavel_telefone: '',
    observacoes: ''
  })
  const [salvando, setSalvando] = useState(false)

  // Simular orgaoId (em produção viria do contexto de autenticação)
  const orgaoId = 'orgao-teste-id'

  useEffect(() => {
    carregarDados()
  }, [anoSelecionado])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [demandasRes, estatisticasRes, unidadesRes] = await Promise.all([
        fetch(`${API_URL}/api/demandas?orgaoId=${orgaoId}&ano=${anoSelecionado}`),
        fetch(`${API_URL}/api/demandas/estatisticas?orgaoId=${orgaoId}&ano=${anoSelecionado}`),
        fetch(`${API_URL}/api/demandas/unidades?orgaoId=${orgaoId}`)
      ])

      if (demandasRes.ok) {
        const data = await demandasRes.json()
        setDemandas(data)
      }

      if (estatisticasRes.ok) {
        const data = await estatisticasRes.json()
        setEstatisticas(data)
      }

      if (unidadesRes.ok) {
        const data = await unidadesRes.json()
        setUnidades(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const criarDemanda = async () => {
    if (!novaDemanda.unidade_requisitante) {
      alert('Informe a unidade requisitante')
      return
    }

    setSalvando(true)
    try {
      const response = await fetch(`${API_URL}/api/demandas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgaoId,
          ano_referencia: anoSelecionado,
          ...novaDemanda
        })
      })

      if (response.ok) {
        const demandaCriada = await response.json()
        setShowNovaDemanda(false)
        setNovaDemanda({
          unidade_requisitante: '',
          responsavel_nome: '',
          responsavel_email: '',
          responsavel_telefone: '',
          observacoes: ''
        })
        // Abrir detalhes da demanda criada para adicionar itens
        setDemandaSelecionada(demandaCriada)
        setShowDetalhes(true)
        carregarDados()
      }
    } catch (error) {
      console.error('Erro ao criar demanda:', error)
      alert('Erro ao criar demanda')
    } finally {
      setSalvando(false)
    }
  }

  const enviarDemanda = async (demandaId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/demandas/${demandaId}/enviar`, {
        method: 'PATCH'
      })

      if (response.ok) {
        carregarDados()
        if (demandaSelecionada?.id === demandaId) {
          const updated = await response.json()
          setDemandaSelecionada(updated)
        }
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao enviar demanda')
      }
    } catch (error) {
      console.error('Erro ao enviar demanda:', error)
    }
  }

  const excluirDemanda = async (demandaId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta demanda?')) return

    try {
      const response = await fetch(`${API_URL}/api/demandas/${demandaId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        carregarDados()
        if (demandaSelecionada?.id === demandaId) {
          setShowDetalhes(false)
          setDemandaSelecionada(null)
        }
      }
    } catch (error) {
      console.error('Erro ao excluir demanda:', error)
    }
  }

  // Filtrar demandas
  const demandasFiltradas = demandas.filter(d => {
    if (filtroStatus !== 'TODOS' && d.status !== filtroStatus) return false
    if (filtroUnidade !== 'TODAS' && d.unidade_requisitante !== filtroUnidade) return false
    if (termoBusca) {
      const termo = termoBusca.toLowerCase()
      const matchUnidade = d.unidade_requisitante.toLowerCase().includes(termo)
      const matchResponsavel = d.responsavel_nome?.toLowerCase().includes(termo)
      const matchItem = d.itens.some(i => i.descricao_objeto.toLowerCase().includes(termo))
      if (!matchUnidade && !matchResponsavel && !matchItem) return false
    }
    return true
  })

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  const calcularTotalDemanda = (itens: ItemDemanda[]) => {
    return itens.reduce((acc, item) => acc + (Number(item.valor_total_estimado) || 0), 0)
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Demandas de Contratação
          </h1>
          <p className="text-gray-500">
            Gerencie as demandas das áreas para o PCA {anoSelecionado}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(anoSelecionado)} onValueChange={(v) => setAnoSelecionado(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map(ano => (
                <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowNovaDemanda(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Demanda
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      {estatisticas && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{estatisticas.total}</div>
              <p className="text-sm text-gray-500">Total de Demandas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {estatisticas.porStatus.find(s => s.status === 'APROVADA')?.total || 0}
              </div>
              <p className="text-sm text-gray-500">Aprovadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {estatisticas.porStatus.find(s => s.status === 'ENVIADA')?.total || 0}
              </div>
              <p className="text-sm text-gray-500">Aguardando Aprovação</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {formatarMoeda(estatisticas.valorTotal)}
              </div>
              <p className="text-sm text-gray-500">Valor Total Estimado</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por unidade, responsável ou item..."
                  value={termoBusca}
                  onChange={(e) => setTermoBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroUnidade} onValueChange={setFiltroUnidade}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as Unidades</SelectItem>
                {unidades.map(unidade => (
                  <SelectItem key={unidade} value={unidade}>{unidade}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Demandas */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : demandasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600">Nenhuma demanda encontrada</h3>
            <p className="text-gray-500 mt-1">
              {demandas.length === 0 
                ? 'Clique em "Nova Demanda" para criar a primeira demanda.'
                : 'Tente ajustar os filtros de busca.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {demandasFiltradas.map(demanda => {
            const StatusIcon = STATUS_CONFIG[demanda.status]?.icon || FileText
            const isExpanded = demandaExpandida === demanda.id
            const totalValor = calcularTotalDemanda(demanda.itens)

            return (
              <Card key={demanda.id} className="overflow-hidden">
                <div 
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setDemandaExpandida(isExpanded ? null : demanda.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        <Building2 className="h-5 w-5 text-gray-400" />
                      </div>
                      <div>
                        <h3 className="font-medium">{demanda.unidade_requisitante}</h3>
                        <p className="text-sm text-gray-500">
                          {demanda.responsavel_nome || 'Sem responsável definido'}
                          {demanda.responsavel_email && ` • ${demanda.responsavel_email}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-medium">{demanda.itens.length} {demanda.itens.length === 1 ? 'item' : 'itens'}</div>
                        <div className="text-sm text-gray-500">{formatarMoeda(totalValor)}</div>
                      </div>
                      <Badge className={STATUS_CONFIG[demanda.status]?.cor}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {STATUS_CONFIG[demanda.status]?.label}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Itens expandidos */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    {demanda.itens.length === 0 ? (
                      <p className="text-center text-gray-500 py-4">Nenhum item cadastrado</p>
                    ) : (
                      <div className="space-y-2">
                        {demanda.itens.map(item => (
                          <div key={item.id} className="bg-white p-3 rounded-lg border flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {item.categoria === 'MATERIAL' ? (
                                <Package className="h-4 w-4 text-blue-500" />
                              ) : (
                                <Wrench className="h-4 w-4 text-purple-500" />
                              )}
                              <div>
                                <div className="font-medium">{item.descricao_objeto}</div>
                                <div className="text-sm text-gray-500">
                                  {item.codigo_item_catalogo && <span className="font-mono mr-2">{item.codigo_item_catalogo}</span>}
                                  {item.quantidade_estimada} {item.unidade_medida}
                                  {item.trimestre_previsto && ` • ${item.trimestre_previsto}º Trimestre`}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">{formatarMoeda(Number(item.valor_total_estimado) || 0)}</div>
                              <Badge className={PRIORIDADE_CONFIG[item.prioridade]?.cor} variant="outline">
                                {PRIORIDADE_CONFIG[item.prioridade]?.label}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDemandaSelecionada(demanda)
                          setShowDetalhes(true)
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Detalhes
                      </Button>
                      {demanda.status === 'RASCUNHO' && (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              excluirDemanda(demanda.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </Button>
                          <Button 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              enviarDemanda(demanda.id)
                            }}
                            disabled={demanda.itens.length === 0}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Enviar para Aprovação
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Nova Demanda */}
      <Dialog open={showNovaDemanda} onOpenChange={setShowNovaDemanda}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nova Demanda de Contratação
            </DialogTitle>
            <DialogDescription>
              Crie uma nova demanda para o PCA {anoSelecionado}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1">Unidade Requisitante *</label>
              <Input
                value={novaDemanda.unidade_requisitante}
                onChange={(e) => setNovaDemanda({...novaDemanda, unidade_requisitante: e.target.value})}
                placeholder="Ex: Departamento de TI, Setor de Compras..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome do Responsável</label>
                <Input
                  value={novaDemanda.responsavel_nome}
                  onChange={(e) => setNovaDemanda({...novaDemanda, responsavel_nome: e.target.value})}
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Telefone</label>
                <Input
                  value={novaDemanda.responsavel_telefone}
                  onChange={(e) => setNovaDemanda({...novaDemanda, responsavel_telefone: e.target.value})}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">E-mail do Responsável</label>
              <Input
                type="email"
                value={novaDemanda.responsavel_email}
                onChange={(e) => setNovaDemanda({...novaDemanda, responsavel_email: e.target.value})}
                placeholder="email@orgao.gov.br"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Observações</label>
              <Textarea
                value={novaDemanda.observacoes}
                onChange={(e) => setNovaDemanda({...novaDemanda, observacoes: e.target.value})}
                placeholder="Informações adicionais sobre a demanda..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovaDemanda(false)}>
              Cancelar
            </Button>
            <Button onClick={criarDemanda} disabled={salvando}>
              {salvando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Criar Demanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhes da Demanda */}
      <DetalhesDemandaModal
        demanda={demandaSelecionada}
        open={showDetalhes}
        onClose={() => {
          setShowDetalhes(false)
          setDemandaSelecionada(null)
        }}
        onUpdate={() => carregarDados()}
        onEnviar={() => demandaSelecionada && enviarDemanda(demandaSelecionada.id)}
      />
    </div>
  )
}

// Componente Modal de Detalhes
function DetalhesDemandaModal({ 
  demanda, 
  open, 
  onClose, 
  onUpdate,
  onEnviar 
}: { 
  demanda: Demanda | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
  onEnviar: () => void
}) {
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [novoItem, setNovoItem] = useState({
    categoria: 'SERVICO' as 'MATERIAL' | 'SERVICO',
    codigo_classe: '',
    nome_classe: '',
    codigo_item_catalogo: '',
    descricao_objeto: '',
    justificativa: '',
    quantidade_estimada: '1',
    unidade_medida: 'UN',
    valor_unitario_estimado: '',
    trimestre_previsto: '1',
    prioridade: '3',
    renovacao_contrato: false,
    catalogo_utilizado: 'OUTROS'
  })

  if (!demanda) return null

  const StatusIcon = STATUS_CONFIG[demanda.status]?.icon || FileText
  const podeEditar = demanda.status === 'RASCUNHO'
  const totalValor = demanda.itens.reduce((acc, item) => acc + (Number(item.valor_total_estimado) || 0), 0)

  const adicionarItem = async () => {
    if (!novoItem.descricao_objeto) {
      alert('Informe a descrição do item')
      return
    }

    setSalvando(true)
    try {
      const valorUnitario = parseFloat(novoItem.valor_unitario_estimado) || 0
      const quantidade = parseFloat(novoItem.quantidade_estimada) || 1

      const response = await fetch(`${API_URL}/api/demandas/${demanda.id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...novoItem,
          quantidade_estimada: quantidade,
          valor_unitario_estimado: valorUnitario,
          valor_total_estimado: valorUnitario * quantidade,
          trimestre_previsto: parseInt(novoItem.trimestre_previsto),
          prioridade: parseInt(novoItem.prioridade)
        })
      })

      if (response.ok) {
        setShowNovoItem(false)
        setNovoItem({
          categoria: 'SERVICO',
          codigo_classe: '',
          nome_classe: '',
          codigo_item_catalogo: '',
          descricao_objeto: '',
          justificativa: '',
          quantidade_estimada: '1',
          unidade_medida: 'UN',
          valor_unitario_estimado: '',
          trimestre_previsto: '1',
          prioridade: '3',
          renovacao_contrato: false,
          catalogo_utilizado: 'OUTROS'
        })
        onUpdate()
      }
    } catch (error) {
      console.error('Erro ao adicionar item:', error)
    } finally {
      setSalvando(false)
    }
  }

  const removerItem = async (itemId: string) => {
    if (!confirm('Remover este item?')) return

    try {
      await fetch(`${API_URL}/api/demandas/itens/${itemId}`, { method: 'DELETE' })
      onUpdate()
    } catch (error) {
      console.error('Erro ao remover item:', error)
    }
  }

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {demanda.unidade_requisitante}
            </DialogTitle>
            <Badge className={STATUS_CONFIG[demanda.status]?.cor}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {STATUS_CONFIG[demanda.status]?.label}
            </Badge>
          </div>
          <DialogDescription>
            Demanda para o PCA {demanda.ano_referencia}
            {demanda.responsavel_nome && ` • Responsável: ${demanda.responsavel_nome}`}
          </DialogDescription>
        </DialogHeader>

        {/* Informações da Demanda */}
        <div className="grid grid-cols-3 gap-4 py-4 border-b">
          <div>
            <div className="text-sm text-gray-500">Total de Itens</div>
            <div className="text-xl font-bold">{demanda.itens.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Valor Total</div>
            <div className="text-xl font-bold text-blue-600">{formatarMoeda(totalValor)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Criada em</div>
            <div className="text-xl font-bold">
              {new Date(demanda.created_at).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>

        {/* Motivo de Rejeição */}
        {demanda.status === 'REJEITADA' && demanda.motivo_rejeicao && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <div className="font-medium text-red-800">Motivo da Rejeição</div>
                <p className="text-red-700">{demanda.motivo_rejeicao}</p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de Itens */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Itens da Demanda</h3>
            {podeEditar && (
              <Button size="sm" onClick={() => setShowNovoItem(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Item
              </Button>
            )}
          </div>

          {demanda.itens.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Package className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500">Nenhum item cadastrado</p>
              {podeEditar && (
                <Button variant="outline" className="mt-4" onClick={() => setShowNovoItem(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar primeiro item
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {demanda.itens.map(item => (
                <div key={item.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {item.categoria === 'MATERIAL' ? (
                        <Package className="h-5 w-5 text-blue-500 mt-1" />
                      ) : (
                        <Wrench className="h-5 w-5 text-purple-500 mt-1" />
                      )}
                      <div>
                        <div className="font-medium">{item.descricao_objeto}</div>
                        <div className="text-sm text-gray-500 space-x-2">
                          {item.codigo_item_catalogo && (
                            <span className="font-mono bg-gray-200 px-1 rounded">{item.codigo_item_catalogo}</span>
                          )}
                          {item.nome_classe && <span>• {item.nome_classe}</span>}
                        </div>
                        {item.justificativa && (
                          <p className="text-sm text-gray-600 mt-1">{item.justificativa}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span>{item.quantidade_estimada} {item.unidade_medida}</span>
                          {item.trimestre_previsto && <span>• {item.trimestre_previsto}º Trimestre</span>}
                          {item.renovacao_contrato && (
                            <Badge variant="outline" className="text-xs">Renovação</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatarMoeda(Number(item.valor_total_estimado) || 0)}</div>
                      <div className="text-sm text-gray-500">
                        {formatarMoeda(Number(item.valor_unitario_estimado) || 0)} / {item.unidade_medida}
                      </div>
                      <Badge className={PRIORIDADE_CONFIG[item.prioridade]?.cor} variant="outline">
                        {PRIORIDADE_CONFIG[item.prioridade]?.label}
                      </Badge>
                      {podeEditar && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="mt-2 text-red-500"
                          onClick={() => removerItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulário de Novo Item */}
        {showNovoItem && (
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Novo Item
            </h4>
            <div className="space-y-4">
              {/* Busca no Catálogo */}
              <div>
                <label className="block text-sm font-medium mb-1">Buscar Item no Catálogo</label>
                <BuscaItemCatalogoProprio
                  placeholder="Buscar item existente..."
                  onChange={(item) => {
                    if (item) {
                      setNovoItem({
                        ...novoItem,
                        codigo_item_catalogo: item.codigo,
                        descricao_objeto: item.descricao,
                        categoria: item.tipo,
                        unidade_medida: item.unidade_padrao || 'UN',
                        codigo_classe: item.classificacao?.codigo || '',
                        nome_classe: item.classificacao?.nome || ''
                      })
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Categoria</label>
                  <Select 
                    value={novoItem.categoria} 
                    onValueChange={(v: 'MATERIAL' | 'SERVICO') => setNovoItem({...novoItem, categoria: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SERVICO">Serviço</SelectItem>
                      <SelectItem value="MATERIAL">Material</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Código do Item</label>
                  <Input value={novoItem.codigo_item_catalogo} readOnly className="bg-gray-50" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Descrição *</label>
                <Textarea
                  value={novoItem.descricao_objeto}
                  onChange={(e) => setNovoItem({...novoItem, descricao_objeto: e.target.value})}
                  placeholder="Descreva o material ou serviço..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Quantidade</label>
                  <Input
                    type="number"
                    value={novoItem.quantidade_estimada}
                    onChange={(e) => setNovoItem({...novoItem, quantidade_estimada: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unidade</label>
                  <Select value={novoItem.unidade_medida} onValueChange={(v) => setNovoItem({...novoItem, unidade_medida: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UN">UN</SelectItem>
                      <SelectItem value="MES">MES</SelectItem>
                      <SelectItem value="KG">KG</SelectItem>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                      <SelectItem value="H">H</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor Unitário</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={novoItem.valor_unitario_estimado}
                    onChange={(e) => setNovoItem({...novoItem, valor_unitario_estimado: e.target.value})}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Trimestre</label>
                  <Select value={novoItem.trimestre_previsto} onValueChange={(v) => setNovoItem({...novoItem, trimestre_previsto: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1º Trimestre</SelectItem>
                      <SelectItem value="2">2º Trimestre</SelectItem>
                      <SelectItem value="3">3º Trimestre</SelectItem>
                      <SelectItem value="4">4º Trimestre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Justificativa</label>
                <Textarea
                  value={novoItem.justificativa}
                  onChange={(e) => setNovoItem({...novoItem, justificativa: e.target.value})}
                  placeholder="Justifique a necessidade desta contratação..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNovoItem(false)}>
                  Cancelar
                </Button>
                <Button onClick={adicionarItem} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Adicionar Item
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {podeEditar && demanda.itens.length > 0 && (
            <Button onClick={onEnviar}>
              <Send className="h-4 w-4 mr-2" />
              Enviar para Aprovação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
