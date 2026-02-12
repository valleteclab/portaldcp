'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  Unlock
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface TermoAditivo {
  id: string
  numero_termo: string
  sequencial: number
  tipo: string
  objeto: string
  valor_acrescimo: number
  valor_supressao: number
  nova_data_vigencia_fim: string
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
  orgao: { id: string; nome: string; cnpj: string; cidade: string; uf: string }
  licitacao?: { id: string; numero_processo: string; modalidade: string }
  liberado_por_nome?: string
  liberado_em?: string
  saldo_total_em_valor?: number
  itens?: ItemContrato[]
  total_itens?: number
}

const STATUS_CONTRATO = {
  'RASCUNHO': { label: 'Rascunho', cor: 'bg-slate-100 text-slate-800', icon: FileText },
  'AGUARDANDO_LIBERACAO': { label: 'Aguardando Liberação', cor: 'bg-amber-100 text-amber-800', icon: Lock },
  'VIGENTE': { label: 'Vigente', cor: 'bg-green-100 text-green-800', icon: CheckCircle },
  'ENCERRADO': { label: 'Encerrado', cor: 'bg-gray-100 text-gray-800', icon: Clock },
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

export default function DetalheContratoOrgaoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [termos, setTermos] = useState<TermoAditivo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAction, setLoadingAction] = useState(false)
  
  const [modalTermo, setModalTermo] = useState(false)
  const [novoTermo, setNovoTermo] = useState({
    tipo: 'ADITIVO_PRAZO',
    objeto: '',
    valor_acrescimo: '',
    valor_supressao: '',
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
  const [buscaCatalogo, setBuscaCatalogo] = useState('')
  const [resultadosCatalogo, setResultadosCatalogo] = useState<any[]>([])
  const [buscandoCatalogo, setBuscandoCatalogo] = useState(false)
  const [novoItem, setNovoItem] = useState({
    numero_item: 1,
    descricao: '',
    descricao_detalhada: '',
    unidade_medida: 'UNIDADE',
    valor_unitario: '',
    quantidade_contratada: '',
    codigo_catalogo: '',
    codigo_catalogo_proprio: '',
    lote_numero: '',
    lote_descricao: '',
    observacoes: '',
  })

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

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [contratoRes, termosRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${id}`),
        authFetch(`${API_URL}/api/contratos/${id}/termos`)
      ])
      if (contratoRes.ok) setContrato(await contratoRes.json())
      if (termosRes.ok) setTermos(await termosRes.json())
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number | string) => {
    const numero = typeof valor === 'string' ? parseFloat(valor) : valor
    return (numero || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data: string) => {
    if (!data) return '-'
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
      const payload = {
        tipo: novoTermo.tipo,
        objeto: novoTermo.objeto,
        valor_acrescimo: novoTermo.valor_acrescimo ? parseFloat(novoTermo.valor_acrescimo) : null,
        valor_supressao: novoTermo.valor_supressao ? parseFloat(novoTermo.valor_supressao) : null,
        nova_data_vigencia_fim: novoTermo.nova_data_vigencia_fim || null,
        data_assinatura: novoTermo.data_assinatura,
      }
      const res = await authFetch(`${API_URL}/api/contratos/${id}/termos`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setModalTermo(false)
        setNovoTermo({ tipo: 'ADITIVO_PRAZO', objeto: '', valor_acrescimo: '', valor_supressao: '', nova_data_vigencia_fim: '', data_assinatura: '' })
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

  const handleEnviarParaLiberacao = async () => {
    if (!confirm('Deseja enviar este contrato para liberação? Após enviar, ele ficará aguardando aprovação de um responsável.')) return
    setLoadingAction(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${id}/enviar-liberacao`, { method: 'POST' })
      if (res.ok) {
        carregarDados()
      } else {
        const error = await res.json().catch(() => ({}))
        alert(error.message || 'Erro ao enviar para liberação')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao enviar para liberação')
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

  const abrirModalNovoItem = () => {
    const proximoNumero = (contrato?.itens?.length || 0) + 1
    setEditandoItem(null)
    setBuscaCatalogo('')
    setResultadosCatalogo([])
    setNovoItem({
      numero_item: proximoNumero,
      descricao: '',
      descricao_detalhada: '',
      unidade_medida: contrato?.categoria === 'SERVICOS' ? 'MES' : 'UNIDADE',
      valor_unitario: '',
      quantidade_contratada: '',
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
      unidade_medida: item.unidade_medida,
      valor_unitario: String(item.valor_unitario),
      quantidade_contratada: String(item.quantidade_contratada),
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
        const res = await authFetch(`${API_URL}/api/almoxarifado/itens-contrato/${editandoItem.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            descricao: novoItem.descricao,
            descricao_detalhada: novoItem.descricao_detalhada || null,
            valor_unitario: parseFloat(novoItem.valor_unitario),
            codigo_catalogo: novoItem.codigo_catalogo || null,
            codigo_catalogo_proprio: novoItem.codigo_catalogo_proprio || null,
            lote_numero: novoItem.lote_numero ? parseInt(novoItem.lote_numero) : null,
            lote_descricao: novoItem.lote_descricao || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || 'Erro ao atualizar item')
        }
      } else {
        const res = await authFetch(`${API_URL}/api/almoxarifado/contratos/${id}/itens`, {
          method: 'POST',
          body: JSON.stringify({
            numero_item: novoItem.numero_item,
            descricao: novoItem.descricao,
            descricao_detalhada: novoItem.descricao_detalhada || null,
            unidade_medida: novoItem.unidade_medida,
            valor_unitario: parseFloat(novoItem.valor_unitario),
            quantidade_contratada: parseFloat(novoItem.quantidade_contratada),
            codigo_catalogo: novoItem.codigo_catalogo || null,
            codigo_catalogo_proprio: novoItem.codigo_catalogo_proprio || null,
            lote_numero: novoItem.lote_numero ? parseInt(novoItem.lote_numero) : null,
            lote_descricao: novoItem.lote_descricao || null,
            observacoes: novoItem.observacoes || null,
          }),
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
    const header = 'numero_item;descricao;descricao_detalhada;unidade_medida;quantidade_contratada;valor_unitario;lote_numero;lote_descricao;codigo_catalogo;codigo_catalogo_proprio;observacoes'
    const exemplo1 = '1;Resma de papel A4 75g;Papel sulfite branco formato A4;UNIDADE;500;25.90;1;Material de escritório;;;'
    const exemplo2 = '2;Toner HP 26A;Toner original HP CF226A;UNIDADE;50;189.90;1;Material de escritório;449158;;'
    const exemplo3 = '3;Serviço de manutenção predial;Manutenção preventiva mensal;MES;12;3500.00;2;Serviços gerais;;;'
    const csv = [header, exemplo1, exemplo2, exemplo3].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'modelo_itens_contrato.csv'
    link.click()
    URL.revokeObjectURL(link.href)
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
      const headers = linhas[0].split(separador).map(h => h.trim().toLowerCase().replace(/"/g, ''))
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
            <h1 className="text-2xl font-bold">Contrato nº {contrato.numero_contrato}</h1>
            <p className="text-gray-600">Processo: {contrato.numero_processo}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {contrato.status === 'RASCUNHO' && (
            <Button onClick={handleEnviarParaLiberacao} disabled={loadingAction} className="bg-amber-600 hover:bg-amber-700">
              {loadingAction ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar para Liberação
            </Button>
          )}
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
          {contrato.status === 'VIGENTE' && (
            <Button variant="outline" onClick={() => { setNovoStatus(contrato.status); setModalStatus(true) }}>
              <Shield className="w-4 h-4 mr-2" />Alterar Status
            </Button>
          )}
          {(contrato.status === 'RASCUNHO' || contrato.status === 'VIGENTE') && (
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
        </div>
      </div>

      <Tabs defaultValue="detalhes" className="space-y-6">
        <TabsList>
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          <TabsTrigger value="itens">Itens ({contrato.itens?.length || 0})</TabsTrigger>
          <TabsTrigger value="termos">Termos Aditivos ({termos.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {contrato.status === 'RASCUNHO' && (
          <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <FileText className="w-5 h-5 text-slate-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-slate-700">Contrato em Rascunho</p>
              <p className="text-sm text-slate-500">Este contrato ainda não foi liberado para pedidos. Revise os dados e envie para liberação quando estiver pronto.</p>
            </div>
            <Button onClick={handleEnviarParaLiberacao} disabled={loadingAction} size="sm" className="bg-amber-600 hover:bg-amber-700 shrink-0">
              <Send className="w-4 h-4 mr-1" /> Enviar para Liberação
            </Button>
          </div>
        )}

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
                        <p className="text-xl font-bold text-purple-600">{formatarMoeda(contrato.saldo_total_em_valor)}</p>
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

              {contrato.observacoes && (
                <Card>
                  <CardHeader><CardTitle>Observações</CardTitle></CardHeader>
                  <CardContent><p className="text-gray-700 whitespace-pre-wrap">{contrato.observacoes}</p></CardContent>
                </Card>
              )}
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
                    <p className="text-sm text-gray-500">{contrato.licitacao.modalidade}</p>
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
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Itens do Contrato</h3>
              <p className="text-sm text-gray-500">
                {contrato.categoria === 'SERVICOS' ? 'Serviços contratados' : 'Materiais/produtos contratados'} - Controle de saldos
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setCsvItens([]); setResultadoImportacao(null); setModalImportarCSV(true) }}>
                <Upload className="w-4 h-4 mr-2" />Importar CSV
              </Button>
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
                      {contrato.itens.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-3 font-medium">{item.numero_item}</td>
                          <td className="py-3 px-3 text-xs">
                            {item.lote_numero ? (
                              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded" title={item.lote_descricao || ''}>
                                Lote {item.lote_numero}
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="py-3 px-3 max-w-[220px]">
                            <p className="font-medium truncate" title={item.descricao}>{item.descricao}</p>
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="termos" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Termos Aditivos e Apostilamentos</h3>
            <Button onClick={() => setModalTermo(true)}><Plus className="w-4 h-4 mr-2" />Novo Termo Aditivo</Button>
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
                <Card key={termo.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-5 h-5 text-blue-500" />
                          <span className="font-medium">{termo.numero_termo}</span>
                          <Badge variant="outline">{getTipoTermoLabel(termo.tipo)}</Badge>
                        </div>
                        <p className="text-gray-600 mb-4">{termo.objeto}</p>
                        <div className="flex gap-6 text-sm">
                          <div><span className="text-gray-500">Data de Assinatura:</span> <span className="font-medium">{formatarData(termo.data_assinatura)}</span></div>
                          {termo.valor_acrescimo > 0 && <div className="text-green-600"><TrendingUp className="w-4 h-4 inline mr-1" />+ {formatarMoeda(termo.valor_acrescimo)}</div>}
                          {termo.valor_supressao > 0 && <div className="text-red-600"><TrendingDown className="w-4 h-4 inline mr-1" />- {formatarMoeda(termo.valor_supressao)}</div>}
                          {termo.nova_data_vigencia_fim && <div><span className="text-gray-500">Nova Vigência:</span> <span className="font-medium">{formatarData(termo.nova_data_vigencia_fim)}</span></div>}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm"><Download className="w-4 h-4" /></Button>
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
            <Button><FileUp className="w-4 h-4 mr-2" />Upload de Documento</Button>
          </div>
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Nenhum documento anexado.</p>
              <Button className="mt-4" variant="outline"><FileUp className="w-4 h-4 mr-2" />Anexar Documento</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <h3 className="text-lg font-semibold">Histórico de Alterações</h3>
          <Card>
            <CardContent className="text-center py-12">
              <History className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Histórico de alterações em desenvolvimento.</p>
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
                <Select value={novoTermo.tipo} onValueChange={(v) => setNovoTermo({...novoTermo, tipo: v})}>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor de Acréscimo (R$)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0,00" value={novoTermo.valor_acrescimo} onChange={(e) => setNovoTermo({...novoTermo, valor_acrescimo: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Valor de Supressão (R$)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0,00" value={novoTermo.valor_supressao} onChange={(e) => setNovoTermo({...novoTermo, valor_supressao: e.target.value})} />
              </div>
            </div>
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
              <Textarea placeholder="Especificações técnicas, marca, modelo, etc. (opcional)" value={novoItem.descricao_detalhada} onChange={(e) => setNovoItem({...novoItem, descricao_detalhada: e.target.value})} rows={2} />
            </div>

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
                <Input type="number" step="0.01" min="0" placeholder="Ex: 100" value={novoItem.quantidade_contratada} onChange={(e) => setNovoItem({...novoItem, quantidade_contratada: e.target.value})} disabled={!!editandoItem} />
              </div>
              <div className="space-y-2">
                <Label>Valor Unitário (R$) *</Label>
                <Input type="number" step="0.01" min="0" placeholder="Ex: 25.90" value={novoItem.valor_unitario} onChange={(e) => setNovoItem({...novoItem, valor_unitario: e.target.value})} />
              </div>
            </div>

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
              <p className="font-medium mb-1">Formato do arquivo:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Separador: <strong>ponto e vírgula (;)</strong> ou vírgula (,)</li>
                <li>Primeira linha deve conter os cabeçalhos</li>
                <li>Campos obrigatórios: <strong>descricao, quantidade_contratada, valor_unitario</strong></li>
                <li>Unidades: UNIDADE, PECA, CAIXA, METRO, LITRO, QUILOGRAMA, HORA, MES, SERVICO, GLOBAL</li>
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
                          <th className="text-left py-2 px-3">Lote</th>
                          <th className="text-left py-2 px-3">Descrição</th>
                          <th className="text-center py-2 px-3">Unid.</th>
                          <th className="text-right py-2 px-3">Qtd.</th>
                          <th className="text-right py-2 px-3">Valor Unit.</th>
                          <th className="text-left py-2 px-3">Cód. Próprio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvItens.map((item, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3">{item.numero_item || i + 1}</td>
                            <td className="py-2 px-3">{item.lote_numero || '-'}</td>
                            <td className="py-2 px-3 max-w-[200px] truncate">{item.descricao}</td>
                            <td className="py-2 px-3 text-center">{item.unidade_medida || 'UN'}</td>
                            <td className="py-2 px-3 text-right">{item.quantidade_contratada}</td>
                            <td className="py-2 px-3 text-right">{item.valor_unitario}</td>
                            <td className="py-2 px-3">{item.codigo_catalogo_proprio || '-'}</td>
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
    </div>
  )
}

