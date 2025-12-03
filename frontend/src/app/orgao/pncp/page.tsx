'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  RefreshCw, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  FileText,
  Upload,
  ExternalLink,
  Settings,
  Wifi,
  WifiOff,
  Calendar,
  Building,
  Loader2,
  Plus,
  Edit,
  Trash2,
  Eye,
  FileCheck,
  ScrollText,
  ShoppingCart
} from 'lucide-react'
import { pncpService, MODALIDADES, MODO_DISPUTA } from '@/lib/pncp'
import type { Compra, ItemCompra, Resultado, Ata, ItemAta, AtaRetificacao, Contrato, ItemPca, Pca } from '@/lib/pncp'

interface SyncRecord {
  id: string
  tipo: string
  licitacao_id: string
  entidade_id?: string
  numero_controle_pncp: string
  status: string
  erro_mensagem: string
  tentativas: number
  created_at: string
  updated_at: string
  payload_enviado?: any
  resposta_pncp?: any
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
  numero_controle_pncp?: string
  modalidade?: string
  srp?: boolean
  ano_compra?: number
  sequencial_pncp?: number
  itens?: any[]
}

interface ConfigPNCP {
  configurado: boolean
  ambiente: string
  cnpjOrgao: string | null
  loginConfigurado: boolean
}

interface PCA {
  id: string
  numero_pca: string
  ano_exercicio: number
  status: string
  enviado_pncp: boolean
  quantidade_itens: number
  valor_total_estimado: number
  numero_controle_pncp?: string
  sequencial_pncp?: number
}

interface CompraEnviada {
  id: string
  ano: number
  sequencial: number
  numero_processo: string
  objeto: string
  srp: boolean
  link_pncp: string
}

interface ContratoPNCP {
  id: string
  numero_contrato: string
  ano_contrato: number
  sequencial_pncp?: number
  objeto: string
  cnpj_fornecedor: string
  nome_fornecedor: string
  valor_inicial: number
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  enviado_pncp: boolean
}

interface ItemPcaForm {
  numero_item: number
  categoria_item_pca: number
  descricao: string
  unidade_fornecimento: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  valor_orcamento_exercicio: number
  unidade_requisitante: string
  data_desejada: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function PncpPage() {
  const [pendentes, setPendentes] = useState<SyncRecord[]>([])
  const [erros, setErros] = useState<SyncRecord[]>([])
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [pcas, setPcas] = useState<PCA[]>([])
  const [comprasEnviadas, setComprasEnviadas] = useState<CompraEnviada[]>([])
  const [config, setConfig] = useState<ConfigPNCP | null>(null)
  const [orgaoAtual, setOrgaoAtual] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [testandoConexao, setTestandoConexao] = useState(false)
  const [statusConexao, setStatusConexao] = useState<{ sucesso: boolean; mensagem: string } | null>(null)
  
  // Estados para modais
  const [modalCompra, setModalCompra] = useState(false)
  const [modalResultado, setModalResultado] = useState(false)
  const [modalAta, setModalAta] = useState(false)
  const [licitacaoSelecionada, setLicitacaoSelecionada] = useState<Licitacao | null>(null)
  const [compraSelecionada, setCompraSelecionada] = useState<CompraEnviada | null>(null)
  
  // Estados para formulários
  const [formResultado, setFormResultado] = useState<Partial<Resultado>>({
    data_resultado: new Date().toISOString().split('T')[0],
  })
  const [formAta, setFormAta] = useState<Partial<Ata>>({
    ano_ata: new Date().getFullYear(),
    itens: []
  })
  const [itemSelecionado, setItemSelecionado] = useState<number>(1)
  
  // Estados para PCA
  const [modalPca, setModalPca] = useState(false)
  const [modalPcaItem, setModalPcaItem] = useState(false)
  const [modalRetificarItem, setModalRetificarItem] = useState(false)
  const [pcaSelecionado, setPcaSelecionado] = useState<PCA | null>(null)
  const [itemParaRetificar, setItemParaRetificar] = useState<any>(null)
  const [formPca, setFormPca] = useState({ 
    ano_pca: new Date().getFullYear(),
    codigo_unidade: '1',
    nome_unidade: 'Unidade Principal'
  })
  const [unidadesOrgao, setUnidadesOrgao] = useState<any[]>([])
  const [carregandoUnidades, setCarregandoUnidades] = useState(false)
  const [formPcaItem, setFormPcaItem] = useState<Partial<ItemPcaForm>>({
    numero_item: 1,
    categoria_item_pca: 1,
    quantidade: 1,
    valor_unitario: 0,
    valor_total: 0,
    valor_orcamento_exercicio: 0,
    data_desejada: new Date().toISOString().split('T')[0],
  })
  const [itensPca, setItensPca] = useState<ItemPcaForm[]>([])
  
  // Estados para Importação do PNCP
  const [modalImportarPncp, setModalImportarPncp] = useState(false)
  const [pcasNoPncp, setPcasNoPncp] = useState<any[]>([])
  const [carregandoPcasPncp, setCarregandoPcasPncp] = useState(false)
  const [importandoPca, setImportandoPca] = useState<string | null>(null)
  const [ambienteTreinamento, setAmbienteTreinamento] = useState(false)
  const [formImportManual, setFormImportManual] = useState({ ano: new Date().getFullYear(), sequencial: 1 })

  // Estados para Contratos
  const [contratos, setContratos] = useState<ContratoPNCP[]>([])
  const [modalContrato, setModalContrato] = useState(false)
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoPNCP | null>(null)
  const [formContrato, setFormContrato] = useState({
    numero_contrato: '',
    ano_contrato: new Date().getFullYear(),
    objeto: '',
    cnpj_fornecedor: '',
    nome_fornecedor: '',
    valor_inicial: 0,
    data_assinatura: new Date().toISOString().split('T')[0],
    data_vigencia_inicio: new Date().toISOString().split('T')[0],
    data_vigencia_fim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    tipo_contrato_id: 1,
    ano_compra: new Date().getFullYear(),
    sequencial_compra: 1,
  })

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const orgaoData = localStorage.getItem('orgao')
      const orgao = orgaoData ? JSON.parse(orgaoData) : null
      setOrgaoAtual(orgao)

      const [pendentesRes, errosRes, licitacoesRes, configRes, pcasRes] = await Promise.all([
        fetch(`${API_URL}/api/pncp/pendentes`),
        fetch(`${API_URL}/api/pncp/erros`),
        fetch(`${API_URL}/api/licitacoes`),
        fetch(`${API_URL}/api/pncp/config/status`),
        orgao ? fetch(`${API_URL}/api/pca?orgaoId=${orgao.id}`) : Promise.resolve(null)
      ])

      if (pendentesRes.ok) setPendentes(await pendentesRes.json())
      if (errosRes.ok) setErros(await errosRes.json())
      if (licitacoesRes.ok) setLicitacoes(await licitacoesRes.json())
      if (configRes.ok) setConfig(await configRes.json())
      if (pcasRes && pcasRes.ok) setPcas(await pcasRes.json())
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  // Erros filtrados para o órgão atual (usa entidade_id casando com PCA deste órgão)
  const errosFiltrados = erros.filter((erro) => {
    if (!erro.entidade_id) return true
    return pcas.some((p) => p.id === erro.entidade_id)
  })

  const testarConexao = async () => {
    setTestandoConexao(true)
    setStatusConexao(null)
    try {
      const response = await fetch(`${API_URL}/api/pncp/config/testar-conexao`, {
        method: 'POST'
      })
      const data = await response.json()
      setStatusConexao(data)
    } catch (error) {
      setStatusConexao({ sucesso: false, mensagem: 'Erro ao testar conexão' })
    } finally {
      setTestandoConexao(false)
    }
  }

  // Carregar unidades do órgão
  const carregarUnidadesOrgao = async () => {
    if (!orgaoAtual?.cnpj) return
    
    setCarregandoUnidades(true)
    try {
      const cnpjLimpo = orgaoAtual.cnpj.replace(/\D/g, '')
      const response = await fetch(`${API_URL}/api/pncp/orgao/${cnpjLimpo}/unidades`)
      const data = await response.json()
      
      if (response.ok && data.unidades) {
        setUnidadesOrgao(data.unidades)
        // Se só tem uma unidade, selecionar automaticamente
        if (data.unidades.length === 1) {
          setFormPca(prev => ({
            ...prev,
            codigo_unidade: data.unidades[0].codigoUnidade,
            nome_unidade: data.unidades[0].nomeUnidade
          }))
        }
      }
    } catch (error) {
      console.error('Erro ao carregar unidades:', error)
      // Usar unidade padrão em caso de erro
      setUnidadesOrgao([{ codigoUnidade: '1', nomeUnidade: 'Unidade Principal' }])
    } finally {
      setCarregandoUnidades(false)
    }
  }

  // Funções para importar PCAs do PNCP
  const buscarPCAsNoPncp = async () => {
    if (!orgaoAtual?.cnpj) {
      alert('CNPJ do órgão não encontrado')
      return
    }

    setCarregandoPcasPncp(true)
    try {
      const cnpjLimpo = orgaoAtual.cnpj.replace(/\D/g, '')
      const response = await fetch(`${API_URL}/api/pncp/importar/pcas/${cnpjLimpo}`)
      const data = await response.json()
      
      if (response.ok) {
        setPcasNoPncp(data.pcas || [])
        setAmbienteTreinamento(data.ambienteTreinamento || false)
      } else {
        alert(data.message || 'Erro ao buscar PCAs no PNCP')
      }
    } catch (error: any) {
      console.error('Erro ao buscar PCAs no PNCP:', error)
      alert('Erro ao buscar PCAs no PNCP')
    } finally {
      setCarregandoPcasPncp(false)
    }
  }

  // Importar PCA manualmente (para ambiente de treinamento)
  const importarPcaManual = async () => {
    if (!orgaoAtual?.id || !orgaoAtual?.cnpj) {
      alert('Dados do órgão não encontrados')
      return
    }

    const { ano, sequencial } = formImportManual
    if (!ano || !sequencial) {
      alert('Informe o ano e sequencial do PCA')
      return
    }

    setImportandoPca(`${ano}-${sequencial}`)
    try {
      const cnpjLimpo = orgaoAtual.cnpj.replace(/\D/g, '')
      const response = await fetch(`${API_URL}/api/pncp/importar/pca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgaoId: orgaoAtual.id,
          cnpj: cnpjLimpo,
          ano,
          sequencial
        })
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert(`PCA ${ano}/${sequencial} importado com sucesso!\n${data.mensagem}`)
        await carregarDados()
        setModalImportarPncp(false)
      } else {
        alert(data.message || data.mensagem || 'Erro ao importar PCA')
      }
    } catch (error: any) {
      console.error('Erro ao importar PCA:', error)
      alert('Erro ao importar PCA do PNCP')
    } finally {
      setImportandoPca(null)
    }
  }

  const importarPcaDoPncp = async (pcaPncp: any) => {
    if (!orgaoAtual?.id || !orgaoAtual?.cnpj) {
      alert('Dados do órgão não encontrados')
      return
    }

    const chave = `${pcaPncp.anoPca}-${pcaPncp.sequencialPca}`
    setImportandoPca(chave)
    
    try {
      const cnpjLimpo = orgaoAtual.cnpj.replace(/\D/g, '')
      const response = await fetch(`${API_URL}/api/pncp/importar/pca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgaoId: orgaoAtual.id,
          cnpj: cnpjLimpo,
          ano: pcaPncp.anoPca,
          sequencial: pcaPncp.sequencialPca
        })
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert(`PCA ${pcaPncp.anoPca} importado com sucesso!\n${data.mensagem}`)
        await carregarDados()
        // Remover da lista de PCAs no PNCP
        setPcasNoPncp(prev => prev.filter(p => 
          !(p.anoPca === pcaPncp.anoPca && p.sequencialPca === pcaPncp.sequencialPca)
        ))
      } else {
        alert(data.message || 'Erro ao importar PCA')
      }
    } catch (error: any) {
      console.error('Erro ao importar PCA:', error)
      alert('Erro ao importar PCA do PNCP')
    } finally {
      setImportandoPca(null)
    }
  }

  const importarTodosPcasDoPncp = async () => {
    if (!orgaoAtual?.id || !orgaoAtual?.cnpj) {
      alert('Dados do órgão não encontrados')
      return
    }

    if (!confirm('Deseja importar todos os PCAs encontrados no PNCP?')) {
      return
    }

    setCarregandoPcasPncp(true)
    try {
      const cnpjLimpo = orgaoAtual.cnpj.replace(/\D/g, '')
      const response = await fetch(`${API_URL}/api/pncp/importar/pcas/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgaoId: orgaoAtual.id,
          cnpj: cnpjLimpo
        })
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert(`Sincronização concluída!\n\nImportados: ${data.importados}\nAtualizados: ${data.atualizados}${data.erros?.length > 0 ? `\nErros: ${data.erros.length}` : ''}`)
        await carregarDados()
        setModalImportarPncp(false)
        setPcasNoPncp([])
      } else {
        alert(data.message || 'Erro ao sincronizar PCAs')
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar PCAs:', error)
      alert('Erro ao sincronizar PCAs do PNCP')
    } finally {
      setCarregandoPcasPncp(false)
    }
  }

  const enviarPCAParaPNCP = async (pca: PCA) => {
    setEnviando(pca.id)
    try {
      // Buscar dados completos do PCA
      const pcaResponse = await fetch(`${API_URL}/api/pca/${pca.id}`)
      if (!pcaResponse.ok) {
        throw new Error('Erro ao buscar dados do PCA')
      }
      const pcaCompleto = await pcaResponse.json()

      // Enviar para o PNCP
      const response = await fetch(`${API_URL}/api/pncp/pca/${pca.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pcaCompleto)
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert(`PCA enviado ao PNCP com sucesso!\nNúmero de Controle: ${data.numeroControlePNCP}\nSequencial: ${data.sequencial}`)
        await carregarDados()
      } else {
        alert(data.message || 'Erro ao enviar PCA para o PNCP')
      }
    } catch (error: any) {
      console.error('Erro ao enviar PCA:', error)
      alert(error.message || 'Erro ao enviar PCA para o PNCP')
    } finally {
      setEnviando(null)
    }
  }

  const enviarParaPNCP = async (licitacaoId: string) => {
    setEnviando(licitacaoId)
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await fetch(`${API_URL}/api/pncp/compras/${licitacaoId}/completo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert('Licitação enviada ao PNCP com sucesso!')
        carregarDados()
      } else {
        alert(data.message || 'Erro ao enviar para o PNCP')
      }
    } catch (error) {
      console.error('Erro ao enviar:', error)
      alert('Erro ao enviar para o PNCP')
    } finally {
      setEnviando(null)
    }
  }

  const reenviar = async (syncId: string) => {
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await fetch(`${API_URL}/api/pncp/reenviar/${syncId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        alert('Reenvio iniciado!')
        carregarDados()
      } else {
        alert('Erro ao reenviar')
      }
    } catch (error) {
      alert('Erro ao reenviar')
    }
  }

  // ============ FUNÇÕES PNCP - RESULTADO ============
  
  const abrirModalResultado = (compra: CompraEnviada, numeroItem: number) => {
    setCompraSelecionada(compra)
    setItemSelecionado(numeroItem)
    setFormResultado({
      data_resultado: new Date().toISOString().split('T')[0],
    })
    setModalResultado(true)
  }

  const enviarResultado = async () => {
    if (!compraSelecionada) return
    
    setEnviando('resultado')
    try {
      const response = await pncpService.incluirResultado(
        compraSelecionada.ano,
        compraSelecionada.sequencial,
        itemSelecionado,
        formResultado as Resultado
      )
      
      if (response.sucesso) {
        alert(`✅ Resultado incluído com sucesso!\n${response.mensagem}`)
        setModalResultado(false)
        carregarDados()
      }
    } catch (error: any) {
      alert(`❌ Erro ao incluir resultado:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  // ============ FUNÇÕES PNCP - ATA ============
  
  const abrirModalAta = (compra: CompraEnviada) => {
    setCompraSelecionada(compra)
    setFormAta({
      numero_ata: `001/${new Date().getFullYear()}`,
      ano_ata: new Date().getFullYear(),
      data_assinatura: new Date().toISOString().split('T')[0],
      data_vigencia_inicio: new Date().toISOString().split('T')[0],
      data_vigencia_fim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      itens: [{ numero_item: 1, quantidade: 1, valor_unitario: 0, valor_total: 0 }]
    })
    setModalAta(true)
  }

  const enviarAta = async () => {
    if (!compraSelecionada) return
    
    setEnviando('ata')
    try {
      const response = await pncpService.incluirAta(
        compraSelecionada.ano,
        compraSelecionada.sequencial,
        formAta as Ata
      )
      
      if (response.sucesso) {
        alert(`✅ Ata incluída com sucesso!\n${response.mensagem}`)
        setModalAta(false)
        carregarDados()
      }
    } catch (error: any) {
      alert(`❌ Erro ao incluir ata:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  // ============ FUNÇÕES PNCP - EXCLUSÃO ============
  
  const excluirCompra = async (compra: CompraEnviada) => {
    const justificativa = prompt('Informe a justificativa para exclusão:')
    if (!justificativa) {
      alert('Justificativa é obrigatória para exclusão')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir a compra ${compra.numero_processo}?`)) return
    
    setEnviando(compra.id)
    try {
      const response = await pncpService.excluirCompra(
        compra.ano,
        compra.sequencial,
        justificativa
      )
      
      if (response.sucesso) {
        alert('✅ Compra excluída com sucesso!')
        carregarDados()
      }
    } catch (error: any) {
      alert(`❌ Erro ao excluir compra:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  // ============ FUNÇÕES PNCP - PCA ============
  
  const incluirPcaPncp = async () => {
    if (itensPca.length === 0) {
      alert('Adicione pelo menos um item ao PCA')
      return
    }
    
    if (!formPca.codigo_unidade) {
      alert('Selecione a unidade do órgão')
      return
    }
    
    setEnviando('pca')
    try {
      const response = await pncpService.incluirPca({
        ano_pca: formPca.ano_pca,
        codigo_unidade: formPca.codigo_unidade,
        nome_unidade: formPca.nome_unidade,
        itens: itensPca
      })
      
      if (response.sucesso) {
        alert(`✅ PCA incluído com sucesso!\n${response.mensagem}`)
        setModalPca(false)
        setItensPca([])
        carregarDados()
      }
    } catch (error: any) {
      alert(`❌ Erro ao incluir PCA:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  const abrirGerenciarItensPca = async (pca: PCA) => {
    if (!pca.sequencial_pncp) {
      alert('PCA não possui sequencial PNCP')
      return
    }
    
    // Buscar itens do PCA
    try {
      const response = await fetch(`${API_URL}/api/pca/${pca.id}`)
      if (response.ok) {
        const pcaCompleto = await response.json()
        setPcaSelecionado({ ...pca, itens: pcaCompleto.itens } as any)
        setModalRetificarItem(true)
      }
    } catch (error) {
      alert('Erro ao carregar itens do PCA')
    }
  }

  const retificarItemPca = async (item: any) => {
    if (!pcaSelecionado?.sequencial_pncp) return
    
    const novaDescricao = prompt('Nova descrição do item:', item.descricao_objeto)
    if (!novaDescricao) return
    
    const novaQuantidade = prompt('Nova quantidade:', item.quantidade_estimada?.toString())
    if (!novaQuantidade) return
    
    const novoValor = prompt('Novo valor unitário:', item.valor_unitario_estimado?.toString())
    if (!novoValor) return
    
    setEnviando(item.id)
    try {
      const response = await fetch(`${API_URL}/api/pncp/pca/${pcaSelecionado.ano_exercicio}/${pcaSelecionado.sequencial_pncp}/itens/${item.numero_item}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: novaDescricao,
          quantidade: parseFloat(novaQuantidade),
          valorUnitario: parseFloat(novoValor),
          valorTotal: parseFloat(novaQuantidade) * parseFloat(novoValor)
        })
      })
      
      const data = await response.json()
      if (response.ok && data.sucesso) {
        alert('✅ Item retificado com sucesso!')
        abrirGerenciarItensPca(pcaSelecionado)
      } else {
        alert(`❌ Erro: ${data.message || 'Erro ao retificar item'}`)
      }
    } catch (error: any) {
      alert(`❌ Erro ao retificar item:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  const excluirItemPcaPncp = async (item: any) => {
    if (!pcaSelecionado?.sequencial_pncp) return
    
    const justificativa = prompt('Justificativa para exclusão do item:')
    if (!justificativa) {
      alert('Justificativa é obrigatória')
      return
    }
    
    if (!confirm(`Excluir item ${item.numero_item}?`)) return
    
    setEnviando(item.id)
    try {
      const response = await fetch(`${API_URL}/api/pncp/pca/${pcaSelecionado.ano_exercicio}/${pcaSelecionado.sequencial_pncp}/itens/${item.numero_item}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa })
      })
      
      const data = await response.json()
      if (response.ok && data.sucesso) {
        alert('✅ Item excluído com sucesso!')
        abrirGerenciarItensPca(pcaSelecionado)
      } else {
        alert(`❌ Erro: ${data.message || 'Erro ao excluir item'}`)
      }
    } catch (error: any) {
      alert(`❌ Erro ao excluir item:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  const excluirPcaPncp = async (pca: PCA) => {
    if (!pca.sequencial_pncp) {
      alert('PCA não possui sequencial PNCP')
      return
    }
    
    const justificativa = prompt('Informe a justificativa para exclusão do PCA:')
    if (!justificativa) {
      alert('Justificativa é obrigatória')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir o PCA ${pca.ano_exercicio}?`)) return
    
    setEnviando(pca.id)
    try {
      const response = await pncpService.excluirPca(
        pca.ano_exercicio,
        pca.sequencial_pncp,
        justificativa
      )
      
      if (response.sucesso) {
        // Desmarcar PCA como enviado no nosso sistema
        await fetch(`${API_URL}/api/pca/${pca.id}/desmarcar-enviado-pncp`, {
          method: 'PATCH'
        })
        alert('✅ PCA excluído do PNCP com sucesso!')
        await carregarDados()
      }
    } catch (error: any) {
      alert(`❌ Erro ao excluir PCA:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  const adicionarItemPca = () => {
    if (!formPcaItem.descricao || !formPcaItem.unidade_fornecimento || !formPcaItem.unidade_requisitante) {
      alert('Preencha todos os campos obrigatórios do item')
      return
    }
    
    const novoItem: ItemPcaForm = {
      numero_item: itensPca.length + 1,
      categoria_item_pca: formPcaItem.categoria_item_pca || 1,
      descricao: formPcaItem.descricao || '',
      unidade_fornecimento: formPcaItem.unidade_fornecimento || '',
      quantidade: formPcaItem.quantidade || 1,
      valor_unitario: formPcaItem.valor_unitario || 0,
      valor_total: (formPcaItem.quantidade || 1) * (formPcaItem.valor_unitario || 0),
      valor_orcamento_exercicio: formPcaItem.valor_orcamento_exercicio || 0,
      unidade_requisitante: formPcaItem.unidade_requisitante || '',
      data_desejada: formPcaItem.data_desejada || new Date().toISOString().split('T')[0],
    }
    
    setItensPca([...itensPca, novoItem])
    setFormPcaItem({
      numero_item: itensPca.length + 2,
      categoria_item_pca: 1,
      quantidade: 1,
      valor_unitario: 0,
      valor_total: 0,
      valor_orcamento_exercicio: 0,
      data_desejada: new Date().toISOString().split('T')[0],
    })
  }

  const removerItemPca = (index: number) => {
    setItensPca(itensPca.filter((_, i) => i !== index))
  }

  // ============ FUNÇÕES PNCP - CONTRATOS ============
  
  const incluirContratoPncp = async () => {
    setEnviando('contrato')
    try {
      const response = await pncpService.incluirContrato({
        numero_contrato: formContrato.numero_contrato,
        ano_contrato: formContrato.ano_contrato,
        objeto: formContrato.objeto,
        cnpj_fornecedor: formContrato.cnpj_fornecedor.replace(/\D/g, ''),
        nome_fornecedor: formContrato.nome_fornecedor,
        valor_inicial: formContrato.valor_inicial,
        data_assinatura: formContrato.data_assinatura,
        data_vigencia_inicio: formContrato.data_vigencia_inicio,
        data_vigencia_fim: formContrato.data_vigencia_fim,
        tipo_contrato_id: formContrato.tipo_contrato_id,
        ano_compra: formContrato.ano_compra,
        sequencial_compra: formContrato.sequencial_compra,
      })
      
      if (response.sucesso) {
        alert(`✅ Contrato incluído com sucesso!\n${response.mensagem}`)
        setModalContrato(false)
        resetFormContrato()
        carregarDados()
      }
    } catch (error: any) {
      alert(`❌ Erro ao incluir contrato:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  const excluirContratoPncp = async (contrato: ContratoPNCP) => {
    if (!contrato.sequencial_pncp) {
      alert('Contrato não possui sequencial PNCP')
      return
    }
    
    const justificativa = prompt('Informe a justificativa para exclusão do contrato:')
    if (!justificativa) {
      alert('Justificativa é obrigatória')
      return
    }
    
    if (!confirm(`Tem certeza que deseja excluir o contrato ${contrato.numero_contrato}?`)) return
    
    setEnviando(contrato.id)
    try {
      const response = await pncpService.excluirContrato(
        contrato.ano_contrato,
        contrato.sequencial_pncp,
        justificativa
      )
      
      if (response.sucesso) {
        alert('✅ Contrato excluído com sucesso!')
        carregarDados()
      }
    } catch (error: any) {
      alert(`❌ Erro ao excluir contrato:\n${error.message}`)
    } finally {
      setEnviando(null)
    }
  }

  const resetFormContrato = () => {
    setFormContrato({
      numero_contrato: '',
      ano_contrato: new Date().getFullYear(),
      objeto: '',
      cnpj_fornecedor: '',
      nome_fornecedor: '',
      valor_inicial: 0,
      data_assinatura: new Date().toISOString().split('T')[0],
      data_vigencia_inicio: new Date().toISOString().split('T')[0],
      data_vigencia_fim: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      tipo_contrato_id: 1,
      ano_compra: new Date().getFullYear(),
      sequencial_compra: 1,
    })
    setContratoSelecionado(null)
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: React.ReactNode }> = {
      'PENDENTE': { variant: 'secondary', icon: <Clock className="w-3 h-3 mr-1" /> },
      'ENVIANDO': { variant: 'outline', icon: <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> },
      'ENVIADO': { variant: 'default', icon: <CheckCircle className="w-3 h-3 mr-1" /> },
      'ERRO': { variant: 'destructive', icon: <XCircle className="w-3 h-3 mr-1" /> },
      'ATUALIZADO': { variant: 'default', icon: <CheckCircle className="w-3 h-3 mr-1" /> }
    }

    const config = statusMap[status] || { variant: 'secondary' as const, icon: null }

    return (
      <Badge variant={config.variant} className="flex items-center">
        {config.icon}
        {status}
      </Badge>
    )
  }

  const licitacoesNaoEnviadas = licitacoes.filter(l => 
    !l.numero_controle_pncp && 
    ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'RECURSO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(l.fase)
  )

  const licitacoesEnviadas = licitacoes.filter(l => l.numero_controle_pncp)

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Integração PNCP</h1>
          <p className="text-muted-foreground">
            Portal Nacional de Contratações Públicas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={carregarDados} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" asChild>
            <a href="https://pncp.gov.br" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Portal PNCP
            </a>
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando Envio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{licitacoesNaoEnviadas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Enviadas ao PNCP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{licitacoesEnviadas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendentes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Com Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{erros.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pca" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="pca">
            <Calendar className="w-4 h-4 mr-2" />
            PCA
          </TabsTrigger>
          <TabsTrigger value="licitacoes">
            <Send className="w-4 h-4 mr-2" />
            Compras
          </TabsTrigger>
          <TabsTrigger value="enviadas">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Enviadas ({licitacoesEnviadas.length})
          </TabsTrigger>
          <TabsTrigger value="resultados">
            <FileCheck className="w-4 h-4 mr-2" />
            Resultados
          </TabsTrigger>
          <TabsTrigger value="atas">
            <ScrollText className="w-4 h-4 mr-2" />
            Atas
          </TabsTrigger>
          <TabsTrigger value="contratos">
            <FileText className="w-4 h-4 mr-2" />
            Contratos
          </TabsTrigger>
          <TabsTrigger value="erros">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Erros ({erros.length})
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* Tab: PCA */}
        <TabsContent value="pca">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Plano de Contratações Anual (PCA)
                </CardTitle>
                <CardDescription>
                  Gerencie os PCAs no Portal Nacional de Contratações Públicas
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {/* Botão Importar do PNCP */}
                <Dialog open={modalImportarPncp} onOpenChange={(open) => {
                  setModalImportarPncp(open)
                  if (open) buscarPCAsNoPncp()
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Upload className="w-4 h-4 mr-2" />
                      Importar do PNCP
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Importar PCAs do PNCP</DialogTitle>
                      <DialogDescription>
                        Busque e importe PCAs já enviados ao PNCP para sincronizar com a plataforma
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      {carregandoPcasPncp ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin mr-2" />
                          <span>Verificando ambiente PNCP...</span>
                        </div>
                      ) : ambienteTreinamento ? (
                        <div className="space-y-4">
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-sm text-yellow-800">
                              <strong>Ambiente de Treinamento:</strong> A busca automática de PCAs não está disponível neste ambiente. 
                              Informe manualmente o ano e sequencial do PCA que deseja importar.
                            </p>
                            <p className="text-xs text-yellow-600 mt-2">
                              Você pode encontrar essas informações na URL do PCA no portal PNCP: 
                              <code className="bg-yellow-100 px-1 rounded">treina.pncp.gov.br/app/pca/CNPJ/ANO/SEQUENCIAL</code>
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Ano do PCA</Label>
                              <Input
                                type="number"
                                value={formImportManual.ano}
                                onChange={(e) => setFormImportManual(prev => ({ ...prev, ano: parseInt(e.target.value) }))}
                                placeholder="Ex: 2025"
                              />
                            </div>
                            <div>
                              <Label>Sequencial</Label>
                              <Input
                                type="number"
                                value={formImportManual.sequencial}
                                onChange={(e) => setFormImportManual(prev => ({ ...prev, sequencial: parseInt(e.target.value) }))}
                                placeholder="Ex: 1"
                              />
                            </div>
                          </div>
                          <Button 
                            onClick={importarPcaManual}
                            disabled={importandoPca !== null}
                            className="w-full"
                          >
                            {importandoPca ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</>
                            ) : (
                              <><Upload className="w-4 h-4 mr-2" /> Importar PCA</>
                            )}
                          </Button>
                        </div>
                      ) : pcasNoPncp.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Nenhum PCA encontrado no PNCP para este órgão.</p>
                          <Button 
                            variant="outline" 
                            className="mt-4"
                            onClick={buscarPCAsNoPncp}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Buscar Novamente
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <p className="text-sm text-muted-foreground">
                              {pcasNoPncp.length} PCA(s) encontrado(s) no PNCP
                            </p>
                            <Button 
                              onClick={importarTodosPcasDoPncp}
                              disabled={carregandoPcasPncp}
                            >
                              Importar Todos
                            </Button>
                          </div>
                          <div className="border rounded-lg divide-y">
                            {pcasNoPncp.map((pcaPncp) => {
                              const chave = `${pcaPncp.anoPca}-${pcaPncp.sequencialPca}`
                              const jaExiste = pcas.some(p => 
                                p.ano_exercicio === pcaPncp.anoPca && p.sequencial_pncp === pcaPncp.sequencialPca
                              )
                              return (
                                <div key={chave} className="p-4 flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">PCA {pcaPncp.anoPca}</p>
                                    <p className="text-sm text-muted-foreground">
                                      Sequencial: {pcaPncp.sequencialPca} | 
                                      Itens: {pcaPncp.quantidadeItensPlano || 0}
                                    </p>
                                    {pcaPncp.dataPublicacaoPncp && (
                                      <p className="text-xs text-muted-foreground">
                                        Publicado em: {new Date(pcaPncp.dataPublicacaoPncp).toLocaleDateString('pt-BR')}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {jaExiste ? (
                                      <Badge variant="outline" className="text-green-600">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Já importado
                                      </Badge>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => importarPcaDoPncp(pcaPncp)}
                                        disabled={importandoPca === chave}
                                      >
                                        {importandoPca === chave ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <>
                                            <Upload className="w-4 h-4 mr-1" />
                                            Importar
                                          </>
                                        )}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Botão Novo PCA */}
                <Dialog open={modalPca} onOpenChange={(open) => {
                  setModalPca(open)
                  if (open) carregarUnidadesOrgao()
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Novo PCA
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Incluir PCA no PNCP</DialogTitle>
                    <DialogDescription>
                      Preencha os dados do Plano de Contratações Anual
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Ano do PCA</Label>
                        <Input
                          type="number"
                          value={formPca.ano_pca}
                          onChange={(e) => setFormPca(prev => ({ ...prev, ano_pca: parseInt(e.target.value) }))}
                        />
                      </div>
                      <div>
                        <Label>Unidade do Órgão</Label>
                        {carregandoUnidades ? (
                          <div className="flex items-center gap-2 h-10">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Carregando unidades...</span>
                          </div>
                        ) : (
                          <Select
                            value={formPca.codigo_unidade}
                            onValueChange={(value) => {
                              const unidade = unidadesOrgao.find(u => u.codigoUnidade === value)
                              setFormPca(prev => ({
                                ...prev,
                                codigo_unidade: value,
                                nome_unidade: unidade?.nomeUnidade || `Unidade ${value}`
                              }))
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a unidade" />
                            </SelectTrigger>
                            <SelectContent>
                              {unidadesOrgao.map((unidade) => (
                                <SelectItem key={unidade.codigoUnidade} value={unidade.codigoUnidade}>
                                  {unidade.codigoUnidade} - {unidade.nomeUnidade}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Código da unidade no PNCP (cada unidade tem seu próprio PCA)
                        </p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Adicionar Item ao PCA</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Categoria</Label>
                          <Select
                            value={String(formPcaItem.categoria_item_pca)}
                            onValueChange={(v) => setFormPcaItem({...formPcaItem, categoria_item_pca: parseInt(v)})}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Bens</SelectItem>
                              <SelectItem value="2">Serviços</SelectItem>
                              <SelectItem value="3">Obras</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Data Desejada</Label>
                          <Input
                            type="date"
                            value={formPcaItem.data_desejada || ''}
                            onChange={(e) => setFormPcaItem({...formPcaItem, data_desejada: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="mt-3">
                        <Label>Descrição do Item *</Label>
                        <Textarea
                          placeholder="Descrição detalhada do item"
                          value={formPcaItem.descricao || ''}
                          onChange={(e) => setFormPcaItem({...formPcaItem, descricao: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <Label>Unidade de Fornecimento *</Label>
                          <Input
                            placeholder="Ex: Unidade, Caixa, Litro"
                            value={formPcaItem.unidade_fornecimento || ''}
                            onChange={(e) => setFormPcaItem({...formPcaItem, unidade_fornecimento: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Unidade Requisitante *</Label>
                          <Input
                            placeholder="Ex: Secretaria de Administração"
                            value={formPcaItem.unidade_requisitante || ''}
                            onChange={(e) => setFormPcaItem({...formPcaItem, unidade_requisitante: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                          <Label>Quantidade</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formPcaItem.quantidade || ''}
                            onChange={(e) => setFormPcaItem({...formPcaItem, quantidade: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div>
                          <Label>Valor Unitário</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formPcaItem.valor_unitario || ''}
                            onChange={(e) => setFormPcaItem({...formPcaItem, valor_unitario: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div>
                          <Label>Valor Orçamento</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={formPcaItem.valor_orcamento_exercicio || ''}
                            onChange={(e) => setFormPcaItem({...formPcaItem, valor_orcamento_exercicio: parseFloat(e.target.value)})}
                          />
                        </div>
                      </div>
                      <Button type="button" variant="outline" className="mt-3" onClick={adicionarItemPca}>
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar Item
                      </Button>
                    </div>

                    {itensPca.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-3">Itens do PCA ({itensPca.length})</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {itensPca.map((item, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                              <div className="text-sm">
                                <span className="font-medium">Item {item.numero_item}:</span> {item.descricao.substring(0, 50)}...
                                <span className="text-muted-foreground ml-2">
                                  {item.quantidade} x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario)}
                                </span>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => removerItemPca(index)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setModalPca(false)}>Cancelar</Button>
                    <Button onClick={incluirPcaPncp} disabled={enviando === 'pca' || itensPca.length === 0}>
                      {enviando === 'pca' ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                      ) : (
                        <><Send className="w-4 h-4 mr-2" /> Enviar PCA ao PNCP</>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {pcas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4" />
                  <p>Nenhum PCA encontrado.</p>
                  <p className="text-sm">Clique em "Novo PCA" para criar um novo plano.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pcas.map((pca) => (
                    <div 
                      key={pca.id} 
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        pca.enviado_pncp ? 'bg-green-50 border-green-200' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">PCA {pca.ano_exercicio}</span>
                          <Badge variant={pca.status === 'PUBLICADO' ? 'default' : 'secondary'}>
                            {pca.status}
                          </Badge>
                          {pca.enviado_pncp && (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Enviado ao PNCP
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {pca.quantidade_itens} itens • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pca.valor_total_estimado)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!pca.enviado_pncp && pca.status === 'PUBLICADO' ? (
                          <Button 
                            onClick={() => enviarPCAParaPNCP(pca)}
                            disabled={enviando === pca.id}
                          >
                            {enviando === pca.id ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                            ) : (
                              <><Send className="w-4 h-4 mr-2" /> Enviar</>
                            )}
                          </Button>
                        ) : pca.enviado_pncp ? (
                          <>
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                              Seq: {pca.sequencial_pncp}
                            </Badge>
                            <Button variant="outline" size="sm" onClick={() => abrirGerenciarItensPca(pca)}>
                              <Edit className="w-4 h-4 mr-1" /> Gerenciar Itens
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => excluirPcaPncp(pca)} disabled={enviando === pca.id}>
                              <Trash2 className="w-4 h-4 mr-1" /> Excluir
                            </Button>
                            {pca.numero_controle_pncp ? (
                              <Button variant="outline" size="sm" asChild>
                                {(() => {
                                  const numeroControle = pca.numero_controle_pncp!
                                  const partes = numeroControle.split('-')
                                  const cnpjPncp = (partes[0] || '').replace(/\D/g, '')

                                  if (!cnpjPncp) {
                                    return (
                                      <span className="text-xs text-gray-500 px-2">
                                        Número de controle PNCP inválido
                                      </span>
                                    )
                                  }

                                  return (
                                    <a
                                      href={`https://treina.pncp.gov.br/app/pca/${cnpjPncp}/${pca.ano_exercicio}/${pca.sequencial_pncp}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="w-4 h-4 mr-1" /> Ver no PNCP
                                    </a>
                                  )
                                })()}
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Sem número de controle PNCP
                              </Badge>
                            )}
                          </>
                        ) : (
                          <Badge variant="secondary">Publique para enviar</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Licitações */}
        <TabsContent value="licitacoes">
          <Card>
            <CardHeader>
              <CardTitle>Licitações Aguardando Envio</CardTitle>
              <CardDescription>
                Licitações publicadas que ainda não foram enviadas ao PNCP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {licitacoesNaoEnviadas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p>Todas as licitações publicadas já foram enviadas ao PNCP!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {licitacoesNaoEnviadas.map((licitacao) => (
                    <div 
                      key={licitacao.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{licitacao.numero_processo}</span>
                          <Badge variant="outline">{licitacao.fase}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {licitacao.objeto}
                        </p>
                      </div>
                      <Button 
                        onClick={() => enviarParaPNCP(licitacao.id)}
                        disabled={enviando === licitacao.id}
                      >
                        {enviando === licitacao.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Enviar ao PNCP
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Enviadas */}
        <TabsContent value="enviadas">
          <Card>
            <CardHeader>
              <CardTitle>Licitações Enviadas ao PNCP</CardTitle>
              <CardDescription>
                Licitações já publicadas no Portal Nacional de Contratações Públicas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {licitacoesEnviadas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Upload className="w-12 h-12 mx-auto mb-4" />
                  <p>Nenhuma licitação foi enviada ao PNCP ainda.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {licitacoesEnviadas.map((licitacao) => (
                    <div 
                      key={licitacao.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="font-medium">{licitacao.numero_processo}</span>
                          <Badge variant="default">Enviada</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Controle PNCP: <code className="bg-muted px-1 rounded">{licitacao.numero_controle_pncp}</code>
                        </p>
                      </div>
                      <Button variant="outline" asChild>
                        <a 
                          href={`https://pncp.gov.br/app/editais/${licitacao.numero_controle_pncp}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ver no PNCP
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Resultados */}
        <TabsContent value="resultados">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="w-5 h-5" />
                Incluir Resultado de Item
              </CardTitle>
              <CardDescription>
                Registre o resultado (fornecedor vencedor) dos itens das compras enviadas ao PNCP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {licitacoesEnviadas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="w-12 h-12 mx-auto mb-4" />
                  <p>Nenhuma compra enviada ao PNCP.</p>
                  <p className="text-sm">Envie uma compra primeiro para registrar resultados.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {licitacoesEnviadas.map((licitacao) => (
                    <div 
                      key={licitacao.id} 
                      className="p-4 border rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{licitacao.numero_processo}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {licitacao.objeto}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Plus className="w-4 h-4 mr-2" />
                              Incluir Resultado
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Incluir Resultado do Item</DialogTitle>
                              <DialogDescription>
                                Compra: {licitacao.numero_processo}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Número do Item</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={itemSelecionado}
                                    onChange={(e) => setItemSelecionado(parseInt(e.target.value))}
                                  />
                                </div>
                                <div>
                                  <Label>Data do Resultado</Label>
                                  <Input
                                    type="date"
                                    value={formResultado.data_resultado || ''}
                                    onChange={(e) => setFormResultado({...formResultado, data_resultado: e.target.value})}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label>CNPJ do Fornecedor</Label>
                                <Input
                                  placeholder="00.000.000/0000-00"
                                  value={formResultado.cnpj_fornecedor || ''}
                                  onChange={(e) => setFormResultado({...formResultado, cnpj_fornecedor: e.target.value})}
                                />
                              </div>
                              <div>
                                <Label>Nome/Razão Social</Label>
                                <Input
                                  placeholder="Nome do fornecedor vencedor"
                                  value={formResultado.nome_fornecedor || ''}
                                  onChange={(e) => setFormResultado({...formResultado, nome_fornecedor: e.target.value})}
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <Label>Qtd. Homologada</Label>
                                  <Input
                                    type="number"
                                    step="0.0001"
                                    value={formResultado.quantidade_homologada || ''}
                                    onChange={(e) => setFormResultado({...formResultado, quantidade_homologada: parseFloat(e.target.value)})}
                                  />
                                </div>
                                <div>
                                  <Label>Valor Unitário</Label>
                                  <Input
                                    type="number"
                                    step="0.0001"
                                    value={formResultado.valor_unitario_homologado || ''}
                                    onChange={(e) => setFormResultado({...formResultado, valor_unitario_homologado: parseFloat(e.target.value)})}
                                  />
                                </div>
                                <div>
                                  <Label>Valor Total</Label>
                                  <Input
                                    type="number"
                                    step="0.0001"
                                    value={formResultado.valor_total_homologado || ''}
                                    onChange={(e) => setFormResultado({...formResultado, valor_total_homologado: parseFloat(e.target.value)})}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label>Percentual de Desconto (%)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0"
                                  value={formResultado.percentual_desconto || ''}
                                  onChange={(e) => setFormResultado({...formResultado, percentual_desconto: parseFloat(e.target.value)})}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button 
                                onClick={async () => {
                                  setEnviando('resultado')
                                  try {
                                    // Extrair ano e sequencial do numero_controle_pncp
                                    const partes = licitacao.numero_controle_pncp?.split('/') || []
                                    const ano = licitacao.ano_compra || new Date().getFullYear()
                                    const seq = licitacao.sequencial_pncp || 1
                                    
                                    const response = await pncpService.incluirResultado(
                                      ano, seq, itemSelecionado,
                                      formResultado as Resultado
                                    )
                                    if (response.sucesso) {
                                      alert(`✅ Resultado incluído!\n${response.mensagem}`)
                                    }
                                  } catch (error: any) {
                                    alert(`❌ Erro: ${error.message}`)
                                  } finally {
                                    setEnviando(null)
                                  }
                                }}
                                disabled={enviando === 'resultado'}
                              >
                                {enviando === 'resultado' ? (
                                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                                ) : (
                                  <><Send className="w-4 h-4 mr-2" /> Enviar Resultado</>
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`https://pncp.gov.br/app/editais/${licitacao.numero_controle_pncp}`} target="_blank">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ver no PNCP
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Atas SRP */}
        <TabsContent value="atas">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="w-5 h-5" />
                Atas de Registro de Preço
              </CardTitle>
              <CardDescription>
                Crie atas de registro de preço para compras SRP enviadas ao PNCP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {licitacoesEnviadas.filter(l => l.srp).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ScrollText className="w-12 h-12 mx-auto mb-4" />
                  <p>Nenhuma compra SRP enviada ao PNCP.</p>
                  <p className="text-sm">Envie uma compra com SRP para criar atas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {licitacoesEnviadas.filter(l => l.srp).map((licitacao) => (
                    <div 
                      key={licitacao.id} 
                      className="p-4 border rounded-lg bg-blue-50 border-blue-200"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <ScrollText className="w-4 h-4 text-blue-600" />
                            <span className="font-medium">{licitacao.numero_processo}</span>
                            <Badge variant="outline" className="bg-blue-100 text-blue-700">SRP</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {licitacao.objeto}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Plus className="w-4 h-4 mr-2" />
                              Criar Ata
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Criar Ata de Registro de Preço</DialogTitle>
                              <DialogDescription>
                                Compra SRP: {licitacao.numero_processo}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Número da Ata</Label>
                                  <Input
                                    placeholder="001/2025"
                                    value={formAta.numero_ata || ''}
                                    onChange={(e) => setFormAta({...formAta, numero_ata: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <Label>Ano da Ata</Label>
                                  <Input
                                    type="number"
                                    value={formAta.ano_ata || new Date().getFullYear()}
                                    onChange={(e) => setFormAta({...formAta, ano_ata: parseInt(e.target.value)})}
                                  />
                                </div>
                              </div>
                              <div>
                                <Label>CNPJ do Fornecedor</Label>
                                <Input
                                  placeholder="00.000.000/0000-00"
                                  value={formAta.cnpj_fornecedor || ''}
                                  onChange={(e) => setFormAta({...formAta, cnpj_fornecedor: e.target.value})}
                                />
                              </div>
                              <div>
                                <Label>Nome/Razão Social</Label>
                                <Input
                                  placeholder="Nome do fornecedor"
                                  value={formAta.nome_fornecedor || ''}
                                  onChange={(e) => setFormAta({...formAta, nome_fornecedor: e.target.value})}
                                />
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <Label>Data Assinatura</Label>
                                  <Input
                                    type="date"
                                    value={formAta.data_assinatura || ''}
                                    onChange={(e) => setFormAta({...formAta, data_assinatura: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <Label>Início Vigência</Label>
                                  <Input
                                    type="date"
                                    value={formAta.data_vigencia_inicio || ''}
                                    onChange={(e) => setFormAta({...formAta, data_vigencia_inicio: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <Label>Fim Vigência</Label>
                                  <Input
                                    type="date"
                                    value={formAta.data_vigencia_fim || ''}
                                    onChange={(e) => setFormAta({...formAta, data_vigencia_fim: e.target.value})}
                                  />
                                </div>
                              </div>
                              <div className="border-t pt-4">
                                <Label className="mb-2 block">Item da Ata</Label>
                                <div className="grid grid-cols-4 gap-2">
                                  <Input type="number" placeholder="Nº Item" min="1" defaultValue="1" />
                                  <Input type="number" placeholder="Qtd" step="0.01" />
                                  <Input type="number" placeholder="Vlr Unit" step="0.01" />
                                  <Input type="number" placeholder="Vlr Total" step="0.01" />
                                </div>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button 
                                onClick={async () => {
                                  setEnviando('ata')
                                  try {
                                    const ano = licitacao.ano_compra || new Date().getFullYear()
                                    const seq = licitacao.sequencial_pncp || 1
                                    
                                    const ataData: Ata = {
                                      ...formAta as Ata,
                                      itens: [{ numero_item: 1, quantidade: 1, valor_unitario: 0, valor_total: 0 }]
                                    }
                                    
                                    const response = await pncpService.incluirAta(ano, seq, ataData)
                                    if (response.sucesso) {
                                      alert(`✅ Ata criada!\n${response.mensagem}`)
                                    }
                                  } catch (error: any) {
                                    alert(`❌ Erro: ${error.message}`)
                                  } finally {
                                    setEnviando(null)
                                  }
                                }}
                                disabled={enviando === 'ata'}
                              >
                                {enviando === 'ata' ? (
                                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                                ) : (
                                  <><Send className="w-4 h-4 mr-2" /> Criar Ata</>
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`https://pncp.gov.br/app/editais/${licitacao.numero_controle_pncp}`} target="_blank">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ver no PNCP
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Contratos */}
        <TabsContent value="contratos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Contratos
                </CardTitle>
                <CardDescription>
                  Gerencie contratos no Portal Nacional de Contratações Públicas
                </CardDescription>
              </div>
              <Dialog open={modalContrato} onOpenChange={setModalContrato}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Contrato
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Incluir Contrato no PNCP</DialogTitle>
                    <DialogDescription>
                      Preencha os dados do contrato para enviar ao PNCP
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Número do Contrato *</Label>
                        <Input
                          placeholder="001/2025"
                          value={formContrato.numero_contrato}
                          onChange={(e) => setFormContrato({...formContrato, numero_contrato: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Ano do Contrato</Label>
                        <Input
                          type="number"
                          value={formContrato.ano_contrato}
                          onChange={(e) => setFormContrato({...formContrato, ano_contrato: parseInt(e.target.value)})}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label>Objeto do Contrato *</Label>
                      <Textarea
                        placeholder="Descrição do objeto do contrato"
                        value={formContrato.objeto}
                        onChange={(e) => setFormContrato({...formContrato, objeto: e.target.value})}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CNPJ do Fornecedor *</Label>
                        <Input
                          placeholder="00.000.000/0000-00"
                          value={formContrato.cnpj_fornecedor}
                          onChange={(e) => setFormContrato({...formContrato, cnpj_fornecedor: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Nome/Razão Social *</Label>
                        <Input
                          placeholder="Nome do fornecedor"
                          value={formContrato.nome_fornecedor}
                          onChange={(e) => setFormContrato({...formContrato, nome_fornecedor: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Valor Inicial (R$) *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formContrato.valor_inicial}
                          onChange={(e) => setFormContrato({...formContrato, valor_inicial: parseFloat(e.target.value)})}
                        />
                      </div>
                      <div>
                        <Label>Tipo de Contrato</Label>
                        <Select
                          value={String(formContrato.tipo_contrato_id)}
                          onValueChange={(v) => setFormContrato({...formContrato, tipo_contrato_id: parseInt(v)})}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Contrato</SelectItem>
                            <SelectItem value="2">Termo Aditivo</SelectItem>
                            <SelectItem value="3">Termo de Apostilamento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>Data Assinatura</Label>
                        <Input
                          type="date"
                          value={formContrato.data_assinatura}
                          onChange={(e) => setFormContrato({...formContrato, data_assinatura: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Início Vigência</Label>
                        <Input
                          type="date"
                          value={formContrato.data_vigencia_inicio}
                          onChange={(e) => setFormContrato({...formContrato, data_vigencia_inicio: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Fim Vigência</Label>
                        <Input
                          type="date"
                          value={formContrato.data_vigencia_fim}
                          onChange={(e) => setFormContrato({...formContrato, data_vigencia_fim: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Vinculação com Compra PNCP</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Ano da Compra</Label>
                          <Input
                            type="number"
                            value={formContrato.ano_compra}
                            onChange={(e) => setFormContrato({...formContrato, ano_compra: parseInt(e.target.value)})}
                          />
                        </div>
                        <div>
                          <Label>Sequencial da Compra</Label>
                          <Input
                            type="number"
                            value={formContrato.sequencial_compra}
                            onChange={(e) => setFormContrato({...formContrato, sequencial_compra: parseInt(e.target.value)})}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setModalContrato(false); resetFormContrato(); }}>
                      Cancelar
                    </Button>
                    <Button onClick={incluirContratoPncp} disabled={enviando === 'contrato'}>
                      {enviando === 'contrato' ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                      ) : (
                        <><Send className="w-4 h-4 mr-2" /> Enviar Contrato</>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {contratos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4" />
                  <p>Nenhum contrato enviado ao PNCP.</p>
                  <p className="text-sm">Clique em "Novo Contrato" para incluir um contrato.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contratos.map((contrato) => (
                    <div 
                      key={contrato.id} 
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        contrato.enviado_pncp ? 'bg-green-50 border-green-200' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">Contrato {contrato.numero_contrato}</span>
                          {contrato.enviado_pncp && (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Enviado ao PNCP
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {contrato.nome_fornecedor} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contrato.valor_inicial)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {contrato.objeto.substring(0, 80)}...
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {contrato.enviado_pncp && (
                          <>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => excluirContratoPncp(contrato)} disabled={enviando === contrato.id}>
                              <Trash2 className="w-4 h-4 mr-1" /> Excluir
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                              <a href={`https://pncp.gov.br/app/contratos`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-1" /> Ver
                              </a>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Erros */}
        <TabsContent value="erros">
          <Card>
            <CardHeader>
              <CardTitle>Erros de Sincronização</CardTitle>
              <CardDescription>
                Registros que falharam ao enviar para o PNCP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {erros.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p>Nenhum erro de sincronização!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {errosFiltrados.map((erro) => (
                    <div 
                      key={erro.id} 
                      className="p-4 border border-red-200 rounded-lg bg-red-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="font-medium">{erro.tipo}</span>
                          <Badge variant="destructive">Tentativas: {erro.tentativas}</Badge>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => reenviar(erro.id)}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Reenviar
                        </Button>
                      </div>
                      <p className="text-sm text-red-700">
                        {erro.erro_mensagem}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Última tentativa: {new Date(erro.updated_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Configuração */}
        <TabsContent value="config">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Status da Configuração */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Status da Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {config ? (
                  <>
                    <div className={`p-4 rounded-lg ${config.configurado ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {config.configurado ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        )}
                        <span className="font-medium">
                          {config.configurado ? 'Configuração Completa' : 'Configuração Pendente'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">Ambiente</span>
                        <Badge variant={config.ambiente === 'PRODUÇÃO' ? 'default' : 'secondary'}>
                          {config.ambiente}
                        </Badge>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <span className="text-sm font-medium">CNPJ da Plataforma no PNCP</span>
                          <span className="text-sm font-mono">
                            {config.cnpjOrgao || <span className="text-red-500">Não configurado</span>}
                          </span>
                        </div>
                        {orgaoAtual && (
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <span className="text-sm font-medium">CNPJ deste Órgão</span>
                            <span className="text-sm font-mono">
                              {orgaoAtual.cnpj || '---'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">Login</span>
                        {config.loginConfigurado ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Configurado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3 mr-1" />
                            Não configurado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                    Carregando configuração...
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Teste de Conexão */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="w-5 h-5" />
                  Teste de Conexão
                </CardTitle>
                <CardDescription>
                  Verifique se a conexão com o PNCP está funcionando
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={testarConexao} 
                  disabled={testandoConexao}
                  className="w-full"
                >
                  {testandoConexao ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testando conexão...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-4 h-4 mr-2" />
                      Testar Conexão com PNCP
                    </>
                  )}
                </Button>

                {statusConexao && (
                  <div className={`p-4 rounded-lg ${
                    statusConexao.sucesso 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {statusConexao.sucesso ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className={`font-medium ${
                        statusConexao.sucesso ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {statusConexao.mensagem}
                      </span>
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  O teste verifica se as credenciais estão corretas e se é possível autenticar no PNCP.
                </div>
              </CardContent>
            </Card>

            {/* Documentação */}
            <Card>
              <CardHeader>
                <CardTitle>Documentação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://pncp.gov.br/api/pncp/swagger-ui/index.html" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Swagger API
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://www.gov.br/pncp/pt-br/pncp/integre-se-ao-pncp" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Manual de Integração
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://treina.pncp.gov.br" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Ambiente de Treinamento
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Dados Enviados */}
            <Card>
              <CardHeader>
                <CardTitle>Dados Enviados ao PNCP</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Plano de Contratações Anual (PCA)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Dados da Contratação/Compra
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Itens da Licitação
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Documentos (Edital, TR, ETP)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Resultado por Item
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Ata de Registro de Preços
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Contratos e Aditivos
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Gerenciar Itens do PCA */}
      <Dialog open={modalRetificarItem} onOpenChange={setModalRetificarItem}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Itens do PCA {pcaSelecionado?.ano_exercicio}</DialogTitle>
            <DialogDescription>
              Retifique ou exclua itens do PCA no PNCP. Sequencial: {pcaSelecionado?.sequencial_pncp}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            {(pcaSelecionado as any)?.itens?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Item {item.numero_item}</Badge>
                    <Badge variant="secondary">{item.categoria}</Badge>
                  </div>
                  <p className="text-sm mt-1 line-clamp-2">{item.descricao_objeto}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    Qtd: {item.quantidade_estimada} | 
                    Valor Unit: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario_estimado || 0)} |
                    Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_estimado || 0)}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => retificarItemPca(item)}
                    disabled={enviando === item.id}
                  >
                    {enviando === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit className="w-4 h-4" />}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-red-600"
                    onClick={() => excluirItemPcaPncp(item)}
                    disabled={enviando === item.id}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {!(pcaSelecionado as any)?.itens?.length && (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum item encontrado
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRetificarItem(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
