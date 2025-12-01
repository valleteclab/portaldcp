"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft,
  FileText, 
  Upload,
  Check,
  Clock,
  AlertCircle,
  ChevronRight,
  Play,
  Pause,
  Users,
  Gavel,
  Award,
  CheckCircle2,
  XCircle,
  FileCheck,
  Scale,
  Loader2,
  Settings,
  Eye,
  EyeOff,
  X,
  Info,
  Trash2,
  Ban,
  RotateCcw,
  AlertTriangle,
  MessageSquare
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Fases conforme Lei 14.133/2021
const FASES_INTERNAS = [
  { id: 'PLANEJAMENTO', label: 'Planejamento', icon: FileText, docs: ['DFD', 'ETP'] },
  { id: 'TERMO_REFERENCIA', label: 'Termo de Referência', icon: FileText, docs: ['TR', 'JC'] },
  { id: 'PESQUISA_PRECOS', label: 'Pesquisa de Preços', icon: FileText, docs: ['PP', 'MCP'] },
  { id: 'ANALISE_JURIDICA', label: 'Análise Jurídica', icon: Scale, docs: ['PJ'] },
  { id: 'APROVACAO_INTERNA', label: 'Aprovação', icon: CheckCircle2, docs: ['AA', 'DP', 'DO'] },
]

const FASES_EXTERNAS = [
  { id: 'PUBLICADO', label: 'Publicação', icon: FileText },
  { id: 'IMPUGNACAO', label: 'Impugnação', icon: AlertCircle },
  { id: 'ACOLHIMENTO_PROPOSTAS', label: 'Propostas', icon: Users },
  { id: 'ANALISE_PROPOSTAS', label: 'Análise', icon: FileCheck },
  { id: 'EM_DISPUTA', label: 'Disputa', icon: Gavel },
  { id: 'JULGAMENTO', label: 'Julgamento', icon: Scale },
  { id: 'HABILITACAO', label: 'Habilitação', icon: FileCheck },
  { id: 'RECURSO', label: 'Recursos', icon: AlertCircle },
  { id: 'ADJUDICACAO', label: 'Adjudicação', icon: Award },
  { id: 'HOMOLOGACAO', label: 'Homologação', icon: CheckCircle2 },
]

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  modalidade: string
  fase: string
  fase_interna_concluida: boolean
  valor_total_estimado: number
  data_publicacao_edital: string
  data_abertura_sessao: string
  pregoeiro_nome: string
  sigilo_orcamento: string
  created_at: string
}

interface Documento {
  id: string
  tipo: string
  titulo: string
  status: string
}

interface Proposta {
  id: string
  status: string
  valor_total_proposta: number
  data_envio: string
  fornecedor?: {
    id: string
    razao_social: string
    cpf_cnpj: string
    porte?: string
  }
}

interface FaseInfo {
  id: string
  label: string
  descricao: string
  artigo: string
  acoes: string[]
}

export default function GestaoLicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const licitacaoId = resolvedParams.id

  const [loading, setLoading] = useState(true)
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [resumoFaseInterna, setResumoFaseInterna] = useState<any>(null)
  const [faseModal, setFaseModal] = useState<FaseInfo | null>(null)
  const [loadingPropostas, setLoadingPropostas] = useState(false)
  const [actionModal, setActionModal] = useState<{ type: string; title: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [motivoAcao, setMotivoAcao] = useState('')

  // Informações detalhadas de cada fase
  const FASES_INFO: Record<string, FaseInfo> = {
    PUBLICADO: {
      id: 'PUBLICADO',
      label: 'Publicação',
      descricao: 'O edital foi publicado no PNCP e demais meios oficiais. Os interessados podem consultar o processo.',
      artigo: 'Art. 54 da Lei 14.133/2021',
      acoes: ['Verificar publicação no PNCP', 'Responder pedidos de esclarecimento', 'Aguardar prazo de impugnação']
    },
    IMPUGNACAO: {
      id: 'IMPUGNACAO',
      label: 'Impugnação',
      descricao: 'Período para recebimento de impugnações ao edital. Qualquer cidadão pode impugnar.',
      artigo: 'Art. 164 da Lei 14.133/2021',
      acoes: ['Analisar impugnações recebidas', 'Responder em até 3 dias úteis', 'Alterar edital se necessário']
    },
    ACOLHIMENTO_PROPOSTAS: {
      id: 'ACOLHIMENTO_PROPOSTAS',
      label: 'Acolhimento de Propostas',
      descricao: 'Período para os fornecedores cadastrarem suas propostas no sistema.',
      artigo: 'Art. 26 da Lei 14.133/2021',
      acoes: ['Monitorar propostas recebidas', 'Verificar habilitação preliminar', 'Preparar sessão pública']
    },
    ANALISE_PROPOSTAS: {
      id: 'ANALISE_PROPOSTAS',
      label: 'Análise de Propostas',
      descricao: 'Análise das propostas recebidas quanto à conformidade com o edital.',
      artigo: 'Art. 59 da Lei 14.133/2021',
      acoes: ['Verificar conformidade das propostas', 'Desclassificar propostas irregulares', 'Classificar propostas válidas']
    },
    EM_DISPUTA: {
      id: 'EM_DISPUTA',
      label: 'Fase de Disputa',
      descricao: 'Sessão pública de lances. Os fornecedores competem pelo menor preço.',
      artigo: 'Art. 56 da Lei 14.133/2021',
      acoes: ['Conduzir sessão de lances', 'Negociar com o melhor colocado', 'Encerrar fase de lances']
    },
    JULGAMENTO: {
      id: 'JULGAMENTO',
      label: 'Julgamento',
      descricao: 'Análise final das propostas e definição do vencedor provisório.',
      artigo: 'Art. 33 da Lei 14.133/2021',
      acoes: ['Analisar proposta vencedora', 'Verificar exequibilidade', 'Declarar vencedor provisório']
    },
    HABILITACAO: {
      id: 'HABILITACAO',
      label: 'Habilitação',
      descricao: 'Verificação dos documentos de habilitação do licitante melhor classificado.',
      artigo: 'Art. 62 a 70 da Lei 14.133/2021',
      acoes: ['Verificar documentos de habilitação', 'Solicitar documentos complementares', 'Declarar habilitado/inabilitado']
    },
    RECURSO: {
      id: 'RECURSO',
      label: 'Recursos',
      descricao: 'Período para interposição de recursos administrativos.',
      artigo: 'Art. 165 da Lei 14.133/2021',
      acoes: ['Receber recursos', 'Analisar contrarrazões', 'Decidir sobre recursos']
    },
    ADJUDICACAO: {
      id: 'ADJUDICACAO',
      label: 'Adjudicação',
      descricao: 'Atribuição do objeto da licitação ao vencedor.',
      artigo: 'Art. 71 da Lei 14.133/2021',
      acoes: ['Adjudicar objeto ao vencedor', 'Convocar para assinatura do contrato']
    },
    HOMOLOGACAO: {
      id: 'HOMOLOGACAO',
      label: 'Homologação',
      descricao: 'Ato da autoridade competente que ratifica todo o procedimento licitatório.',
      artigo: 'Art. 71 da Lei 14.133/2021',
      acoes: ['Homologar resultado', 'Publicar resultado final', 'Encaminhar para contratação']
    }
  }

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    setLoading(true)
    try {
      // Carregar licitação
      const resLic = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
      if (resLic.ok) {
        const licData = await resLic.json()
        setLicitacao(licData)
      }

      // Carregar documentos da fase interna
      const resDocs = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos`)
      if (resDocs.ok) {
        const docsData = await resDocs.json()
        setDocumentos(docsData)
      }

      // Carregar resumo da fase interna
      const resResumo = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/resumo`)
      if (resResumo.ok) {
        const resumoData = await resResumo.json()
        setResumoFaseInterna(resumoData)
      }

      // Carregar propostas
      const resPropostas = await fetch(`${API_URL}/api/propostas/licitacao/${licitacaoId}`)
      if (resPropostas.ok) {
        const propostasData = await resPropostas.json()
        setPropostas(propostasData)
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const desclassificarProposta = async (propostaId: string, motivo: string) => {
    try {
      const res = await fetch(`${API_URL}/api/propostas/${propostaId}/desclassificar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      })
      if (res.ok) {
        // Recarregar propostas
        const resPropostas = await fetch(`${API_URL}/api/propostas/licitacao/${licitacaoId}`)
        if (resPropostas.ok) {
          const propostasData = await resPropostas.json()
          setPropostas(propostasData)
        }
      }
    } catch (error) {
      console.error('Erro ao desclassificar:', error)
    }
  }

  const classificarProposta = async (propostaId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/propostas/${propostaId}/classificar`, {
        method: 'PUT'
      })
      if (res.ok) {
        const resPropostas = await fetch(`${API_URL}/api/propostas/licitacao/${licitacaoId}`)
        if (resPropostas.ok) {
          const propostasData = await resPropostas.json()
          setPropostas(propostasData)
        }
      }
    } catch (error) {
      console.error('Erro ao classificar:', error)
    }
  }

  const getStatusProposta = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-700' },
      ENVIADA: { label: 'Enviada', className: 'bg-blue-100 text-blue-700' },
      RECEBIDA: { label: 'Recebida', className: 'bg-cyan-100 text-cyan-700' },
      EM_ANALISE: { label: 'Em Análise', className: 'bg-yellow-100 text-yellow-700' },
      CLASSIFICADA: { label: 'Classificada', className: 'bg-green-100 text-green-700' },
      DESCLASSIFICADA: { label: 'Desclassificada', className: 'bg-red-100 text-red-700' },
      VENCEDORA: { label: 'Vencedora', className: 'bg-emerald-100 text-emerald-700' },
    }
    return map[status] || { label: status, className: 'bg-gray-100 text-gray-700' }
  }

  // Ações de gerenciamento da licitação
  const executarAcao = async () => {
    if (!actionModal) return
    setActionLoading(true)

    try {
      let endpoint = ''
      let method = 'PUT'
      let body: any = {}

      switch (actionModal.type) {
        case 'suspender':
          endpoint = `/api/licitacoes/${licitacaoId}/suspender`
          body = { motivo: motivoAcao }
          break
        case 'revogar':
          endpoint = `/api/licitacoes/${licitacaoId}/revogar`
          body = { motivo: motivoAcao }
          break
        case 'anular':
          endpoint = `/api/licitacoes/${licitacaoId}/anular`
          body = { motivo: motivoAcao }
          break
        case 'retomar':
          endpoint = `/api/licitacoes/${licitacaoId}/retomar`
          body = {}
          break
        case 'excluir':
          endpoint = `/api/licitacoes/${licitacaoId}`
          method = 'DELETE'
          break
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'DELETE' ? JSON.stringify(body) : undefined
      })

      if (res.ok) {
        if (actionModal.type === 'excluir') {
          alert('Licitação excluída com sucesso!')
          router.push('/orgao/licitacoes')
        } else {
          alert(`Ação "${actionModal.title}" executada com sucesso!`)
          setActionModal(null)
          setMotivoAcao('')
          carregarDados()
        }
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message || 'Falha ao executar ação'}`)
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao executar ação')
    } finally {
      setActionLoading(false)
    }
  }

  // Verifica se pode excluir (apenas fase interna)
  const podeExcluir = () => {
    if (!licitacao) return false
    const fasesInternas = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA']
    return fasesInternas.includes(licitacao.fase)
  }

  // Verifica se pode suspender/revogar/anular
  const podeGerenciar = () => {
    if (!licitacao) return false
    const fasesFinais = ['CONCLUIDO', 'FRACASSADO', 'DESERTO', 'REVOGADO', 'ANULADO']
    return !fasesFinais.includes(licitacao.fase)
  }

  // Verifica se está suspenso (pode retomar)
  const estaSuspenso = () => licitacao?.fase === 'SUSPENSO'

  // Avançar para próxima fase
  const avancarFase = async () => {
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/avancar-fase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacao: 'Fase avançada pelo pregoeiro' })
      })
      if (res.ok) {
        setFaseModal(null)
        carregarDados()
        alert('Fase avançada com sucesso!')
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao avançar fase')
    }
  }

  // Retroceder fase
  const retrocederFase = async (motivo: string) => {
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/retroceder-fase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      })
      if (res.ok) {
        setFaseModal(null)
        carregarDados()
        alert('Fase retrocedida com sucesso!')
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao retroceder fase')
    }
  }

  // Iniciar disputa
  const iniciarDisputa = async () => {
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/iniciar-disputa`, {
        method: 'PUT'
      })
      if (res.ok) {
        setFaseModal(null)
        carregarDados()
        alert('Disputa iniciada! Redirecionando para sala de disputa...')
        router.push(`/orgao/licitacoes/${licitacaoId}/sala`)
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao iniciar disputa')
    }
  }

  // Encerrar disputa
  const encerrarDisputa = async () => {
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/encerrar-disputa`, {
        method: 'PUT'
      })
      if (res.ok) {
        setFaseModal(null)
        carregarDados()
        alert('Disputa encerrada! Avançando para julgamento.')
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao encerrar disputa')
    }
  }

  // Homologar licitação
  const homologarLicitacao = async () => {
    if (!licitacao) return
    const valorHomologado = prompt('Informe o valor homologado:')
    if (!valorHomologado) return
    
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/homologar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_homologado: parseFloat(valorHomologado) })
      })
      if (res.ok) {
        setFaseModal(null)
        carregarDados()
        alert('Licitação homologada com sucesso!')
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao homologar')
    }
  }

  // Obter ações disponíveis para a fase atual
  const getAcoesFase = (faseId: string) => {
    const acoes: { label: string; action: () => void; variant?: 'default' | 'destructive' | 'outline'; icon?: any }[] = []
    
    if (!licitacao) return acoes
    const faseAtual = licitacao.fase
    const isFaseAtual = faseId === faseAtual

    if (isFaseAtual) {
      switch (faseId) {
        case 'PUBLICADO':
          acoes.push({ label: 'Ver Impugnações', action: () => router.push(`/orgao/licitacoes/${licitacaoId}/impugnacoes`), icon: MessageSquare })
          acoes.push({ label: 'Avançar para Impugnação', action: avancarFase, icon: ChevronRight })
          break
        case 'IMPUGNACAO':
          acoes.push({ label: 'Gerenciar Impugnações', action: () => router.push(`/orgao/licitacoes/${licitacaoId}/impugnacoes`), variant: 'default', icon: MessageSquare })
          acoes.push({ label: 'Avançar para Acolhimento', action: avancarFase, icon: ChevronRight })
          break
        case 'ACOLHIMENTO_PROPOSTAS':
          acoes.push({ label: 'Ver Propostas Recebidas', action: () => router.push(`/orgao/licitacoes/${licitacaoId}/propostas`), icon: Eye })
          acoes.push({ label: 'Avançar para Análise', action: avancarFase, icon: ChevronRight })
          break
        case 'ANALISE_PROPOSTAS':
          acoes.push({ label: 'Analisar Propostas', action: () => router.push(`/orgao/licitacoes/${licitacaoId}/propostas`), variant: 'default', icon: FileText })
          acoes.push({ label: 'Iniciar Sessão de Disputa', action: iniciarDisputa, variant: 'default', icon: Play })
          break
        case 'EM_DISPUTA':
          acoes.push({ label: 'Ir para Sala de Disputa', action: () => router.push(`/orgao/licitacoes/${licitacaoId}/sala`), variant: 'default', icon: Gavel })
          acoes.push({ label: 'Encerrar Disputa', action: encerrarDisputa, variant: 'destructive', icon: XCircle })
          break
        case 'JULGAMENTO':
          acoes.push({ label: 'Ver Resultado', action: () => router.push(`/orgao/licitacoes/${licitacaoId}/propostas`), icon: Eye })
          acoes.push({ label: 'Avançar para Habilitação', action: avancarFase, icon: ChevronRight })
          break
        case 'HABILITACAO':
          acoes.push({ label: 'Verificar Documentos', action: () => router.push(`/orgao/licitacoes/${licitacaoId}/habilitacao`), variant: 'default', icon: FileText })
          acoes.push({ label: 'Avançar para Recursos', action: avancarFase, icon: ChevronRight })
          break
        case 'RECURSO':
          acoes.push({ label: 'Ver Recursos', action: () => alert('Página de recursos em desenvolvimento'), icon: MessageSquare })
          acoes.push({ label: 'Avançar para Adjudicação', action: avancarFase, icon: ChevronRight })
          break
        case 'ADJUDICACAO':
          acoes.push({ label: 'Gerar Termo de Adjudicação', action: () => alert('Gerando termo...'), icon: FileText })
          acoes.push({ label: 'Avançar para Homologação', action: avancarFase, icon: ChevronRight })
          break
        case 'HOMOLOGACAO':
          acoes.push({ label: 'Homologar e Concluir', action: homologarLicitacao, variant: 'default', icon: Award })
          break
      }
    }

    return acoes
  }

  const getFaseIndex = (fase: string, fases: typeof FASES_INTERNAS | typeof FASES_EXTERNAS) => {
    return fases.findIndex(f => f.id === fase)
  }


  const getStatusDocumento = (status: string) => {
    const map: Record<string, { label: string; className: string; icon: any }> = {
      APROVADO: { label: 'Aprovado', className: 'bg-green-100 text-green-800', icon: Check },
      AGUARDANDO_APROVACAO: { label: 'Aguardando', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
      EM_ELABORACAO: { label: 'Em Elaboracao', className: 'bg-blue-100 text-blue-800', icon: FileText },
      REPROVADO: { label: 'Reprovado', className: 'bg-red-100 text-red-800', icon: XCircle },
    }
    return map[status] || { label: status, className: 'bg-gray-100', icon: FileText }
  }

  const progressoFaseExterna = () => {
    if (!licitacao) return 0
    const index = FASES_EXTERNAS.findIndex(f => f.id === licitacao.fase)
    return index >= 0 ? ((index + 1) / FASES_EXTERNAS.length) * 100 : 0
  }

  const formatarMoeda = (valor: number | string) => {
    const numero = typeof valor === 'string' ? parseFloat(valor) : valor
    return (numero || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  const formatarData = (data: string) => data ? new Date(data).toLocaleDateString('pt-BR') : '-'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!licitacao) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Licitação não encontrada</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">{licitacao.numero_processo}</h1>
              {licitacao.sigilo_orcamento === 'SIGILOSO' && (
                <Badge className="bg-amber-100 text-amber-700"><EyeOff className="w-3 h-3 mr-1" /> Sigiloso</Badge>
              )}
            </div>
            <p className="text-muted-foreground">{licitacao.objeto}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!licitacao.fase_interna_concluida && (
            <Link href={`/orgao/licitacoes/${licitacao.id}/fase-interna`}>
              <Button variant="outline"><Settings className="mr-2 h-4 w-4" />Fase Interna</Button>
            </Link>
          )}
          {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && (
            <Link href={`/orgao/licitacoes/${licitacao.id}/sessao`}>
              <Button><Play className="mr-2 h-4 w-4" />Iniciar Sessão</Button>
            </Link>
          )}
          {licitacao.fase === 'EM_DISPUTA' && (
            <Link href={`/orgao/licitacoes/${licitacao.id}/sala`}>
              <Button variant="destructive"><Gavel className="mr-2 h-4 w-4" />Sala de Disputa</Button>
            </Link>
          )}
          {estaSuspenso() && (
            <Button 
              variant="outline" 
              className="text-green-600 border-green-600"
              onClick={() => setActionModal({ type: 'retomar', title: 'Retomar Licitação' })}
            >
              <RotateCcw className="mr-2 h-4 w-4" />Retomar
            </Button>
          )}
          {podeGerenciar() && !estaSuspenso() && (
            <Button 
              variant="outline" 
              className="text-yellow-600 border-yellow-600"
              onClick={() => setActionModal({ type: 'suspender', title: 'Suspender Licitação' })}
            >
              <Pause className="mr-2 h-4 w-4" />Suspender
            </Button>
          )}
          {podeGerenciar() && (
            <>
              <Button 
                variant="outline" 
                className="text-orange-600 border-orange-600"
                onClick={() => setActionModal({ type: 'revogar', title: 'Revogar Licitação' })}
              >
                <Ban className="mr-2 h-4 w-4" />Revogar
              </Button>
              <Button 
                variant="outline" 
                className="text-red-600 border-red-600"
                onClick={() => setActionModal({ type: 'anular', title: 'Anular Licitação' })}
              >
                <XCircle className="mr-2 h-4 w-4" />Anular
              </Button>
            </>
          )}
          {podeExcluir() && (
            <Button 
              variant="destructive"
              onClick={() => setActionModal({ type: 'excluir', title: 'Excluir Licitação' })}
            >
              <Trash2 className="mr-2 h-4 w-4" />Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Valor Estimado</p>
            {licitacao.sigilo_orcamento === 'SIGILOSO' ? (
              <p className="text-xl font-bold text-amber-600 flex items-center gap-1"><EyeOff className="h-4 w-4" /> Sigiloso</p>
            ) : (
              <p className="text-xl font-bold">{formatarMoeda(licitacao.valor_total_estimado)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Fase Atual</p>
            <p className="text-xl font-bold text-blue-600">
              {FASES_EXTERNAS.find(f => f.id === licitacao.fase)?.label || licitacao.fase}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Data Abertura</p>
            <p className="text-xl font-bold">{formatarData(licitacao.data_abertura_sessao)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Pregoeiro</p>
            <p className="text-xl font-bold">{licitacao.pregoeiro_nome || '-'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fases">
        <TabsList>
          <TabsTrigger value="fases">Fases do Processo</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="propostas">Propostas</TabsTrigger>
          <TabsTrigger value="historico">Historico</TabsTrigger>
        </TabsList>

        <TabsContent value="fases" className="space-y-6">
          {/* Fase Interna */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Fase Interna (Preparatoria)
                  </CardTitle>
                  <CardDescription>Art. 18 da Lei 14.133/2021</CardDescription>
                </div>
                {licitacao.fase_interna_concluida ? (
                  <Badge className="bg-green-100 text-green-800">
                    <Check className="w-4 h-4 mr-1" /> Concluída
                  </Badge>
                ) : (
                  <Link href={`/orgao/licitacoes/${licitacao.id}/fase-interna`}>
                    <Button size="sm"><Settings className="mr-2 h-4 w-4" /> Gerenciar</Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {FASES_INTERNAS.map((fase, index) => {
                  const Icon = fase.icon
                  const isConcluida = licitacao.fase_interna_concluida
                  return (
                    <div key={fase.id} className="flex items-center">
                      <div className={`flex flex-col items-center ${isConcluida ? 'text-green-600' : 'text-slate-400'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isConcluida ? 'bg-green-100' : 'bg-slate-100'
                        }`}>
                          {isConcluida ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                        </div>
                        <span className="text-xs mt-1 text-center max-w-[80px]">{fase.label}</span>
                      </div>
                      {index < FASES_INTERNAS.length - 1 && (
                        <div className={`w-12 h-1 mx-2 ${isConcluida ? 'bg-green-400' : 'bg-slate-200'}`} />
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Fase Externa */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Gavel className="h-5 w-5" />
                    Fase Externa (Licitacao)
                  </CardTitle>
                  <CardDescription>Processo licitatorio em andamento</CardDescription>
                </div>
                <Badge className="bg-blue-100 text-blue-800">
                  {FASES_EXTERNAS.find(f => f.id === licitacao.fase)?.label || licitacao.fase}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progresso</span>
                  <span>{Math.round(progressoFaseExterna())}%</span>
                </div>
                <Progress value={progressoFaseExterna()} className="h-2" />
              </div>

              <div className="grid grid-cols-5 gap-2">
                {FASES_EXTERNAS.map((fase, index) => {
                  const Icon = fase.icon
                  const faseIndex = getFaseIndex(fase.id, FASES_EXTERNAS)
                  const faseAtualIndex = getFaseIndex(licitacao.fase, FASES_EXTERNAS)
                  const isConcluida = faseIndex < faseAtualIndex
                  const isAtual = faseIndex === faseAtualIndex
                  const isPendente = faseIndex > faseAtualIndex
                  const faseInfo = FASES_INFO[fase.id]

                  return (
                    <div 
                      key={fase.id} 
                      onClick={() => faseInfo && setFaseModal(faseInfo)}
                      className={`p-3 rounded-lg border text-center transition-colors cursor-pointer hover:shadow-md ${
                        isAtual ? 'border-blue-500 bg-blue-50 hover:bg-blue-100' :
                        isConcluida ? 'border-green-300 bg-green-50 hover:bg-green-100' :
                        'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center mb-1 ${
                        isAtual ? 'bg-blue-500 text-white' :
                        isConcluida ? 'bg-green-500 text-white' :
                        'bg-slate-200 text-slate-500'
                      }`}>
                        {isConcluida ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <p className={`text-xs font-medium ${
                        isAtual ? 'text-blue-700' :
                        isConcluida ? 'text-green-700' :
                        'text-slate-500'
                      }`}>
                        {fase.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">Clique para detalhes</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Acoes da Fase Atual */}
          <Card>
            <CardHeader>
              <CardTitle>Acoes Disponiveis</CardTitle>
              <CardDescription>Acoes para a fase atual: {FASES_EXTERNAS.find(f => f.id === licitacao.fase)?.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && (
                  <>
                    <Button variant="outline" className="h-20 flex-col">
                      <Users className="h-6 w-6 mb-2" />
                      Ver Propostas
                    </Button>
                    <Button className="h-20 flex-col">
                      <Play className="h-6 w-6 mb-2" />
                      Iniciar Sessao Publica
                    </Button>
                    <Button variant="outline" className="h-20 flex-col">
                      <Pause className="h-6 w-6 mb-2" />
                      Suspender Processo
                    </Button>
                  </>
                )}
                {licitacao.fase === 'EM_DISPUTA' && (
                  <>
                    <Link href={`/orgao/licitacoes/${licitacao.id}/sala`} className="contents">
                      <Button variant="destructive" className="h-20 flex-col">
                        <Gavel className="h-6 w-6 mb-2" />
                        Acessar Sala de Disputa
                      </Button>
                    </Link>
                    <Button variant="outline" className="h-20 flex-col">
                      <Pause className="h-6 w-6 mb-2" />
                      Suspender Sessao
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Documentos do Processo</CardTitle>
                <Button size="sm">
                  <Upload className="mr-2 h-4 w-4" /> Adicionar Documento
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {documentos.map((doc) => {
                  const statusConfig = getStatusDocumento(doc.status)
                  const StatusIcon = statusConfig.icon
                  return (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.titulo}</p>
                          <p className="text-sm text-muted-foreground">Tipo: {doc.tipo}</p>
                        </div>
                      </div>
                      <Badge className={statusConfig.className}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusConfig.label}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="propostas">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Propostas Recebidas ({propostas.length})</CardTitle>
                  <CardDescription>Analise as propostas antes de iniciar a sessão de disputa</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge className="bg-green-100 text-green-700">
                    {propostas.filter(p => p.status === 'CLASSIFICADA').length} Classificadas
                  </Badge>
                  <Badge className="bg-red-100 text-red-700">
                    {propostas.filter(p => p.status === 'DESCLASSIFICADA').length} Desclassificadas
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {propostas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma proposta recebida ainda</p>
                  <p className="text-sm">As propostas aparecerão aqui quando os fornecedores as enviarem</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {propostas.map((proposta, index) => {
                    const statusConfig = getStatusProposta(proposta.status)
                    return (
                      <div key={proposta.id} className="border rounded-lg p-4 hover:bg-slate-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg font-bold text-blue-600">#{index + 1}</span>
                              <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
                              {proposta.fornecedor?.porte && (
                                <Badge variant="outline">{proposta.fornecedor.porte}</Badge>
                              )}
                            </div>
                            <p className="font-medium">{proposta.fornecedor?.razao_social || 'Fornecedor não identificado'}</p>
                            <p className="text-sm text-muted-foreground">{proposta.fornecedor?.cpf_cnpj}</p>
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <span className="font-semibold text-green-600">
                                {formatarMoeda(proposta.valor_total_proposta)}
                              </span>
                              <span className="text-muted-foreground">
                                Enviada em: {formatarData(proposta.data_envio)}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {proposta.status !== 'DESCLASSIFICADA' && proposta.status !== 'CLASSIFICADA' && (
                              <>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="text-green-600 border-green-600 hover:bg-green-50"
                                  onClick={() => classificarProposta(proposta.id)}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Classificar
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="text-red-600 border-red-600 hover:bg-red-50"
                                  onClick={() => {
                                    const motivo = prompt('Informe o motivo da desclassificação:')
                                    if (motivo) desclassificarProposta(proposta.id, motivo)
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" /> Desclassificar
                                </Button>
                              </>
                            )}
                            <Button size="sm" variant="ghost">
                              <Eye className="h-4 w-4 mr-1" /> Detalhes
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle>Historico do Processo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { data: '2025-11-20 09:00', evento: 'Edital publicado no PNCP', usuario: 'Maria Silva' },
                  { data: '2025-11-15 14:30', evento: 'Parecer juridico aprovado', usuario: 'Dr. Joao Santos' },
                  { data: '2025-11-10 10:00', evento: 'Termo de Referencia aprovado', usuario: 'Carlos Oliveira' },
                  { data: '2025-11-05 11:00', evento: 'Processo iniciado', usuario: 'Maria Silva' },
                ].map((item, index) => (
                  <div key={index} className="flex gap-4 items-start">
                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
                    <div>
                      <p className="font-medium">{item.evento}</p>
                      <p className="text-sm text-muted-foreground">{item.data} - {item.usuario}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Informações da Fase */}
      {faseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setFaseModal(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">{faseModal.label}</h2>
                {licitacao?.fase === faseModal.id && (
                  <Badge className="bg-blue-100 text-blue-700">Fase Atual</Badge>
                )}
              </div>
              <button onClick={() => setFaseModal(null)} className="p-1 hover:bg-slate-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Descrição</p>
                <p>{faseModal.descricao}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Base Legal</p>
                <Badge variant="outline">{faseModal.artigo}</Badge>
              </div>
              
              {/* Ações Disponíveis - FUNCIONAIS */}
              {licitacao?.fase === faseModal.id && getAcoesFase(faseModal.id).length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-800 mb-3">Ações Disponíveis</p>
                  <div className="flex flex-wrap gap-2">
                    {getAcoesFase(faseModal.id).map((acao, i) => {
                      const Icon = acao.icon
                      return (
                        <Button 
                          key={i}
                          variant={acao.variant || 'outline'}
                          size="sm"
                          onClick={acao.action}
                          className={acao.variant === 'default' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                        >
                          {Icon && <Icon className="h-4 w-4 mr-1" />}
                          {acao.label}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Se não é fase atual, mostra status */}
              {licitacao?.fase !== faseModal.id && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600">
                    {FASES_EXTERNAS.findIndex(f => f.id === faseModal.id) < FASES_EXTERNAS.findIndex(f => f.id === licitacao?.fase)
                      ? '✓ Esta fase já foi concluída'
                      : '○ Esta fase ainda não foi iniciada'}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-2">Checklist da Fase</p>
                <ul className="space-y-1">
                  {faseModal.acoes.map((acao, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="rounded" />
                      {acao}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-between">
              <div className="flex gap-2">
                {licitacao?.fase === faseModal.id && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="text-orange-600 border-orange-300"
                    onClick={() => {
                      const motivo = prompt('Informe o motivo para retroceder a fase:')
                      if (motivo) retrocederFase(motivo)
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Retroceder Fase
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={() => setFaseModal(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ação (Suspender/Revogar/Anular/Excluir) */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setActionModal(null); setMotivoAcao(''); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${
                  actionModal.type === 'excluir' || actionModal.type === 'anular' ? 'text-red-600' :
                  actionModal.type === 'revogar' ? 'text-orange-600' :
                  actionModal.type === 'suspender' ? 'text-yellow-600' :
                  'text-green-600'
                }`} />
                <h2 className="text-lg font-semibold">{actionModal.title}</h2>
              </div>
              <button onClick={() => { setActionModal(null); setMotivoAcao(''); }} className="p-1 hover:bg-slate-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {actionModal.type === 'excluir' ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 font-medium">Atenção!</p>
                  <p className="text-red-700 text-sm mt-1">
                    Esta ação é irreversível. A licitação e todos os seus dados serão permanentemente excluídos.
                  </p>
                  <p className="text-red-700 text-sm mt-2">
                    <strong>Nota:</strong> Só é possível excluir licitações em fase interna (antes da publicação do edital).
                  </p>
                </div>
              ) : actionModal.type === 'retomar' ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-800 font-medium">Retomar Licitação</p>
                  <p className="text-green-700 text-sm mt-1">
                    A licitação será retomada e voltará para a fase de Acolhimento de Propostas.
                  </p>
                </div>
              ) : (
                <>
                  <div className={`border rounded-lg p-4 ${
                    actionModal.type === 'anular' ? 'bg-red-50 border-red-200' :
                    actionModal.type === 'revogar' ? 'bg-orange-50 border-orange-200' :
                    'bg-yellow-50 border-yellow-200'
                  }`}>
                    <p className={`font-medium ${
                      actionModal.type === 'anular' ? 'text-red-800' :
                      actionModal.type === 'revogar' ? 'text-orange-800' :
                      'text-yellow-800'
                    }`}>
                      {actionModal.type === 'suspender' && 'Art. 147 - Suspensão do Processo'}
                      {actionModal.type === 'revogar' && 'Art. 71, §1º - Revogação por interesse público'}
                      {actionModal.type === 'anular' && 'Art. 71, §1º - Anulação por ilegalidade'}
                    </p>
                    <p className={`text-sm mt-1 ${
                      actionModal.type === 'anular' ? 'text-red-700' :
                      actionModal.type === 'revogar' ? 'text-orange-700' :
                      'text-yellow-700'
                    }`}>
                      {actionModal.type === 'suspender' && 'A licitação será suspensa temporariamente. Poderá ser retomada posteriormente.'}
                      {actionModal.type === 'revogar' && 'A revogação encerra definitivamente o processo por razões de interesse público.'}
                      {actionModal.type === 'anular' && 'A anulação encerra o processo devido a vícios de ilegalidade.'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Motivo (obrigatório)
                    </label>
                    <Textarea
                      placeholder="Descreva o motivo desta ação..."
                      value={motivoAcao}
                      onChange={(e) => setMotivoAcao(e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setActionModal(null); setMotivoAcao(''); }}>
                Cancelar
              </Button>
              <Button 
                variant={actionModal.type === 'retomar' ? 'default' : 'destructive'}
                onClick={executarAcao}
                disabled={actionLoading || (['suspender', 'revogar', 'anular'].includes(actionModal.type) && !motivoAcao.trim())}
              >
                {actionLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
                ) : (
                  <>Confirmar {actionModal.title}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
