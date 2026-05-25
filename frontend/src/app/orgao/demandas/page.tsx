'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  Trash2,
  Search,
  Building2,
  ArrowRight,
  Loader2,
  X,
  ChevronUp,
  ChevronDown
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
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'

import { API_URL, authFetch } from '@/lib/api'

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
  data_desejada_contratacao?: string
  renovacao_contrato?: boolean
  data_envio?: string
  data_aprovacao?: string
  aprovado_por?: string
  motivo_rejeicao?: string
  pca_id?: string
  created_at: string
  itens: ItemDemanda[]
}

interface SetorOrgao {
  id: string
  codigo: string
  nome: string
  responsavel_nome?: string
  responsavel_email?: string
  responsavel_telefone?: string
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

function DemandasPageContent() {
  const router = useRouter()
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null)
  const [loading, setLoading] = useState(true)
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear())
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS')
  const [filtroUnidade, setFiltroUnidade] = useState<string>('TODAS')
  const [unidades, setUnidades] = useState<string[]>([])
  const [setores, setSetores] = useState<SetorOrgao[]>([])
  const [termoBusca, setTermoBusca] = useState('')

  // Estados para modais
  const [showNovaDemanda, setShowNovaDemanda] = useState(false)
  const [demandaExpandida, setDemandaExpandida] = useState<string | null>(null)

  // Estado para nova demanda
  const [novaDemanda, setNovaDemanda] = useState({
    unidade_requisitante: '',
    responsavel_nome: '',
    responsavel_email: '',
    responsavel_telefone: '',
    data_desejada_contratacao: '',
    renovacao_contrato: false,
    observacoes: ''
  })
  const [salvando, setSalvando] = useState(false)

  // orgaoId carregado do localStorage (mesmo padrão do PCA)
  const [orgaoId, setOrgaoId] = useState('')

  useEffect(() => {
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (orgaoData) {
        const orgao = JSON.parse(orgaoData)
        setOrgaoId(orgao.id)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (orgaoId) carregarDados()
  }, [anoSelecionado, orgaoId])

  const carregarDados = async () => {
    if (!orgaoId) return
    setLoading(true)
    try {
      const [demandasRes, estatisticasRes, unidadesRes] = await Promise.all([
        authFetch(`${API_URL}/api/demandas?orgaoId=${orgaoId}&ano=${anoSelecionado}`),
        authFetch(`${API_URL}/api/demandas/estatisticas?orgaoId=${orgaoId}&ano=${anoSelecionado}`),
        authFetch(`${API_URL}/api/demandas/unidades?orgaoId=${orgaoId}`),
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

      authFetch(`${API_URL}/api/orgaos/${orgaoId}/setores`)
        .then(async (setoresRes) => {
          if (!setoresRes.ok) return
          const data = await setoresRes.json()
          setSetores(Array.isArray(data) ? data : [])
        })
        .catch((error) => {
          console.error('Erro ao carregar setores:', error)
          setSetores([])
        })
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
      const response = await authFetch(`${API_URL}/api/demandas`, {
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
          data_desejada_contratacao: '',
          renovacao_contrato: false,
          observacoes: ''
        })
        // Navegar direto para a página de detalhe da demanda criada
        router.push(`/orgao/demandas/${demandaCriada.id}`)
      } else {
        const err = await response.json().catch(() => ({}))
        alert(err.message || 'Erro ao criar demanda')
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
      const response = await authFetch(`${API_URL}/api/demandas/${demandaId}/enviar`, {
        method: 'PATCH'
      })
      if (response.ok) {
        carregarDados()
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
      const response = await authFetch(`${API_URL}/api/demandas/${demandaId}`, { method: 'DELETE' })
      if (response.ok) carregarDados()
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

  const calcularTotalDemanda = (itens: ItemDemanda[] | undefined) => {
    return (itens ?? []).reduce((acc, item) => acc + (Number(item.valor_total_estimado) || 0), 0)
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
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(ano => (
                <SelectItem key={ano} value={String(ano)}>
                  {ano}{ano === new Date().getFullYear() ? ' (atual)' : ''}
                </SelectItem>
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
                        <div className="font-medium">{(demanda.itens ?? []).length} {(demanda.itens ?? []).length === 1 ? 'item' : 'itens'}</div>
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
                    {(demanda.itens ?? []).length === 0 ? (
                      <p className="text-center text-gray-500 py-4">Nenhum item cadastrado</p>
                    ) : (
                      <div className="space-y-2">
                        {(demanda.itens ?? []).map(item => (
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
                          router.push(`/orgao/demandas/${demanda.id}`)
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Abrir
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
                            disabled={(demanda.itens ?? []).length === 0}
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
              {setores.length > 0 ? (
                <Select
                  value={novaDemanda.unidade_requisitante}
                  onValueChange={(value) => {
                    const setor = setores.find(s => s.nome === value)
                    setNovaDemanda({
                      ...novaDemanda,
                      unidade_requisitante: value,
                      responsavel_nome: setor?.responsavel_nome || novaDemanda.responsavel_nome,
                      responsavel_email: setor?.responsavel_email || novaDemanda.responsavel_email,
                      responsavel_telefone: setor?.responsavel_telefone || novaDemanda.responsavel_telefone
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o setor requisitante" />
                  </SelectTrigger>
                  <SelectContent>
                    {setores.map(setor => (
                      <SelectItem key={setor.id} value={setor.nome}>
                        {setor.codigo} - {setor.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={novaDemanda.unidade_requisitante}
                  onChange={(e) => setNovaDemanda({...novaDemanda, unidade_requisitante: e.target.value})}
                  placeholder="Ex: Departamento de TI, Setor de Compras..."
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo da Demanda</label>
                <Select
                  value={novaDemanda.renovacao_contrato ? 'RENOVACAO' : 'NOVA'}
                  onValueChange={(value) => setNovaDemanda({
                    ...novaDemanda,
                    renovacao_contrato: value === 'RENOVACAO'
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOVA">Nova demanda</SelectItem>
                    <SelectItem value="RENOVACAO">Renovação contratual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Data Desejada</label>
                <Input
                  type="date"
                  value={novaDemanda.data_desejada_contratacao}
                  onChange={(e) => setNovaDemanda({...novaDemanda, data_desejada_contratacao: e.target.value})}
                />
              </div>
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

    </div>
  )
}


export default function DemandasPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.DEMANDAS}>
      <DemandasPageContent />
    </ModuleGuard>
  )
}
