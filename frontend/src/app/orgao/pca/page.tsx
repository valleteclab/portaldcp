'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Plus, 
  FileText, 
  Calendar, 
  DollarSign,
  Filter,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart3,
  Package,
  Wrench,
  Building,
  Laptop,
  Copy,
  Eye,
  Search,
  Pencil,
  Trash2,
  MoreHorizontal,
  X,
  ClipboardList,
  Loader2,
  ArrowRight,
  Download,
  FileSpreadsheet
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CatalogoBusca } from '@/components/catalogo/CatalogoBusca'
import { UnidadeMedidaSelect } from '@/components/catalogo/UnidadeMedidaSelect'
import { ImportarParaPCA } from '@/components/catalogo/ImportarParaPCA'
import { ImportarCSVParaPCA } from '@/components/catalogo/ImportarCSVParaPCA'
import { BuscaClassificacao, BuscaItemCatalogoProprio } from '@/components/catalogo/BuscaCatalogoProprio'
import * as XLSX from 'xlsx'

interface ItemCatalogo {
  id: string
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  codigo_classe?: string
  unidade_padrao?: string
  classe?: {
    codigo: string
    nome: string
  }
}

interface ItemPCA {
  id: string
  numero_item: number
  categoria: string
  status: string
  descricao_objeto: string
  valor_estimado: number
  valor_unitario_estimado?: number
  quantidade_estimada?: number
  unidade_medida?: string
  trimestre_previsto: number
  prioridade: number
  unidade_requisitante?: string
  codigo_item_catalogo?: string
  descricao_item_catalogo?: string
  codigo_classe?: string
  nome_classe?: string
  // Campos do catálogo próprio
  catalogo_utilizado?: string
  classificacao_catalogo?: string
  codigo_grupo?: string
  nome_grupo?: string
  renovacao_contrato?: string
  data_desejada_contratacao?: string
  valor_orcamentario_exercicio?: number
  // Campos PDM (Padrão Descritivo de Materiais)
  codigo_pdm?: string
  nome_pdm?: string
}

interface PCA {
  id: string
  numero_pca: string
  ano_exercicio: number
  status: string
  valor_total_estimado: number
  quantidade_itens: number
  data_aprovacao: string
  data_publicacao: string
  enviado_pncp: boolean
  itens: ItemPCA[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_PCA = {
  'RASCUNHO': { label: 'Rascunho', cor: 'bg-gray-100 text-gray-800' },
  'EM_ELABORACAO': { label: 'Em Elaboração', cor: 'bg-blue-100 text-blue-800' },
  'APROVADO': { label: 'Aprovado', cor: 'bg-green-100 text-green-800' },
  'PUBLICADO': { label: 'Publicado', cor: 'bg-purple-100 text-purple-800' },
  'ENVIADO_PNCP': { label: 'Enviado PNCP', cor: 'bg-indigo-100 text-indigo-800' }
}

const CATEGORIAS = {
  'MATERIAL': { label: 'Material', icon: Package },
  'SERVICO': { label: 'Serviço', icon: Wrench },
  'OBRA': { label: 'Obra', icon: Building },
  'SERVICO_ENGENHARIA': { label: 'Serviço de Engenharia', icon: Building },
  'SOLUCAO_TIC': { label: 'Solução de TIC', icon: Laptop },
  'LOCACAO_IMOVEL': { label: 'Locação de Imóvel', icon: Building },
  'ALIENACAO': { label: 'Alienação', icon: Package }
}

const PRIORIDADES = {
  1: { label: 'Muito Alta', cor: 'bg-red-100 text-red-800' },
  2: { label: 'Alta', cor: 'bg-orange-100 text-orange-800' },
  3: { label: 'Média', cor: 'bg-yellow-100 text-yellow-800' },
  4: { label: 'Baixa', cor: 'bg-blue-100 text-blue-800' },
  5: { label: 'Muito Baixa', cor: 'bg-gray-100 text-gray-800' }
}

export default function PcaPage() {
  const [pcas, setPcas] = useState<PCA[]>([])
  const [pcaAtual, setPcaAtual] = useState<PCA | null>(null)
  const [loading, setLoading] = useState(true)
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear())
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [visualizacao, setVisualizacao] = useState<'lista' | 'detalhes'>('lista')
  const [showNovoPCA, setShowNovoPCA] = useState(false)
  const [anoNovoPCA, setAnoNovoPCA] = useState(new Date().getFullYear() + 1)
  const [showConfirmarExclusaoPCA, setShowConfirmarExclusaoPCA] = useState(false)
  const [pcaParaExcluir, setPcaParaExcluir] = useState<PCA | null>(null)
  const [novoItem, setNovoItem] = useState({
    categoria: 'SERVICO',
    descricao_objeto: '',
    valor_estimado: '',
    valor_unitario_estimado: '',
    quantidade_estimada: '1',
    unidade_medida: 'UN',
    trimestre_previsto: '1',
    prioridade: '3',
    unidade_requisitante: '',
    justificativa: '',
    // Campos do catálogo próprio
    codigo_item_catalogo: '',
    descricao_item_catalogo: '',
    codigo_classe: '',
    nome_classe: '',
    catalogo_utilizado: 'OUTROS',
    renovacao_contrato: 'NAO',
    data_desejada_contratacao: ''
  })
  const [itemCatalogoSelecionado, setItemCatalogoSelecionado] = useState<ItemCatalogo | null>(null)
  
  // Estados para ações de item
  const [itemSelecionado, setItemSelecionado] = useState<ItemPCA | null>(null)
  const [showVisualizarItem, setShowVisualizarItem] = useState(false)
  const [showEditarItem, setShowEditarItem] = useState(false)
  const [showConfirmarExclusao, setShowConfirmarExclusao] = useState(false)
  
  // Estados para consolidação de demandas
  const [showConsolidarDemandas, setShowConsolidarDemandas] = useState(false)
  const [demandasDisponiveis, setDemandasDisponiveis] = useState<any[]>([])
  const [demandasSelecionadas, setDemandasSelecionadas] = useState<string[]>([])
  const [consolidando, setConsolidando] = useState(false)
  const [itemEditando, setItemEditando] = useState({
    categoria: '',
    descricao_objeto: '',
    valor_unitario_estimado: '',
    quantidade_estimada: '',
    unidade_medida: '',
    trimestre_previsto: '',
    prioridade: '',
    unidade_requisitante: '',
    justificativa: '',
    status: '',
    // Campos do catálogo próprio
    catalogo_utilizado: 'OUTROS',
    codigo_classe: '',
    nome_classe: '',
    codigo_item_catalogo: '',
    renovacao_contrato: 'NAO',
    data_desejada_contratacao: '',
    valor_orcamentario_exercicio: ''
  })

  useEffect(() => {
    carregarPCAs()
  }, [])

  const carregarPCAs = async () => {
    setLoading(true)
    try {
      // Buscar órgão do localStorage
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return

      const orgao = JSON.parse(orgaoData)
      const response = await fetch(`${API_URL}/api/pca?orgaoId=${orgao.id}`)
      
      if (response.ok) {
        const data = await response.json()
        setPcas(data)
        
        // Selecionar PCA do ano atual
        const pcaAnoAtual = data.find((p: PCA) => p.ano_exercicio === anoSelecionado)
        if (pcaAnoAtual) {
          setPcaAtual(pcaAnoAtual)
        }
      }
    } catch (error) {
      console.error('Erro ao carregar PCAs:', error)
    } finally {
      setLoading(false)
    }
  }

  const criarPCA = async () => {
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return

      const orgao = JSON.parse(orgaoData)
      const response = await fetch(`${API_URL}/api/pca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgao_id: orgao.id,
          ano_exercicio: anoSelecionado
        })
      })

      if (response.ok) {
        const novoPca = await response.json()
        alert('PCA criado com sucesso!')
        setShowNovoPCA(false)
        await carregarPCAs()
        // Abrir o novo PCA
        setPcaAtual(novoPca)
        setVisualizacao('detalhes')
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao criar PCA')
      }
    } catch (error) {
      console.error('Erro ao criar PCA:', error)
      alert('Erro ao criar PCA')
    }
  }

  const criarNovoPCA = async () => {
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return

      const orgao = JSON.parse(orgaoData)
      const response = await fetch(`${API_URL}/api/pca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgao_id: orgao.id,
          ano_exercicio: anoNovoPCA
        })
      })

      if (response.ok) {
        const novoPca = await response.json()
        alert('PCA criado com sucesso!')
        setShowNovoPCA(false)
        await carregarPCAs()
        setPcaAtual(novoPca)
        setVisualizacao('detalhes')
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao criar PCA')
      }
    } catch (error) {
      console.error('Erro ao criar PCA:', error)
      alert('Erro ao criar PCA')
    }
  }

  const excluirPCA = async () => {
    if (!pcaParaExcluir) return

    try {
      const response = await fetch(`${API_URL}/api/pca/${pcaParaExcluir.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('PCA excluído com sucesso!')
        setShowConfirmarExclusaoPCA(false)
        setPcaParaExcluir(null)
        carregarPCAs()
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao excluir PCA')
      }
    } catch (error) {
      console.error('Erro ao excluir PCA:', error)
      alert('Erro ao excluir PCA')
    }
  }

  const abrirPCA = (pca: PCA) => {
    setPcaAtual(pca)
    setAnoSelecionado(pca.ano_exercicio)
    setVisualizacao('detalhes')
  }

  const voltarParaLista = () => {
    setVisualizacao('lista')
    setPcaAtual(null)
  }

  const handleSelecionarItemCatalogo = (item: ItemCatalogo | null) => {
    setItemCatalogoSelecionado(item)
    if (item) {
      // Mapear categoria do catálogo para categoria do PCA
      const categoria = item.tipo === 'MATERIAL' ? 'MATERIAL' : 'SERVICO'
      setNovoItem(prev => ({
        ...prev,
        categoria,
        descricao_objeto: item.descricao,
        codigo_item_catalogo: item.codigo,
        descricao_item_catalogo: item.descricao,
        codigo_classe: item.codigo_classe || item.classe?.codigo || '',
        nome_classe: item.classe?.nome || '',
        unidade_medida: item.unidade_padrao || 'UN'
      }))
    }
  }

  const adicionarItem = async () => {
    if (!pcaAtual) return

    const valorUnitario = parseFloat(novoItem.valor_unitario_estimado) || 0
    const quantidade = parseFloat(novoItem.quantidade_estimada) || 1
    const valorTotal = valorUnitario * quantidade

    try {
      const response = await fetch(`${API_URL}/api/pca/${pcaAtual.id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...novoItem,
          valor_estimado: valorTotal,
          valor_unitario_estimado: valorUnitario,
          quantidade_estimada: quantidade,
          trimestre_previsto: parseInt(novoItem.trimestre_previsto) || 1,
          prioridade: parseInt(novoItem.prioridade) || 3,
          catalogo_utilizado: novoItem.catalogo_utilizado || 'OUTROS',
          classificacao_catalogo: novoItem.categoria === 'MATERIAL' ? 'MATERIAL' : 'SERVICO',
          renovacao_contrato: novoItem.renovacao_contrato || 'NAO',
          data_desejada_contratacao: novoItem.data_desejada_contratacao || null
        })
      })

      if (response.ok) {
        alert('Item adicionado com sucesso!')
        setShowNovoItem(false)
        setItemCatalogoSelecionado(null)
        setNovoItem({
          categoria: 'SERVICO',
          descricao_objeto: '',
          valor_estimado: '',
          valor_unitario_estimado: '',
          quantidade_estimada: '1',
          unidade_medida: 'UN',
          trimestre_previsto: '1',
          prioridade: '3',
          unidade_requisitante: '',
          justificativa: '',
          codigo_item_catalogo: '',
          descricao_item_catalogo: '',
          codigo_classe: '',
          nome_classe: '',
          catalogo_utilizado: 'OUTROS',
          renovacao_contrato: 'NAO',
          data_desejada_contratacao: ''
        })
        carregarPCAs()
      }
    } catch (error) {
      console.error('Erro ao adicionar item:', error)
      alert('Erro ao adicionar item')
    }
  }

  // ============ AÇÕES DE ITEM ============

  const handleVisualizarItem = (item: ItemPCA) => {
    setItemSelecionado(item)
    setShowVisualizarItem(true)
  }

  const handleEditarItem = (item: ItemPCA) => {
    setItemSelecionado(item)
    setItemEditando({
      categoria: item.categoria || '',
      descricao_objeto: item.descricao_objeto || '',
      valor_unitario_estimado: item.valor_unitario_estimado != null ? String(item.valor_unitario_estimado) : '',
      quantidade_estimada: item.quantidade_estimada != null ? String(item.quantidade_estimada) : '1',
      unidade_medida: item.unidade_medida || 'UN',
      trimestre_previsto: item.trimestre_previsto != null ? String(item.trimestre_previsto) : '1',
      prioridade: item.prioridade != null ? String(item.prioridade) : '3',
      unidade_requisitante: item.unidade_requisitante || '',
      justificativa: (item as any).justificativa || '',
      status: item.status || 'PLANEJADO',
      // Campos do catálogo próprio
      catalogo_utilizado: item.catalogo_utilizado || 'OUTROS',
      codigo_classe: item.codigo_classe || '',
      nome_classe: item.nome_classe || '',
      codigo_item_catalogo: item.codigo_item_catalogo || '',
      renovacao_contrato: item.renovacao_contrato || 'NAO',
      data_desejada_contratacao: item.data_desejada_contratacao || '',
      valor_orcamentario_exercicio: item.valor_orcamentario_exercicio != null ? String(item.valor_orcamentario_exercicio) : ''
    })
    setShowEditarItem(true)
  }

  const handleExcluirItem = (item: ItemPCA) => {
    setItemSelecionado(item)
    setShowConfirmarExclusao(true)
  }

  const salvarEdicaoItem = async () => {
    if (!pcaAtual || !itemSelecionado) return

    const valorUnitario = parseFloat(itemEditando.valor_unitario_estimado) || 0
    const quantidade = parseFloat(itemEditando.quantidade_estimada) || 1
    const valorTotal = valorUnitario * quantidade

    try {
      const response = await fetch(`${API_URL}/api/pca/itens/${itemSelecionado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...itemEditando,
          valor_estimado: valorTotal,
          valor_unitario_estimado: valorUnitario,
          quantidade_estimada: quantidade,
          trimestre_previsto: parseInt(itemEditando.trimestre_previsto),
          prioridade: parseInt(itemEditando.prioridade)
        })
      })

      if (response.ok) {
        alert('Item atualizado com sucesso!')
        setShowEditarItem(false)
        setItemSelecionado(null)
        carregarPCAs()
      } else {
        alert('Erro ao atualizar item')
      }
    } catch (error) {
      console.error('Erro ao atualizar item:', error)
      alert('Erro ao atualizar item')
    }
  }

  const confirmarExclusaoItem = async () => {
    if (!pcaAtual || !itemSelecionado) return

    try {
      const response = await fetch(`${API_URL}/api/pca/itens/${itemSelecionado.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Item excluído com sucesso!')
        setShowConfirmarExclusao(false)
        setItemSelecionado(null)
        carregarPCAs()
      } else {
        alert('Erro ao excluir item')
      }
    } catch (error) {
      console.error('Erro ao excluir item:', error)
      alert('Erro ao excluir item')
    }
  }

  // ============ CONSOLIDAÇÃO DE DEMANDAS ============

  const abrirConsolidarDemandas = async () => {
    if (!pcaAtual) return

    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return
      const orgao = JSON.parse(orgaoData)

      const response = await fetch(`${API_URL}/api/demandas/para-consolidar?orgaoId=${orgao.id}&ano=${pcaAtual.ano_exercicio}`)
      if (response.ok) {
        const demandas = await response.json()
        setDemandasDisponiveis(demandas)
        setDemandasSelecionadas([])
        setShowConsolidarDemandas(true)
      }
    } catch (error) {
      console.error('Erro ao carregar demandas:', error)
    }
  }

  const consolidarDemandas = async () => {
    if (!pcaAtual || demandasSelecionadas.length === 0) return

    setConsolidando(true)
    try {
      const response = await fetch(`${API_URL}/api/pca/${pcaAtual.id}/consolidar-demandas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demandaIds: demandasSelecionadas })
      })

      if (response.ok) {
        const result = await response.json()
        alert(`Consolidação concluída!\n${result.demandasConsolidadas} demanda(s) consolidada(s)\n${result.itensAdicionados} item(ns) adicionado(s) ao PCA`)
        setShowConsolidarDemandas(false)
        carregarPCAs()
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao consolidar demandas')
      }
    } catch (error) {
      console.error('Erro ao consolidar demandas:', error)
      alert('Erro ao consolidar demandas')
    } finally {
      setConsolidando(false)
    }
  }

  const toggleDemandaSelecionada = (demandaId: string) => {
    setDemandasSelecionadas(prev => 
      prev.includes(demandaId) 
        ? prev.filter(id => id !== demandaId)
        : [...prev, demandaId]
    )
  }

  const selecionarTodasDemandas = () => {
    if (demandasSelecionadas.length === demandasDisponiveis.length) {
      setDemandasSelecionadas([])
    } else {
      setDemandasSelecionadas(demandasDisponiveis.map(d => d.id))
    }
  }

  const aprovarPCA = async () => {
    if (!pcaAtual) return

    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return
      const orgao = JSON.parse(orgaoData)

      const response = await fetch(`${API_URL}/api/pca/${pcaAtual.id}/aprovar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orgao.id,
          nome: orgao.responsavel_nome || 'Responsável',
          cargo: 'Ordenador de Despesas'
        })
      })

      if (response.ok) {
        alert('PCA aprovado com sucesso!')
        carregarPCAs()
      }
    } catch (error) {
      console.error('Erro ao aprovar PCA:', error)
    }
  }

  const publicarPCA = async () => {
    if (!pcaAtual) return

    try {
      const response = await fetch(`${API_URL}/api/pca/${pcaAtual.id}/publicar`, {
        method: 'PATCH'
      })

      if (response.ok) {
        alert('PCA publicado com sucesso!')
        carregarPCAs()
      }
    } catch (error) {
      console.error('Erro ao publicar PCA:', error)
    }
  }

  const [enviandoPNCP, setEnviandoPNCP] = useState(false)

  const enviarPNCP = async () => {
    if (!pcaAtual) return
    
    if (!confirm(`Deseja enviar o PCA ${pcaAtual.ano_exercicio} para o PNCP?\n\nEsta ação não pode ser desfeita.`)) {
      return
    }

    setEnviandoPNCP(true)
    try {
      // Enviar para o PNCP via API
      const response = await fetch(`${API_URL}/api/pncp/pca/${pcaAtual.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pcaAtual)
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        // Atualizar status do PCA no backend
        await fetch(`${API_URL}/api/pca/${pcaAtual.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enviado_pncp: true })
        })

        alert(`PCA enviado ao PNCP com sucesso!\n\nNúmero de Controle: ${data.numeroControlePNCP}`)
        carregarPCAs()
      } else {
        alert(`Erro ao enviar PCA ao PNCP:\n${data.message || 'Erro desconhecido'}`)
      }
    } catch (error: any) {
      console.error('Erro ao enviar PCA ao PNCP:', error)
      alert(`Erro ao enviar PCA ao PNCP:\n${error.message || 'Erro de conexão'}`)
    } finally {
      setEnviandoPNCP(false)
    }
  }

  const duplicarPCA = async () => {
    if (!pcaAtual) return

    try {
      const response = await fetch(`${API_URL}/api/pca/${pcaAtual.id}/duplicar`, {
        method: 'POST'
      })

      if (response.ok) {
        alert(`PCA duplicado para ${pcaAtual.ano_exercicio + 1}!`)
        carregarPCAs()
      }
    } catch (error) {
      console.error('Erro ao duplicar PCA:', error)
    }
  }

  const formatarMoeda = (valor: number | string | null | undefined) => {
    const num = typeof valor === 'string' ? parseFloat(valor) : (valor || 0)
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // ============ EXPORTAÇÃO PARA PNCP (EXCEL) ============

  const exportarParaPNCP = () => {
    if (!pcaAtual || !pcaAtual.itens || pcaAtual.itens.length === 0) {
      alert('Não há itens para exportar')
      return
    }

    // Mapear itens para o formato PNCP
    const dadosExportacao = pcaAtual.itens.map((item, index) => {
      // Determinar categoria formatada
      const categoriaMap: Record<string, string> = {
        'MATERIAL': '1-Material',
        'SERVICO': '2-Serviço',
        'OBRA': '3-Obras',
        'SERVICO_ENGENHARIA': '4-Serviços de Engenharia',
        'TIC': '5-Soluções de TIC',
        'LOCACAO_IMOVEL': '6-Locação de Imóveis',
        'ALIENACAO': '7-Alienação/Concessão/Permissão',
        'OBRA_ENGENHARIA': '8-Obras e Serviços de Engenharia'
      }

      const catalogoMap: Record<string, string> = {
        'COMPRASGOV': '1-CNBS(Catálogo Nacional de Bens e Serviços)',
        'OUTROS': '2-Outros'
      }

      const classificacaoMap: Record<string, string> = {
        'MATERIAL': '1-Material',
        'SERVICO': '2-Serviço'
      }

      // Formatar valor para o padrão brasileiro
      const formatarValorExcel = (valor: number | string | null | undefined) => {
        const num = typeof valor === 'string' ? parseFloat(valor) : (valor || 0)
        return num
      }

      // Formatar data para dd/mm/yyyy
      const formatarData = (trimestre: number) => {
        const mes = trimestre * 3
        return `01/${mes.toString().padStart(2, '0')}/${pcaAtual.ano_exercicio}`
      }

      return {
        'Numero Item*': index + 1,
        'Categoria do Item*': categoriaMap[item.categoria] || '2-Serviço',
        'Catálogo Utilizado*': catalogoMap[item.catalogo_utilizado || 'OUTROS'] || '2-Outros',
        'Classificação do Catálogo*': classificacaoMap[item.classificacao_catalogo || 'SERVICO'] || '2-Serviço',
        'Código da Classificação Superior (Classe/Grupo)*': item.codigo_classe || '',
        'Classificacao Superior Nome*': item.nome_classe || '',
        'Código do PDM do Item': item.codigo_pdm || '',
        'Nome do PDM do Item': item.nome_pdm || '',
        'Código do Item': item.codigo_item_catalogo || '',
        'Descrição do Item': item.descricao_objeto || '',
        'Unidade de Fornecimento': item.unidade_medida || 'UN',
        'Quantidade Estimada*': Number(item.quantidade_estimada) || 1,
        'Valor Unitário Estimado (R$)*': formatarValorExcel(item.valor_unitario_estimado),
        'Valor Total Estimado (R$)*': formatarValorExcel(item.valor_estimado),
        'Valor orçamentário estimado para o exercício (R$)*': formatarValorExcel(item.valor_orcamentario_exercicio || item.valor_estimado),
        'Renovação Contrato*': item.renovacao_contrato === 'SIM' ? '1-Sim' : '2-Não',
        'Data Desejada*': formatarData(item.trimestre_previsto || 1),
        'Unidade Requisitante': item.unidade_requisitante || '',
        'Grupo Contratação Codigo': item.codigo_grupo || '',
        'Grupo Contratação Nome': item.nome_grupo || ''
      }
    })

    // Criar workbook e worksheet
    const ws = XLSX.utils.json_to_sheet(dadosExportacao)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Itens PCA')

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 12 },  // Numero Item
      { wch: 20 },  // Categoria
      { wch: 40 },  // Catálogo
      { wch: 25 },  // Classificação
      { wch: 15 },  // Código Classe
      { wch: 35 },  // Nome Classe
      { wch: 15 },  // Código PDM
      { wch: 25 },  // Nome PDM
      { wch: 15 },  // Código Item
      { wch: 60 },  // Descrição
      { wch: 15 },  // Unidade
      { wch: 15 },  // Quantidade
      { wch: 20 },  // Valor Unitário
      { wch: 20 },  // Valor Total
      { wch: 25 },  // Valor Orçamentário
      { wch: 18 },  // Renovação
      { wch: 15 },  // Data
      { wch: 30 },  // Unidade Requisitante
      { wch: 20 },  // Grupo Código
      { wch: 30 },  // Grupo Nome
    ]
    ws['!cols'] = colWidths

    // Gerar arquivo e fazer download
    const nomeArquivo = `PCA_${pcaAtual.ano_exercicio}_Itens_PNCP.xlsx`
    XLSX.writeFile(wb, nomeArquivo)
  }

  const anos = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 1)

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando PCA...</p>
      </div>
    )
  }

  // ============ VISUALIZAÇÃO: LISTA DE PCAs ============
  if (visualizacao === 'lista') {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Planos de Contratações Anuais (PCA)</h1>
            <p className="text-gray-600">Gerencie os planos de contratações do órgão</p>
          </div>
          <Button onClick={() => setShowNovoPCA(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo PCA
          </Button>
        </div>

        {/* Lista de PCAs */}
        {pcas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum PCA cadastrado</h3>
              <p className="text-gray-600 mb-4">Crie o primeiro Plano de Contratações Anual para começar o planejamento.</p>
              <Button onClick={() => setShowNovoPCA(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro PCA
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pcas.sort((a, b) => b.ano_exercicio - a.ano_exercicio).map((pca) => (
              <Card key={pca.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Calendar className="w-8 h-8 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">PCA {pca.ano_exercicio}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={STATUS_PCA[pca.status as keyof typeof STATUS_PCA]?.cor || 'bg-gray-100'}>
                            {STATUS_PCA[pca.status as keyof typeof STATUS_PCA]?.label || pca.status}
                          </Badge>
                          {pca.enviado_pncp && (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Enviado PNCP
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-8">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{pca.quantidade_itens || 0}</p>
                        <p className="text-sm text-gray-500">Itens</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">
                          {formatarMoeda(pca.valor_total_estimado)}
                        </p>
                        <p className="text-sm text-gray-500">Valor Total</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => abrirPCA(pca)}>
                          <Eye className="w-4 h-4 mr-1" />
                          Visualizar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => abrirPCA(pca)}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        {!pca.enviado_pncp && pca.status !== 'ENVIADO_PNCP' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              setPcaParaExcluir(pca)
                              setShowConfirmarExclusaoPCA(true)
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Excluir
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modal Novo PCA */}
        <Dialog open={showNovoPCA} onOpenChange={setShowNovoPCA}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo PCA</DialogTitle>
              <DialogDescription>
                Selecione o ano para o novo Plano de Contratações Anual
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Ano do Exercício</label>
                <Select value={anoNovoPCA.toString()} onValueChange={(v) => setAnoNovoPCA(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map(ano => (
                      <SelectItem 
                        key={ano} 
                        value={ano.toString()}
                        disabled={pcas.some(p => p.ano_exercicio === ano)}
                      >
                        {ano} {pcas.some(p => p.ano_exercicio === ano) && '(já existe)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNovoPCA(false)}>
                  Cancelar
                </Button>
                <Button onClick={criarNovoPCA}>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar PCA {anoNovoPCA}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Confirmar Exclusão PCA */}
        <AlertDialog open={showConfirmarExclusaoPCA} onOpenChange={setShowConfirmarExclusaoPCA}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir PCA {pcaParaExcluir?.ano_exercicio}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todos os itens do PCA serão excluídos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPcaParaExcluir(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={excluirPCA} className="bg-red-600 hover:bg-red-700">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ============ VISUALIZAÇÃO: DETALHES DO PCA ============
  return (
    <div className="p-6 space-y-6">
      {/* Header com botão voltar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={voltarParaLista}>
            <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Plano de Contratações Anual (PCA)</h1>
            <p className="text-gray-600">Gerencie o planejamento de contratações do órgão</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Select value={anoSelecionado.toString()} onValueChange={(v) => {
            setAnoSelecionado(parseInt(v))
            const pca = pcas.find(p => p.ano_exercicio === parseInt(v))
            if (pca) {
              setPcaAtual(pca)
            } else {
              setVisualizacao('lista')
            }
          }}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anos.map(ano => (
                <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!pcaAtual ? (
        <Card>
          <CardContent className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum PCA para {anoSelecionado}</h3>
            <p className="text-gray-600 mb-4">Selecione outro ano ou volte para a lista.</p>
            <Button onClick={voltarParaLista}>
              Voltar para Lista
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <Badge className={STATUS_PCA[pcaAtual.status as keyof typeof STATUS_PCA]?.cor || ''}>
                      {STATUS_PCA[pcaAtual.status as keyof typeof STATUS_PCA]?.label || pcaAtual.status}
                    </Badge>
                  </div>
                  <FileText className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Itens Planejados</p>
                    <p className="text-2xl font-bold">{pcaAtual.quantidade_itens}</p>
                  </div>
                  <Package className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600 font-medium">Valor Total Estimado</p>
                    <p className="text-2xl font-bold text-green-700">{formatarMoeda(pcaAtual.valor_total_estimado)}</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <DollarSign className="w-8 h-8 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">PNCP</p>
                    <p className="text-lg font-medium">
                      {pcaAtual.enviado_pncp ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" /> Enviado
                        </span>
                      ) : (
                        <span className="text-yellow-600 flex items-center gap-1">
                          <Clock className="w-4 h-4" /> Pendente
                        </span>
                      )}
                    </p>
                  </div>
                  <Send className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ações */}
          <Card>
            <CardHeader>
              <CardTitle>Ações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShowNovoItem(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Item
                </Button>

                <Button variant="outline" onClick={abrirConsolidarDemandas}>
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Consolidar Demandas
                </Button>
                
                {pcaAtual.status === 'RASCUNHO' || pcaAtual.status === 'EM_ELABORACAO' ? (
                  <Button variant="outline" onClick={aprovarPCA}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Aprovar PCA
                  </Button>
                ) : null}

                {pcaAtual.status === 'APROVADO' && (
                  <Button variant="outline" onClick={publicarPCA}>
                    <FileText className="w-4 h-4 mr-2" />
                    Publicar PCA
                  </Button>
                )}

                {pcaAtual.status === 'PUBLICADO' && !pcaAtual.enviado_pncp && (
                  <Button 
                    variant="outline" 
                    onClick={enviarPNCP}
                    disabled={enviandoPNCP}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    {enviandoPNCP ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar ao PNCP
                      </>
                    )}
                  </Button>
                )}

                {pcaAtual.enviado_pncp && (
                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 px-3 py-2">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Enviado ao PNCP
                  </Badge>
                )}

                <Button variant="outline" onClick={duplicarPCA}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar para {anoSelecionado + 1}
                </Button>

                <Button variant="outline" onClick={exportarParaPNCP} className="border-green-300 text-green-700 hover:bg-green-50">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Exportar PNCP (Excel)
                </Button>

                <Button variant="outline" asChild>
                  <Link href={`/orgao/pca/${pcaAtual.id}/relatorio`}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Relatório
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Modal Novo Item */}
          {showNovoItem && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Novo Item do PCA
                </CardTitle>
                <CardDescription>Adicione uma nova contratação ao planejamento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Opções de Importação */}
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <span className="text-sm font-medium">Importar itens em lote:</span>
                  {pcaAtual && (
                    <div className="flex gap-2">
                      <ImportarParaPCA 
                        pcaId={pcaAtual.id} 
                        onImportSuccess={(count) => {
                          carregarPCAs()
                          setShowNovoItem(false)
                        }} 
                      />
                      <ImportarCSVParaPCA 
                        pcaId={pcaAtual.id} 
                        onImportSuccess={(count) => {
                          carregarPCAs()
                          setShowNovoItem(false)
                        }} 
                      />
                    </div>
                  )}
                </div>

                {/* Busca no Catálogo Próprio */}
                <div className="p-4 bg-white rounded-lg border">
                  <label className="text-sm font-medium flex items-center gap-2 mb-2">
                    <Search className="w-4 h-4" />
                    Buscar Item no Catálogo
                  </label>
                  <BuscaItemCatalogoProprio
                    value={null}
                    onChange={(item) => {
                      if (item) {
                        setNovoItem({
                          ...novoItem,
                          descricao_objeto: item.descricao,
                          codigo_item_catalogo: item.codigo,
                          codigo_classe: item.classificacao?.codigo || '',
                          nome_classe: item.classificacao?.nome || '',
                          unidade_medida: item.unidade_padrao || 'UN',
                          categoria: item.tipo === 'MATERIAL' ? 'MATERIAL' : 'SERVICO',
                          catalogo_utilizado: 'OUTROS'
                        })
                      }
                    }}
                    tipo={novoItem.categoria === 'MATERIAL' ? 'MATERIAL' : undefined}
                    placeholder="Buscar item existente no catálogo..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Selecione um item existente ou preencha manualmente abaixo.
                  </p>
                </div>

                {/* Categoria e Catálogo */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Categoria *</label>
                    <Select value={novoItem.categoria} onValueChange={(v) => setNovoItem({...novoItem, categoria: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORIAS).map(([key, val]) => (
                          <SelectItem key={key} value={key}>{val.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Catálogo</label>
                    <Select value={novoItem.catalogo_utilizado || 'OUTROS'} onValueChange={(v) => setNovoItem({...novoItem, catalogo_utilizado: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COMPRASGOV">Compras.gov.br</SelectItem>
                        <SelectItem value="OUTROS">Catálogo Próprio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Código do Item</label>
                    <Input 
                      value={novoItem.codigo_item_catalogo || ''}
                      readOnly
                      className="bg-gray-100 font-mono"
                      placeholder="Automático"
                    />
                  </div>
                </div>

                {/* Classificação */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Cód. Classificação</label>
                    <Input 
                      value={novoItem.codigo_classe || ''}
                      readOnly
                      className="bg-gray-100 font-mono"
                      placeholder="Automático"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-sm font-medium mb-1">Buscar Classificação</label>
                    <BuscaClassificacao
                      value={novoItem.codigo_classe && novoItem.nome_classe ? {
                        codigo: novoItem.codigo_classe,
                        nome: novoItem.nome_classe
                      } : null}
                      onChange={(classificacao) => {
                        if (classificacao) {
                          setNovoItem({
                            ...novoItem,
                            codigo_classe: classificacao.codigo,
                            nome_classe: classificacao.nome
                          })
                        } else {
                          setNovoItem({
                            ...novoItem,
                            codigo_classe: '',
                            nome_classe: ''
                          })
                        }
                      }}
                      tipo={novoItem.categoria === 'MATERIAL' ? 'MATERIAL' : 'SERVICO'}
                      placeholder="Buscar classificação..."
                    />
                  </div>
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-sm font-medium mb-1">Descrição do Objeto *</label>
                  <Input 
                    value={novoItem.descricao_objeto}
                    onChange={(e) => setNovoItem({...novoItem, descricao_objeto: e.target.value})}
                    placeholder="Descreva o objeto da contratação..."
                  />
                </div>

                {/* Quantidade, Unidade e Valores */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Quantidade *</label>
                    <Input 
                      type="number"
                      min="1"
                      step="0.0001"
                      value={novoItem.quantidade_estimada}
                      onChange={(e) => setNovoItem({...novoItem, quantidade_estimada: e.target.value})}
                      placeholder="1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Unidade</label>
                    <UnidadeMedidaSelect
                      value={novoItem.unidade_medida}
                      onChange={(v) => setNovoItem({...novoItem, unidade_medida: v})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Valor Unitário (R$) *</label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={novoItem.valor_unitario_estimado}
                      onChange={(e) => setNovoItem({...novoItem, valor_unitario_estimado: e.target.value})}
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Valor Total (R$)</label>
                    <Input 
                      type="text"
                      readOnly
                      value={formatarMoeda(
                        (parseFloat(novoItem.valor_unitario_estimado) || 0) * 
                        (parseFloat(novoItem.quantidade_estimada) || 1)
                      )}
                      className="bg-gray-100"
                    />
                  </div>
                </div>

                {/* Renovação e Data Desejada */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Renovação de Contrato</label>
                    <Select value={novoItem.renovacao_contrato || 'NAO'} onValueChange={(v) => setNovoItem({...novoItem, renovacao_contrato: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SIM">Sim</SelectItem>
                        <SelectItem value="NAO">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Data Desejada</label>
                    <Input 
                      type="date"
                      value={novoItem.data_desejada_contratacao || ''}
                      onChange={(e) => setNovoItem({...novoItem, data_desejada_contratacao: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Unidade Requisitante</label>
                    <Input 
                      value={novoItem.unidade_requisitante}
                      onChange={(e) => setNovoItem({...novoItem, unidade_requisitante: e.target.value})}
                      placeholder="Setor/Departamento"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Justificativa</label>
                  <textarea 
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    rows={2}
                    value={novoItem.justificativa}
                    onChange={(e) => setNovoItem({...novoItem, justificativa: e.target.value})}
                    placeholder="Justifique a necessidade da contratação..."
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={adicionarItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Item
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setShowNovoItem(false)
                    setItemCatalogoSelecionado(null)
                  }}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de Itens */}
          <Card>
            <CardHeader>
              <CardTitle>Itens do PCA ({pcaAtual.itens?.length || 0})</CardTitle>
              <CardDescription>Contratações planejadas para {anoSelecionado}</CardDescription>
            </CardHeader>
            <CardContent>
              {!pcaAtual.itens || pcaAtual.itens.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhum item cadastrado ainda.</p>
                  <Button variant="link" onClick={() => setShowNovoItem(true)}>
                    Adicionar primeiro item
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-2 whitespace-nowrap">Nº</th>
                        <th className="text-left py-3 px-2 whitespace-nowrap">Categoria</th>
                        <th className="text-left py-3 px-2 whitespace-nowrap">Catálogo</th>
                        <th className="text-left py-3 px-2 whitespace-nowrap">Cód. Classe</th>
                        <th className="text-left py-3 px-2 whitespace-nowrap">Classe</th>
                        <th className="text-left py-3 px-2 whitespace-nowrap">Cód. Item</th>
                        <th className="text-left py-3 px-2 min-w-[200px]">Descrição</th>
                        <th className="text-center py-3 px-2 whitespace-nowrap">Unid.</th>
                        <th className="text-right py-3 px-2 whitespace-nowrap">Qtd.</th>
                        <th className="text-right py-3 px-2 whitespace-nowrap">Valor Unit.</th>
                        <th className="text-right py-3 px-2 whitespace-nowrap">Valor Total</th>
                        <th className="text-center py-3 px-2 whitespace-nowrap">Renovação</th>
                        <th className="text-center py-3 px-2 whitespace-nowrap">Data Desejada</th>
                        <th className="text-left py-3 px-2 whitespace-nowrap">Requisitante</th>
                        <th className="text-center py-3 px-2 whitespace-nowrap">Status</th>
                        <th className="text-center py-3 px-2 whitespace-nowrap">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pcaAtual.itens.map((item) => {
                        const CategoriaIcon = CATEGORIAS[item.categoria as keyof typeof CATEGORIAS]?.icon || Package
                        return (
                          <tr key={item.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-2 font-medium">{item.numero_item}</td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1">
                                <CategoriaIcon className="w-3 h-3 text-gray-500" />
                                <span className="text-xs">{CATEGORIAS[item.categoria as keyof typeof CATEGORIAS]?.label || item.categoria}</span>
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-xs">
                                {item.catalogo_utilizado === 'COMPRASGOV' ? 'Compras.gov' : 'Próprio'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 font-mono text-xs">{item.codigo_classe || '-'}</td>
                            <td className="py-2 px-2 text-xs max-w-[150px] truncate" title={item.nome_classe || ''}>
                              {item.nome_classe || '-'}
                            </td>
                            <td className="py-2 px-2 font-mono text-xs">{item.codigo_item_catalogo || '-'}</td>
                            <td className="py-2 px-2 max-w-[200px] truncate" title={item.descricao_objeto}>
                              {item.descricao_objeto}
                            </td>
                            <td className="py-2 px-2 text-center text-xs">{item.unidade_medida || 'UN'}</td>
                            <td className="py-2 px-2 text-right">{Number(item.quantidade_estimada || 1).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                            <td className="py-2 px-2 text-right font-mono text-xs">
                              {formatarMoeda(item.valor_unitario_estimado || 0)}
                            </td>
                            <td className="py-2 px-2 text-right font-medium font-mono text-xs">
                              {formatarMoeda(item.valor_estimado)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <Badge variant={item.renovacao_contrato === 'SIM' ? 'default' : 'secondary'} className="text-xs">
                                {item.renovacao_contrato || 'NAO'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-center text-xs">
                              {item.data_desejada_contratacao 
                                ? new Date(item.data_desejada_contratacao).toLocaleDateString('pt-BR')
                                : '-'}
                            </td>
                            <td className="py-2 px-2 text-xs max-w-[120px] truncate" title={item.unidade_requisitante || ''}>
                              {item.unidade_requisitante || '-'}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <Badge variant="outline" className="text-xs">{item.status}</Badge>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleVisualizarItem(item)}>
                                    <Eye className="w-4 h-4 mr-2" />
                                    Visualizar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleEditarItem(item)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleExcluirItem(item)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal Visualizar Item */}
      <Dialog open={showVisualizarItem} onOpenChange={setShowVisualizarItem}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Detalhes do Item #{itemSelecionado?.numero_item}
            </DialogTitle>
          </DialogHeader>
          {itemSelecionado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Categoria</p>
                  <p className="font-medium">{CATEGORIAS[itemSelecionado.categoria as keyof typeof CATEGORIAS]?.label || itemSelecionado.categoria}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <Badge variant="outline">{itemSelecionado.status}</Badge>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Descrição do Objeto</p>
                <p className="font-medium">{itemSelecionado.descricao_objeto}</p>
              </div>

              {itemSelecionado.codigo_item_catalogo && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Código Catálogo:</strong> {itemSelecionado.codigo_item_catalogo}
                  </p>
                  {itemSelecionado.codigo_classe && (
                    <p className="text-sm text-blue-800">
                      <strong>Classe:</strong> {itemSelecionado.codigo_classe} - {itemSelecionado.nome_classe}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Quantidade</p>
                  <p className="font-medium">{Number(itemSelecionado.quantidade_estimada || 1).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Unidade</p>
                  <p className="font-medium">{itemSelecionado.unidade_medida || 'UN'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Valor Unitário</p>
                  <p className="font-medium">{formatarMoeda(itemSelecionado.valor_unitario_estimado || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Valor Total</p>
                  <p className="font-medium text-green-600">{formatarMoeda(itemSelecionado.valor_estimado)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Trimestre</p>
                  <p className="font-medium">{itemSelecionado.trimestre_previsto}º Trimestre</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Prioridade</p>
                  <Badge className={PRIORIDADES[itemSelecionado.prioridade as keyof typeof PRIORIDADES]?.cor || ''}>
                    {PRIORIDADES[itemSelecionado.prioridade as keyof typeof PRIORIDADES]?.label || itemSelecionado.prioridade}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Unidade Requisitante</p>
                  <p className="font-medium">{itemSelecionado.unidade_requisitante || '-'}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => {
                  setShowVisualizarItem(false)
                  handleEditarItem(itemSelecionado)
                }}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button variant="outline" className="text-red-600" onClick={() => {
                  setShowVisualizarItem(false)
                  handleExcluirItem(itemSelecionado)
                }}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Editar Item */}
      <Dialog open={showEditarItem} onOpenChange={setShowEditarItem}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Editar Item #{itemSelecionado?.numero_item}
            </DialogTitle>
            <DialogDescription>Altere os dados do item</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Linha 1: Categoria, Status, Catálogo */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Categoria *</label>
                <Select value={itemEditando.categoria} onValueChange={(v) => setItemEditando({...itemEditando, categoria: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIAS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select value={itemEditando.status} onValueChange={(v) => setItemEditando({...itemEditando, status: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLANEJADO">Planejado</SelectItem>
                    <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
                    <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Catálogo Utilizado</label>
                <Select value={itemEditando.catalogo_utilizado || 'OUTROS'} onValueChange={(v) => setItemEditando({...itemEditando, catalogo_utilizado: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPRASGOV">Compras.gov.br</SelectItem>
                    <SelectItem value="OUTROS">Catálogo Próprio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Linha 2: Classificação - Busca com autocomplete */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Cód. Classificação</label>
                <Input
                  value={itemEditando.codigo_classe || ''}
                  readOnly
                  className="bg-gray-100 font-mono"
                  placeholder="Automático"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium mb-1">Buscar Classificação</label>
                <BuscaClassificacao
                  value={itemEditando.codigo_classe && itemEditando.nome_classe ? {
                    codigo: itemEditando.codigo_classe,
                    nome: itemEditando.nome_classe
                  } : null}
                  onChange={(classificacao) => {
                    if (classificacao) {
                      setItemEditando({
                        ...itemEditando,
                        codigo_classe: classificacao.codigo,
                        nome_classe: classificacao.nome
                      })
                    } else {
                      setItemEditando({
                        ...itemEditando,
                        codigo_classe: '',
                        nome_classe: ''
                      })
                    }
                  }}
                  tipo={itemEditando.categoria === 'MATERIAL' ? 'MATERIAL' : 'SERVICO'}
                  placeholder="Buscar classificação..."
                />
              </div>
            </div>

            {/* Linha 3: Código do Item e Descrição */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Código do Item</label>
                <Input
                  value={itemEditando.codigo_item_catalogo || ''}
                  readOnly
                  className="bg-gray-100 font-mono"
                  placeholder="Automático"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium mb-1">Descrição do Objeto *</label>
                <Input
                  value={itemEditando.descricao_objeto}
                  onChange={(e) => setItemEditando({...itemEditando, descricao_objeto: e.target.value})}
                />
              </div>
            </div>

            {/* Linha 4: Quantidade, Unidade, Valores */}
            <div className="grid grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Quantidade *</label>
                <Input
                  type="number"
                  min="1"
                  step="0.0001"
                  value={itemEditando.quantidade_estimada}
                  onChange={(e) => setItemEditando({...itemEditando, quantidade_estimada: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Unidade</label>
                <UnidadeMedidaSelect
                  value={itemEditando.unidade_medida}
                  onChange={(v) => setItemEditando({...itemEditando, unidade_medida: v})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor Unitário *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemEditando.valor_unitario_estimado}
                  onChange={(e) => setItemEditando({...itemEditando, valor_unitario_estimado: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor Total</label>
                <Input
                  type="text"
                  readOnly
                  value={formatarMoeda(
                    (parseFloat(itemEditando.valor_unitario_estimado) || 0) *
                    (parseFloat(itemEditando.quantidade_estimada) || 1)
                  )}
                  className="bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor Orçamentário</label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemEditando.valor_orcamentario_exercicio || ''}
                  onChange={(e) => setItemEditando({...itemEditando, valor_orcamentario_exercicio: e.target.value})}
                />
              </div>
            </div>

            {/* Linha 5: Renovação, Data Desejada, Requisitante */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Renovação de Contrato</label>
                <Select value={itemEditando.renovacao_contrato || 'NAO'} onValueChange={(v) => setItemEditando({...itemEditando, renovacao_contrato: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIM">Sim</SelectItem>
                    <SelectItem value="NAO">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Data Desejada</label>
                <Input
                  type="date"
                  value={itemEditando.data_desejada_contratacao ? itemEditando.data_desejada_contratacao.split('T')[0] : ''}
                  onChange={(e) => setItemEditando({...itemEditando, data_desejada_contratacao: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Unidade Requisitante</label>
                <Input
                  value={itemEditando.unidade_requisitante || ''}
                  onChange={(e) => setItemEditando({...itemEditando, unidade_requisitante: e.target.value})}
                />
              </div>
            </div>

            {/* Linha 6: Justificativa */}
            <div>
              <label className="block text-sm font-medium mb-1">Justificativa</label>
              <textarea
                className="w-full px-3 py-2 border rounded-md text-sm"
                rows={3}
                value={itemEditando.justificativa || ''}
                onChange={(e) => setItemEditando({...itemEditando, justificativa: e.target.value})}
                placeholder="Justificativa da contratação..."
              />
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={salvarEdicaoItem}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Salvar Alterações
              </Button>
              <Button variant="outline" onClick={() => setShowEditarItem(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <AlertDialog open={showConfirmarExclusao} onOpenChange={setShowConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o item #{itemSelecionado?.numero_item}?
              <br />
              <strong>{itemSelecionado?.descricao_objeto}</strong>
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusaoItem} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Consolidar Demandas */}
      <Dialog open={showConsolidarDemandas} onOpenChange={setShowConsolidarDemandas}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Consolidar Demandas no PCA {pcaAtual?.ano_exercicio}
            </DialogTitle>
            <DialogDescription>
              Selecione as demandas aprovadas que deseja consolidar neste PCA.
              Os itens das demandas serão adicionados automaticamente.
            </DialogDescription>
          </DialogHeader>

          {demandasDisponiveis.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Nenhuma demanda aprovada disponível para consolidação.</p>
              <p className="text-sm text-gray-400 mt-2">
                As demandas precisam estar com status "Aprovada" para serem consolidadas.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between py-2 border-b">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={demandasSelecionadas.length === demandasDisponiveis.length}
                    onChange={selecionarTodasDemandas}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">
                    Selecionar todas ({demandasDisponiveis.length})
                  </span>
                </label>
                <span className="text-sm text-gray-500">
                  {demandasSelecionadas.length} selecionada(s)
                </span>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {demandasDisponiveis.map((demanda) => {
                  const totalItens = demanda.itens?.length || 0
                  const valorTotal = demanda.itens?.reduce((acc: number, item: any) => 
                    acc + (Number(item.valor_total_estimado) || 0), 0) || 0
                  const isSelected = demandasSelecionadas.includes(demanda.id)

                  return (
                    <div 
                      key={demanda.id}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => toggleDemandaSelecionada(demanda.id)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-1 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">{demanda.unidade_requisitante}</h4>
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              Aprovada
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {demanda.responsavel_nome || 'Sem responsável'}
                            {demanda.responsavel_email && ` • ${demanda.responsavel_email}`}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-sm">
                            <span className="flex items-center gap-1">
                              <Package className="h-4 w-4 text-gray-400" />
                              {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-4 w-4 text-gray-400" />
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowConsolidarDemandas(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={consolidarDemandas} 
                  disabled={demandasSelecionadas.length === 0 || consolidando}
                >
                  {consolidando ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  Consolidar {demandasSelecionadas.length > 0 && `(${demandasSelecionadas.length})`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
