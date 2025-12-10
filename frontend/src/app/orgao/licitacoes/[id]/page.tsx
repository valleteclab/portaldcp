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
  MessageSquare,
  Send,
  ExternalLink,
  Download,
  HelpCircle,
  FileWarning,
  Building2,
  Calendar,
  RefreshCw,
  Plus,
  Edit
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Fases conforme Lei 14.133/2021 - Art. 17
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
  data_fim_propostas: string
  pregoeiro_nome: string
  sigilo_orcamento: string
  created_at: string
  enviado_pncp?: boolean
  numero_controle_pncp?: string
  sequencial_compra_pncp?: number
  ano_compra_pncp?: number
  orgao?: {
    nome: string
    cnpj: string
  }
}

interface Documento {
  id: string
  tipo: string
  titulo: string
  status: string
  nome_original?: string
  tamanho?: number
  publico?: boolean
  created_at: string
  descricao?: string
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

interface Impugnacao {
  id: string
  texto_impugnacao: string
  nome_impugnante: string
  cpf_cnpj_impugnante: string
  email_impugnante: string
  is_cidadao: boolean
  status: string
  resposta?: string
  respondido_por?: string
  data_resposta?: string
  created_at: string
}

interface EventoHistorico {
  id: string
  tipo: string
  descricao: string
  usuario_nome?: string
  created_at: string
  dados_adicionais?: any
}

interface ItemLicitacao {
  id: string
  numero_item: number
  numero_lote?: number
  descricao_resumida: string
  descricao_detalhada?: string
  quantidade: number
  unidade_medida: string
  valor_unitario_estimado: number
  valor_total_estimado: number
  tipo_participacao: string
  status: string
  codigo_catalogo?: string
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
  const [enviandoPncp, setEnviandoPncp] = useState(false)
  const [impugnacoes, setImpugnacoes] = useState<Impugnacao[]>([])
  const [historico, setHistorico] = useState<EventoHistorico[]>([])
  const [itens, setItens] = useState<ItemLicitacao[]>([])
  const [loadingItens, setLoadingItens] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingLicitacao, setEditingLicitacao] = useState<Partial<Licitacao>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Partial<ItemLicitacao> | null>(null)
  const [savingItem, setSavingItem] = useState(false)
  const [estatisticas, setEstatisticas] = useState<{
    totalDocumentos: number
    totalPropostas: number
    totalImpugnacoes: number
    impugnacoesPendentes: number
  }>({ totalDocumentos: 0, totalPropostas: 0, totalImpugnacoes: 0, impugnacoesPendentes: 0 })
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [novoDocumento, setNovoDocumento] = useState({
    tipo: 'EDITAL',
    titulo: '',
    descricao: '',
    publico: true
  })
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null)

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

      // Carregar documentos da licitação (ambos endpoints)
      let todosDocumentos: Documento[] = []
      
      // Documentos do módulo de documentos
      const resDocs = await fetch(`${API_URL}/api/documentos/licitacao/${licitacaoId}`)
      if (resDocs.ok) {
        const docsData = await resDocs.json()
        todosDocumentos = [...todosDocumentos, ...docsData]
      }
      
      // Documentos da fase interna
      const resDocsFase = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos`)
      if (resDocsFase.ok) {
        const docsFaseData = await resDocsFase.json()
        if (Array.isArray(docsFaseData)) {
          todosDocumentos = [...todosDocumentos, ...docsFaseData]
        }
      }
      
      setDocumentos(todosDocumentos)

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

      // Carregar impugnações
      const resImpugnacoes = await fetch(`${API_URL}/api/impugnacoes/licitacao/${licitacaoId}`)
      if (resImpugnacoes.ok) {
        const impugnacoesData = await resImpugnacoes.json()
        setImpugnacoes(impugnacoesData)
      }

      // Carregar itens da licitação
      const resItens = await fetch(`${API_URL}/api/itens/licitacao/${licitacaoId}`)
      if (resItens.ok) {
        const itensData = await resItens.json()
        setItens(itensData)
      }

      // Carregar histórico/eventos da sessão (se existir)
      try {
        const resSessao = await fetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}`)
        if (resSessao.ok) {
          const sessaoData = await resSessao.json()
          if (sessaoData?.id) {
            const resEventos = await fetch(`${API_URL}/api/sessao/${sessaoData.id}/eventos`)
            if (resEventos.ok) {
              const eventosData = await resEventos.json()
              setHistorico(eventosData)
            }
          }
        }
      } catch (e) {
        // Sessão pode não existir ainda
      }

      // Calcular estatísticas
      setEstatisticas({
        totalDocumentos: documentos.length,
        totalPropostas: propostas.length,
        totalImpugnacoes: impugnacoes.length,
        impugnacoesPendentes: impugnacoes.filter(i => i.status === 'PENDENTE').length
      })
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

  // Upload de documento
  const uploadDocumento = async () => {
    if (!arquivoSelecionado || !novoDocumento.titulo) {
      alert('Selecione um arquivo e preencha o título')
      return
    }

    setUploadingDoc(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivoSelecionado)
      formData.append('tipo', novoDocumento.tipo)
      formData.append('titulo', novoDocumento.titulo)
      formData.append('descricao', novoDocumento.descricao)
      formData.append('publico', String(novoDocumento.publico))

      const res = await fetch(`${API_URL}/api/documentos/licitacao/${licitacaoId}`, {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        alert('Documento enviado com sucesso!')
        setShowUploadModal(false)
        setArquivoSelecionado(null)
        setNovoDocumento({ tipo: 'EDITAL', titulo: '', descricao: '', publico: true })
        carregarDados()
      } else {
        const error = await res.json()
        alert(`Erro ao enviar documento: ${error.message || 'Erro desconhecido'}`)
      }
    } catch (error) {
      console.error('Erro ao enviar documento:', error)
      alert('Erro ao enviar documento')
    } finally {
      setUploadingDoc(false)
    }
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

  // Sincronizar fase baseado no cronograma (datas)
  const sincronizarFase = async () => {
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/atualizar-fase`, {
        method: 'PUT',
      })
      if (res.ok) {
        carregarDados()
        alert('Fase sincronizada com o cronograma!')
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao sincronizar fase')
    }
  }

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

  // Suspender licitação
  const suspenderLicitacao = async () => {
    const motivo = prompt('Informe o motivo da suspensão:')
    if (!motivo) return
    
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/suspender`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      })
      if (res.ok) {
        carregarDados()
        alert('Licitação suspensa com sucesso!')
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao suspender licitação')
    }
  }

  // Marcar fase interna como concluída (quando feita fora do sistema)
  const marcarFaseInternaConcluida = async () => {
    if (!licitacao) return
    
    const confirmou = window.confirm('Confirma que a fase interna (preparatória) foi concluída?\n\nIsso indica que os documentos obrigatórios (ETP, TR, Orçamento, Parecer Jurídico e Autorização) já foram elaborados, mesmo que fora deste sistema.\n\nApós confirmar, você poderá enviar a licitação ao PNCP.')
    
    if (!confirmou) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fase_interna_concluida: true
        })
      })

      if (response.ok) {
        window.alert('✅ Fase interna marcada como concluída!\n\nAgora você pode enviar a licitação ao PNCP.')
        await carregarDados()
      } else {
        const data = await response.json()
        window.alert(`❌ Erro: ${data.message || 'Erro ao atualizar'}`)
      }
    } catch (error) {
      console.error('Erro ao marcar fase interna:', error)
      window.alert('Erro ao conectar com o servidor.')
    } finally {
      setLoading(false)
    }
  }

  // Enviar para o PNCP
  const enviarParaPNCP = async () => {
    if (!licitacao) return
    
    if (!confirm('Deseja enviar esta licitação para o PNCP?\n\nEsta ação publicará a compra no Portal Nacional de Contratações Públicas.')) {
      return
    }

    setEnviandoPncp(true)
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await fetch(`${API_URL}/api/pncp/compras/${licitacaoId}/completo`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert(`✅ Licitação enviada ao PNCP com sucesso!\n\nNúmero de Controle: ${data.numeroControlePNCP || 'Gerado'}`)
        carregarDados()
      } else {
        alert(`❌ Erro ao enviar para o PNCP:\n\n${data.message || data.erro || 'Erro desconhecido'}`)
      }
    } catch (error) {
      console.error('Erro ao enviar para PNCP:', error)
      alert('Erro ao conectar com o servidor. Verifique sua conexão.')
    } finally {
      setEnviandoPncp(false)
    }
  }

  // Verificar se pode enviar ao PNCP
  const podeEnviarPNCP = () => {
    if (!licitacao) return false
    // Pode enviar se fase interna concluída e ainda não foi enviado
    return licitacao.fase_interna_concluida && !licitacao.enviado_pncp
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
          {/* Botão PNCP */}
          {podeEnviarPNCP() && (
            <Button 
              onClick={enviarParaPNCP}
              disabled={enviandoPncp}
              className="bg-green-600 hover:bg-green-700"
            >
              {enviandoPncp ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />Enviar ao PNCP</>
              )}
            </Button>
          )}
          {licitacao.enviado_pncp && (
            <Badge className="bg-green-100 text-green-700 px-3 py-2">
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Enviado ao PNCP
            </Badge>
          )}
        </div>
      </div>

      {/* Status PNCP */}
      {licitacao.enviado_pncp && licitacao.numero_controle_pncp && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-800">Publicado no PNCP</p>
                  <p className="text-sm text-green-600">
                    Nº Controle: {licitacao.numero_controle_pncp}
                    {licitacao.sequencial_compra_pncp && ` | Sequencial: ${licitacao.sequencial_compra_pncp}`}
                    {licitacao.ano_compra_pncp && ` | Ano: ${licitacao.ano_compra_pncp}`}
                  </p>
                </div>
              </div>
              <a 
                href={`https://pncp.gov.br/app/editais/${licitacao.numero_controle_pncp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="text-green-700 border-green-300">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Ver no PNCP
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controle de Fase - Art. 17 Lei 14.133/2021 */}
      {licitacao.enviado_pncp && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-blue-800">Controle de Fase</p>
                  <p className="text-sm text-blue-600">
                    Fase atual: <strong>{FASES_EXTERNAS.find(f => f.id === licitacao.fase)?.label || licitacao.fase}</strong>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {/* Sincronizar fase baseado no cronograma */}
                {['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS'].includes(licitacao.fase) && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={sincronizarFase}
                    title="Atualiza a fase automaticamente baseado nas datas do cronograma"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Sincronizar
                  </Button>
                )}
                {!['CONCLUIDO', 'FRACASSADO', 'DESERTO', 'REVOGADO', 'ANULADO'].includes(licitacao.fase) && (
                  <Button 
                    size="sm" 
                    onClick={avancarFase}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <ChevronRight className="w-4 h-4 mr-1" />
                    Avançar Fase
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
              {FASES_EXTERNAS.find(f => f.id === licitacao.fase)?.label || FASES_INTERNAS.find(f => f.id === licitacao.fase)?.label || licitacao.fase}
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

      {/* Estatísticas do Processo */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Documentos</p>
                <p className="text-2xl font-bold">{documentos.length}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Propostas</p>
                <p className="text-2xl font-bold">{propostas.length}</p>
              </div>
              <Users className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${impugnacoes.some(i => i.status === 'PENDENTE') ? 'border-l-yellow-500' : 'border-l-slate-300'}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Impugnações</p>
                <p className="text-2xl font-bold">
                  {impugnacoes.length}
                  {impugnacoes.some(i => i.status === 'PENDENTE') && (
                    <span className="text-sm text-yellow-600 ml-2">
                      ({impugnacoes.filter(i => i.status === 'PENDENTE').length} pendentes)
                    </span>
                  )}
                </p>
              </div>
              <FileWarning className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Eventos</p>
                <p className="text-2xl font-bold">{historico.length}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fases">
        <TabsList>
          <TabsTrigger value="fases">Fases do Processo</TabsTrigger>
          <TabsTrigger value="documentos">
            Documentos
            {documentos.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{documentos.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="impugnacoes">
            Impugnações
            {impugnacoes.length > 0 && (
              <Badge variant={impugnacoes.some(i => i.status === 'PENDENTE') ? 'destructive' : 'secondary'} className="ml-2 text-xs">
                {impugnacoes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="propostas">
            Propostas
            {propostas.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{propostas.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="itens">
            Itens
            {itens.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{itens.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dados">Dados da Licitação</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
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
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={marcarFaseInternaConcluida}
                      title="Use esta opção se a fase interna foi feita fora do sistema"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como Concluída
                    </Button>
                    <Link href={`/orgao/licitacoes/${licitacao.id}/fase-interna`}>
                      <Button size="sm"><Settings className="mr-2 h-4 w-4" /> Gerenciar no Sistema</Button>
                    </Link>
                  </div>
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
              {!licitacao.fase_interna_concluida && (
                <p className="text-xs text-muted-foreground mt-4 bg-amber-50 p-2 rounded border border-amber-200">
                  <strong>Nota:</strong> Se a fase interna foi realizada fora deste sistema (em papel ou outro software), 
                  clique em "Marcar como Concluída" para liberar o envio ao PNCP.
                </p>
              )}
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
                {/* Ações comuns - Ver Impugnações e Esclarecimentos */}
                <Link href={`/orgao/licitacoes/${licitacaoId}/impugnacoes`} className="contents">
                  <Button variant="outline" className="h-20 flex-col">
                    <MessageSquare className="h-6 w-6 mb-2" />
                    Ver Impugnações
                  </Button>
                </Link>
                <Link href={`/orgao/licitacoes/${licitacaoId}/esclarecimentos`} className="contents">
                  <Button variant="outline" className="h-20 flex-col">
                    <HelpCircle className="h-6 w-6 mb-2" />
                    Ver Esclarecimentos
                  </Button>
                </Link>

                {/* Ações específicas por fase */}
                {['ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS'].includes(licitacao.fase) && (
                  <>
                    <Link href={`/orgao/licitacoes/${licitacaoId}/propostas`} className="contents">
                      <Button variant="outline" className="h-20 flex-col">
                        <Users className="h-6 w-6 mb-2" />
                        Ver Propostas
                      </Button>
                    </Link>
                    <Link href={`/orgao/licitacoes/${licitacaoId}/sessao`} className="contents">
                      <Button className="h-20 flex-col">
                        <Play className="h-6 w-6 mb-2" />
                        Iniciar Sessão Pública
                      </Button>
                    </Link>
                    <Button variant="outline" className="h-20 flex-col" onClick={() => suspenderLicitacao()}>
                      <Pause className="h-6 w-6 mb-2" />
                      Suspender Processo
                    </Button>
                  </>
                )}
                {licitacao.fase === 'EM_DISPUTA' && (
                  <>
                    <Link href={`/orgao/licitacoes/${licitacaoId}/sala`} className="contents">
                      <Button variant="destructive" className="h-20 flex-col">
                        <Gavel className="h-6 w-6 mb-2" />
                        Acessar Sala de Disputa
                      </Button>
                    </Link>
                    <Button variant="outline" className="h-20 flex-col" onClick={() => suspenderLicitacao()}>
                      <Pause className="h-6 w-6 mb-2" />
                      Suspender Sessão
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
                <div>
                  <CardTitle>Documentos do Processo</CardTitle>
                  <CardDescription>
                    {documentos.length} documento(s) cadastrado(s) | {documentos.filter(d => d.publico).length} público(s)
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setShowUploadModal(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Adicionar Documento
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {documentos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum documento cadastrado</p>
                  <p className="text-sm">Adicione documentos como Edital, Termo de Referência, etc.</p>
                  <Button className="mt-4" onClick={() => setShowUploadModal(true)}>
                    <Upload className="mr-2 h-4 w-4" /> Adicionar Primeiro Documento
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {documentos.map((doc) => {
                    const statusConfig = getStatusDocumento(doc.status)
                    const StatusIcon = statusConfig.icon
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{doc.titulo || doc.nome_original}</p>
                              {doc.publico && (
                                <Badge variant="outline" className="text-xs">Público</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {doc.tipo} • {doc.tamanho ? `${(doc.tamanho / 1024).toFixed(1)} KB` : ''} • {formatarData(doc.created_at)}
                            </p>
                            {doc.descricao && (
                              <p className="text-xs text-slate-500 mt-1">{doc.descricao}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusConfig.className}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => window.open(`${API_URL}/api/documentos/${doc.id}/download`, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Impugnações - Art. 164 da Lei 14.133/2021 */}
        <TabsContent value="impugnacoes">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileWarning className="h-5 w-5" />
                    Impugnações e Esclarecimentos
                  </CardTitle>
                  <CardDescription>
                    Art. 164 da Lei 14.133/2021 - Prazo de 3 dias úteis para resposta
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge className="bg-yellow-100 text-yellow-700">
                    {impugnacoes.filter(i => i.status === 'PENDENTE').length} Pendentes
                  </Badge>
                  <Badge className="bg-green-100 text-green-700">
                    {impugnacoes.filter(i => i.status === 'RESPONDIDA' || i.status === 'DEFERIDA' || i.status === 'INDEFERIDA').length} Respondidas
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {impugnacoes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma impugnação ou pedido de esclarecimento</p>
                  <p className="text-sm">As impugnações aparecerão aqui quando forem registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {impugnacoes.map((impugnacao) => (
                    <div key={impugnacao.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={
                              impugnacao.status === 'PENDENTE' ? 'bg-yellow-100 text-yellow-700' :
                              impugnacao.status === 'EM_ANALISE' ? 'bg-blue-100 text-blue-700' :
                              impugnacao.status === 'DEFERIDA' ? 'bg-green-100 text-green-700' :
                              impugnacao.status === 'INDEFERIDA' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-700'
                            }>
                              {impugnacao.status.replace('_', ' ')}
                            </Badge>
                            {impugnacao.is_cidadao && (
                              <Badge variant="outline">Cidadão</Badge>
                            )}
                          </div>
                          <p className="font-medium">{impugnacao.nome_impugnante}</p>
                          <p className="text-sm text-muted-foreground">
                            {impugnacao.cpf_cnpj_impugnante} • {impugnacao.email_impugnante}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{formatarData(impugnacao.created_at)}</p>
                      </div>
                      
                      <div className="bg-slate-50 rounded p-3 mb-3">
                        <p className="text-sm font-medium text-slate-700 mb-1">Texto da Impugnação:</p>
                        <p className="text-sm">{impugnacao.texto_impugnacao}</p>
                      </div>

                      {impugnacao.resposta && (
                        <div className="bg-blue-50 rounded p-3 mb-3">
                          <p className="text-sm font-medium text-blue-700 mb-1">
                            Resposta ({impugnacao.respondido_por} - {formatarData(impugnacao.data_resposta || '')}):
                          </p>
                          <p className="text-sm">{impugnacao.resposta}</p>
                        </div>
                      )}

                      {impugnacao.status === 'PENDENTE' && (
                        <div className="flex gap-2">
                          <Link href={`/orgao/licitacoes/${licitacaoId}/impugnacoes`}>
                            <Button size="sm">
                              <MessageSquare className="h-4 w-4 mr-1" /> Responder
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Histórico do Processo</CardTitle>
                  <CardDescription>Registro de todos os eventos e ações realizadas</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={carregarDados}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {historico.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum evento registrado ainda</p>
                  <p className="text-sm">O histórico será preenchido conforme o processo avançar</p>
                  
                  {/* Mostrar informações básicas da licitação como histórico inicial */}
                  {licitacao && (
                    <div className="mt-6 text-left max-w-md mx-auto">
                      <p className="text-sm font-medium text-slate-700 mb-3">Informações do Processo:</p>
                      <div className="space-y-2">
                        <div className="flex gap-4 items-start">
                          <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                          <div>
                            <p className="font-medium text-slate-800">Processo criado</p>
                            <p className="text-sm text-muted-foreground">{formatarData(licitacao.created_at)}</p>
                          </div>
                        </div>
                        {licitacao.fase_interna_concluida && (
                          <div className="flex gap-4 items-start">
                            <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                            <div>
                              <p className="font-medium text-slate-800">Fase interna concluída</p>
                              <p className="text-sm text-muted-foreground">Processo pronto para publicação</p>
                            </div>
                          </div>
                        )}
                        {licitacao.enviado_pncp && (
                          <div className="flex gap-4 items-start">
                            <div className="w-2 h-2 mt-2 rounded-full bg-blue-500" />
                            <div>
                              <p className="font-medium text-slate-800">Enviado ao PNCP</p>
                              <p className="text-sm text-muted-foreground">Nº Controle: {licitacao.numero_controle_pncp}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {historico.map((evento) => (
                    <div key={evento.id} className="flex gap-4 items-start">
                      <div className={`w-2 h-2 mt-2 rounded-full ${
                        evento.tipo.includes('ERRO') ? 'bg-red-500' :
                        evento.tipo.includes('APROVAD') ? 'bg-green-500' :
                        evento.tipo.includes('INICIADA') ? 'bg-blue-500' :
                        'bg-slate-400'
                      }`} />
                      <div className="flex-1">
                        <p className="font-medium">{evento.descricao}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatarData(evento.created_at)}</span>
                          {evento.usuario_nome && (
                            <>
                              <span>•</span>
                              <span>{evento.usuario_nome}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Itens */}
        <TabsContent value="itens">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Itens da Licitação</CardTitle>
                  <CardDescription>
                    {itens.length} item(ns) cadastrado(s) | Valor total estimado: {formatarMoeda(itens.reduce((sum, i) => sum + Number(i.valor_total_estimado), 0))}
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => {
                  setEditingItem({
                    numero_item: itens.length + 1,
                    quantidade: 1,
                    unidade_medida: 'UNIDADE',
                    valor_unitario_estimado: 0,
                    tipo_participacao: 'AMPLA',
                    status: 'ATIVO'
                  })
                  setShowItemModal(true)
                }}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {itens.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum item cadastrado</p>
                  <p className="text-sm">Adicione os itens que serão licitados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Item</th>
                          <th className="px-4 py-3 text-left font-medium">Descrição</th>
                          <th className="px-4 py-3 text-right font-medium">Qtd</th>
                          <th className="px-4 py-3 text-left font-medium">Unid.</th>
                          <th className="px-4 py-3 text-right font-medium">Valor Unit.</th>
                          <th className="px-4 py-3 text-right font-medium">Valor Total</th>
                          <th className="px-4 py-3 text-center font-medium">Status</th>
                          <th className="px-4 py-3 text-center font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {itens.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium">
                              {item.numero_lote ? `L${item.numero_lote}-` : ''}{item.numero_item}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{item.descricao_resumida}</p>
                              {item.codigo_catalogo && (
                                <p className="text-xs text-muted-foreground">Cód: {item.codigo_catalogo}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">{Number(item.quantidade).toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3">{item.unidade_medida}</td>
                            <td className="px-4 py-3 text-right">{formatarMoeda(item.valor_unitario_estimado)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatarMoeda(item.valor_total_estimado)}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={
                                item.status === 'ATIVO' ? 'bg-green-100 text-green-700' :
                                item.status === 'ADJUDICADO' ? 'bg-blue-100 text-blue-700' :
                                item.status === 'HOMOLOGADO' ? 'bg-emerald-100 text-emerald-700' :
                                item.status === 'CANCELADO' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-700'
                              }>
                                {item.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setEditingItem(item)
                                  setShowItemModal(true)
                                }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={async () => {
                                  if (confirm(`Excluir item ${item.numero_item}?`)) {
                                    try {
                                      const res = await fetch(`${API_URL}/api/itens/${item.id}`, { method: 'DELETE' })
                                      if (res.ok) {
                                        carregarDados()
                                      } else {
                                        alert('Erro ao excluir item')
                                      }
                                    } catch (e) {
                                      alert('Erro ao excluir item')
                                    }
                                  }
                                }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-100 font-medium">
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-right">Total Estimado:</td>
                          <td className="px-4 py-3 text-right">{formatarMoeda(itens.reduce((sum, i) => sum + Number(i.valor_total_estimado), 0))}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Dados da Licitação */}
        <TabsContent value="dados">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Dados da Licitação</CardTitle>
                  <CardDescription>Informações gerais do processo licitatório</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  setEditingLicitacao({...licitacao})
                  setShowEditModal(true)
                }}>
                  <Settings className="mr-2 h-4 w-4" /> Editar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Número do Processo</p>
                    <p className="font-medium">{licitacao.numero_processo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Objeto</p>
                    <p className="font-medium">{licitacao.objeto}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Modalidade</p>
                    <p className="font-medium">{licitacao.modalidade?.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Total Estimado</p>
                    <p className="font-medium">{formatarMoeda(licitacao.valor_total_estimado)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Órgão</p>
                    <p className="font-medium">{licitacao.orgao?.nome || '-'}</p>
                    {licitacao.orgao?.cnpj && <p className="text-sm text-muted-foreground">CNPJ: {licitacao.orgao.cnpj}</p>}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Data de Publicação</p>
                    <p className="font-medium">{formatarData(licitacao.data_publicacao_edital)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Data de Abertura da Sessão</p>
                    <p className="font-medium">{formatarData(licitacao.data_abertura_sessao)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pregoeiro</p>
                    <p className="font-medium">{licitacao.pregoeiro_nome || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sigilo do Orçamento</p>
                    <p className="font-medium">{licitacao.sigilo_orcamento || 'Público'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status PNCP</p>
                    {licitacao.enviado_pncp ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-700">Enviado</Badge>
                        {licitacao.numero_controle_pncp && <span className="text-sm">Nº: {licitacao.numero_controle_pncp}</span>}
                      </div>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-700">Não enviado</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Edição da Licitação */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Editar Licitação</h2>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Número do Processo</label>
                <Input 
                  value={editingLicitacao.numero_processo || ''} 
                  onChange={(e) => setEditingLicitacao({...editingLicitacao, numero_processo: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Objeto</label>
                <Textarea 
                  value={editingLicitacao.objeto || ''} 
                  onChange={(e) => setEditingLicitacao({...editingLicitacao, objeto: e.target.value})}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Valor Total Estimado</label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={editingLicitacao.valor_total_estimado || ''} 
                    onChange={(e) => setEditingLicitacao({...editingLicitacao, valor_total_estimado: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Pregoeiro</label>
                  <Input 
                    value={editingLicitacao.pregoeiro_nome || ''} 
                    onChange={(e) => setEditingLicitacao({...editingLicitacao, pregoeiro_nome: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Data de Publicação</label>
                  <Input 
                    type="date"
                    value={editingLicitacao.data_publicacao_edital?.split('T')[0] || ''} 
                    onChange={(e) => setEditingLicitacao({...editingLicitacao, data_publicacao_edital: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data de Abertura</label>
                  <Input 
                    type="datetime-local"
                    value={editingLicitacao.data_abertura_sessao?.slice(0, 16) || ''} 
                    onChange={(e) => setEditingLicitacao({...editingLicitacao, data_abertura_sessao: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 sticky bottom-0">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={async () => {
                  setSavingEdit(true)
                  try {
                    const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(editingLicitacao)
                    })
                    if (res.ok) {
                      alert('Licitação atualizada com sucesso!')
                      setShowEditModal(false)
                      carregarDados()
                    } else {
                      const error = await res.json()
                      alert(`Erro: ${error.message || 'Falha ao salvar'}`)
                    }
                  } catch (error) {
                    console.error('Erro:', error)
                    alert('Erro ao salvar alterações')
                  } finally {
                    setSavingEdit(false)
                  }
                }}
                disabled={savingEdit}
              >
                {savingEdit ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : 'Salvar Alterações'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criar/Editar Item */}
      {showItemModal && editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowItemModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">{editingItem.id ? 'Editar Item' : 'Novo Item'}</h2>
              <button onClick={() => setShowItemModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nº Item *</label>
                  <Input 
                    type="number"
                    value={editingItem.numero_item || ''} 
                    onChange={(e) => setEditingItem({...editingItem, numero_item: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nº Lote</label>
                  <Input 
                    type="number"
                    value={editingItem.numero_lote || ''} 
                    onChange={(e) => setEditingItem({...editingItem, numero_lote: parseInt(e.target.value) || undefined})}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Código Catálogo</label>
                  <Input 
                    value={editingItem.codigo_catalogo || ''} 
                    onChange={(e) => setEditingItem({...editingItem, codigo_catalogo: e.target.value})}
                    placeholder="CATMAT/CATSER"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição Resumida *</label>
                <Input 
                  value={editingItem.descricao_resumida || ''} 
                  onChange={(e) => setEditingItem({...editingItem, descricao_resumida: e.target.value})}
                  placeholder="Descrição do item"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição Detalhada</label>
                <Textarea 
                  value={editingItem.descricao_detalhada || ''} 
                  onChange={(e) => setEditingItem({...editingItem, descricao_detalhada: e.target.value})}
                  rows={3}
                  placeholder="Especificações técnicas, marca de referência, etc."
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Quantidade *</label>
                  <Input 
                    type="number"
                    step="0.0001"
                    value={editingItem.quantidade || ''} 
                    onChange={(e) => setEditingItem({...editingItem, quantidade: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unidade *</label>
                  <select 
                    className="w-full border rounded-md px-3 py-2"
                    value={editingItem.unidade_medida || 'UNIDADE'}
                    onChange={(e) => setEditingItem({...editingItem, unidade_medida: e.target.value})}
                  >
                    <option value="UNIDADE">Unidade</option>
                    <option value="PECA">Peça</option>
                    <option value="CAIXA">Caixa</option>
                    <option value="PACOTE">Pacote</option>
                    <option value="METRO">Metro</option>
                    <option value="METRO_QUADRADO">Metro²</option>
                    <option value="METRO_CUBICO">Metro³</option>
                    <option value="LITRO">Litro</option>
                    <option value="QUILOGRAMA">Quilograma</option>
                    <option value="TONELADA">Tonelada</option>
                    <option value="HORA">Hora</option>
                    <option value="DIARIA">Diária</option>
                    <option value="MES">Mês</option>
                    <option value="ANO">Ano</option>
                    <option value="SERVICO">Serviço</option>
                    <option value="GLOBAL">Global</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor Unitário *</label>
                  <Input 
                    type="number"
                    step="0.0001"
                    value={editingItem.valor_unitario_estimado || ''} 
                    onChange={(e) => setEditingItem({...editingItem, valor_unitario_estimado: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de Participação</label>
                  <select 
                    className="w-full border rounded-md px-3 py-2"
                    value={editingItem.tipo_participacao || 'AMPLA'}
                    onChange={(e) => setEditingItem({...editingItem, tipo_participacao: e.target.value})}
                  >
                    <option value="AMPLA">Ampla Concorrência</option>
                    <option value="EXCLUSIVO_MPE">Exclusivo ME/EPP</option>
                    <option value="COTA_RESERVADA">Cota Reservada ME/EPP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Valor Total Estimado</label>
                  <Input 
                    type="text"
                    value={formatarMoeda((editingItem.quantidade || 0) * (editingItem.valor_unitario_estimado || 0))}
                    disabled
                    className="bg-slate-50"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2 sticky bottom-0">
              <Button variant="outline" onClick={() => setShowItemModal(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={async () => {
                  if (!editingItem.descricao_resumida || !editingItem.quantidade || !editingItem.valor_unitario_estimado) {
                    alert('Preencha os campos obrigatórios')
                    return
                  }
                  setSavingItem(true)
                  try {
                    const itemData = {
                      ...editingItem,
                      licitacao_id: licitacaoId,
                      valor_total_estimado: (editingItem.quantidade || 0) * (editingItem.valor_unitario_estimado || 0)
                    }
                    
                    const url = editingItem.id 
                      ? `${API_URL}/api/itens/${editingItem.id}`
                      : `${API_URL}/api/itens`
                    
                    const res = await fetch(url, {
                      method: editingItem.id ? 'PUT' : 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(itemData)
                    })
                    
                    if (res.ok) {
                      alert(editingItem.id ? 'Item atualizado!' : 'Item criado!')
                      setShowItemModal(false)
                      setEditingItem(null)
                      carregarDados()
                    } else {
                      const error = await res.json()
                      alert(`Erro: ${error.message || 'Falha ao salvar'}`)
                    }
                  } catch (error) {
                    console.error('Erro:', error)
                    alert('Erro ao salvar item')
                  } finally {
                    setSavingItem(false)
                  }
                }}
                disabled={savingItem}
              >
                {savingItem ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : (editingItem.id ? 'Atualizar Item' : 'Criar Item')}
              </Button>
            </div>
          </div>
        </div>
      )}

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

              {/* Se não é fase atual, mostra status e ações de consulta */}
              {licitacao?.fase !== faseModal.id && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-slate-600">
                    {FASES_EXTERNAS.findIndex(f => f.id === faseModal.id) < FASES_EXTERNAS.findIndex(f => f.id === licitacao?.fase)
                      ? '✓ Esta fase já foi concluída'
                      : '○ Esta fase ainda não foi iniciada'}
                  </p>
                  
                  {/* Botões de consulta para fases concluídas */}
                  {FASES_EXTERNAS.findIndex(f => f.id === faseModal.id) < FASES_EXTERNAS.findIndex(f => f.id === licitacao?.fase) && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                      {faseModal.id === 'IMPUGNACAO' && (
                        <Link href={`/orgao/licitacoes/${licitacaoId}/impugnacoes`}>
                          <Button size="sm" variant="outline">
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Ver Impugnações Recebidas
                          </Button>
                        </Link>
                      )}
                      {faseModal.id === 'PUBLICADO' && (
                        <Link href={`/orgao/licitacoes/${licitacaoId}/esclarecimentos`}>
                          <Button size="sm" variant="outline">
                            <HelpCircle className="h-4 w-4 mr-1" />
                            Ver Esclarecimentos
                          </Button>
                        </Link>
                      )}
                      {faseModal.id === 'ACOLHIMENTO_PROPOSTAS' && (
                        <Link href={`/orgao/licitacoes/${licitacaoId}/propostas`}>
                          <Button size="sm" variant="outline">
                            <Users className="h-4 w-4 mr-1" />
                            Ver Propostas Recebidas
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-2">Requisitos da Fase</p>
                <ul className="space-y-1">
                  {faseModal.acoes.map((acao, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                      <ChevronRight className="h-3 w-3" />
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

      {/* Modal de Upload de Documento */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold">Adicionar Documento</h2>
              </div>
              <button onClick={() => setShowUploadModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tipo de Documento *</label>
                <select 
                  className="w-full border rounded-md p-2"
                  value={novoDocumento.tipo}
                  onChange={(e) => setNovoDocumento({...novoDocumento, tipo: e.target.value})}
                >
                  <option value="EDITAL">Edital</option>
                  <option value="TERMO_REFERENCIA">Termo de Referência</option>
                  <option value="ESTUDO_TECNICO">Estudo Técnico Preliminar</option>
                  <option value="PESQUISA_PRECOS">Pesquisa de Preços</option>
                  <option value="PARECER_JURIDICO">Parecer Jurídico</option>
                  <option value="ATA">Ata</option>
                  <option value="CONTRATO">Contrato</option>
                  <option value="ANEXO">Anexo</option>
                  <option value="ESCLARECIMENTO">Esclarecimento</option>
                  <option value="IMPUGNACAO">Impugnação</option>
                  <option value="RECURSO">Recurso</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Título *</label>
                <Input 
                  placeholder="Ex: Edital de Pregão Eletrônico nº 001/2025"
                  value={novoDocumento.titulo}
                  onChange={(e) => setNovoDocumento({...novoDocumento, titulo: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Descrição</label>
                <Textarea 
                  placeholder="Descrição opcional do documento..."
                  value={novoDocumento.descricao}
                  onChange={(e) => setNovoDocumento({...novoDocumento, descricao: e.target.value})}
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Arquivo *</label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {arquivoSelecionado ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <span className="text-sm">{arquivoSelecionado.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(arquivoSelecionado.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setArquivoSelecionado(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input 
                        type="file" 
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                        onChange={(e) => setArquivoSelecionado(e.target.files?.[0] || null)}
                      />
                      <div className="text-muted-foreground">
                        <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Clique para selecionar ou arraste o arquivo</p>
                        <p className="text-xs mt-1">PDF, DOC, DOCX, XLS, XLSX, PNG, JPG (máx. 10MB)</p>
                      </div>
                    </label>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="publico" 
                  checked={novoDocumento.publico}
                  onChange={(e) => setNovoDocumento({...novoDocumento, publico: e.target.checked})}
                  className="rounded"
                />
                <label htmlFor="publico" className="text-sm">
                  Documento público (visível para fornecedores)
                </label>
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowUploadModal(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={uploadDocumento}
                disabled={uploadingDoc || !arquivoSelecionado || !novoDocumento.titulo}
              >
                {uploadingDoc ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Enviar Documento</>
                )}
              </Button>
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
