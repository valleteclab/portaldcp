"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, Plus, FileText, Eye, Calendar, Building2, Loader2, CheckCircle2, Edit2, Trash2, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, 
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useRouter } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  modalidade: string
  fase: string
  valor_total_estimado: number | string
  data_abertura_sessao: string
  created_at: string
  fase_interna_concluida?: boolean
  enviado_pncp?: boolean
  numero_controle_pncp?: string
}

const FASES_INTERNAS = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA']
const FASES_PROPOSTAS = ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS']
const FASES_DISPUTA = ['EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'RECURSO']
const FASES_CONCLUIDAS = ['ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO']

const getFaseLabel = (fase: string) => {
  const labels: Record<string, string> = {
    'PLANEJAMENTO': 'Planejamento',
    'TERMO_REFERENCIA': 'Termo de Referência',
    'PESQUISA_PRECOS': 'Pesquisa de Preços',
    'ANALISE_JURIDICA': 'Análise Jurídica',
    'APROVACAO_INTERNA': 'Aprovação Interna',
    'PUBLICADO': 'Publicado',
    'IMPUGNACAO': 'Impugnação',
    'ACOLHIMENTO_PROPOSTAS': 'Recebendo Propostas',
    'ANALISE_PROPOSTAS': 'Análise de Propostas',
    'EM_DISPUTA': 'Em Disputa',
    'JULGAMENTO': 'Julgamento',
    'HABILITACAO': 'Habilitação',
    'RECURSO': 'Recurso',
    'ADJUDICACAO': 'Adjudicação',
    'HOMOLOGACAO': 'Homologação',
    'CONCLUIDO': 'Concluído',
    'FRACASSADO': 'Fracassado',
    'DESERTO': 'Deserto',
    'REVOGADO': 'Revogado',
    'ANULADO': 'Anulado',
    'SUSPENSO': 'Suspenso',
  }
  return labels[fase] || fase
}

const getFaseBadgeColor = (fase: string) => {
  if (FASES_INTERNAS.includes(fase)) return 'bg-purple-100 text-purple-700'
  if (FASES_PROPOSTAS.includes(fase)) return 'bg-blue-100 text-blue-700'
  if (FASES_DISPUTA.includes(fase)) return 'bg-red-100 text-red-700'
  if (FASES_CONCLUIDAS.includes(fase)) return 'bg-green-100 text-green-700'
  return 'bg-slate-100 text-slate-700'
}

const getModalidadeLabel = (modalidade: string) => {
  const labels: Record<string, string> = {
    'PREGAO_ELETRONICO': 'Pregão Eletrônico',
    'CONCORRENCIA': 'Concorrência',
    'DISPENSA_ELETRONICA': 'Dispensa Eletrônica',
    'CONCURSO': 'Concurso',
    'LEILAO': 'Leilão',
    'DIALOGO_COMPETITIVO': 'Diálogo Competitivo',
    'INEXIGIBILIDADE': 'Inexigibilidade',
  }
  return labels[modalidade] || modalidade
}

const formatarData = (dataISO: string) => {
  if (!dataISO) return '-'
  const data = new Date(dataISO)
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatarMoeda = (valor: number | string) => {
  const numero = typeof valor === 'string' ? parseFloat(valor) : valor
  return (numero || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function LicitacoesOrgaoPage() {
  const router = useRouter()
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroFase, setFiltroFase] = useState("")
  const [filtroModalidade, setFiltroModalidade] = useState("")
  const [busca, setBusca] = useState("")
  const [licitacaoParaDeletar, setLicitacaoParaDeletar] = useState<Licitacao | null>(null)
  const [deletando, setDeletando] = useState(false)

  useEffect(() => {
    carregarLicitacoes()
  }, [])

  const carregarLicitacoes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/licitacoes`)
      if (res.ok) {
        const data = await res.json()
        setLicitacoes(data)
      }
    } catch (error) {
      console.error('Erro ao carregar licitações:', error)
    } finally {
      setLoading(false)
    }
  }

  const deletarLicitacao = async () => {
    if (!licitacaoParaDeletar) return
    setDeletando(true)
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoParaDeletar.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setLicitacoes(licitacoes.filter(l => l.id !== licitacaoParaDeletar.id))
        setLicitacaoParaDeletar(null)
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao deletar licitação')
      }
    } catch (error) {
      console.error('Erro ao deletar licitação:', error)
      alert('Erro ao deletar licitação')
    } finally {
      setDeletando(false)
    }
  }

  // Filtrar licitações
  const licitacoesFiltradas = licitacoes.filter(lic => {
    if (busca && !lic.objeto.toLowerCase().includes(busca.toLowerCase()) && 
        !lic.numero_processo.toLowerCase().includes(busca.toLowerCase())) {
      return false
    }
    if (filtroFase && filtroFase !== 'all' && lic.fase !== filtroFase) {
      return false
    }
    if (filtroModalidade && filtroModalidade !== 'all' && lic.modalidade !== filtroModalidade) {
      return false
    }
    return true
  })

  // Contadores
  const stats = {
    total: licitacoes.length,
    faseInterna: licitacoes.filter(l => FASES_INTERNAS.includes(l.fase)).length,
    propostas: licitacoes.filter(l => FASES_PROPOSTAS.includes(l.fase)).length,
    disputa: licitacoes.filter(l => FASES_DISPUTA.includes(l.fase)).length,
    concluidas: licitacoes.filter(l => FASES_CONCLUIDAS.includes(l.fase)).length,
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Licitações</h1>
          <p className="text-muted-foreground">Gerencie os processos licitatórios do órgão</p>
        </div>
        <Link href="/orgao/licitacoes/nova">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nova Licitação
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
            <p className="text-sm text-muted-foreground">Fase Interna</p>
            <p className="text-2xl font-bold text-purple-600">{stats.faseInterna}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Recebendo Propostas</p>
            <p className="text-2xl font-bold text-blue-600">{stats.propostas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Em Disputa</p>
            <p className="text-2xl font-bold text-red-600">{stats.disputa}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Concluídas</p>
            <p className="text-2xl font-bold text-green-600">{stats.concluidas}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[300px]">
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

            <Select value={filtroFase} onValueChange={setFiltroFase}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Fase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="PLANEJAMENTO">Planejamento</SelectItem>
                <SelectItem value="PUBLICADO">Publicado</SelectItem>
                <SelectItem value="ACOLHIMENTO_PROPOSTAS">Recebendo Propostas</SelectItem>
                <SelectItem value="EM_DISPUTA">Em Disputa</SelectItem>
                <SelectItem value="HOMOLOGACAO">Homologação</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader>
          <CardTitle>Processos ({licitacoesFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-blue-600" />
              <p className="text-muted-foreground">Carregando licitações...</p>
            </div>
          ) : licitacoesFiltradas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhuma licitação encontrada</p>
              <p className="text-sm mb-4">
                {licitacoes.length === 0 
                  ? 'Clique em "Nova Licitação" para criar seu primeiro processo'
                  : 'Tente ajustar os filtros de busca'}
              </p>
              {licitacoes.length === 0 && (
                <Link href="/orgao/licitacoes/nova">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Licitação
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {licitacoesFiltradas.map((lic) => (
                <div 
                  key={lic.id}
                  className="p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-blue-600">{lic.numero_processo}</span>
                        <Badge className={getFaseBadgeColor(lic.fase)}>
                          {getFaseLabel(lic.fase)}
                        </Badge>
                        {lic.enviado_pncp && (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            PNCP
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 mb-2 line-clamp-2">{lic.objeto}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {getModalidadeLabel(lic.modalidade)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {lic.data_abertura_sessao 
                            ? `Sessão: ${formatarData(lic.data_abertura_sessao)}`
                            : `Criado: ${formatarData(lic.created_at)}`}
                        </span>
                        <span className="font-medium text-slate-600">
                          {formatarMoeda(lic.valor_total_estimado)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/orgao/licitacoes/${lic.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          Visualizar
                        </Button>
                      </Link>
                      <Link href={`/orgao/licitacoes/${lic.id}/editar`}>
                        <Button variant="outline" size="sm">
                          <Edit2 className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                      </Link>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setLicitacaoParaDeletar(lic)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!licitacaoParaDeletar} onOpenChange={() => setLicitacaoParaDeletar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a licitação <strong>{licitacaoParaDeletar?.numero_processo}</strong>?
              <br /><br />
              <span className="text-red-600">Esta ação não pode ser desfeita.</span>
              {licitacaoParaDeletar?.enviado_pncp && (
                <span className="block mt-2 text-yellow-600">
                  ⚠️ Esta licitação já foi enviada ao PNCP. A exclusão local não remove do portal.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deletarLicitacao}
              disabled={deletando}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
