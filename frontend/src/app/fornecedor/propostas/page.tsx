"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, FileText, Plus, Eye, Calendar, DollarSign, Building2, MapPin, Gavel, AlertCircle, Download, Info, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

import { API_URL, authFetch } from '@/lib/api'

interface Proposta {
  id: string
  status: string
  valor_total_proposta: number
  data_envio: string
  motivo_desclassificacao?: string
  documento_desclassificacao_nome?: string
  licitacao?: {
    id: string
    numero_processo: string
    objeto: string
    modalidade: string
    fase: string
    data_abertura_sessao?: string
    data_fim_acolhimento?: string
    orgao?: {
      nome: string
      cidade?: string
      uf?: string
    }
  }
}

export default function PropostasFornecedorPage() {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMotivo, setModalMotivo] = useState<Proposta | null>(null)

  useEffect(() => {
    const fetchPropostas = async () => {
      try {
        // Buscar fornecedor logado do localStorage
        const fornecedorStr = localStorage.getItem('fornecedor')
        if (!fornecedorStr) {
          setLoading(false)
          return
        }
        const fornecedor = JSON.parse(fornecedorStr)
        
        // Buscar propostas do fornecedor
        const res = await authFetch(`${API_URL}/api/propostas/fornecedor/${fornecedor.id}`)
        if (res.ok) {
          const data = await res.json()
          setPropostas(data)
        }
      } catch (error) {
        console.error('Erro ao buscar propostas:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchPropostas()
  }, [])

  const filteredPropostas = propostas.filter(p => {
    if (busca && !p.licitacao?.objeto?.toLowerCase().includes(busca.toLowerCase()) && !p.licitacao?.numero_processo?.includes(busca)) return false
    if (filtroStatus && filtroStatus !== 'all' && p.status !== filtroStatus) return false
    return true
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
  }

  const formatDate = (date: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-800' },
      ENVIADA: { label: 'Enviada', className: 'bg-blue-100 text-blue-800' },
      RECEBIDA: { label: 'Recebida', className: 'bg-cyan-100 text-cyan-800' },
      EM_ANALISE: { label: 'Em Análise', className: 'bg-yellow-100 text-yellow-800' },
      CLASSIFICADA: { label: 'Classificada', className: 'bg-green-100 text-green-800' },
      DESCLASSIFICADA: { label: 'Desclassificada', className: 'bg-red-100 text-red-800' },
      VENCEDORA: { label: 'Vencedora', className: 'bg-emerald-100 text-emerald-800' },
      CANCELADA: { label: 'Cancelada', className: 'bg-gray-100 text-gray-800' },
    }
    const config = map[status] || { label: status, className: 'bg-gray-100 text-gray-800' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getFaseBadge = (fase?: string) => {
    if (!fase) return <span className="text-slate-400">-</span>
    const map: Record<string, { label: string; className: string }> = {
      RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-700' },
      PUBLICADO: { label: 'Publicado', className: 'bg-blue-100 text-blue-700' },
      IMPUGNACAO: { label: 'Impugnação', className: 'bg-orange-100 text-orange-700' },
      ACOLHIMENTO_PROPOSTAS: { label: 'Acolhimento', className: 'bg-cyan-100 text-cyan-700' },
      ANALISE_PROPOSTAS: { label: 'Análise', className: 'bg-yellow-100 text-yellow-700' },
      EM_DISPUTA: { label: 'Em Disputa', className: 'bg-purple-100 text-purple-700' },
      JULGAMENTO: { label: 'Julgamento', className: 'bg-indigo-100 text-indigo-700' },
      HABILITACAO: { label: 'Habilitação', className: 'bg-teal-100 text-teal-700' },
      RECURSO: { label: 'Recurso', className: 'bg-amber-100 text-amber-700' },
      ADJUDICACAO: { label: 'Adjudicação', className: 'bg-lime-100 text-lime-700' },
      HOMOLOGACAO: { label: 'Homologado', className: 'bg-green-100 text-green-700' },
      CONCLUIDO: { label: 'Concluído', className: 'bg-emerald-100 text-emerald-700' },
      SUSPENSO: { label: 'Suspenso', className: 'bg-red-100 text-red-700' },
      REVOGADO: { label: 'Revogado', className: 'bg-gray-100 text-gray-700' },
      ANULADO: { label: 'Anulado', className: 'bg-gray-100 text-gray-700' },
      FRACASSADO: { label: 'Fracassado', className: 'bg-red-100 text-red-700' },
      DESERTO: { label: 'Deserto', className: 'bg-gray-100 text-gray-700' },
    }
    const config = map[fase] || { label: fase, className: 'bg-gray-100 text-gray-700' }
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>
  }

  // Estatísticas
  const stats = {
    total: propostas.length,
    rascunhos: propostas.filter(p => p.status === 'RASCUNHO').length,
    enviadas: propostas.filter(p => ['ENVIADA', 'RECEBIDA', 'EM_ANALISE', 'CLASSIFICADA'].includes(p.status)).length,
    vencedoras: propostas.filter(p => p.status === 'VENCEDORA').length,
    valorTotal: propostas.reduce((acc, p) => acc + (p.valor_total_proposta || 0), 0),
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Minhas Propostas</h1>
          <p className="text-muted-foreground">Gerencie suas propostas enviadas</p>
        </div>
        <Link href="/fornecedor/licitacoes">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Nova Proposta
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Rascunhos</p>
            <p className="text-2xl font-bold text-slate-600">{stats.rascunhos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Enviadas</p>
            <p className="text-2xl font-bold text-blue-600">{stats.enviadas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Vencedoras</p>
            <p className="text-2xl font-bold text-green-600">{stats.vencedoras}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Valor Total</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.valorTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por objeto ou número..." 
                  className="pl-10"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="RASCUNHO">Rascunhos</SelectItem>
                <SelectItem value="ENVIADA">Enviadas</SelectItem>
                <SelectItem value="ACEITA">Aceitas</SelectItem>
                <SelectItem value="VENCEDORA">Vencedoras</SelectItem>
                <SelectItem value="DESCLASSIFICADA">Desclassificadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Propostas */}
      <Card>
        <CardHeader>
          <CardTitle>Propostas ({filteredPropostas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando propostas...
            </div>
          ) : filteredPropostas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Você ainda não enviou nenhuma proposta</p>
              <p className="text-sm mb-4">Busque licitações disponíveis para participar</p>
              <Link href="/fornecedor/licitacoes">
                <Button>
                  <Search className="mr-2 h-4 w-4" />
                  Buscar Licitações
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left p-3 font-medium">Órgão</th>
                    <th className="text-left p-3 font-medium">Processo</th>
                    <th className="text-left p-3 font-medium">Modalidade</th>
                    <th className="text-left p-3 font-medium">Cidade</th>
                    <th className="text-left p-3 font-medium">Fase</th>
                    <th className="text-left p-3 font-medium">Proposta</th>
                    <th className="text-left p-3 font-medium">Fim Propostas</th>
                    <th className="text-left p-3 font-medium">Disputa</th>
                    <th className="text-center p-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPropostas.map((proposta, index) => (
                    <tr 
                      key={proposta.id} 
                      className={`border-b hover:bg-slate-50 transition-colors ${
                        proposta.status === 'DESCLASSIFICADA' ? 'bg-red-50' : 
                        proposta.status === 'VENCEDORA' ? 'bg-green-50' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span className="font-medium">{proposta.licitacao?.orgao?.nome || 'Órgão não informado'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Link 
                          href={`/fornecedor/licitacoes/${proposta.licitacao?.id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {proposta.licitacao?.numero_processo || 'N/A'}
                        </Link>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="font-normal">
                          {proposta.licitacao?.modalidade || 'N/A'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin className="h-3 w-3" />
                          {proposta.licitacao?.orgao?.cidade || 'N/A'}
                          {proposta.licitacao?.orgao?.uf && ` - ${proposta.licitacao.orgao.uf}`}
                        </div>
                      </td>
                      <td className="p-3">
                        {getFaseBadge(proposta.licitacao?.fase)}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(proposta.status)}
                          {proposta.status === 'DESCLASSIFICADA' && (proposta.motivo_desclassificacao || proposta.documento_desclassificacao_nome) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setModalMotivo(proposta)}
                            >
                              <Info className="h-3 w-3 mr-1" />
                              Ver motivo
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        {proposta.licitacao?.data_fim_acolhimento 
                          ? formatDate(proposta.licitacao.data_fim_acolhimento)
                          : '-'}
                      </td>
                      <td className="p-3 text-slate-600">
                        {proposta.licitacao?.data_abertura_sessao 
                          ? formatDate(proposta.licitacao.data_abertura_sessao)
                          : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <Link href={`/fornecedor/licitacoes/${proposta.licitacao?.id}`}>
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Motivo de Desclassificação */}
      {modalMotivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50" 
            onClick={() => setModalMotivo(null)}
          />
          {/* Modal */}
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-red-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
                <h3 className="font-semibold text-red-800">Proposta Desclassificada</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setModalMotivo(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Content */}
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Processo</p>
                <p className="font-medium">{modalMotivo.licitacao?.numero_processo}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Motivo da Desclassificação</p>
                <p className="text-slate-700 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {modalMotivo.motivo_desclassificacao || 'Motivo não informado'}
                </p>
              </div>
              {modalMotivo.documento_desclassificacao_nome && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Documento Anexado</p>
                  <a 
                    href={`${API_URL}/api/propostas/${modalMotivo.id}/documento-desclassificacao`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    {modalMotivo.documento_desclassificacao_nome}
                  </a>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="p-4 border-t bg-slate-50">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setModalMotivo(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
