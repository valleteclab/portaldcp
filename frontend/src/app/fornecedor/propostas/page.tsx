"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, FileText, Plus, Eye, Calendar, DollarSign } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Proposta {
  id: string
  status: string
  valor_total_proposta: number
  data_envio: string
  licitacao?: {
    id: string
    numero_processo: string
    objeto: string
  }
}

export default function PropostasFornecedorPage() {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [loading, setLoading] = useState(true)

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
        const res = await fetch(`${API_URL}/api/propostas/fornecedor/${fornecedor.id}`)
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
            <div className="space-y-4">
              {filteredPropostas.map((proposta) => (
                <div key={proposta.id} className="border rounded-lg p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-blue-600">{proposta.licitacao?.numero_processo || 'N/A'}</span>
                        {getStatusBadge(proposta.status)}
                      </div>
                      <h3 className="font-medium mb-2">{proposta.licitacao?.objeto || 'Objeto não informado'}</h3>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          <span>Valor: {formatCurrency(proposta.valor_total_proposta)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Enviada em: {formatDate(proposta.data_envio)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/fornecedor/propostas/${proposta.id}`}>
                        <Button size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Proposta
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
