"use client"

import { useState, useEffect } from "react"
import { Search, Filter, FileText, Building2, Calendar, DollarSign, Eye } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  modalidade: string
  fase: string
  valor_total_estimado: number
  data_abertura_sessao: string
  orgao?: {
    nome: string
  }
}

export default function LicitacoesDisponiveisPage() {
  const [filtroModalidade, setFiltroModalidade] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")
  const [busca, setBusca] = useState("")
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLicitacoes = async () => {
      try {
        const res = await fetch(`${API_URL}/api/licitacoes`)
        if (res.ok) {
          const data = await res.json()
          // Filtra apenas licitações em fases visíveis para fornecedores
          const fasesVisiveis = ['PUBLICADO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO']
          const licitacoesVisiveis = data.filter((l: Licitacao) => fasesVisiveis.includes(l.fase))
          setLicitacoes(licitacoesVisiveis)
        }
      } catch (error) {
        console.error('Erro ao buscar licitações:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchLicitacoes()
  }, [])

  const filteredLicitacoes = licitacoes.filter(l => {
    if (busca && !l.objeto?.toLowerCase().includes(busca.toLowerCase()) && !l.numero_processo?.includes(busca)) return false
    if (filtroModalidade && filtroModalidade !== 'all' && l.modalidade !== filtroModalidade) return false
    if (filtroStatus && filtroStatus !== 'all' && l.fase !== filtroStatus) return false
    return true
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
  }

  const formatDate = (date: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getFaseBadge = (fase: string) => {
    const map: Record<string, { label: string; className: string }> = {
      PUBLICADO: { label: 'Publicado', className: 'bg-blue-100 text-blue-800' },
      ACOLHIMENTO_PROPOSTAS: { label: 'Recebendo Propostas', className: 'bg-green-100 text-green-800' },
      ANALISE_PROPOSTAS: { label: 'Análise de Propostas', className: 'bg-yellow-100 text-yellow-800' },
      EM_DISPUTA: { label: 'Em Disputa', className: 'bg-red-100 text-red-800' },
      JULGAMENTO: { label: 'Julgamento', className: 'bg-purple-100 text-purple-800' },
      HABILITACAO: { label: 'Habilitação', className: 'bg-orange-100 text-orange-800' },
    }
    const config = map[fase] || { label: fase, className: 'bg-gray-100 text-gray-800' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Licitações Disponíveis</h1>
        <p className="text-muted-foreground">Encontre oportunidades de negócio</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por objeto, número ou órgão..." 
                  className="pl-10"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>

            <Select value={filtroModalidade} onValueChange={setFiltroModalidade}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Modalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="PREGAO_ELETRONICO">Pregão Eletrônico</SelectItem>
                <SelectItem value="CONCORRENCIA">Concorrência</SelectItem>
                <SelectItem value="DISPENSA_ELETRONICA">Dispensa Eletrônica</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PUBLICADO">Publicado</SelectItem>
                <SelectItem value="ACOLHIMENTO_PROPOSTAS">Recebendo Propostas</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Mais Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Licitações */}
      <Card>
        <CardHeader>
          <CardTitle>Resultados ({filteredLicitacoes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando licitações...
            </div>
          ) : filteredLicitacoes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhuma licitação disponível no momento</p>
              <p className="text-sm">Novas licitações aparecerão aqui quando publicadas pelos órgãos</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLicitacoes.map((licitacao) => (
                <div key={licitacao.id} className="border rounded-lg p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-blue-600">{licitacao.numero_processo}</span>
                        {getFaseBadge(licitacao.fase)}
                      </div>
                      <h3 className="font-medium text-lg mb-2">{licitacao.objeto}</h3>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          <span>{licitacao.orgao?.nome || 'Órgão não informado'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          <span>{formatCurrency(licitacao.valor_total_estimado)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          <span>Abertura: {formatDate(licitacao.data_abertura_sessao)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/fornecedor/licitacoes/${licitacao.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver Detalhes
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
