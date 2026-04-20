'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Edit,
  FileText,
  Calendar,
  Building2,
  DollarSign,
  Download,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Plus,
  Send,
  Loader2,
  FileUp,
  History,
  Shield,
  Trash2,
  Package,
  Pencil,
  Upload,
  Search,
  FileSpreadsheet,
  DownloadCloud,
  Lock,
  Unlock,
  X,
  Settings,
  RefreshCw,
  Receipt,
  ExternalLink,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { formatarModalidadeLicitacao } from '@/lib/utils'
import TabMedicao from '@/components/contratos/TabMedicao'
import TabAtestacao from '@/components/contratos/TabAtestacao'
import TabLicencas from '@/components/contratos/TabLicencas'
import TabOrdensServico from '@/components/contratos/TabOrdensServico'

interface TermoAditivo {
  id: string
  numero_termo: string
  sequencial: number
  tipo: string
  objeto: string
  justificativa?: string | null
  renovacao_ciclo?: boolean
  valor_ciclo?: number | null
  valor_acrescimo?: number | null
  valor_supressao?: number | null
  nova_data_vigencia_fim?: string | null
  data_assinatura: string
  status: string
  created_at: string
}

interface ItemContrato {
  id: string
  numero_item: number
  descricao: string
  descricao_detalhada?: string
  quantidade_contratada: number
  quantidade_empenhada: number
  quantidade_entregue: number
  saldo_disponivel: number
  valor_unitario: number
  valor_total: number
  unidade_medida: string
  lote_numero?: number
  lote_descricao?: string
  codigo_catalogo?: string
  codigo_catalogo_proprio?: string
}

interface Contrato {
  id: string
  numero_contrato: string
  ano: number
  tipo: string
  categoria: string
  modalidade_execucao?: string
  status: string
  objeto: string
  objeto_detalhado: string
  valor_inicial: number | string
  valor_global: number | string
  valor_acrescimos: number | string
  valor_supressoes: number | string
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  data_publicacao: string
  prazo_execucao_dias: number
  prazo_vigencia_meses: number
  fornecedor_id: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  numero_processo: string
  amparo_legal: string
  dotacao_orcamentaria: string
  fonte_recurso: string
  programa_trabalho: string
  elemento_despesa: string
  fiscal_nome: string
  fiscal_matricula: string
  gestor_nome: string
  gestor_matricula: string
  exige_garantia: boolean
  percentual_garantia: number
  valor_garantia: number
  tipo_garantia: string
  enviado_pncp: boolean
  data_envio_pncp: string
  numero_controle_pncp: string
  observacoes: string
  fornecedor?: { id: string; razao_social: string; cpf_cnpj: string; nome_fantasia?: string }
  orgao: { id: string; nome: string; cnpj: string; cidade: string; uf: string }
  licitacao?: { id: string; numero_processo: string; modalidade: string }
  liberado_por_nome?: string
  liberado_em?: string
  saldo_total_em_valor?: number
  valor_medido_total?: number
  valor_comprometido_total?: number
  valor_em_analise?: number
  valor_executado_anterior?: number
  observacao_ajuste?: string
  itens?: ItemContrato[]
  total_itens?: number
}

interface DocumentoContrato {
  id: string
  contrato_id: string
  termo_aditivo_id?: string
  tipo: string
  titulo: string
  descricao?: string
  nome_original: string
  tamanho_bytes: number
  created_at: string
}

interface HistoricoContrato {
  id: string
  contrato_id: string
  tipo_acao: string
  descricao: string
  detalhes?: string
  status_anterior?: string
  status_novo?: string
  usuario_id?: string
  usuario_nome?: string
  created_at: string
}

type FaseDespesa = 'EMPENHO' | 'LIQUIDACAO' | 'PAGAMENTO' | 'OUTRO'

interface EmpenhoFator {
  numero_liquidacao: string
  numero_empenho: string
  data: string
  fase: string
  fase_tipo: FaseDespesa
  credor: string
  cnpj: string
  valor: number
  valor_formatado: string
  bem_servico: string
  numero_contrato: string
  numero_processo: string
  modalidade: string
  elemento_despesa: string
}

interface RequisicaoVinculada {
  id: string
  numero: string
  tipo: string
  status: string
  valor_total_estimado: number
  created_at: string
}

interface EmpenhoComposto {
  numero_empenho: string
  ano_exercicio?: number
  empenho: EmpenhoFator | null
  acrescimos: EmpenhoFator[]
  anulacoes: EmpenhoFator[]
  liquidacoes: EmpenhoFator[]
  pagamentos: EmpenhoFator[]
  total_empenhado_bruto: number
  total_acrescimos: number
  total_anulado: number
  total_empenhado_liquido: number
  total_liquidado: number
  total_pago: number
  saldo_a_liquidar: number
  saldo_a_pagar: number
  comprometido?: number
  saldo_virtual?: number
  requisicoes_vinculadas?: RequisicaoVinculada[]
}

interface GrupoExercicio {
  ano: number
  empenhos_positivos: EmpenhoFator[]
  anulacoes: EmpenhoFator[]
  liquidacoes: EmpenhoFator[]
  pagamentos: EmpenhoFator[]
  empenhos_compostos: EmpenhoComposto[]
  total_empenhado_bruto: number
  total_anulado: number
  total_empenhado_liquido: number
  total_liquidado: number
  total_pago: number
  saldo_a_liquidar: number
  saldo_a_pagar: number
  status: 'ENCERRADO' | 'EXECUCAO' | 'ABERTO'
}

interface ResumoAnoEmpenhos {
  ano: number
  total_empenhado: number
  total_liquidado: number
  total_pago: number
  quantidade_empenhos: number
  quantidade_liquidacoes: number
  quantidade_pagamentos: number
}

interface ResumoEmpenhos {
  empenhos: EmpenhoFator[]
  resumo: {
    valor_global_contrato: number
    ano_contrato: number
    ano_atual: number
    total_empenhado: number
    total_liquidado: number
    total_pago: number
    saldo_empenhado: number
    saldo_a_empenhar: number
    percentual_execucao_orcamentaria: number
    percentual_execucao_financeira: number
    requer_novo_empenho_anual: boolean
    quantidade_empenhos: number
    quantidade_liquidacoes: number
    quantidade_pagamentos: number
  }
  por_ano: ResumoAnoEmpenhos[]
  grupos_exercicio: GrupoExercicio[]
}

const TIPO_ACAO_LABELS: Record<string, { label: string, cor: string, icon: string }> = {
  'CRIADO': { label: 'Criação', cor: 'bg-blue-100 text-blue-800', icon: '📄' },
  'EDITADO': { label: 'Edição', cor: 'bg-gray-100 text-gray-800', icon: '✏️' },
  'ENVIADO_LIBERACAO': { label: 'Enviado para Liberação', cor: 'bg-amber-100 text-amber-800', icon: '📤' },
  'LIBERADO': { label: 'Liberado', cor: 'bg-green-100 text-green-800', icon: '✅' },
  'LIBERACAO_REJEITADA': { label: 'Liberação Rejeitada', cor: 'bg-red-100 text-red-800', icon: '❌' },
  'STATUS_ALTERADO': { label: 'Status Alterado', cor: 'bg-purple-100 text-purple-800', icon: '🔄' },
  'TERMO_ADITIVO_CRIADO': { label: 'Termo Aditivo', cor: 'bg-indigo-100 text-indigo-800', icon: '📋' },
  'REQUISICAO_CRIADA': { label: 'Requisição', cor: 'bg-cyan-100 text-cyan-800', icon: '📦' },
  'ENVIADO_PNCP': { label: 'Enviado ao PNCP', cor: 'bg-teal-100 text-teal-800', icon: '🌐' },
  'ITEM_ADICIONADO': { label: 'Item Adicionado', cor: 'bg-emerald-100 text-emerald-800', icon: '➕' },
  'ITEM_REMOVIDO': { label: 'Item Removido', cor: 'bg-orange-100 text-orange-800', icon: '➖' },
  'ITEM_ALTERADO': { label: 'Item Alterado', cor: 'bg-yellow-100 text-yellow-800', icon: '🔧' },
  'DOCUMENTO_ANEXADO': { label: 'Documento', cor: 'bg-sky-100 text-sky-800', icon: '📎' },
  'OBSERVACAO': { label: 'Observação', cor: 'bg-slate-100 text-slate-800', icon: '💬' },
}

const STATUS_CONTRATO = {
  'RASCUNHO': { label: 'Rascunho', cor: 'bg-slate-100 text-slate-800', icon: FileText },
  'AGUARDANDO_LIBERACAO': { label: 'Aguardando Liberação', cor: 'bg-amber-100 text-amber-800', icon: Lock },
  'VIGENTE': { label: 'Vigente', cor: 'bg-green-100 text-green-800', icon: CheckCircle },
  'ENCERRADO': { label: 'Encerrado', cor: 'bg-gray-100 text-gray-800', icon: Clock },
  'VENCIDO': { label: 'Vencido', cor: 'bg-orange-100 text-orange-800', icon: Clock },
  'RESCINDIDO': { label: 'Rescindido', cor: 'bg-red-100 text-red-800', icon: AlertCircle },
  'SUSPENSO': { label: 'Suspenso', cor: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  'CANCELADO': { label: 'Cancelado', cor: 'bg-red-100 text-red-800', icon: AlertCircle }
}

const TIPOS_TERMO = [
  { value: 'ADITIVO_PRAZO', label: 'Aditivo de Prazo' },
  { value: 'ADITIVO_VALOR', label: 'Aditivo de Valor' },
  { value: 'ADITIVO_PRAZO_VALOR', label: 'Aditivo de Prazo e Valor' },
  { value: 'APOSTILAMENTO', label: 'Apostilamento' },
  { value: 'RESCISAO', label: 'Rescisão' },
  { value: 'REAJUSTE', label: 'Reajuste' },
  { value: 'SUSPENSAO', label: 'Suspensão' },
]

const TABS_VALIDOS = ['detalhes', 'itens', 'medicao', 'atestacao', 'licencas', 'ordens-servico', 'termos', 'documentos', 'historico', 'empenhos']

export default function DetalheContratoOrgaoPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params.id as string

  const tabUrl = searchParams.get('tab')
  const tabAtivo = tabUrl && TABS_VALIDOS.includes(tabUrl) ? tabUrl : 'detalhes'

  const setTabAtivo = (tab: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    router.replace(url.pathname + url.search)
  }

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [termos, setTermos] = useState<TermoAditivo[]>([])
  const [documentos, setDocumentos] = useState<DocumentoContrato[]>([])
  const [historico, setHistorico] = useState<HistoricoContrato[]>([])
  const [empenhos, setEmpenhos] = useState<EmpenhoFator[]>([])
  const [resumoEmpenhos, setResumoEmpenhos] = useState<ResumoEmpenhos['resumo'] | null>(null)
  const [empenhosPorAno, setEmpenhosPorAno] = useState<ResumoAnoEmpenhos[]>([])
  const [gruposExercicio, setGruposExercicio] = useState<GrupoExercicio[]>([])
  const [loadingEmpenhos, setLoadingEmpenhos] = useState(false)
  const [empenhosBuscados, setEmpenhosBuscados] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingAction, setLoadingAction] = useState(false)
  
  const [paginaItens, setPaginaItens] = useState(1)
  const itensPorPagina = 15
  const [isAdmin, setIsAdmin] = useState(false)
  const [duplicados, setDuplicados] = useState<{
    grupos: Array<{ descricao: string; valor_unitario: number; quantidade: number; ids: string[]; manter_id: string; remover_ids: string[] }>;
    total_duplicados: number;
  } | null>(null)
  const [modalDuplicados, setModalDuplicados] = useState(false)
  const [removendoDuplicados, setRemovendoDuplicados] = useState(false)

  const [modalTermo, setModalTermo] = useState(false)
  const [modalEditTermo, setModalEditTermo] = useState<TermoAditivo | null>(null)
  const [modalCancelarTermo, setModalCancelarTermo] = useState<TermoAditivo | null>(null)
  const [modalAditivosPortal, setModalAditivosPortal] = useState<{
    open: boolean
    aditivos: Array<{ nome: string; tipo: string; valor: string; vigencia: string; fiscal: string; pdf_url: string }>
    selecionados: Set<number>
    loading: boolean
    importando: boolean
    resultado: any | null
    erro: string | null
  }>({ open: false, aditivos: [], selecionados: new Set(), loading: false, importando: false, resultado: null, erro: null })
  const [novoTermo, setNovoTermo] = useState({
    tipo: 'ADITIVO_PRAZO',
    renovacao_ciclo: false,
    objeto: '',
    justificativa: '',
    valor_acrescimo: '',
    valor_supressao: '',
    modo_acrescimo: 'incremento' as 'incremento' | 'novo_global' | 'percentual',
    modo_supressao: 'incremento' as 'incremento' | 'novo_global' | 'percentual',
    novo_valor_global_acrescimo: '',
    novo_valor_global_supressao: '',
    percentual_acrescimo: '',
    percentual_supressao: '',
    nova_data_vigencia_fim: '',
    data_assinatura: '',
  })

  const [modalStatus, setModalStatus] = useState(false)
  const [novoStatus, setNovoStatus] = useState('')

  // Estados para itens do contrato
  const [modalItem, setModalItem] = useState(false)
  const [modalImportarCSV, setModalImportarCSV] = useState(false)
  const [editandoItem, setEditandoItem] = useState<ItemContrato | null>(null)
  const [csvItens, setCsvItens] = useState<any[]>([])
  const [importandoCSV, setImportandoCSV] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<{ importados: number; erros: string[] } | null>(null)
  const [modalExcluirTodosItens, setModalExcluirTodosItens] = useState(false)
  const [excluindoTodosItens, setExcluindoTodosItens] = useState(false)
  const [buscaCatalogo, setBuscaCatalogo] = useState('')
  const [resultadosCatalogo, setResultadosCatalogo] = useState<any[]>([])
  const [buscandoCatalogo, setBuscandoCatalogo] = useState(false)
  const [novoItem, setNovoItem] = useState({
    numero_item: 1,
    descricao: '',
    descricao_detalhada: '',
    marca: '',
    modelo: '',
    tipo_item: 'CONSUMO' as 'CONSUMO' | 'PERMANENTE',
    unidade_medida: 'UNIDADE',
    valor_unitario: '',
    quantidade_contratada: '',
    quantidade_ja_utilizada: '',
    codigo_catalogo: '',
    codigo_catalogo_proprio: '',
    lote_numero: '',
    lote_descricao: '',
    observacoes: '',
  })

  const [editandoObservacoes, setEditandoObservacoes] = useState(false)
  const [textoObservacoesEdit, setTextoObservacoesEdit] = useState('')

  const [modalDocumento, setModalDocumento] = useState(false)
  const [novoDocumento, setNovoDocumento] = useState({ tipo: 'OUTROS', titulo: '', descricao: '', termo_aditivo_id: '' as string })
  const [arquivoDocumento, setArquivoDocumento] = useState<File | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const [modalAjuste, setModalAjuste] = useState(false)
  const [ajusteForm, setAjusteForm] = useState({ modo: 'executado' as 'executado' | 'empenhado', valor_executado_anterior: '', valor_empenhado: '', observacao_ajuste: '' })
  const [podeFazerAjuste, setPodeFazerAjuste] = useState(false)
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}')
      setPodeFazerAjuste(u.pode_liberar_contratos === true)
      if (u.role === 'ADMIN' || u.tipo === 'ADMIN' || u.papel === 'ADMIN') setIsAdmin(true)
    } catch { setPodeFazerAjuste(false) }
  }, [])

  const UNIDADES_MEDIDA = [
    { value: 'UNIDADE', label: 'Unidade' },
    { value: 'PECA', label: 'Peça' },
    { value: 'CAIXA', label: 'Caixa' },
    { value: 'PACOTE', label: 'Pacote' },
    { value: 'METRO', label: 'Metro' },
    { value: 'METRO_QUADRADO', label: 'Metro²' },
    { value: 'LITRO', label: 'Litro' },
    { value: 'QUILOGRAMA', label: 'Quilograma' },
    { value: 'HORA', label: 'Hora' },
    { value: 'DIARIA', label: 'Diária' },
    { value: 'MES', label: 'Mês' },
    { value: 'ANO', label: 'Ano' },
    { value: 'SERVICO', label: 'Serviço' },
    { value: 'GLOBAL', label: 'Global' },
  ]

  useEffect(() => {
    if (id) carregarDados()
  }, [id])

  useEffect(() => {
    if (tabAtivo === 'empenhos' && !empenhosBuscados && id) {
      buscarEmpenhos()
    }
  }, [tabAtivo, id])

  const buscarEmpenhos = async () => {
    setLoadingEmpenhos(true)
    setEmpenhosBuscados(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/empenhos`)
      if (res.ok) {
        const data: ResumoEmpenhos = await res.json()
        setEmpenhos(data.empenhos)
        setResumoEmpenhos(data.resumo)
        setEmpenhosPorAno(data.por_ano || [])
        setGruposExercicio(data.grupos_exercicio || [])
      } else {
        setEmpenhos([])
        setResumoEmpenhos(null)
        setEmpenhosPorAno([])
        setGruposExercicio([])
      }
    } catch {
      setEmpenhos([])
      setResumoEmpenhos(null)
      setEmpenhosPorAno([])
      setGruposExercicio([])
    } finally {
      setLoadingEmpenhos(false)
    }
  }

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [contratoRes, termosRes, historicoRes, documentosRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${id}`),
        authFetch(`${API_URL}/api/contratos/${id}/termos`),
        authFetch(`${API_URL}/api/contratos/${id}/historico`),
        authFetch(`${API_URL}/api/contratos/${id}/documentos`)
      ])
      if (contratoRes.ok) setContrato(await contratoRes.json())
      if (termosRes.ok) setTermos(await termosRes.json())
      if (historicoRes.ok) setHistorico(await historicoRes.json())
      if (documentosRes.ok) setDocumentos(await documentosRes.json())
      else setDocumentos([])
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSalvarAjuste = async () => {
    setLoadingAction(true)
    try {
      const payload: { valor_executado_anterior?: number; valor_empenhado?: number; observacao_ajuste: string } = {
        observacao_ajuste: ajusteForm.observacao_ajuste
      }
      if (ajusteForm.modo === 'empenhado') {
        payload.valor_empenhado = parseFloat(ajusteForm.valor_empenhado) || 0
      } else {
        payload.valor_executado_anterior = parseFloat(ajusteForm.valor_executado_anterior) || 0
      }
      const res = await authFetch(`${API_URL}/api/contratos/${id}/ajuste-migracao`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        setModalAjuste(false)
        carregarDados()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao salvar ajuste')
      }
    } catch { alert('Erro ao salvar ajuste') }
    finally { setLoadingAction(false) }
  }

  const formatarMoeda = (valor: number | string) => {
    const numero = typeof valor === 'string' ? parseFloat(valor) : valor
    return (numero || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data: string) => {
    if (!data) return '-'
    const dateOnly = data.split('T')[0]
    const parts = dateOnly.split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const calcularDiasRestantes = (dataFim: string) => {
    const fim = new Date(dataFim)
    const hoje = new Date()
    return Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  }

  const handleCriarTermo = async () => {
    setLoadingAction(true)
    try {
      let valorAcrescimo: number | null = novoTermo.valor_acrescimo ? parseFloat(novoTermo.valor_acrescimo) : null
      let valorSupressao: number | null = novoTermo.valor_supressao ? parseFloat(novoTermo.valor_supressao) : null
      const valorGlobalAtual = Number(contrato?.valor_global) || 0
      if (novoTermo.modo_acrescimo === 'novo_global' && novoTermo.novo_valor_global_acrescimo) {
        const novoValor = parseFloat(novoTermo.novo_valor_global_acrescimo)
        valorAcrescimo = Math.max(0, novoValor - valorGlobalAtual)
      } else if (novoTermo.modo_acrescimo === 'percentual' && novoTermo.percentual_acrescimo) {
        valorAcrescimo = valorGlobalAtual * (parseFloat(novoTermo.percentual_acrescimo) / 100)
      }
      if (novoTermo.modo_supressao === 'novo_global' && novoTermo.novo_valor_global_supressao) {
        const novoValor = parseFloat(novoTermo.novo_valor_global_supressao)
        valorSupressao = Math.max(0, valorGlobalAtual - novoValor)
      } else if (novoTermo.modo_supressao === 'percentual' && novoTermo.percentual_supressao) {
        valorSupressao = valorGlobalAtual * (parseFloat(novoTermo.percentual_supressao) / 100)
      }
      const ehRenovacaoCiclo = novoTermo.tipo === 'ADITIVO_PRAZO' && novoTermo.renovacao_ciclo
      const payload = {
        tipo: novoTermo.tipo,
        renovacao_ciclo: ehRenovacaoCiclo,
        valor_ciclo: ehRenovacaoCiclo ? (parseFloat(novoTermo.valor_acrescimo) || null) : null,
        objeto: novoTermo.objeto,
        justificativa: novoTermo.justificativa || novoTermo.objeto,
        valor_acrescimo: ehRenovacaoCiclo ? null : valorAcrescimo,
        valor_supressao: ehRenovacaoCiclo ? null : valorSupressao,
        nova_data_vigencia_fim: novoTermo.nova_data_vigencia_fim || null,
        data_assinatura: novoTermo.data_assinatura,
      }
      const res = await authFetch(`${API_URL}/api/contratos/${id}/termos`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setModalTermo(false)
        setNovoTermo({ tipo: 'ADITIVO_PRAZO', renovacao_ciclo: false, objeto: '', justificativa: '', valor_acrescimo: '', valor_supressao: '', modo_acrescimo: 'incremento', modo_supressao: 'incremento', novo_valor_global_acrescimo: '', novo_valor_global_supressao: '', percentual_acrescimo: '', percentual_supressao: '', nova_data_vigencia_fim: '', data_assinatura: '' })
        carregarDados()
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao criar termo aditivo')
      }
    } catch (error) {
      console.error('Erro ao criar termo:', error)
      alert('Erro ao criar termo aditivo')
    } finally {
      setLoadingAction(false)
    }
  }

  const buscarAditivosPortal = async () => {
    if (!contrato) return
    setModalAditivosPortal({ open: true, aditivos: [], selecionados: new Set(), loading: true, importando: false, resultado: null, erro: null })
    try {
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/buscar-aditivos-por-contrato/${contrato.id}`)
      if (res.ok) {
        const data = await res.json()
        const aditivos = data.aditivos || []
        setModalAditivosPortal(prev => prev ? { ...prev, aditivos, selecionados: new Set(aditivos.map((_: any, i: number) => i)), loading: false } : prev)
      } else {
        setModalAditivosPortal(prev => prev ? { ...prev, loading: false, erro: 'Erro ao buscar aditivos no portal' } : prev)
      }
    } catch {
      setModalAditivosPortal(prev => prev ? { ...prev, loading: false, erro: 'Erro de conexão com o portal' } : prev)
    }
  }

  const importarAditivosPortal = async () => {
    if (!contrato || !modalAditivosPortal.selecionados.size) return
    const aditivosSelecionados = modalAditivosPortal.aditivos.filter((_, i) => modalAditivosPortal.selecionados.has(i))
    setModalAditivosPortal(prev => prev ? { ...prev, importando: true } : prev)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/importar-aditivos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contrato_id: contrato.id, aditivos: aditivosSelecionados }),
      })
      if (res.ok) {
        const data = await res.json()
        setModalAditivosPortal(prev => prev ? { ...prev, importando: false, resultado: data } : prev)
        carregarDados()
      } else {
        setModalAditivosPortal(prev => prev ? { ...prev, importando: false, erro: 'Erro ao importar aditivos' } : prev)
      }
    } catch {
      setModalAditivosPortal(prev => prev ? { ...prev, importando: false, erro: 'Erro de conexão' } : prev)
    }
  }

  const handleEditarTermo = async () => {
    if (!modalEditTermo || !contrato) return
    setLoadingAction(true)
    try {
      const payload = {
        objeto: modalEditTermo.objeto,
        justificativa: modalEditTermo.justificativa || null,
        valor_acrescimo: modalEditTermo.valor_acrescimo ? parseFloat(String(modalEditTermo.valor_acrescimo)) : null,
        valor_supressao: modalEditTermo.valor_supressao ? parseFloat(String(modalEditTermo.valor_supressao)) : null,
        nova_data_vigencia_fim: modalEditTermo.nova_data_vigencia_fim || null,
        data_assinatura: modalEditTermo.data_assinatura?.toString().split('T')[0],
      }
      const res = await authFetch(`${API_URL}/api/contratos/${id}/termos/${modalEditTermo.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setModalEditTermo(null)
        carregarDados()
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao editar termo')
      }
    } catch (error) {
      console.error('Erro ao editar termo:', error)
      alert('Erro ao editar termo aditivo')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleCancelarTermo = async () => {
    if (!modalCancelarTermo || !confirm('Cancelar este termo aditivo? Os valores do contrato serão revertidos.')) return
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/termos/${modalCancelarTermo.id}/cancelar`, {
        method: 'PATCH',
      })
      if (res.ok) {
        setModalCancelarTermo(null)
        carregarDados()
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao cancelar termo')
      }
    } catch (error) {
      console.error('Erro ao cancelar termo:', error)
      alert('Erro ao cancelar termo aditivo')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleExcluirTermo = async (termo: TermoAditivo) => {
    if (!confirm(`Excluir o termo aditivo "${termo.numero_termo}"? O número ficará disponível para um novo termo. Os documentos vinculados permanecerão no contrato.`)) return
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/termos/${termo.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        carregarDados()
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao excluir termo')
      }
    } catch (error) {
      console.error('Erro ao excluir termo:', error)
      alert('Erro ao excluir termo aditivo')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleUploadDocumento = async () => {
    if (!arquivoDocumento || !novoDocumento.titulo.trim()) {
      alert('Selecione um arquivo e preencha o título')
      return
    }
    setUploadingDoc(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', arquivoDocumento)
      formData.append('titulo', novoDocumento.titulo)
      formData.append('tipo', novoDocumento.tipo)
      if (novoDocumento.descricao) formData.append('descricao', novoDocumento.descricao)
      if (novoDocumento.termo_aditivo_id) formData.append('termo_aditivo_id', novoDocumento.termo_aditivo_id)
      const res = await authFetch(`${API_URL}/api/contratos/${id}/documentos`, {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        setModalDocumento(false)
        setArquivoDocumento(null)
        setNovoDocumento({ tipo: 'OUTROS', titulo: '', descricao: '', termo_aditivo_id: '' })
        carregarDados()
      } else {
        const err = await res.json()
        alert(err.message || 'Erro ao enviar documento')
      }
    } catch (e) {
      console.error('Erro ao enviar documento:', e)
      alert('Erro ao enviar documento')
    } finally {
      setUploadingDoc(false)
    }
  }

  const handleDownloadDocumento = async (docId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/documentos/${docId}/download`)
      if (!res.ok) throw new Error('Erro ao baixar')
      const blob = await res.blob()
      const doc = documentos.find((d) => d.id === docId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc?.nome_original || 'documento'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Erro ao baixar documento')
    }
  }

  const handleExcluirDocumento = async (docId: string) => {
    if (!confirm('Excluir este documento?')) return
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/documentos/${docId}`, { method: 'DELETE' })
      if (res.ok) carregarDados()
      else alert('Erro ao excluir')
    } catch (e) {
      alert('Erro ao excluir documento')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleAlterarStatus = async () => {
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: novoStatus }),
      })
      if (res.ok) {
        setModalStatus(false)
        carregarDados()
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao alterar status')
      }
    } catch (error) {
      console.error('Erro ao alterar status:', error)
      alert('Erro ao alterar status')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleEnviarPncp = async () => {
    if (!contrato) return
    setLoadingAction(true)
    try {
      const tipoContratoMap: Record<string, number> = {
        'CONTRATO': 1, 'NOTA_EMPENHO': 2, 'ORDEM_SERVICO': 3, 'ORDEM_FORNECIMENTO': 4,
        'CARTA_CONTRATO': 5, 'TERMO_ADESAO': 6, 'ATA_REGISTRO_PRECO': 7,
      }
      const payload = {
        anoContrato: contrato.ano,
        numeroContratoEmpenho: contrato.numero_contrato,
        tipoContratoId: tipoContratoMap[contrato.tipo] || 1,
        objetoContrato: contrato.objeto,
        niFornecedor: contrato.fornecedor_cnpj?.replace(/\D/g, ''),
        nomeRazaoSocialFornecedor: contrato.fornecedor_razao_social,
        dataAssinatura: contrato.data_assinatura,
        dataVigenciaInicio: contrato.data_vigencia_inicio,
        dataVigenciaFim: contrato.data_vigencia_fim,
        valorInicial: parseFloat(String(contrato.valor_inicial)),
        valorGlobal: parseFloat(String(contrato.valor_global)),
        tipoPessoa: 'PJ',
        informacaoComplementar: contrato.observacoes || undefined,
      }
      const res = await authFetch(`${API_URL}/api/pncp/contratos`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const result = await res.json()
        // Atualizar contrato com dados do PNCP
        await authFetch(`${API_URL}/api/contratos/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            enviado_pncp: true,
            data_envio_pncp: new Date().toISOString(),
            numero_controle_pncp: result.numeroControlePNCP || null,
          }),
        })
        alert(`Contrato enviado ao PNCP com sucesso!\nNúmero de Controle: ${result.numeroControlePNCP || 'N/A'}`)
        carregarDados()
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao enviar contrato ao PNCP')
      }
    } catch (error) {
      console.error('Erro ao enviar ao PNCP:', error)
      alert('Erro ao enviar contrato ao PNCP')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleLiberarContrato = async () => {
    if (!confirm('Deseja LIBERAR este contrato para pedidos/requisições? Após liberado, o contrato ficará VIGENTE e poderá receber requisições.')) return
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/liberar`, { method: 'POST' })
      if (res.ok) {
        carregarDados()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.message || 'Erro ao liberar contrato')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao liberar contrato')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleRejeitarLiberacao = async () => {
    const motivo = prompt('Informe o motivo da rejeição (opcional):')
    if (motivo === null) return // cancelou o prompt
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/rejeitar-liberacao`, {
        method: 'POST',
        body: JSON.stringify({ motivo }),
      })
      if (res.ok) {
        carregarDados()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.message || 'Erro ao rejeitar liberação')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao rejeitar liberação')
    } finally {
      setLoadingAction(false)
    }
  }

  const getTipoTermoLabel = (tipo: string) => {
    const t = TIPOS_TERMO.find(t => t.value === tipo)
    return t?.label || tipo
  }

  const verificarDuplicados = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/itens-duplicados`)
      if (res.ok) {
        const data = await res.json()
        setDuplicados(data)
        if (data.total_duplicados > 0) setModalDuplicados(true)
        else alert('Nenhum item duplicado encontrado.')
      }
    } catch { /* ignora */ }
  }

  const removerDuplicados = async () => {
    setRemovendoDuplicados(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/itens-duplicados`, { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        setModalDuplicados(false)
        setDuplicados(null)
        carregarDados()
        alert(`${data.removidos} item(ns) duplicado(s) removido(s) de ${data.grupos} grupo(s).`)
      }
    } catch { /* ignora */ }
    setRemovendoDuplicados(false)
  }

  const abrirModalNovoItem = () => {
    const maxNumero = contrato?.itens?.reduce((max, i) => Math.max(max, i.numero_item || 0), 0) || 0
    const proximoNumero = maxNumero + 1
    setEditandoItem(null)
    setBuscaCatalogo('')
    setResultadosCatalogo([])
    setNovoItem({
      numero_item: proximoNumero,
      descricao: '',
      descricao_detalhada: '',
      marca: '',
      modelo: '',
      tipo_item: 'CONSUMO',
      unidade_medida: contrato?.categoria === 'SERVICOS' ? 'MES' : 'UNIDADE',
      valor_unitario: '',
      quantidade_contratada: '',
      quantidade_ja_utilizada: '',
      codigo_catalogo: '',
      codigo_catalogo_proprio: '',
      lote_numero: '',
      lote_descricao: '',
      observacoes: '',
    })
    setModalItem(true)
  }

  const abrirModalEditarItem = (item: ItemContrato) => {
    setEditandoItem(item)
    setBuscaCatalogo('')
    setResultadosCatalogo([])
    setNovoItem({
      numero_item: item.numero_item,
      descricao: item.descricao,
      descricao_detalhada: item.descricao_detalhada || '',
      marca: (item as any).marca || '',
      modelo: (item as any).modelo || '',
      tipo_item: ((item as any).tipo_item || 'CONSUMO') as 'CONSUMO' | 'PERMANENTE',
      unidade_medida: item.unidade_medida,
      valor_unitario: String(item.valor_unitario),
      quantidade_contratada: String(item.quantidade_contratada),
      quantidade_ja_utilizada: String(item.quantidade_entregue ?? 0),
      codigo_catalogo: item.codigo_catalogo || '',
      codigo_catalogo_proprio: item.codigo_catalogo_proprio || '',
      lote_numero: item.lote_numero ? String(item.lote_numero) : '',
      lote_descricao: item.lote_descricao || '',
      observacoes: '',
    })
    setModalItem(true)
  }

  const handleSalvarItem = async () => {
    setLoadingAction(true)
    try {
      if (!novoItem.descricao) throw new Error('Informe a descrição do item.')
      if (!novoItem.valor_unitario) throw new Error('Informe o valor unitário.')
      if (!novoItem.quantidade_contratada) throw new Error('Informe a quantidade.')

      if (editandoItem) {
        const payload: any = {
          descricao: novoItem.descricao,
          descricao_detalhada: novoItem.descricao_detalhada || null,
          marca: novoItem.marca || null,
          modelo: novoItem.modelo || null,
          valor_unitario: parseFloat(novoItem.valor_unitario),
          quantidade_contratada: parseFloat(novoItem.quantidade_contratada),
          quantidade_ja_utilizada: novoItem.quantidade_ja_utilizada !== '' ? parseFloat(novoItem.quantidade_ja_utilizada) : undefined,
          codigo_catalogo: novoItem.codigo_catalogo || null,
          codigo_catalogo_proprio: novoItem.codigo_catalogo_proprio || null,
          lote_numero: novoItem.lote_numero ? parseInt(novoItem.lote_numero) : null,
          lote_descricao: novoItem.lote_descricao || null,
        }
        if (contrato?.categoria === 'COMPRAS' && contrato?.modalidade_execucao === 'ITEM_QUANTIDADE') {
          payload.tipo_item = novoItem.tipo_item
        }
        const res = await authFetch(`${API_URL}/api/almoxarifado/itens-contrato/${editandoItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || 'Erro ao atualizar item')
        }
      } else {
        const payload: any = {
          numero_item: novoItem.numero_item,
          descricao: novoItem.descricao,
          descricao_detalhada: novoItem.descricao_detalhada || null,
          marca: novoItem.marca || null,
          modelo: novoItem.modelo || null,
          unidade_medida: novoItem.unidade_medida,
          valor_unitario: parseFloat(novoItem.valor_unitario),
          quantidade_contratada: parseFloat(novoItem.quantidade_contratada),
          codigo_catalogo: novoItem.codigo_catalogo || null,
          codigo_catalogo_proprio: novoItem.codigo_catalogo_proprio || null,
          lote_numero: novoItem.lote_numero ? parseInt(novoItem.lote_numero) : null,
          lote_descricao: novoItem.lote_descricao || null,
          observacoes: novoItem.observacoes || null,
        }
        if (contrato?.categoria === 'COMPRAS' && contrato?.modalidade_execucao === 'ITEM_QUANTIDADE') {
          payload.tipo_item = novoItem.tipo_item
        }
        const res = await authFetch(`${API_URL}/api/almoxarifado/contratos/${id}/itens`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || 'Erro ao criar item')
        }
      }

      setModalItem(false)
      carregarDados()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      alert(msg)
    } finally {
      setLoadingAction(false)
    }
  }

  const buscarNoCatalogoProprio = async (termo: string) => {
    if (!termo || termo.length < 2) { setResultadosCatalogo([]); return }
    setBuscandoCatalogo(true)
    try {
      const tipo = contrato?.categoria === 'SERVICOS' ? 'SERVICO' : 'MATERIAL'
      const res = await authFetch(`${API_URL}/api/catalogo-proprio/itens?termo=${encodeURIComponent(termo)}&tipo=${tipo}&limite=10`)
      if (res.ok) {
        const data = await res.json()
        setResultadosCatalogo(data)
      }
    } catch (e) { console.error('Erro ao buscar catálogo:', e) }
    finally { setBuscandoCatalogo(false) }
  }

  const selecionarItemCatalogo = (item: any) => {
    setNovoItem(prev => ({
      ...prev,
      descricao: item.descricao || prev.descricao,
      codigo_catalogo_proprio: item.codigo || '',
      unidade_medida: (item.unidade_padrao || prev.unidade_medida).toUpperCase(),
      valor_unitario: item.valor_referencia ? String(item.valor_referencia) : prev.valor_unitario,
    }))
    setResultadosCatalogo([])
    setBuscaCatalogo('')
  }

  const gerarModeloCSV = () => {
    const header = 'numero_item;descricao;descricao_detalhada;unidade_medida;quantidade_contratada;valor_unitario;tipo_item;lote_numero;lote_descricao;codigo_catalogo;codigo_catalogo_proprio;observacoes'
    const exemplo1 = '1;Resma de papel A4 75g;Papel sulfite branco formato A4;UNIDADE;500;25.90;CONSUMO;1;Material de escritório;;;'
    const exemplo2 = '2;Toner HP 26A;Toner original HP CF226A;UNIDADE;50;189.90;CONSUMO;1;Material de escritório;449158;;'
    const exemplo3 = '3;Computador Dell;Notebook Dell Inspiron 15;UNIDADE;10;3500.00;PERMANENTE;2;Equipamentos;;;'
    const csv = [header, exemplo1, exemplo2, exemplo3].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'modelo_itens_contrato.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const normalizarHeader = (h: string): string => {
    const base = h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const map: Record<string, string> = {
      'item':           'numero_item',
      'descricao':      'descricao',
      'unidade':        'unidade_medida',
      'preco_unitario': 'valor_unitario',
      'quantidade':     'quantidade_contratada',
    }
    return map[base] ?? base
  }

  const handleUploadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResultadoImportacao(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return

      const linhas = text.split('\n').map(l => l.trim()).filter(l => l)
      if (linhas.length < 2) { alert('Arquivo vazio ou sem dados'); return }

      const separador = linhas[0].includes(';') ? ';' : ','
      const headers = linhas[0].split(separador).map(h => normalizarHeader(h.trim().replace(/"/g, '')))
      const itens: any[] = []

      for (let i = 1; i < linhas.length; i++) {
        const valores = linhas[i].split(separador).map(v => v.trim().replace(/"/g, ''))
        const obj: any = {}
        headers.forEach((h, idx) => { obj[h] = valores[idx] || '' })
        if (obj.descricao) itens.push(obj)
      }

      setCsvItens(itens)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleImportarCSV = async () => {
    if (csvItens.length === 0) return
    setImportandoCSV(true)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/contratos/${id}/itens/importar`, {
        method: 'POST',
        body: JSON.stringify({ itens: csvItens }),
      })
      if (res.ok) {
        const result = await res.json()
        setResultadoImportacao(result)
        if (result.importados > 0) carregarDados()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro na importação')
      }
    } catch (e) { alert('Erro ao importar itens') }
    finally { setImportandoCSV(false) }
  }

  const handleRemoverItem = async (itemId: string, descricao: string) => {
    if (!confirm(`Remover item "${descricao}"? Esta ação não pode ser desfeita.`)) return
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/itens-contrato/${itemId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao remover item')
      } else {
        carregarDados()
      }
    } catch (error) {
      console.error('Erro ao remover item:', error)
      alert('Erro ao remover item')
    } finally {
      setLoadingAction(false)
    }
  }

  const handleExcluirTodosItens = async () => {
    setExcluindoTodosItens(true)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/contratos/${id}/itens`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(body.message || 'Erro ao excluir itens')
        return
      }
      setModalExcluirTodosItens(false)
      setPaginaItens(1)
      carregarDados()
    } catch {
      alert('Erro ao excluir itens')
    } finally {
      setExcluindoTodosItens(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando contrato...</p>
      </div>
    )
  }

  if (!contrato) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Contrato não encontrado</h2>
        <p className="text-gray-600 mb-4">O contrato solicitado não existe ou foi removido.</p>
        <Button asChild><Link href="/orgao/contratos">Voltar para Contratos</Link></Button>
      </div>
    )
  }

  const diasRestantes = calcularDiasRestantes(contrato.data_vigencia_fim)
  const StatusIcon = STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.icon || Clock

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link href="/orgao/contratos"><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline">{contrato.tipo}</Badge>
              <Badge className={STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.cor || ''}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.label || contrato.status}
              </Badge>
              {contrato.enviado_pncp && (
                <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />PNCP</Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold">Contrato nº {contrato.numero_contrato} - {contrato.tipo}</h1>
            <p className="text-gray-600">Processo: {contrato.numero_processo}</p>
            {(contrato.fornecedor?.razao_social || contrato.fornecedor_razao_social) && (
              <p className="text-gray-700 font-medium flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-4 h-4 text-gray-500" />
                {contrato.fornecedor?.razao_social || contrato.fornecedor_razao_social}
                {(contrato.fornecedor?.cpf_cnpj || contrato.fornecedor_cnpj) && (
                  <span className="text-gray-400 text-sm ml-1">
                    ({contrato.fornecedor?.cpf_cnpj || contrato.fornecedor_cnpj})
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {contrato.status === 'AGUARDANDO_LIBERACAO' && (
            <>
              <Button onClick={handleLiberarContrato} disabled={loadingAction} className="bg-green-600 hover:bg-green-700">
                {loadingAction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlock className="w-4 h-4 mr-2" />}
                Liberar Contrato
              </Button>
              <Button variant="outline" onClick={handleRejeitarLiberacao} disabled={loadingAction} className="text-red-600 border-red-300 hover:bg-red-50">
                Rejeitar
              </Button>
            </>
          )}
          {(contrato.status === 'VIGENTE' || contrato.status === 'ENCERRADO' || contrato.status === 'VENCIDO' || contrato.status === 'RESCINDIDO' || contrato.status === 'SUSPENSO') && (
            <Button variant="outline" onClick={() => { setNovoStatus(contrato.status); setModalStatus(true) }}>
              <Shield className="w-4 h-4 mr-2" />Alterar Status
            </Button>
          )}
          {(contrato.status === 'AGUARDANDO_LIBERACAO' || contrato.status === 'VIGENTE') && (
            <Button variant="outline" asChild>
              <Link href={`/orgao/contratos/${id}/editar`}><Edit className="w-4 h-4 mr-2" />Editar</Link>
            </Button>
          )}
          {contrato.status === 'VIGENTE' && !contrato.enviado_pncp && (
            <Button onClick={handleEnviarPncp} disabled={loadingAction}>
              {loadingAction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar ao PNCP
            </Button>
          )}
          {podeFazerAjuste && (
            <Button variant="outline" onClick={() => {
              const vExec = Number(contrato.valor_executado_anterior || 0)
              const vGlobal = Number(contrato.valor_global || 0)
              const saldo = contrato.saldo_total_em_valor ?? (vGlobal - vExec)
              setAjusteForm({
                modo: 'executado',
                valor_executado_anterior: vExec ? String(vExec) : '',
                valor_empenhado: saldo > 0 ? String(saldo) : '',
                observacao_ajuste: contrato.observacao_ajuste || ''
              })
              setModalAjuste(true)
            }}>
              <Settings className="w-4 h-4 mr-2" />Ajuste Migração
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tabAtivo} onValueChange={setTabAtivo} className="space-y-6">
        <TabsList>
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          {(!contrato.modalidade_execucao || contrato.modalidade_execucao === 'ITEM_QUANTIDADE') && (
            <TabsTrigger value="itens">Itens ({contrato.itens?.length || 0})</TabsTrigger>
          )}
          {['MEDICAO', 'CONTINUADO', 'LICENCA'].includes(contrato.modalidade_execucao || '') && (
            <TabsTrigger value="medicao">Medição</TabsTrigger>
          )}
          {contrato.modalidade_execucao === 'CONTINUADO' && (
            <TabsTrigger value="atestacao">Atestação Mensal</TabsTrigger>
          )}
          {contrato.modalidade_execucao === 'LICENCA' && (
            <TabsTrigger value="licencas">Licenças</TabsTrigger>
          )}
          {contrato.modalidade_execucao === 'ORDEM_SERVICO' && (
            <TabsTrigger value="ordens-servico">Ordens de Serviço</TabsTrigger>
          )}
          <TabsTrigger value="termos">Termos Aditivos ({termos.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="empenhos">Empenhos</TabsTrigger>
        </TabsList>

        {contrato.status === 'AGUARDANDO_LIBERACAO' && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-700">Aguardando Liberação</p>
              <p className="text-sm text-amber-600">Este contrato está aguardando liberação de um responsável para permitir pedidos/requisições.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={handleLiberarContrato} disabled={loadingAction} size="sm" className="bg-green-600 hover:bg-green-700">
                <Unlock className="w-4 h-4 mr-1" /> Liberar
              </Button>
              <Button variant="outline" onClick={handleRejeitarLiberacao} disabled={loadingAction} size="sm" className="text-red-600 border-red-300 hover:bg-red-50">
                Rejeitar
              </Button>
            </div>
          </div>
        )}

        <TabsContent value="detalhes" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader><CardTitle>Objeto do Contrato</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{contrato.objeto_detalhado || contrato.objeto}</p>
                  {contrato.amparo_legal && <p className="text-sm text-gray-500 mt-4"><strong>Amparo Legal:</strong> {contrato.amparo_legal}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Valores</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-500">Valor Inicial</p>
                      <p className="text-xl font-bold">{formatarMoeda(contrato.valor_inicial)}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-600 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Acréscimos</p>
                      <p className="text-xl font-bold text-green-600">{formatarMoeda(contrato.valor_acrescimos)}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-600 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Supressões</p>
                      <p className="text-xl font-bold text-red-600">{formatarMoeda(contrato.valor_supressoes)}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600">Valor Global</p>
                      <p className="text-xl font-bold text-blue-600">{formatarMoeda(contrato.valor_global)}</p>
                    </div>
                    {contrato.saldo_total_em_valor !== undefined && (
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <p className="text-sm text-purple-600">Saldo Disponível</p>
                        <p className={`text-xl font-bold ${contrato.saldo_total_em_valor > 0 ? 'text-purple-600' : 'text-red-600'}`}>{formatarMoeda(contrato.saldo_total_em_valor)}</p>
                        {(contrato.valor_em_analise || 0) > 0 && (
                          <p className="text-xs text-amber-600 mt-1">Em análise: {formatarMoeda(contrato.valor_em_analise || 0)}</p>
                        )}
                      </div>
                    )}
                    {Number(contrato.valor_executado_anterior || 0) > 0 && (
                      <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-sm text-amber-700">Ajuste Migração</p>
                        <p className="text-xl font-bold text-amber-700">{formatarMoeda(contrato.valor_executado_anterior || 0)}</p>
                        {contrato.observacao_ajuste && (
                          <p className="text-xs text-amber-600 mt-1">{contrato.observacao_ajuste}</p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {contrato.itens && contrato.itens.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Itens do Contrato ({contrato.itens.length})</CardTitle>
                    <CardDescription>Saldo disponível por item</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3">#</th>
                            <th className="text-left py-2 px-3">Descrição</th>
                            <th className="text-right py-2 px-3">Contratado</th>
                            <th className="text-right py-2 px-3">Empenhado</th>
                            <th className="text-right py-2 px-3">Entregue</th>
                            <th className="text-right py-2 px-3">Saldo</th>
                            <th className="text-right py-2 px-3">Valor Unit.</th>
                            <th className="text-right py-2 px-3">Saldo em Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contrato.itens.map((item) => {
                            const saldoEmValor = Number(item.saldo_disponivel) * Number(item.valor_unitario);
                            return (
                              <tr key={item.id} className="border-b hover:bg-gray-50">
                                <td className="py-2 px-3 font-medium">{item.numero_item}</td>
                                <td className="py-2 px-3">{item.descricao}</td>
                                <td className="py-2 px-3 text-right">
                                  {item.quantidade_contratada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {item.unidade_medida}
                                </td>
                                <td className="py-2 px-3 text-right text-yellow-600">
                                  {item.quantidade_empenhada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {item.unidade_medida}
                                </td>
                                <td className="py-2 px-3 text-right text-green-600">
                                  {item.quantidade_entregue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {item.unidade_medida}
                                </td>
                                <td className="py-2 px-3 text-right font-medium">
                                  {item.saldo_disponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {item.unidade_medida}
                                </td>
                                <td className="py-2 px-3 text-right">{formatarMoeda(item.valor_unitario)}</td>
                                <td className="py-2 px-3 text-right font-semibold text-purple-600">
                                  {formatarMoeda(saldoEmValor)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(contrato.dotacao_orcamentaria || contrato.fonte_recurso) && (
                <Card>
                  <CardHeader><CardTitle>Dotação Orçamentária</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      {contrato.dotacao_orcamentaria && <div><p className="text-sm text-gray-500">Dotação</p><p className="font-medium">{contrato.dotacao_orcamentaria}</p></div>}
                      {contrato.fonte_recurso && <div><p className="text-sm text-gray-500">Fonte de Recurso</p><p className="font-medium">{contrato.fonte_recurso}</p></div>}
                      {contrato.programa_trabalho && <div><p className="text-sm text-gray-500">Programa de Trabalho</p><p className="font-medium">{contrato.programa_trabalho}</p></div>}
                      {contrato.elemento_despesa && <div><p className="text-sm text-gray-500">Elemento de Despesa</p><p className="font-medium">{contrato.elemento_despesa}</p></div>}
                    </div>
                  </CardContent>
                </Card>
              )}

              {contrato.exige_garantia && (
                <Card>
                  <CardHeader><CardTitle>Garantia Contratual</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div><p className="text-sm text-gray-500">Percentual</p><p className="font-medium">{contrato.percentual_garantia}%</p></div>
                      <div><p className="text-sm text-gray-500">Valor</p><p className="font-medium">{formatarMoeda(contrato.valor_garantia)}</p></div>
                      <div><p className="text-sm text-gray-500">Tipo</p><p className="font-medium">{contrato.tipo_garantia || '-'}</p></div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>Observações</CardTitle>
                  {!editandoObservacoes ? (
                    <Button variant="ghost" size="sm" onClick={() => { setTextoObservacoesEdit(contrato.observacoes || ''); setEditandoObservacoes(true) }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {editandoObservacoes ? (
                    <div className="space-y-2">
                      <Textarea
                        value={textoObservacoesEdit}
                        onChange={(e) => setTextoObservacoesEdit(e.target.value)}
                        rows={4}
                        className="resize-none"
                        placeholder="Adicione observações sobre o contrato..."
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={async () => {
                          setLoadingAction(true)
                          try {
                            const res = await authFetch(`${API_URL}/api/contratos/${id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ observacoes: textoObservacoesEdit || null }),
                            })
                            if (res.ok) {
                              setContrato(prev => prev ? { ...prev, observacoes: textoObservacoesEdit || '' } : null)
                              setEditandoObservacoes(false)
                            } else {
                              const err = await res.json().catch(() => ({}))
                              alert(err.message || 'Erro ao salvar')
                            }
                          } catch (e) {
                            alert('Erro ao salvar observações')
                          } finally {
                            setLoadingAction(false)
                          }
                        }}>
                          Salvar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setEditandoObservacoes(false); setTextoObservacoesEdit(contrato.observacoes || '') }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-700 whitespace-pre-wrap min-h-[2rem]">
                      {contrato.observacoes ? contrato.observacoes : <span className="text-gray-400 italic">Nenhuma observação. Clique no lápis para adicionar.</span>}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" />Vigência</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><p className="text-sm text-gray-500">Data de Assinatura</p><p className="font-medium">{formatarData(contrato.data_assinatura)}</p></div>
                  <div><p className="text-sm text-gray-500">Início da Vigência</p><p className="font-medium">{formatarData(contrato.data_vigencia_inicio)}</p></div>
                  <div><p className="text-sm text-gray-500">Fim da Vigência</p><p className="font-medium">{formatarData(contrato.data_vigencia_fim)}</p></div>
                  {contrato.status === 'VIGENTE' && (
                    <div className={`p-3 rounded-lg ${diasRestantes <= 30 ? 'bg-yellow-50' : 'bg-green-50'}`}>
                      <div className="flex items-center gap-2">
                        <Clock className={`w-5 h-5 ${diasRestantes <= 30 ? 'text-yellow-600' : 'text-green-600'}`} />
                        <span className={`font-medium ${diasRestantes <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {diasRestantes > 0 ? `${diasRestantes} dias restantes` : 'Vencido'}
                        </span>
                      </div>
                    </div>
                  )}
                  {contrato.prazo_vigencia_meses && <div><p className="text-sm text-gray-500">Prazo de Vigência</p><p className="font-medium">{contrato.prazo_vigencia_meses} meses</p></div>}
                  {contrato.prazo_execucao_dias && <div><p className="text-sm text-gray-500">Prazo de Execução</p><p className="font-medium">{contrato.prazo_execucao_dias} dias</p></div>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" />Contratado</CardTitle></CardHeader>
                <CardContent>
                  <p className="font-semibold">{contrato.fornecedor_razao_social}</p>
                  <p className="text-sm text-gray-500">CNPJ: {contrato.fornecedor_cnpj}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-5 h-5" />Responsáveis</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {contrato.fiscal_nome && (
                    <div>
                      <p className="text-sm text-gray-500">Fiscal do Contrato</p>
                      <p className="font-medium">{contrato.fiscal_nome}</p>
                      {contrato.fiscal_matricula && <p className="text-xs text-gray-400">Matrícula: {contrato.fiscal_matricula}</p>}
                    </div>
                  )}
                  {contrato.gestor_nome && (
                    <div>
                      <p className="text-sm text-gray-500">Gestor do Contrato</p>
                      <p className="font-medium">{contrato.gestor_nome}</p>
                      {contrato.gestor_matricula && <p className="text-xs text-gray-400">Matrícula: {contrato.gestor_matricula}</p>}
                    </div>
                  )}
                  {!contrato.fiscal_nome && !contrato.gestor_nome && <p className="text-gray-500 text-sm">Nenhum responsável cadastrado</p>}
                </CardContent>
              </Card>

              {contrato.licitacao && (
                <Card>
                  <CardHeader><CardTitle>Licitação de Origem</CardTitle></CardHeader>
                  <CardContent>
                    <p className="font-medium">{contrato.licitacao.numero_processo}</p>
                    <p className="text-sm text-gray-500">{formatarModalidadeLicitacao(contrato.licitacao.modalidade)}</p>
                    <Button variant="link" className="p-0 h-auto mt-2" asChild>
                      <Link href={`/orgao/licitacoes/${contrato.licitacao.id}`}>Ver licitação →</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle>Integração PNCP</CardTitle></CardHeader>
                <CardContent>
                  {contrato.enviado_pncp ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-green-600"><CheckCircle className="w-5 h-5" /><span className="font-medium">Enviado ao PNCP</span></div>
                      {contrato.numero_controle_pncp && <p className="text-sm text-gray-500">Controle: {contrato.numero_controle_pncp}</p>}
                      {contrato.data_envio_pncp && <p className="text-sm text-gray-500">Data: {formatarData(contrato.data_envio_pncp)}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-yellow-600"><Clock className="w-5 h-5" /><span className="font-medium">Pendente de envio</span></div>
                      <Button size="sm" className="w-full" onClick={handleEnviarPncp} disabled={loadingAction}>
                        {loadingAction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        Enviar ao PNCP
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="itens" className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-medium">Itens do Contrato</h3>
              <p className="text-sm text-gray-500">
                Gerencie os itens, quantidades e valores deste contrato.
              </p>
            </div>
            <div className="flex gap-2">
              {isAdmin && contrato.itens && contrato.itens.length > 1 && (
                <Button variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={verificarDuplicados}>
                  <Search className="w-4 h-4 mr-2" />Remover Duplicados
                </Button>
              )}
              <Button variant="outline" onClick={() => { setCsvItens([]); setResultadoImportacao(null); setModalImportarCSV(true) }}>
                <Upload className="w-4 h-4 mr-2" />Importar CSV
              </Button>
              {contrato.itens && contrato.itens.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setModalExcluirTodosItens(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />Excluir todos os itens
                </Button>
              )}
              <Button onClick={abrirModalNovoItem}><Plus className="w-4 h-4 mr-2" />Adicionar Item</Button>
            </div>
          </div>

          {(!contrato.itens || contrato.itens.length === 0) ? (
            <Card>
              <CardContent className="text-center py-12">
                <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 mb-1">Nenhum item cadastrado neste contrato.</p>
                <p className="text-sm text-gray-400 mb-4">
                  {contrato.categoria === 'SERVICOS'
                    ? 'Para contratos de serviço, cadastre o serviço como item (ex: unidade MÊS).'
                    : 'Cadastre os materiais/produtos que fazem parte deste contrato.'}
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={abrirModalNovoItem}><Plus className="w-4 h-4 mr-2" />Adicionar Item</Button>
                  <Button variant="outline" onClick={() => { setCsvItens([]); setResultadoImportacao(null); setModalImportarCSV(true) }}>
                    <Upload className="w-4 h-4 mr-2" />Importar via CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-3">#</th>
                        <th className="text-left py-3 px-3">Lote</th>
                        <th className="text-left py-3 px-3">Descrição</th>
                        <th className="text-center py-3 px-3">Unidade</th>
                        <th className="text-right py-3 px-3">Qtd.</th>
                        <th className="text-right py-3 px-3">Emp.</th>
                        <th className="text-right py-3 px-3">Entr.</th>
                        <th className="text-right py-3 px-3">Saldo</th>
                        <th className="text-right py-3 px-3">Valor Unit.</th>
                        <th className="text-right py-3 px-3">Valor Total</th>
                        <th className="text-center py-3 px-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contrato.itens
                        .slice((paginaItens - 1) * itensPorPagina, paginaItens * itensPorPagina)
                        .map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-3 font-medium">{item.numero_item}</td>
                          <td className="py-3 px-3 text-xs">
                            {item.lote_numero ? (
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded" title={item.lote_descricao || ''}>
                                Lote {item.lote_numero}
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="py-3 px-3 max-w-md">
                            <p className="font-medium break-words whitespace-normal">{item.descricao}</p>
                            <div className="flex gap-1 mt-0.5">
                              {item.codigo_catalogo_proprio && <span className="text-[10px] bg-purple-50 text-purple-600 px-1 rounded">Cat: {item.codigo_catalogo_proprio}</span>}
                              {item.codigo_catalogo && <span className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded">CATMAT: {item.codigo_catalogo}</span>}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant="outline" className="text-xs">{UNIDADES_MEDIDA.find(u => u.value === item.unidade_medida)?.label || item.unidade_medida}</Badge>
                          </td>
                          <td className="py-3 px-3 text-right">{Number(item.quantidade_contratada).toLocaleString('pt-BR')}</td>
                          <td className="py-3 px-3 text-right text-yellow-600">{Number(item.quantidade_empenhada).toLocaleString('pt-BR')}</td>
                          <td className="py-3 px-3 text-right text-green-600">{Number(item.quantidade_entregue).toLocaleString('pt-BR')}</td>
                          <td className="py-3 px-3 text-right font-medium">
                            <span className={Number(item.saldo_disponivel) <= 0 ? 'text-red-600' : ''}>{Number(item.saldo_disponivel).toLocaleString('pt-BR')}</span>
                          </td>
                          <td className="py-3 px-3 text-right">{formatarMoeda(item.valor_unitario)}</td>
                          <td className="py-3 px-3 text-right font-semibold">{formatarMoeda(item.valor_total)}</td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => abrirModalEditarItem(item)} title="Editar">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700" onClick={() => handleRemoverItem(item.id, item.descricao)} title="Remover">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-medium">
                      <tr>
                        <td colSpan={9} className="py-3 px-3 text-right">Total do Contrato (itens):</td>
                        <td className="py-3 px-3 text-right font-bold text-blue-600">
                          {formatarMoeda(contrato.itens.reduce((acc, item) => acc + Number(item.valor_total), 0))}
                        </td>
                        <td></td>
                      </tr>
                      {contrato.saldo_total_em_valor !== undefined && (
                        <tr>
                          <td colSpan={9} className="py-3 px-3 text-right">Saldo Disponível Total:</td>
                          <td className="py-3 px-3 text-right font-bold text-purple-600">
                            {formatarMoeda(contrato.saldo_total_em_valor)}
                          </td>
                          <td></td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
                {(contrato.itens?.length ?? 0) > itensPorPagina && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    {(() => {
                      const totalItens = contrato.itens?.length ?? 0;
                      const totalPaginas = Math.ceil(totalItens / itensPorPagina);
                      return (
                        <>
                          <p className="text-sm text-gray-500">
                            Mostrando {((paginaItens - 1) * itensPorPagina) + 1} a {Math.min(paginaItens * itensPorPagina, totalItens)} de {totalItens} itens
                          </p>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" disabled={paginaItens <= 1} onClick={() => setPaginaItens(1)}>
                              {'\u00AB'}
                            </Button>
                            <Button variant="outline" size="sm" disabled={paginaItens <= 1} onClick={() => setPaginaItens(p => p - 1)}>
                              Anterior
                            </Button>
                            <span className="flex items-center px-3 text-sm">{paginaItens} / {totalPaginas}</span>
                            <Button variant="outline" size="sm" disabled={paginaItens >= totalPaginas} onClick={() => setPaginaItens(p => p + 1)}>
                              Próximo
                            </Button>
                            <Button variant="outline" size="sm" disabled={paginaItens >= totalPaginas} onClick={() => setPaginaItens(totalPaginas)}>
                              {'\u00BB'}
                            </Button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="termos" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Termos Aditivos e Apostilamentos</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={buscarAditivosPortal}><DownloadCloud className="w-4 h-4 mr-2" />Buscar no Portal</Button>
              <Button onClick={() => setModalTermo(true)}><Plus className="w-4 h-4 mr-2" />Novo Termo Aditivo</Button>
            </div>
          </div>

          {termos.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Nenhum termo aditivo registrado.</p>
                <Button className="mt-4" onClick={() => setModalTermo(true)}><Plus className="w-4 h-4 mr-2" />Adicionar Termo Aditivo</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {termos.map((termo) => (
                <Card key={termo.id} className={termo.status === 'CANCELADO' ? 'opacity-60' : ''}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-5 h-5 text-blue-500" />
                          <span className="font-medium">{termo.numero_termo}</span>
                          <Badge variant="outline">{getTipoTermoLabel(termo.tipo)}</Badge>
                          {termo.status === 'CANCELADO' && <Badge variant="destructive">Cancelado</Badge>}
                        </div>
                        <p className="text-gray-600 mb-4">{termo.objeto}</p>
                        <div className="flex gap-6 text-sm">
                          <div><span className="text-gray-500">Data de Assinatura:</span> <span className="font-medium">{formatarData(termo.data_assinatura)}</span></div>
                          {termo.renovacao_ciclo
                            ? <div className="text-blue-700"><RefreshCw className="w-4 h-4 inline mr-1" />Ciclo: {formatarMoeda(termo.valor_ciclo || 0)}</div>
                            : (<>
                                {termo.valor_acrescimo != null && Number(termo.valor_acrescimo) > 0 && <div className="text-green-600"><TrendingUp className="w-4 h-4 inline mr-1" />+ {formatarMoeda(termo.valor_acrescimo)}</div>}
                                {termo.valor_supressao != null && Number(termo.valor_supressao) > 0 && <div className="text-red-600"><TrendingDown className="w-4 h-4 inline mr-1" />- {formatarMoeda(termo.valor_supressao)}</div>}
                              </>)
                          }
                          {termo.nova_data_vigencia_fim && <div><span className="text-gray-500">Nova Vigência:</span> <span className="font-medium">{formatarData(termo.nova_data_vigencia_fim)}</span></div>}
                        </div>
                        {documentos.filter(d => d.termo_aditivo_id === termo.id).length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            {documentos.filter(d => d.termo_aditivo_id === termo.id).length} documento(s) anexado(s)
                          </div>
                        )}
                      </div>
                      {termo.status !== 'CANCELADO' ? (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => { setNovoDocumento(d => ({ ...d, termo_aditivo_id: termo.id, tipo: 'TERMO_ADITIVO' })); setModalDocumento(true) }}><FileUp className="w-4 h-4 mr-1" />Doc</Button>
                          <Button variant="outline" size="sm" onClick={() => setModalEditTermo({ ...termo })}><Pencil className="w-4 h-4 mr-1" />Editar</Button>
                          <Button variant="outline" size="sm" className="text-red-600" onClick={() => setModalCancelarTermo(termo)}><X className="w-4 h-4 mr-1" />Cancelar</Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleExcluirTermo(termo)} disabled={loadingAction}>
                            <Trash2 className="w-4 h-4 mr-1" />Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documentos" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Documentos do Contrato</h3>
            <Button onClick={() => setModalDocumento(true)}><FileUp className="w-4 h-4 mr-2" />Upload de Documento</Button>
          </div>
          {documentos.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Nenhum documento anexado.</p>
                <Button className="mt-4" variant="outline" onClick={() => setModalDocumento(true)}><FileUp className="w-4 h-4 mr-2" />Anexar Documento</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {documentos.map((doc) => {
                const termoVinculado = doc.termo_aditivo_id ? termos.find(t => t.id === doc.termo_aditivo_id) : null
                return (
                <Card key={doc.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-blue-500 shrink-0" />
                      <div>
                        <p className="font-medium">{doc.titulo}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.nome_original} • {(doc.tamanho_bytes / 1024).toFixed(1)} KB
                          {termoVinculado && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Termo {termoVinculado.numero_termo}
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleDownloadDocumento(doc.id)}>
                        <Download className="w-4 h-4 mr-1" />Baixar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleExcluirDocumento(doc.id)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Histórico do Contrato
              </CardTitle>
              <CardDescription>
                Todas as ações realizadas neste contrato
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historico.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">Nenhum registro no histórico.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200" />
                  <div className="space-y-6">
                    {historico.map((item, index) => {
                      const acaoInfo = TIPO_ACAO_LABELS[item.tipo_acao] || { label: item.tipo_acao, cor: 'bg-gray-100 text-gray-800', icon: '📌' }
                      // Força interpretação como UTC (backend salva sem timezone) e exibe em Brasília
                      const raw = item.created_at.endsWith('Z') ? item.created_at : item.created_at + 'Z'
                      const dataHora = new Date(raw)
                      const dataFormatada = dataHora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                      const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

                      return (
                        <div key={item.id} className="relative flex gap-4 pl-2">
                          <div className="relative z-10 flex items-center justify-center w-9 h-9 rounded-full bg-white border-2 border-gray-200 text-lg shrink-0">
                            {acaoInfo.icon}
                          </div>
                          <div className="flex-1 pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className={acaoInfo.cor}>{acaoInfo.label}</Badge>
                                  {item.status_anterior && item.status_novo && (
                                    <span className="text-xs text-gray-500">
                                      {STATUS_CONTRATO[item.status_anterior as keyof typeof STATUS_CONTRATO]?.label || item.status_anterior}
                                      {' → '}
                                      {STATUS_CONTRATO[item.status_novo as keyof typeof STATUS_CONTRATO]?.label || item.status_novo}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700 mt-1">{item.descricao}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs text-gray-500">{dataFormatada}</p>
                                <p className="text-xs text-gray-400">{horaFormatada}</p>
                              </div>
                            </div>
                            {item.usuario_nome && (
                              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {item.usuario_nome}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {['MEDICAO', 'CONTINUADO', 'LICENCA'].includes(contrato.modalidade_execucao || '') && (
          <TabsContent value="medicao">
            <TabMedicao contratoId={contrato.id} valorGlobal={Number(contrato.valor_global)} modalidade={contrato.modalidade_execucao} contrato={contrato} isAdmin={isAdmin} />
          </TabsContent>
        )}

        {contrato.modalidade_execucao === 'CONTINUADO' && (
          <TabsContent value="atestacao">
            <TabAtestacao contratoId={contrato.id} valorGlobal={Number(contrato.valor_global)} dataVigenciaInicio={contrato.data_vigencia_inicio} dataVigenciaFim={contrato.data_vigencia_fim} />
          </TabsContent>
        )}

        {contrato.modalidade_execucao === 'LICENCA' && (
          <TabsContent value="licencas">
            <TabLicencas contratoId={contrato.id} />
          </TabsContent>
        )}

        {contrato.modalidade_execucao === 'ORDEM_SERVICO' && (
          <TabsContent value="ordens-servico">
            <TabOrdensServico contratoId={contrato.id} valorGlobal={Number(contrato.valor_global)} />
          </TabsContent>
        )}

        <TabsContent value="empenhos" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="w-5 h-5" />
                    Empenhos — Portal de Transparência
                  </CardTitle>
                  <CardDescription>
                    Despesas registradas no portal municipal para o contrato {contrato.numero_contrato}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEmpenhosBuscados(false); buscarEmpenhos() }}
                  disabled={loadingEmpenhos}
                >
                  {loadingEmpenhos
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                  <span className="ml-2">Atualizar</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEmpenhos ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Consultando portal de transparência...</span>
                </div>
              ) : empenhos.length === 0 ? (
                <div className="text-center py-12">
                  <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium">Nenhuma despesa encontrada</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Verifique se o ID do órgão está configurado em Configurações → Transparência
                  </p>
                </div>
              ) : (
                <>
                  {/* Execução orçamentária (valor global × empenhado) */}
                  {resumoEmpenhos && resumoEmpenhos.valor_global_contrato > 0 && (
                    <div className="mb-6 space-y-4">
                      <div className="rounded-lg border bg-gradient-to-br from-slate-50 to-white p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-xs uppercase font-medium text-slate-500">Execução Orçamentária</p>
                            <p className="text-xs text-slate-400">Valor global × total empenhado em todos os exercícios</p>
                          </div>
                          <p className="text-sm font-semibold text-slate-700">
                            {resumoEmpenhos.percentual_execucao_orcamentaria.toFixed(1)}%
                          </p>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div
                            className="h-3 bg-gradient-to-r from-indigo-500 to-blue-500 transition-all"
                            style={{ width: `${Math.min(100, resumoEmpenhos.percentual_execucao_orcamentaria)}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                          <div>
                            <p className="text-slate-500">Valor Global</p>
                            <p className="font-semibold text-slate-800">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.valor_global_contrato)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Empenhado</p>
                            <p className="font-semibold text-blue-700">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.total_empenhado)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Saldo a Empenhar</p>
                            <p className={`font-semibold ${resumoEmpenhos.saldo_a_empenhar > 0.01 ? 'text-amber-700' : 'text-green-700'}`}>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.saldo_a_empenhar)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {resumoEmpenhos.requer_novo_empenho_anual && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-amber-900">Empenho do exercício seguinte pendente</p>
                            <p className="text-amber-800 mt-0.5">
                              Este contrato plurianual ainda tem{' '}
                              <strong>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.saldo_a_empenhar)}
                              </strong>{' '}
                              a empenhar. Conforme Lei 4.320/64, o órgão deve realizar <strong>apostilamento</strong> e novo empenho no próximo exercício
                              orçamentário até cobrir o valor global.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resumo por fase */}
                  {resumoEmpenhos && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-600 uppercase font-medium">Empenhado</p>
                        <p className="text-lg font-bold text-blue-700">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.total_empenhado)}
                        </p>
                        <p className="text-xs text-blue-500">{resumoEmpenhos.quantidade_empenhos} empenho(s)</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3">
                        <p className="text-xs text-purple-600 uppercase font-medium">Liquidado</p>
                        <p className="text-lg font-bold text-purple-700">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.total_liquidado)}
                        </p>
                        <p className="text-xs text-purple-500">{resumoEmpenhos.quantidade_liquidacoes} liquidação(ões)</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-xs text-green-600 uppercase font-medium">Pago</p>
                        <p className="text-lg font-bold text-green-700">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.total_pago)}
                        </p>
                        <p className="text-xs text-green-500">{resumoEmpenhos.quantidade_pagamentos} pagamento(s)</p>
                      </div>
                      <div className={`rounded-lg p-3 ${resumoEmpenhos.saldo_empenhado >= 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
                        <p className={`text-xs uppercase font-medium ${resumoEmpenhos.saldo_empenhado >= 0 ? 'text-amber-600' : 'text-red-600'}`}>Saldo Empenhado</p>
                        <p className={`text-lg font-bold ${resumoEmpenhos.saldo_empenhado >= 0 ? 'text-amber-700' : 'text-red-700'}`}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoEmpenhos.saldo_empenhado)}
                        </p>
                        <p className={`text-xs ${resumoEmpenhos.saldo_empenhado >= 0 ? 'text-amber-500' : 'text-red-500'}`}>
                          {resumoEmpenhos.saldo_empenhado >= 0 ? 'disponível' : 'excedido'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Agrupamento por ano de exercício */}
                  {empenhosPorAno.length > 1 && (
                    <div className="mb-6 overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b">
                            <th className="text-left px-3 py-2 font-medium text-slate-600">Exercício</th>
                            <th className="text-right px-3 py-2 font-medium text-slate-600">Empenhado</th>
                            <th className="text-right px-3 py-2 font-medium text-slate-600">Liquidado</th>
                            <th className="text-right px-3 py-2 font-medium text-slate-600">Pago</th>
                            <th className="text-right px-3 py-2 font-medium text-slate-600">Qtd.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empenhosPorAno.map((a) => (
                            <tr key={a.ano} className="border-b last:border-0 hover:bg-slate-50">
                              <td className="px-3 py-2 font-semibold text-slate-800">{a.ano}</td>
                              <td className="px-3 py-2 text-right text-blue-700 font-medium">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.total_empenhado)}
                              </td>
                              <td className="px-3 py-2 text-right text-purple-700">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.total_liquidado)}
                              </td>
                              <td className="px-3 py-2 text-right text-green-700">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.total_pago)}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-500 text-xs">
                                {a.quantidade_empenhos}E / {a.quantidade_liquidacoes}L / {a.quantidade_pagamentos}P
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Execução por Exercício (ano fiscal) */}
                  {gruposExercicio.length > 0 && (
                    <div className="mb-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">
                          Execução por Exercício
                        </h3>
                        <span className="text-xs text-gray-500">
                          Agrupamento por ano calendário
                        </span>
                      </div>
                      {gruposExercicio.map((grupo) => {
                        const statusCores: Record<string, string> = {
                          EXECUCAO: 'border-blue-200 bg-blue-50',
                          ENCERRADO: 'border-green-200 bg-green-50',
                          ABERTO: 'border-amber-200 bg-amber-50',
                        }
                        const statusBadge: Record<string, string> = {
                          EXECUCAO: 'bg-blue-100 text-blue-800',
                          ENCERRADO: 'bg-green-100 text-green-800',
                          ABERTO: 'bg-amber-100 text-amber-800',
                        }
                        const statusLabel: Record<string, string> = {
                          EXECUCAO: 'Em execução',
                          ENCERRADO: 'Encerrado',
                          ABERTO: 'Saldo aberto',
                        }
                        const fmt = (v: number) =>
                          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
                        const perc = grupo.total_empenhado_liquido > 0
                          ? (grupo.total_pago / grupo.total_empenhado_liquido) * 100
                          : 0
                        const classificaEmpenho = (e: EmpenhoFator, idx: number): string => {
                          const bs = (e.bem_servico || '').toUpperCase()
                          if (/APOSTILAMENTO/.test(bs)) return 'Empenho do exercício (Apostilamento)'
                          if (/ACR[ÉE]SCIMO\s+DE\s+VALOR\s+AO\s+EMPENHO/.test(bs)) return 'Empenho do exercício (Acréscimo)'
                          if (/REFOR[ÇC]O/.test(bs)) return 'Empenho do exercício (Reforço)'
                          if (/ADITIVO/.test(bs)) return 'Empenho do exercício (Aditivo)'
                          return idx === 0 ? 'Empenho do exercício' : 'Empenho complementar'
                        }
                        return (
                          <details key={grupo.ano} className={`rounded-lg border ${statusCores[grupo.status]}`} open={grupo.status === 'EXECUCAO'}>
                            <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Calendar className="w-5 h-5 text-gray-600 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-gray-800 text-base">
                                      Exercício {grupo.ano}
                                    </span>
                                    <Badge variant="outline" className={`text-xs ${statusBadge[grupo.status]}`}>
                                      {statusLabel[grupo.status]}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {grupo.empenhos_positivos.length} empenho(s) · {grupo.anulacoes.length} anulação(ões) · {grupo.pagamentos.length} pagamento(s)
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-right flex-wrap">
                                <div>
                                  <p className="text-xs text-gray-500">Empenhado líq.</p>
                                  <p className="font-bold text-gray-800">{fmt(grupo.total_empenhado_liquido)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Pago</p>
                                  <p className="font-bold text-green-700">{fmt(grupo.total_pago)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Saldo</p>
                                  <p className={`font-bold ${grupo.saldo_a_liquidar + grupo.saldo_a_pagar > 0.01 ? 'text-amber-700' : 'text-green-700'}`}>
                                    {fmt(grupo.saldo_a_liquidar + grupo.saldo_a_pagar)}
                                  </p>
                                </div>
                              </div>
                            </summary>
                            <div className="border-t bg-white/60 p-4 space-y-3">
                              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-2 bg-gradient-to-r from-green-500 to-emerald-500"
                                  style={{ width: `${Math.min(100, perc)}%` }}
                                />
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Bruto empenhado:</span>{' '}
                                  <span className="font-medium text-blue-700">{fmt(grupo.total_empenhado_bruto)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Anulado:</span>{' '}
                                  <span className="font-medium text-red-700">−{fmt(grupo.total_anulado)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Liquidado:</span>{' '}
                                  <span className="font-medium text-purple-700">{fmt(grupo.total_liquidado)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">% Pago:</span>{' '}
                                  <span className="font-medium text-gray-800">{perc.toFixed(1)}%</span>
                                </div>
                              </div>

                              {/* Empenhos compostos (agrupados por nº empenho) */}
                              {grupo.empenhos_compostos?.length > 0 && grupo.empenhos_compostos.map((comp, ci) => (
                                <div key={ci} className="rounded border">
                                  <div className="bg-blue-50 px-3 py-1.5 border-b flex items-center justify-between">
                                    <p className="text-xs font-semibold text-blue-800">
                                      Empenho #{comp.numero_empenho || 's/n'}{comp.ano_exercicio ? `-${comp.ano_exercicio}` : ''}
                                      {comp.empenho && (
                                        <span className="ml-2 font-normal text-blue-600">
                                          {comp.empenho.data} — {comp.empenho.credor}
                                        </span>
                                      )}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="text-blue-700">
                                        Emp. líq. {fmt(comp.total_empenhado_liquido)}
                                      </span>
                                      <span className="text-green-700">
                                        Pago {fmt(comp.total_pago)}
                                      </span>
                                      {comp.comprometido != null && comp.comprometido > 0.01 && (
                                        <span className="text-orange-600">
                                          Comprometido {fmt(comp.comprometido)}
                                        </span>
                                      )}
                                      <span className={`font-bold ${(comp.saldo_virtual ?? comp.saldo_a_liquidar) > 0.01 ? 'text-blue-700' : 'text-red-600'}`}>
                                        Disponível {fmt(comp.saldo_virtual ?? comp.saldo_a_liquidar)}
                                      </span>
                                    </div>
                                  </div>
                                  <table className="w-full text-xs">
                                    <tbody>
                                      {/* Empenho original */}
                                      {comp.empenho && (
                                        <tr className="border-b bg-blue-50/30">
                                          <td className="px-3 py-1.5 text-gray-600 w-24">{comp.empenho.data}</td>
                                          <td className="px-3 py-1.5">
                                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-800 border-blue-200">
                                              {classificaEmpenho(comp.empenho, ci)}
                                            </Badge>
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-medium text-blue-700">
                                            +{comp.empenho.valor_formatado}
                                          </td>
                                        </tr>
                                      )}
                                      {/* Acréscimos / Reforços absorvidos */}
                                      {comp.acrescimos?.map((ac, aci) => (
                                        <tr key={`ac-${aci}`} className="border-b bg-blue-50/50">
                                          <td className="px-3 py-1.5 text-gray-600 w-24">{ac.data}</td>
                                          <td className="px-3 py-1.5">
                                            <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">
                                              Acréscimo / Reforço
                                            </Badge>
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-medium text-blue-700">
                                            +{ac.valor_formatado}
                                          </td>
                                        </tr>
                                      ))}
                                      {/* Anulações */}
                                      {comp.anulacoes.map((a, ai) => (
                                        <tr key={`a-${ai}`} className="border-b last:border-0 bg-red-50/40">
                                          <td className="px-3 py-1.5 text-gray-600 w-24">{a.data}</td>
                                          <td className="px-3 py-1.5">
                                            <Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 border-red-200">
                                              Anulação
                                            </Badge>
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-medium text-red-700">
                                            {a.valor_formatado}
                                          </td>
                                        </tr>
                                      ))}
                                      {/* Liquidações e pagamentos */}
                                      {[...comp.liquidacoes, ...comp.pagamentos]
                                        .sort((a, b) => {
                                          const [da, ma, ya] = a.data.split('/').map(Number)
                                          const [db, mb, yb] = b.data.split('/').map(Number)
                                          return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime()
                                        })
                                        .map((e, ei) => (
                                          <tr key={`lp-${ei}`} className="border-b last:border-0">
                                            <td className="px-3 py-1.5 text-gray-600 w-24">{e.data}</td>
                                            <td className="px-3 py-1.5">
                                              <Badge variant="outline" className={`text-[10px] ${
                                                e.fase_tipo === 'LIQUIDACAO'
                                                  ? (e.valor < 0 ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-purple-100 text-purple-800 border-purple-200')
                                                  : (e.valor < 0 ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-green-100 text-green-800 border-green-200')
                                              }`}>
                                                {e.fase_tipo === 'LIQUIDACAO'
                                                  ? (e.valor < 0 ? 'Estorno Liq.' : 'Liquidação')
                                                  : (e.valor < 0 ? 'Estorno Pagto' : 'Pagamento')}
                                              </Badge>
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-medium">
                                              {e.valor_formatado}
                                            </td>
                                          </tr>
                                        ))}
                                      {/* Rodapé do empenho composto */}
                                      <tr className="bg-gray-100 font-semibold">
                                        <td colSpan={2} className="px-3 py-1.5 text-gray-700">
                                          Saldo do empenho #{comp.numero_empenho || 's/n'}{comp.ano_exercicio ? `-${comp.ano_exercicio}` : ''}
                                        </td>
                                        <td className="px-3 py-1.5 text-right text-gray-800">
                                          {fmt(comp.saldo_a_liquidar + comp.saldo_a_pagar)}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                  {/* Ordens/Requisições vinculadas */}
                                  {comp.requisicoes_vinculadas && comp.requisicoes_vinculadas.length > 0 && (
                                    <div className="border-t bg-amber-50/50 px-3 py-2">
                                      <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-1">
                                        Ordens vinculadas ({comp.requisicoes_vinculadas.length})
                                      </p>
                                      <div className="space-y-1">
                                        {comp.requisicoes_vinculadas.map((req) => {
                                          const statusColors: Record<string, string> = {
                                            RASCUNHO: 'bg-gray-100 text-gray-700',
                                            AGUARDANDO_AUTORIZACAO: 'bg-yellow-100 text-yellow-800',
                                            AUTORIZADA: 'bg-blue-100 text-blue-800',
                                            ORDEM_GERADA: 'bg-indigo-100 text-indigo-800',
                                            ATENDIDA_PARCIAL: 'bg-orange-100 text-orange-800',
                                            ATENDIDA: 'bg-green-100 text-green-800',
                                          };
                                          const statusLabels: Record<string, string> = {
                                            RASCUNHO: 'Rascunho',
                                            AGUARDANDO_AUTORIZACAO: 'Aguardando',
                                            AUTORIZADA: 'Autorizada',
                                            ORDEM_GERADA: 'Ordem gerada',
                                            ATENDIDA_PARCIAL: 'Parcial',
                                            ATENDIDA: 'Atendida',
                                          };
                                          const tipoLabel = req.tipo === 'ORDEM_SERVICO' ? 'OS' : req.tipo === 'SERVICO' ? 'Serv.' : 'Req.';
                                          return (
                                            <div key={req.id} className="flex items-center gap-2 text-[11px]">
                                              <a
                                                href={req.tipo === 'ORDEM_SERVICO' ? `/orgao/almoxarifado/requisicoes?destaque=${req.id}` : `/orgao/almoxarifado/ordens?destaque=${req.id}`}
                                                className="font-mono font-medium text-blue-700 hover:underline"
                                              >
                                                {req.numero || req.id.slice(0, 8)}
                                              </a>
                                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                                {tipoLabel}
                                              </Badge>
                                              <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${statusColors[req.status] || 'bg-gray-100 text-gray-600'}`}>
                                                {statusLabels[req.status] || req.status}
                                              </Badge>
                                              <span className="text-gray-600">{fmt(req.valor_total_estimado)}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  )}

                  {/* Tabela */}
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Data</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Nº Liquidação</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Fase</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Credor</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 hidden md:table-cell">Nº Processo</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 hidden lg:table-cell">Elemento</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empenhos.map((e, i) => {
                          const faseColors: Record<string, string> = {
                            EMPENHO: 'bg-blue-100 text-blue-800 border-blue-200',
                            LIQUIDACAO: 'bg-purple-100 text-purple-800 border-purple-200',
                            PAGAMENTO: 'bg-green-100 text-green-800 border-green-200',
                            OUTRO: 'bg-gray-100 text-gray-800 border-gray-200',
                          }
                          const faseLabel: Record<string, string> = {
                            EMPENHO: 'Empenho',
                            LIQUIDACAO: 'Liquidação',
                            PAGAMENTO: 'Pagamento',
                            OUTRO: e.fase,
                          }
                          return (
                            <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{e.data}</td>
                              <td className="px-3 py-2 font-mono text-xs">
                                {e.numero_liquidacao || <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`text-xs whitespace-nowrap ${faseColors[e.fase_tipo] || faseColors.OUTRO}`}>
                                  {faseLabel[e.fase_tipo] || e.fase}
                                </Badge>
                              </td>
                              <td className="px-3 py-2">
                                <p className="font-medium text-gray-800 truncate max-w-[180px]">{e.credor}</p>
                                {e.cnpj && <p className="text-xs text-gray-400 font-mono">{e.cnpj}</p>}
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-xs hidden md:table-cell">{e.numero_processo || '—'}</td>
                              <td className="px-3 py-2 text-gray-600 text-xs hidden lg:table-cell truncate max-w-[160px]">{e.elemento_despesa || '—'}</td>
                              <td className="px-3 py-2 text-right font-medium text-gray-800 whitespace-nowrap">{e.valor_formatado}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={modalTermo} onOpenChange={setModalTermo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Termo Aditivo</DialogTitle>
            <DialogDescription>Adicione um termo aditivo ou apostilamento ao contrato</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={novoTermo.tipo} onValueChange={(v) => setNovoTermo({...novoTermo, tipo: v, renovacao_ciclo: false})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_TERMO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data de Assinatura *</Label>
                <Input type="date" value={novoTermo.data_assinatura} onChange={(e) => setNovoTermo({...novoTermo, data_assinatura: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Objeto do Termo *</Label>
              <Textarea placeholder="Descreva o objeto do termo aditivo" value={novoTermo.objeto} onChange={(e) => setNovoTermo({...novoTermo, objeto: e.target.value})} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Justificativa *</Label>
              <Textarea placeholder="Justifique a necessidade do termo aditivo (ex.: necessidade de prorrogação para conclusão dos serviços)" value={novoTermo.justificativa} onChange={(e) => setNovoTermo({...novoTermo, justificativa: e.target.value})} rows={2} />
            </div>
            {novoTermo.tipo === 'ADITIVO_PRAZO' ? (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={novoTermo.renovacao_ciclo}
                    onChange={(e) => setNovoTermo({
                      ...novoTermo,
                      renovacao_ciclo: e.target.checked,
                      valor_acrescimo: e.target.checked ? String(Number(contrato?.valor_global) || '') : '',
                    })}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-medium text-blue-900">Renovação de ciclo</span>
                    <p className="text-xs text-blue-700 mt-0.5">
                      O saldo de medições será reiniciado para o novo ciclo. Medições anteriores não contarão contra o novo saldo. O valor global do contrato <strong>não</strong> é alterado.
                    </p>
                  </div>
                </label>
                {novoTermo.renovacao_ciclo && (
                  <div className="space-y-1">
                    <Label>Valor do ciclo (informativo)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={novoTermo.valor_acrescimo}
                      onChange={(e) => setNovoTermo({...novoTermo, valor_acrescimo: e.target.value})}
                    />
                    <p className="text-xs text-blue-600">
                      Sugestão: {formatarMoeda(Number(contrato?.valor_global) || 0)} (valor global atual do contrato). Este valor é apenas informativo e não altera o total do contrato.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Acréscimo</Label>
                  <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2"><input type="radio" name="modo_acrescimo" checked={novoTermo.modo_acrescimo === 'incremento'} onChange={() => setNovoTermo({...novoTermo, modo_acrescimo: 'incremento'})} /> Incremento (R$)</label>
                    <label className="flex items-center gap-2"><input type="radio" name="modo_acrescimo" checked={novoTermo.modo_acrescimo === 'novo_global'} onChange={() => setNovoTermo({...novoTermo, modo_acrescimo: 'novo_global'})} /> Novo valor global (R$)</label>
                    <label className="flex items-center gap-2"><input type="radio" name="modo_acrescimo" checked={novoTermo.modo_acrescimo === 'percentual'} onChange={() => setNovoTermo({...novoTermo, modo_acrescimo: 'percentual'})} /> Percentual (%)</label>
                  </div>
                  {novoTermo.modo_acrescimo === 'incremento' && <Input type="number" step="0.01" min="0" placeholder="0,00" value={novoTermo.valor_acrescimo} onChange={(e) => setNovoTermo({...novoTermo, valor_acrescimo: e.target.value})} />}
                  {novoTermo.modo_acrescimo === 'novo_global' && <Input type="number" step="0.01" min="0" placeholder="Novo valor total" value={novoTermo.novo_valor_global_acrescimo} onChange={(e) => setNovoTermo({...novoTermo, novo_valor_global_acrescimo: e.target.value})} />}
                  {novoTermo.modo_acrescimo === 'percentual' && <Input type="number" step="0.01" min="0" placeholder="Ex: 8,44" value={novoTermo.percentual_acrescimo} onChange={(e) => setNovoTermo({...novoTermo, percentual_acrescimo: e.target.value})} />}
                </div>
                <div>
                  <Label className="mb-2 block">Supressão</Label>
                  <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2"><input type="radio" name="modo_supressao" checked={novoTermo.modo_supressao === 'incremento'} onChange={() => setNovoTermo({...novoTermo, modo_supressao: 'incremento'})} /> Valor (R$)</label>
                    <label className="flex items-center gap-2"><input type="radio" name="modo_supressao" checked={novoTermo.modo_supressao === 'novo_global'} onChange={() => setNovoTermo({...novoTermo, modo_supressao: 'novo_global'})} /> Novo valor global (R$)</label>
                    <label className="flex items-center gap-2"><input type="radio" name="modo_supressao" checked={novoTermo.modo_supressao === 'percentual'} onChange={() => setNovoTermo({...novoTermo, modo_supressao: 'percentual'})} /> Percentual (%)</label>
                  </div>
                  {novoTermo.modo_supressao === 'incremento' && <Input type="number" step="0.01" min="0" placeholder="0,00" value={novoTermo.valor_supressao} onChange={(e) => setNovoTermo({...novoTermo, valor_supressao: e.target.value})} />}
                  {novoTermo.modo_supressao === 'novo_global' && <Input type="number" step="0.01" min="0" placeholder="Novo valor apos supressao" value={novoTermo.novo_valor_global_supressao} onChange={(e) => setNovoTermo({...novoTermo, novo_valor_global_supressao: e.target.value})} />}
                  {novoTermo.modo_supressao === 'percentual' && <Input type="number" step="0.01" min="0" placeholder="Ex: 5" value={novoTermo.percentual_supressao} onChange={(e) => setNovoTermo({...novoTermo, percentual_supressao: e.target.value})} />}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Nova Data de Vigência</Label>
              <Input type="date" value={novoTermo.nova_data_vigencia_fim} onChange={(e) => setNovoTermo({...novoTermo, nova_data_vigencia_fim: e.target.value})} />
              <p className="text-xs text-gray-500">Preencha apenas se houver alteração na data de vigência</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTermo(false)}>Cancelar</Button>
            <Button onClick={handleCriarTermo} disabled={loadingAction}>
              {loadingAction ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Criar Termo Aditivo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modalEditTermo} onOpenChange={() => setModalEditTermo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Termo Aditivo — {modalEditTermo?.numero_termo}</DialogTitle>
            <DialogDescription>Altere os dados do termo aditivo</DialogDescription>
          </DialogHeader>
          {modalEditTermo && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Objeto do Termo *</Label>
                <Textarea placeholder="Descreva o objeto do termo aditivo" value={modalEditTermo.objeto || ''} onChange={(e) => setModalEditTermo({ ...modalEditTermo, objeto: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Justificativa</Label>
                <Textarea placeholder="Justifique a necessidade do termo aditivo" value={modalEditTermo.justificativa || ''} onChange={(e) => setModalEditTermo({ ...modalEditTermo, justificativa: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor de Acréscimo (R$)</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0,00" value={modalEditTermo.valor_acrescimo ?? ''} onChange={(e) => setModalEditTermo({ ...modalEditTermo, valor_acrescimo: e.target.value ? parseFloat(e.target.value) : null })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor de Supressão (R$)</Label>
                  <Input type="number" step="0.01" min="0" placeholder="0,00" value={modalEditTermo.valor_supressao ?? ''} onChange={(e) => setModalEditTermo({ ...modalEditTermo, valor_supressao: e.target.value ? parseFloat(e.target.value) : null })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data de Assinatura *</Label>
                <Input type="date" value={modalEditTermo.data_assinatura?.toString().split('T')[0] || ''} onChange={(e) => setModalEditTermo({ ...modalEditTermo, data_assinatura: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nova Data de Vigência</Label>
                <Input type="date" value={modalEditTermo.nova_data_vigencia_fim?.toString().split('T')[0] || ''} onChange={(e) => setModalEditTermo({ ...modalEditTermo, nova_data_vigencia_fim: e.target.value || null })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEditTermo(null)}>Cancelar</Button>
            <Button onClick={handleEditarTermo} disabled={loadingAction || !modalEditTermo?.objeto}>
              {loadingAction ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modalCancelarTermo} onOpenChange={() => setModalCancelarTermo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Termo Aditivo — {modalCancelarTermo?.numero_termo}</DialogTitle>
            <DialogDescription>Ao cancelar, os valores do contrato serão revertidos (acréscimos e supressões deste termo).</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCancelarTermo(null)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancelarTermo} disabled={loadingAction}>
              {loadingAction ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelando...</> : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Buscar Aditivos do Portal */}
      <Dialog open={modalAditivosPortal.open} onOpenChange={(open) => setModalAditivosPortal(prev => prev ? { ...prev, open, resultado: null, erro: null } : prev)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aditivos do Portal de Transparência</DialogTitle>
            <DialogDescription>
              Termos aditivos encontrados no Portal para o contrato {contrato?.numero_contrato}
            </DialogDescription>
          </DialogHeader>

          {modalAditivosPortal.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-500">Buscando aditivos no portal...</span>
            </div>
          ) : modalAditivosPortal.erro ? (
            <div className="py-8 text-center">
              <AlertCircle className="w-10 h-10 mx-auto text-red-400 mb-3" />
              <p className="text-red-600">{modalAditivosPortal.erro}</p>
            </div>
          ) : modalAditivosPortal.resultado ? (
            <div className="py-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
                <p className="font-medium text-green-800">Importação concluída!</p>
                <div className="mt-2 text-sm text-green-700 space-y-1">
                  <p>Importados: {modalAditivosPortal.resultado.importados}</p>
                  <p>Já existentes: {modalAditivosPortal.resultado.ja_existentes}</p>
                  {modalAditivosPortal.resultado.erros > 0 && <p className="text-red-600">Erros: {modalAditivosPortal.resultado.erros}</p>}
                </div>
                {modalAditivosPortal.resultado.detalhes?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {modalAditivosPortal.resultado.detalhes.map((d: any, i: number) => (
                      <p key={i} className={`text-xs ${d.status === 'importado' ? 'text-green-700' : d.status === 'ja_existente' ? 'text-amber-700' : 'text-red-700'}`}>
                        {d.nome}: {d.status} {d.mensagem ? `— ${d.mensagem}` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : modalAditivosPortal.aditivos.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhum aditivo encontrado no portal para este contrato.</p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">{modalAditivosPortal.aditivos.length} aditivo(s) encontrado(s):</p>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <Checkbox
                    checked={modalAditivosPortal.selecionados.size === modalAditivosPortal.aditivos.length && modalAditivosPortal.aditivos.length > 0}
                    onCheckedChange={(checked) => {
                      setModalAditivosPortal(prev => prev ? {
                        ...prev,
                        selecionados: checked ? new Set(prev.aditivos.map((_, i) => i)) : new Set()
                      } : prev)
                    }}
                  />
                  Selecionar todos
                </label>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="w-10 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Nº / Nome</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Valor</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Vigência</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Fiscal</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalAditivosPortal.aditivos.map((a, i) => (
                      <tr key={i} className={`border-b last:border-0 ${modalAditivosPortal.selecionados.has(i) ? 'bg-blue-50/50' : ''}`}>
                        <td className="px-3 py-2 text-center">
                          <Checkbox
                            checked={modalAditivosPortal.selecionados.has(i)}
                            onCheckedChange={(checked) => {
                              setModalAditivosPortal(prev => {
                                if (!prev) return prev
                                const novos = new Set(prev.selecionados)
                                if (checked) novos.add(i); else novos.delete(i)
                                return { ...prev, selecionados: novos }
                              })
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{a.nome}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={a.tipo === 'Prazo' ? 'bg-blue-50 text-blue-800 border-blue-200' : a.tipo === 'Valor' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-purple-50 text-purple-800 border-purple-200'}>
                            {a.tipo}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-green-700">{a.valor}</td>
                        <td className="px-3 py-2 text-gray-600">{a.vigencia}</td>
                        <td className="px-3 py-2 text-gray-600">{a.fiscal}</td>
                        <td className="px-3 py-2 text-center">
                          {a.pdf_url ? (
                            <a href={a.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                              <ExternalLink className="w-3.5 h-3.5" />PDF
                            </a>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            {!modalAditivosPortal.resultado && modalAditivosPortal.aditivos.length > 0 && !modalAditivosPortal.loading && (
              <Button onClick={importarAditivosPortal} disabled={modalAditivosPortal.importando || modalAditivosPortal.selecionados.size === 0}>
                {modalAditivosPortal.importando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando...</> : <><DownloadCloud className="w-4 h-4 mr-2" />Importar {modalAditivosPortal.selecionados.size} selecionado(s)</>}
              </Button>
            )}
            <Button variant="outline" onClick={() => setModalAditivosPortal({ open: false, aditivos: [], selecionados: new Set(), loading: false, importando: false, resultado: null, erro: null })}>
              {modalAditivosPortal.resultado ? 'Fechar' : 'Cancelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalDocumento} onOpenChange={setModalDocumento}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload de Documento</DialogTitle>
            <DialogDescription>Anexe um documento ao contrato (PDF, DOC, DOCX, JPG ou PNG)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Vincular a Termo Aditivo</Label>
              <Select value={novoDocumento.termo_aditivo_id || 'none'} onValueChange={(v) => setNovoDocumento({ ...novoDocumento, termo_aditivo_id: v === 'none' ? '' : v, tipo: v === 'none' ? novoDocumento.tipo : 'TERMO_ADITIVO' })}>
                <SelectTrigger><SelectValue placeholder="Contrato (geral)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Contrato (geral)</SelectItem>
                  {termos.filter(t => t.status !== 'CANCELADO').map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.numero_termo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={novoDocumento.tipo} onValueChange={(v) => setNovoDocumento({ ...novoDocumento, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTRATO">Contrato</SelectItem>
                  <SelectItem value="TERMO_ADITIVO">Termo Aditivo</SelectItem>
                  <SelectItem value="APOSTILAMENTO">Apostilamento</SelectItem>
                  <SelectItem value="ANEXO">Anexo</SelectItem>
                  <SelectItem value="ATA">Ata</SelectItem>
                  <SelectItem value="OUTROS">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input placeholder="Ex: Contrato assinado" value={novoDocumento.titulo} onChange={(e) => setNovoDocumento({ ...novoDocumento, titulo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea placeholder="Opcional" value={novoDocumento.descricao} onChange={(e) => setNovoDocumento({ ...novoDocumento, descricao: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Arquivo *</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {arquivoDocumento ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <span className="text-sm">{arquivoDocumento.name}</span>
                      <span className="text-xs text-muted-foreground">({(arquivoDocumento.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setArquivoDocumento(null)}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <label className="cursor-pointer block">
                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => setArquivoDocumento(e.target.files?.[0] || null)} />
                    <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-muted-foreground">Clique para selecionar o arquivo</p>
                    <p className="text-xs mt-1">PDF, DOC, DOCX, JPG, PNG (máx. 10MB)</p>
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDocumento(false)}>Cancelar</Button>
            <Button onClick={handleUploadDocumento} disabled={uploadingDoc || !arquivoDocumento || !novoDocumento.titulo.trim()}>
              {uploadingDoc ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : <><Upload className="mr-2 h-4 w-4" />Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalStatus} onOpenChange={setModalStatus}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status do Contrato</DialogTitle>
            <DialogDescription>Selecione o novo status do contrato</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Novo Status</Label>
              <Select value={novoStatus} onValueChange={setNovoStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONTRATO).map(([key, val]) => <SelectItem key={key} value={key}>{val.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalStatus(false)}>Cancelar</Button>
            <Button onClick={handleAlterarStatus} disabled={loadingAction}>
              {loadingAction ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Remover Duplicados */}
      <Dialog open={modalDuplicados} onOpenChange={setModalDuplicados}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Itens Duplicados Detectados</DialogTitle>
            <DialogDescription>
              {duplicados?.total_duplicados || 0} item(ns) duplicado(s) em {duplicados?.grupos.length || 0} grupo(s). Revise antes de confirmar a remo{'\u00E7\u00E3'}o.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {duplicados?.grupos.map((grupo, i) => (
              <div key={i} className="border rounded-lg p-3 text-sm">
                <p className="font-medium">{grupo.descricao}</p>
                <div className="flex gap-4 text-gray-500 mt-1">
                  <span>Qtd: {grupo.quantidade}</span>
                  <span>Unit: R$ {grupo.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span>{grupo.ids.length} ocorr{'\u00EA'}ncias</span>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  Manter 1, remover {grupo.remover_ids.length}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDuplicados(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={removendoDuplicados}
              onClick={removerDuplicados}
            >
              {removendoDuplicados ? 'Removendo...' : `Remover ${duplicados?.total_duplicados || 0} duplicado(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalItem} onOpenChange={setModalItem}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoItem ? 'Editar Item' : 'Adicionar Item ao Contrato'}</DialogTitle>
            <DialogDescription>
              {contrato.categoria === 'SERVICOS'
                ? 'Para serviços mensais, use unidade MÊS e quantidade = número de meses.'
                : 'Informe os dados do material/produto contratado.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editandoItem && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Search className="w-4 h-4" />Buscar no Catálogo Próprio</Label>
                <div className="relative">
                  <Input
                    placeholder="Digite para buscar no catálogo interno (mín. 2 caracteres)..."
                    value={buscaCatalogo}
                    onChange={(e) => { setBuscaCatalogo(e.target.value); buscarNoCatalogoProprio(e.target.value) }}
                  />
                  {buscandoCatalogo && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-gray-400" />}
                </div>
                {resultadosCatalogo.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto bg-white shadow-sm">
                    {resultadosCatalogo.map((item: any) => (
                      <button key={item.id || item.codigo} className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 text-sm" onClick={() => selecionarItemCatalogo(item)}>
                        <span className="font-medium text-purple-600 mr-2">{item.codigo}</span>
                        <span>{item.descricao}</span>
                        {item.valor_referencia && <span className="text-gray-400 ml-2">- Ref: R$ {Number(item.valor_referencia).toFixed(2)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label>Nº Item</Label>
                <Input type="number" min="1" value={novoItem.numero_item} onChange={(e) => setNovoItem({...novoItem, numero_item: parseInt(e.target.value) || 1})} disabled={!!editandoItem} />
              </div>
              <div className="space-y-2">
                <Label>Lote Nº</Label>
                <Input type="number" min="1" placeholder="Ex: 1" value={novoItem.lote_numero} onChange={(e) => setNovoItem({...novoItem, lote_numero: e.target.value})} />
              </div>
              <div className="col-span-4 space-y-2">
                <Label>Descrição do Lote</Label>
                <Input placeholder="Ex: Material de escritório" value={novoItem.lote_descricao} onChange={(e) => setNovoItem({...novoItem, lote_descricao: e.target.value})} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição do Item *</Label>
              <Input placeholder="Ex: Resma de papel A4 75g" value={novoItem.descricao} onChange={(e) => setNovoItem({...novoItem, descricao: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Descrição Detalhada</Label>
              <Textarea placeholder="Especificações técnicas (opcional)" value={novoItem.descricao_detalhada} onChange={(e) => setNovoItem({...novoItem, descricao_detalhada: e.target.value})} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Marca</Label>
                <Input placeholder="Ex: Dell, Samsung, Canon..." value={novoItem.marca} onChange={(e) => setNovoItem({...novoItem, marca: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Input placeholder="Ex: Inspiron 15, Galaxy S23..." value={novoItem.modelo} onChange={(e) => setNovoItem({...novoItem, modelo: e.target.value})} />
              </div>
            </div>

            {contrato?.categoria === 'COMPRAS' && contrato?.modalidade_execucao === 'ITEM_QUANTIDADE' && (
              <div className="space-y-2">
                <Label>Tipo do item</Label>
                <Select value={novoItem.tipo_item} onValueChange={(v) => setNovoItem({...novoItem, tipo_item: v as 'CONSUMO' | 'PERMANENTE'})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONSUMO">Consumo (almoxarifado)</SelectItem>
                    <SelectItem value="PERMANENTE">Permanente (patrimônio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Unidade de Medida *</Label>
                <Select value={novoItem.unidade_medida} onValueChange={(v) => setNovoItem({...novoItem, unidade_medida: v})} disabled={!!editandoItem}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES_MEDIDA.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantidade Contratada *</Label>
                <Input type="number" step="0.01" min="0" placeholder="Ex: 100" value={novoItem.quantidade_contratada} onChange={(e) => setNovoItem({...novoItem, quantidade_contratada: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Valor Unitário (R$) *</Label>
                <Input type="number" step="0.01" min="0" placeholder="Ex: 25.90" value={novoItem.valor_unitario} onChange={(e) => setNovoItem({...novoItem, valor_unitario: e.target.value})} />
              </div>
            </div>

            {editandoItem && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade já utilizada</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 30"
                    value={novoItem.quantidade_ja_utilizada}
                    onChange={(e) => setNovoItem({...novoItem, quantidade_ja_utilizada: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground">Para migração: qtd. já entregue antes de cadastrar no sistema.</p>
                </div>
              </div>
            )}

            {novoItem.valor_unitario && novoItem.quantidade_contratada && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-sm text-blue-600">Valor Total do Item:</p>
                <p className="text-xl font-bold text-blue-700">
                  {formatarMoeda(parseFloat(novoItem.valor_unitario) * parseFloat(novoItem.quantidade_contratada))}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código Catálogo Próprio</Label>
                <Input placeholder="Código interno do órgão" value={novoItem.codigo_catalogo_proprio} onChange={(e) => setNovoItem({...novoItem, codigo_catalogo_proprio: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Código CATMAT/CATSER</Label>
                <Input placeholder="Código do catálogo federal" value={novoItem.codigo_catalogo} onChange={(e) => setNovoItem({...novoItem, codigo_catalogo: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalItem(false)}>Cancelar</Button>
            <Button onClick={handleSalvarItem} disabled={loadingAction}>
              {loadingAction ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : editandoItem ? 'Salvar Alterações' : 'Adicionar Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalImportarCSV} onOpenChange={setModalImportarCSV}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" />Importar Itens via CSV</DialogTitle>
            <DialogDescription>Importe itens em lote usando um arquivo CSV. Baixe o modelo, preencha e faça o upload.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Button variant="outline" onClick={gerarModeloCSV} className="flex-1">
                <DownloadCloud className="w-4 h-4 mr-2" />Baixar Modelo CSV
              </Button>
              <div className="flex-1">
                <label className="flex items-center justify-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-gray-50 h-10 text-sm font-medium">
                  <Upload className="w-4 h-4" />Selecionar Arquivo CSV
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={handleUploadCSV} />
                </label>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <p className="font-medium mb-1">Formatos aceitos:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Separador: <strong>ponto e vírgula (;)</strong> ou vírgula (,)</li>
                <li>Campos obrigatórios: <strong>descricao</strong> (ou <strong>Descrição</strong>), <strong>quantidade</strong> e <strong>preco_unitario</strong></li>
                <li><strong>Formato de migração:</strong> Item, Descrição, Marca, Unidade, Preco_Unitario, Quantidade, Saida, Valor_R$, Estoque_Atual</li>
                <li><strong>Saida:</strong> quantidade já consumida/entregue — registrada como saldo utilizado</li>
                <li>Colunas <em>Valor_R$</em> e <em>Estoque_Atual</em> são ignoradas (calculadas automaticamente)</li>
                <li>Unidades: UNIDADE, PECA, CAIXA, PACOTE, METRO, LITRO, QUILOGRAMA, HORA, MES, SERVICO, GLOBAL</li>
              </ul>
            </div>

            {csvItens.length > 0 && (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b font-medium text-sm">
                    Preview: {csvItens.length} itens encontrados
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-3">#</th>
                          <th className="text-left py-2 px-3">Descrição</th>
                          <th className="text-left py-2 px-3">Marca</th>
                          <th className="text-center py-2 px-3">Unid.</th>
                          <th className="text-right py-2 px-3">Qtd.</th>
                          <th className="text-right py-2 px-3">Saída</th>
                          <th className="text-right py-2 px-3">Valor Unit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvItens.map((item, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3">{item.numero_item || i + 1}</td>
                            <td className="py-2 px-3 max-w-[200px] truncate">{item.descricao}</td>
                            <td className="py-2 px-3">{item.marca || '-'}</td>
                            <td className="py-2 px-3 text-center">{item.unidade_medida || 'UN'}</td>
                            <td className="py-2 px-3 text-right">{item.quantidade_contratada}</td>
                            <td className="py-2 px-3 text-right">{item.saida || '0'}</td>
                            <td className="py-2 px-3 text-right">{item.valor_unitario}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {resultadoImportacao && (
                  <div className={`border rounded-lg p-4 ${resultadoImportacao.erros.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                    <p className="font-medium text-green-700">{resultadoImportacao.importados} itens importados com sucesso</p>
                    {resultadoImportacao.erros.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-red-600">{resultadoImportacao.erros.length} erros:</p>
                        <ul className="text-xs text-red-500 mt-1 max-h-24 overflow-y-auto">
                          {resultadoImportacao.erros.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalImportarCSV(false)}>
              {resultadoImportacao ? 'Fechar' : 'Cancelar'}
            </Button>
            {csvItens.length > 0 && !resultadoImportacao && (
              <Button onClick={handleImportarCSV} disabled={importandoCSV}>
                {importandoCSV ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando...</> : `Importar ${csvItens.length} Itens`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalExcluirTodosItens} onOpenChange={(open) => !excluindoTodosItens && setModalExcluirTodosItens(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />
              Excluir todos os itens do contrato
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-gray-600 space-y-2 pt-1">
                <p>
                  Serão removidos <strong>todos os {contrato.itens?.length ?? 0} itens</strong>, inclusive os que já têm quantidade empenhada ou entregue.
                </p>
                <p>
                  Itens de requisições vinculados a estes registros serão <strong>desvinculados</strong> (a requisição permanece; o vínculo com o contrato some).
                </p>
                <p className="text-red-700 font-medium">Esta ação não pode ser desfeita.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setModalExcluirTodosItens(false)} disabled={excluindoTodosItens}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleExcluirTodosItens} disabled={excluindoTodosItens}>
              {excluindoTodosItens ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ajuste de Migração */}
      <Dialog open={modalAjuste} onOpenChange={setModalAjuste}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuste de Migração</DialogTitle>
            <DialogDescription>
              Registre o valor já executado ou o saldo disponível (valor empenhado) para ajustar o contrato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Informar por</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="modo_ajuste" checked={ajusteForm.modo === 'executado'} onChange={() => setAjusteForm({ ...ajusteForm, modo: 'executado' })} />
                  <span>Valor já executado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="modo_ajuste" checked={ajusteForm.modo === 'empenhado'} onChange={() => setAjusteForm({ ...ajusteForm, modo: 'empenhado' })} />
                  <span>Valor empenhado (saldo disponível)</span>
                </label>
              </div>
            </div>
            {ajusteForm.modo === 'executado' ? (
              <div>
                <Label>Valor já executado anteriormente (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  max={Number(contrato?.valor_global || 0)}
                  value={ajusteForm.valor_executado_anterior}
                  onChange={(e) => setAjusteForm({ ...ajusteForm, valor_executado_anterior: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            ) : (
              <div>
                <Label>Valor empenhado / Saldo disponível (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  max={Number(contrato?.valor_global || 0)}
                  value={ajusteForm.valor_empenhado}
                  onChange={(e) => setAjusteForm({ ...ajusteForm, valor_empenhado: e.target.value })}
                  placeholder="0,00"
                />
                <p className="text-xs text-gray-500 mt-1">Valor que permanece disponível para execução no sistema.</p>
              </div>
            )}
            {contrato && (
              <p className="text-xs text-gray-500">
                Valor global do contrato: {formatarMoeda(contrato.valor_global)}
              </p>
            )}
            <div>
              <Label>Observação</Label>
              <Textarea
                value={ajusteForm.observacao_ajuste}
                onChange={(e) => setAjusteForm({ ...ajusteForm, observacao_ajuste: e.target.value })}
                placeholder="Ex: Ajuste migração - valor executado antes da implantação do sistema"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAjuste(false)}>Cancelar</Button>
            <Button onClick={handleSalvarAjuste} disabled={loadingAction}>
              {loadingAction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Salvar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

