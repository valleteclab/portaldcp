'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useModulosOrgao, ModuloSistema } from '@/hooks/useModulosOrgao'
import { ModuleGuard } from '@/components/ModuleGuard'
import { 
  Plus, 
  Bot,
  FileText, 
  Calendar, 
  DollarSign,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Building,
  Eye,
  Edit,
  Send,
  ClipboardList,
  Warehouse,
  Upload,
  X,
  Loader2,
  Lock,
  ChevronDown,
  ClipboardCheck,
  Package,
  FileCheck,
  Info,
  MessageCircle,
  Building2,
  Trash2
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ItemContrato {
  id: string
  numero_item: number
  descricao: string
  quantidade_contratada: number
  quantidade_empenhada: number
  quantidade_entregue: number
  saldo_disponivel: number
  valor_unitario: number
  valor_total: number
  unidade_medida: string
}

interface Contrato {
  id: string
  numero_contrato: string
  ano: number
  tipo: string
  categoria: string
  status: string
  objeto: string
  valor_inicial: number
  valor_global: number
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  numero_processo: string
  enviado_pncp: boolean
  fiscal_nome: string
  gestor_nome: string
  saldo_total_em_valor?: number
  itens?: ItemContrato[]
  total_itens?: number
  licitacao?: { id: string; numero_processo: string; modalidade: string }
  modalidade_licitacao?: string
  modalidade_execucao?: string
  fornecedor_telefone?: string | null
}

import { API_URL, authFetch } from '@/lib/api'
import { formatarModalidadeLicitacao } from '@/lib/utils'

const STATUS_CONTRATO = {
  'RASCUNHO': { label: 'Rascunho', cor: 'bg-slate-100 text-slate-800', icon: FileText },
  'AGUARDANDO_LIBERACAO': { label: 'Aguardando Liberação', cor: 'bg-amber-100 text-amber-800', icon: Lock },
  'VIGENTE': { label: 'Vigente', cor: 'bg-green-100 text-green-800', icon: CheckCircle },
  'ENCERRADO': { label: 'Encerrado', cor: 'bg-gray-100 text-gray-800', icon: Clock },
  'VENCIDO': { label: 'Vencido', cor: 'bg-orange-100 text-orange-800', icon: Clock },
  'RESCINDIDO': { label: 'Rescindido', cor: 'bg-red-100 text-red-800', icon: AlertTriangle },
  'SUSPENSO': { label: 'Suspenso', cor: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
  'CANCELADO': { label: 'Cancelado', cor: 'bg-red-100 text-red-800', icon: AlertTriangle }
}

function mesAnteriorYYYYMM(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatarMesReferencia(ym: string): string {
  const [y, m] = ym.split('-')
  if (!m || !y) return ym
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const idx = parseInt(m, 10) - 1
  return idx >= 0 && idx < 12 ? `${meses[idx]}/${y}` : ym
}

/** Gera lista dos últimos 24 meses em formato YYYY-MM para seleção */
function opcoesMesesReferencia(): { value: string; label: string }[] {
  const hoje = new Date()
  const opcoes: { value: string; label: string }[] = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const value = `${y}-${m}`
    opcoes.push({ value, label: formatarMesReferencia(value) })
  }
  return opcoes
}

function ContratosOrgaoPageContent() {
  const { temAcesso } = useModulosOrgao()
  const temIaContratos = temAcesso(ModuloSistema.IA_CONTRATOS)
  const temAlmoxarifado = temAcesso(ModuloSistema.ALMOXARIFADO)
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [contratosAVencer, setContratosAVencer] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    status: '',
    ano: ''
  })

  // Estados para modal Solicitar medição
  const [solicitarContrato, setSolicitarContrato] = useState<Contrato | null>(null)
  const [mesReferencia, setMesReferencia] = useState(mesAnteriorYYYYMM)
  const [mensagemSolicitar, setMensagemSolicitar] = useState('')
  const [loadingSolicitar, setLoadingSolicitar] = useState(false)
  const [erroSolicitar, setErroSolicitar] = useState<string | null>(null)
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(false)
  const [whatsappConfigurado, setWhatsappConfigurado] = useState(false)
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState('')

  // Estados para importação
  const [showImportar, setShowImportar] = useState(false)
  const [contratosImportar, setContratosImportar] = useState<any[]>([])
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<any>(null)
  const [abaImportacao, setAbaImportacao] = useState<'upload' | 'script'>('upload')
  const [scriptCopiado, setScriptCopiado] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  // Estados para exclusão de contrato
  const [contratoParaExcluir, setContratoParaExcluir] = useState<Contrato | null>(null)
  const [showConfirmarExclusao, setShowConfirmarExclusao] = useState(false)
  const [excluindoContrato, setExcluindoContrato] = useState(false)
  const [podeExcluirContratos, setPodeExcluirContratos] = useState(false)

  const scriptExtracao = `// Script de Extração - Portal de Transparência (v4)
// Cole no Console (F12) na página de contratos do portal
// Extrai APENAS contratos VIGENTES
if (window._extraindoContratos) { console.log('JÁ ESTÁ EXECUTANDO! Aguarde...'); } else {
window._extraindoContratos = true;
(async () => {
  try {
    const todos = [];
    const hoje = new Date();
    function parseDataBR(s) {
      if (!s) return null;
      const p = s.trim().split('/');
      return p.length === 3 ? new Date(p[2], p[1]-1, p[0]) : null;
    }
    function vigente(v) {
      if (!v) return false;
      const p = v.split(/\\s*[àa]\\s*/i);
      if (p.length < 2) return false;
      const d = parseDataBR(p[1]);
      return d ? d >= hoje : false;
    }
    function extrair(doc) {
      const t = doc.querySelector('table');
      if (!t) return [];
      const rows = t.querySelectorAll('tr');
      const r = [];
      for (let i = 1; i < rows.length; i++) {
        const c = rows[i].querySelectorAll('td');
        if (c.length < 6) continue;
        const vig = (c[4]?.textContent||'').trim();
        if (!vigente(vig)) continue;
        r.push({ n:(c[0]?.textContent||'').trim(), 'cpf-cnpj':(c[1]?.textContent||'').trim(), favorecido:(c[2]?.textContent||'').trim(), objeto:(c[3]?.textContent||'').trim(), vigencia:vig, fiscal:(c[5]?.textContent||'').trim(), valor:(c[6]?.textContent||'').trim() });
      }
      return r;
    }
    // Página 1
    todos.push(...extrair(document));
    console.log('Pág 1: ' + todos.length + ' vigentes');
    // Descobrir páginas
    let maxPag = 1;
    document.querySelectorAll('a[href*="offset="]').forEach(a => {
      const m = a.href.match(/offset=(\\d+)/);
      if (m) maxPag = Math.max(maxPag, parseInt(m[1]));
    });
    console.log('Páginas: ' + maxPag);
    // Percorrer
    for (let p = 2; p <= maxPag; p++) {
      try {
        const r = await fetch(location.pathname + '?offset=' + p);
        const h = await r.text();
        const d = extrair(new DOMParser().parseFromString(h, 'text/html'));
        todos.push(...d);
        console.log('Pág ' + p + ': +' + d.length + ' (total: ' + todos.length + ')');
        await new Promise(r => setTimeout(r, 1000));
      } catch(e) { console.error('Erro pág ' + p, e); break; }
    }
    console.log('\\n=== PRONTO! ' + todos.length + ' contratos vigentes ===');
    console.log('Baixando arquivo JSON...');
    const json = JSON.stringify(todos, null, 2);
    const blob = new Blob([json], {type: 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'contratos_vigentes.json';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { link.remove(); URL.revokeObjectURL(link.href); }, 1000);
    console.log('Arquivo "contratos_vigentes.json" baixado!');
  } finally { window._extraindoContratos = false; }
})();
}`

  const copiarScript = () => {
    navigator.clipboard.writeText(scriptExtracao)
    setScriptCopiado(true)
    setTimeout(() => setScriptCopiado(false), 3000)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        if (Array.isArray(json)) {
          setContratosImportar(json)
          setResultadoImportacao(null)
        } else {
          alert('O arquivo deve conter um array de contratos.')
        }
      } catch {
        alert('Arquivo JSON inválido.')
      }
    }
    reader.readAsText(file)
  }

  const confirmarImportacao = async () => {
    const orgaoData = localStorage.getItem('orgao')
    if (!orgaoData) return
    const orgao = JSON.parse(orgaoData)

    setImportando(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgaoId: orgao.id, contratos: contratosImportar })
      })
      if (res.ok) {
        const resultado = await res.json()
        setResultadoImportacao(resultado)
        carregarDados()
      } else {
        alert('Erro ao importar contratos.')
      }
    } catch (error) {
      console.error('Erro na importação:', error)
      alert('Erro ao importar contratos.')
    } finally {
      setImportando(false)
    }
  }

  const parseValorBR = (v: string) => {
    const limpo = (v || '0').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
    return parseFloat(limpo) || 0
  }

  const [estatisticas, setEstatisticas] = useState({
    vigentes: 0,
    encerrados: 0,
    valorTotal: 0,
    aVencer30Dias: 0
  })

  useEffect(() => {
    carregarDados()
    verificarWhatsapp()
    verificarPermissaoExclusao()
  }, [])

  const verificarPermissaoExclusao = () => {
    // Verifica se usuário é admin ou tem permissão de excluir contratos
    const userStr = localStorage.getItem('usuario')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        // Admin sempre pode excluir
        if (user.role === 'ADMIN' || user.tipo === 'ADMIN') {
          setPodeExcluirContratos(true)
          return
        }
        // Verifica permissão específica
        if (user.pode_excluir_contratos) {
          setPodeExcluirContratos(true)
        }
      } catch {
        // ignora erro
      }
    }
  }

  const verificarWhatsapp = async () => {
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return
      const orgao = JSON.parse(orgaoData)
      const res = await authFetch(`${API_URL}/api/orgaos/${orgao.id}/whatsapp-config`)
      if (res.ok) {
        const data = await res.json()
        setWhatsappConfigurado(!!(data.whatsapp_instance_id || data.configurado))
      }
    } catch {
      setWhatsappConfigurado(false)
    }
  }

  const carregarDados = async () => {
    setLoading(true)
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return

      const orgao = JSON.parse(orgaoData)

      const [contratosRes, aVencerRes, statsRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos?orgaoId=${orgao.id}`),
        authFetch(`${API_URL}/api/contratos/estatisticas/a-vencer?orgaoId=${orgao.id}&dias=30`),
        authFetch(`${API_URL}/api/contratos/estatisticas/status?orgaoId=${orgao.id}`)
      ])

      if (contratosRes.ok) {
        setContratos(await contratosRes.json())
      }
      if (aVencerRes.ok) {
        setContratosAVencer(await aVencerRes.json())
      }
      if (statsRes.ok) {
        const stats = await statsRes.json()
        setEstatisticas({
          vigentes: stats.VIGENTE || 0,
          encerrados: stats.ENCERRADO || 0,
          valorTotal: 0,
          aVencer30Dias: contratosAVencer.length
        })
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number | string) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0))
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

  const enviarSolicitacao = async () => {
    if (!solicitarContrato) return
    setErroSolicitar(null)
    setLoadingSolicitar(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${solicitarContrato.id}/medicoes/solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes_referencia: mesReferencia,
          mensagem: mensagemSolicitar.trim() || undefined,
          enviar_whatsapp: enviarWhatsapp,
          telefone_whatsapp: enviarWhatsapp && telefoneWhatsapp.trim() ? telefoneWhatsapp.trim() : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Erro ${res.status}`)
      }
      setSolicitarContrato(null)
      setMensagemSolicitar('')
      setMesReferencia(mesAnteriorYYYYMM())
      setEnviarWhatsapp(false)
      setTelefoneWhatsapp('')
      carregarDados()
    } catch (e) {
      setErroSolicitar(e instanceof Error ? e.message : 'Erro ao enviar')
    }
    setLoadingSolicitar(false)
  }

  const handleExcluirContrato = (contrato: Contrato) => {
    setContratoParaExcluir(contrato)
    setShowConfirmarExclusao(true)
  }

  const confirmarExclusaoContrato = async () => {
    if (!contratoParaExcluir) return
    setExcluindoContrato(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoParaExcluir.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setShowConfirmarExclusao(false)
        setContratoParaExcluir(null)
        carregarDados()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.message || 'Erro ao excluir contrato')
      }
    } catch (error) {
      console.error('Erro ao excluir contrato:', error)
      alert('Erro ao excluir contrato')
    } finally {
      setExcluindoContrato(false)
    }
  }

  const contratosFiltrados = contratos.filter(contrato => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!contrato.objeto.toLowerCase().includes(busca) && 
          !contrato.numero_contrato.toLowerCase().includes(busca) &&
          !contrato.fornecedor_razao_social.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.status && contrato.status !== filtros.status) return false
    if (filtros.ano && contrato.ano !== parseInt(filtros.ano)) return false
    return true
  })

  const anos = [...new Set(contratos.map(c => c.ano))].sort((a, b) => b - a)

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando contratos...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Contratos</h1>
          <p className="text-gray-600">Gerencie os contratos do órgão</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setShowImportar(true); setContratosImportar([]); setResultadoImportacao(null) }}>
            <Upload className="w-4 h-4 mr-2" />
            Importar JSON
          </Button>
          <Button variant="outline" asChild>
            <Link href="/orgao/contratos/importar-portal-transparencia">
              <Building2 className="w-4 h-4 mr-2" />
              Importar do Portal
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/orgao/contratos/novo?from=licitacao">
              <FileText className="w-4 h-4 mr-2" />
              Novo a partir de Licitação
            </Link>
          </Button>
          {temIaContratos && (
            <Button variant="outline" asChild>
              <Link href="/orgao/contratos/importar-ia">
                <Bot className="w-4 h-4 mr-2" />
                Importar com IA
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/orgao/contratos/novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Contrato
            </Link>
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Contratos Vigentes</p>
                <p className="text-2xl font-bold text-green-600">{estatisticas.vigentes}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Encerrados</p>
                <p className="text-2xl font-bold">{estatisticas.encerrados}</p>
              </div>
              <Clock className="w-8 h-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={contratosAVencer.length > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">A Vencer (30 dias)</p>
                <p className="text-2xl font-bold text-yellow-600">{contratosAVencer.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total de Contratos</p>
                <p className="text-2xl font-bold">{contratos.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas de Vencimento */}
      {contratosAVencer.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="w-5 h-5" />
              Contratos a Vencer nos Próximos 30 Dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contratosAVencer.slice(0, 5).map(contrato => {
                const dias = calcularDiasRestantes(contrato.data_vigencia_fim)
                return (
                  <div key={contrato.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div>
                      <p className="font-medium">{contrato.numero_contrato}</p>
                      <p className="text-sm text-gray-600">{contrato.fornecedor_razao_social}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={dias <= 7 ? 'destructive' : 'secondary'}>
                        {dias} dias restantes
                      </Badge>
                      <p className="text-sm text-gray-500 mt-1">
                        Vence em {formatarData(contrato.data_vigencia_fim)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instruções: O que você pode fazer */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4 pb-4">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-2 w-full text-left"
          >
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-sm font-medium text-gray-900 flex-1">O que você pode fazer nesta página</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showHelp ? 'rotate-180' : ''}`} />
          </button>
          {showHelp && (
            <div className="mt-3 text-sm text-gray-700 space-y-1 pl-6">
              <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                <li><strong>Ver</strong> (ícone de olho) — Abre os detalhes do contrato</li>
                <li><strong>Editar</strong> (ícone de lápis) — Edita o contrato</li>
                <li><strong>Mais ações</strong> (▼) — Menu com ações rápidas conforme o tipo de contrato:
                  <ul className="list-[circle] list-inside ml-4 mt-1 space-y-0.5">
                    <li><em>Solicitar medição</em> — Contratos por medição vigentes: abre modal para solicitar envio ao fornecedor (escolha o mês)</li>
                    <li><em>Ver medições</em> — Contratos por medição: vai direto para a aba de medições</li>
                    <li><em>Nova requisição</em> — Contratos com itens (Almoxarifado): cria pedido/requisição</li>
                    <li><em>Criar ordem de serviço</em> — Contratos por OS vigentes: abre a aba de ordens de serviço</li>
                    <li><em>Requisições</em> — Lista as requisições deste contrato</li>
                  </ul>
                </li>
                <li><strong>Enviar ao PNCP</strong> (ícone de avião) — Envia o contrato ao Portal Nacional de Contratações Públicas</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtros e Lista */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Contratos</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar..."
                  className="pl-10 w-64"
                  value={filtros.busca}
                  onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                />
              </div>
              <Select value={filtros.status || 'all'} onValueChange={(v) => setFiltros({ ...filtros, status: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_CONTRATO).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtros.ano || 'all'} onValueChange={(v) => setFiltros({ ...filtros, ano: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {anos.map(ano => (
                    <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contratosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhum contrato encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-2 w-24">Contrato</th>
                    <th className="text-left py-3 px-2 w-48">Fornecedor</th>
                    <th className="text-left py-3 px-2 w-2/5">Objeto</th>
                    <th className="text-center py-3 px-2 w-28">Tipo Licitação</th>
                    <th className="text-right py-3 px-2 w-32">Valor</th>
                    <th className="text-center py-3 px-2 w-28">Vigência</th>
                    <th className="text-center py-3 px-2 w-28">Status</th>
                    <th className="text-center py-3 px-2 w-16">PNCP</th>
                    <th className="text-center py-3 px-2 w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contratosFiltrados.map((contrato) => {
                    const StatusIcon = STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.icon || Clock
                    const diasRestantes = calcularDiasRestantes(contrato.data_vigencia_fim)
                    const temItens = (contrato.total_itens ?? contrato.itens?.length ?? 0) > 0
                    const hasAcoesRapidas =
                      (contrato.modalidade_execucao === 'MEDICAO' && contrato.status === 'VIGENTE') ||
                      contrato.modalidade_execucao === 'MEDICAO' ||
                      (temAlmoxarifado && contrato.status === 'VIGENTE' && (contrato.modalidade_execucao === 'ITEM_QUANTIDADE' || temItens)) ||
                      (contrato.modalidade_execucao === 'ORDEM_SERVICO' && contrato.status === 'VIGENTE') ||
                      (temAlmoxarifado && contrato.status === 'VIGENTE')

                    return (
                      <tr key={contrato.id} className="border-b hover:bg-gray-50 align-top">
                        <td className="py-3 px-2 align-top">
                          <p className="font-medium">{contrato.numero_contrato}</p>
                          <p className="text-xs text-gray-500">{contrato.numero_processo}</p>
                        </td>
                        <td className="py-3 px-2 align-top">
                          <p className="font-medium">{contrato.fornecedor_razao_social}</p>
                          <p className="text-xs text-gray-500">{contrato.fornecedor_cnpj}</p>
                        </td>
                        <td className="py-3 px-2 align-top min-w-[200px]">
                          <p className="text-sm text-gray-700 whitespace-normal break-words">{contrato.objeto}</p>
                        </td>
                        <td className="py-3 px-2 text-center align-top">
                          <span className="text-sm text-gray-600">{formatarModalidadeLicitacao(contrato.licitacao?.modalidade || contrato.modalidade_licitacao)}</span>
                        </td>
                        <td className="py-3 px-2 text-right align-top">
                          <div className="font-medium">{formatarMoeda(contrato.valor_global)}</div>
                          {contrato.saldo_total_em_valor !== undefined && (
                            <div className="text-xs text-gray-500">
                              Saldo: {formatarMoeda(contrato.saldo_total_em_valor)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center align-top">
                          <p className="text-sm">{formatarData(contrato.data_vigencia_fim)}</p>
                          {contrato.status === 'VIGENTE' && diasRestantes <= 30 && (
                            <Badge variant="secondary" className="text-xs">
                              {diasRestantes}d
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center align-top">
                          <Badge className={STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.cor || ''}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.label || contrato.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-center align-top">
                          {contrato.enviado_pncp ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-500 mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-2 text-center align-top">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" asChild title="Ver detalhes">
                              <Link href={`/orgao/contratos/${contrato.id}`}>
                                <Eye className="w-4 h-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild title="Editar">
                              <Link href={`/orgao/contratos/${contrato.id}/editar`}>
                                <Edit className="w-4 h-4" />
                              </Link>
                            </Button>
                            {hasAcoesRapidas && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" title="Mais ações">
                                  <ChevronDown className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[200px]">
                                {contrato.modalidade_execucao === 'MEDICAO' && contrato.status === 'VIGENTE' && (
                                  <DropdownMenuItem onClick={() => { setSolicitarContrato(contrato); setMesReferencia(mesAnteriorYYYYMM()); setMensagemSolicitar(''); setErroSolicitar(null); setEnviarWhatsapp(false); setTelefoneWhatsapp(contrato.fornecedor_telefone || '') }}>
                                    <Send className="w-4 h-4 mr-2" />
                                    Solicitar medição
                                  </DropdownMenuItem>
                                )}
                                {contrato.modalidade_execucao === 'MEDICAO' && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/orgao/contratos/${contrato.id}?tab=medicao`}>
                                      <ClipboardCheck className="w-4 h-4 mr-2" />
                                      Ver medições
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                {temAlmoxarifado && contrato.status === 'VIGENTE' && (contrato.modalidade_execucao === 'ITEM_QUANTIDADE' || (contrato.total_itens ?? contrato.itens?.length ?? 0) > 0) && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/orgao/almoxarifado/requisicoes/nova?contrato=${contrato.id}`}>
                                      <Package className="w-4 h-4 mr-2" />
                                      Nova requisição
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                {contrato.modalidade_execucao === 'ORDEM_SERVICO' && contrato.status === 'VIGENTE' && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/orgao/contratos/${contrato.id}?tab=ordens-servico`}>
                                      <FileCheck className="w-4 h-4 mr-2" />
                                      Criar ordem de serviço
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                {temAlmoxarifado && contrato.status === 'VIGENTE' && (
                                  <DropdownMenuItem asChild>
                                    <Link href={`/orgao/almoxarifado/requisicoes?contrato=${contrato.id}`} className="text-green-600">
                                      <ClipboardList className="w-4 h-4 mr-2" />
                                      Requisições
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            )}
                            {!contrato.enviado_pncp && (
                              <Button variant="ghost" size="sm" title="Enviar ao PNCP">
                                <Send className="w-4 h-4" />
                              </Button>
                            )}
                            {podeExcluirContratos && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                title="Excluir contrato"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleExcluirContrato(contrato)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
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

      {/* Modal Solicitar medição */}
      <Dialog open={!!solicitarContrato} onOpenChange={(open) => !open && setSolicitarContrato(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" />
              Solicitar envio de medição
            </DialogTitle>
          </DialogHeader>
          {solicitarContrato && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Contrato <strong>{solicitarContrato.numero_contrato}</strong> — {solicitarContrato.fornecedor_razao_social}
              </p>
              <div>
                <Label>Mês de referência</Label>
                <Select value={mesReferencia} onValueChange={setMesReferencia}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesMesesReferencia().map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="msg-solicitar">Mensagem ao fornecedor (opcional)</Label>
                <Textarea
                  id="msg-solicitar"
                  value={mensagemSolicitar}
                  onChange={(e) => setMensagemSolicitar(e.target.value)}
                  placeholder="Ex.: Precisamos da medição para fechamento do mês..."
                  className="mt-1 min-h-[80px]"
                  rows={3}
                />
              </div>

              {/* WhatsApp */}
              {whatsappConfigurado && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enviarWhatsapp}
                      onChange={(e) => setEnviarWhatsapp(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600"
                    />
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-700">Notificar via WhatsApp</span>
                  </label>

                  {enviarWhatsapp && (
                    <div className="space-y-3">
                      {/* Campo de número */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-medium text-gray-700">Número que receberá a mensagem:</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="tel"
                            value={telefoneWhatsapp}
                            onChange={(e) => setTelefoneWhatsapp(e.target.value)}
                            placeholder="Ex: 5577999999999"
                            className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        {!telefoneWhatsapp.trim() && (
                          <p className="text-xs text-amber-600">⚠️ Fornecedor sem telefone cadastrado. Informe o número manualmente.</p>
                        )}
                        {telefoneWhatsapp.trim() && (
                          <p className="text-xs text-gray-500">Formato: código do país + DDD + número (ex: 5577999999999)</p>
                        )}
                      </div>

                      {/* Prévia da mensagem */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-medium text-green-800">Prévia da mensagem que será enviada:</p>
                        <div className="bg-white rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap border border-green-100">
                          {`📋 *Solicitação de Medição – Contrato ${solicitarContrato?.numero_contrato}*\n\nSolicitamos o envio da medição referente a ${formatarMesReferencia(mesReferencia)}.${mensagemSolicitar.trim() ? `\n\nMensagem do fiscal: ${mensagemSolicitar.trim()}` : ''}`}
                        </div>
                        <div className="flex items-center gap-2 bg-green-600 text-white rounded-lg px-3 py-2 text-xs font-medium w-fit">
                          <MessageCircle className="w-3.5 h-3.5" />
                          Acessar Portal de Medições
                        </div>
                        <p className="text-xs text-green-700">O botão acima abrirá o link direto para a página de medições do fornecedor.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {erroSolicitar && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{erroSolicitar}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSolicitarContrato(null)} disabled={loadingSolicitar}>
                  Cancelar
                </Button>
                <Button onClick={enviarSolicitacao} disabled={loadingSolicitar}>
                  {loadingSolicitar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Enviar solicitação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Importação */}
      <Dialog open={showImportar} onOpenChange={setShowImportar}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Importar Contratos de Sistema Externo
            </DialogTitle>
          </DialogHeader>

          {!resultadoImportacao ? (
            <div className="space-y-4">
              {/* Abas */}
              <div className="flex border-b">
                <button
                  onClick={() => setAbaImportacao('upload')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${abaImportacao === 'upload' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <Upload className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Upload de Arquivo JSON
                </button>
                <button
                  onClick={() => setAbaImportacao('script')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${abaImportacao === 'script' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Extrair do Portal de Transparencia
                </button>
              </div>

              {abaImportacao === 'upload' ? (
                <>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                    <p className="text-sm text-gray-600 mb-2">Selecione o arquivo JSON exportado do sistema externo</p>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="block mx-auto text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-800 mb-2">Como extrair todos os contratos do Portal de Transparencia:</p>
                    <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
                      <li>Acesse a pagina de <strong>Contratos</strong> no Portal de Transparencia do orgao</li>
                      <li>Pressione <strong>F12</strong> para abrir as Ferramentas do Desenvolvedor</li>
                      <li>Clique na aba <strong>Console</strong></li>
                      <li>Copie o script abaixo e cole no console</li>
                      <li>Pressione <strong>Enter</strong> - o script vai percorrer todas as paginas automaticamente</li>
                      <li>Ao finalizar, um arquivo JSON sera baixado automaticamente</li>
                      <li>Volte aqui e faca o upload do arquivo na aba <strong>"Upload de Arquivo JSON"</strong></li>
                    </ol>
                  </div>

                  <div className="relative">
                    <div className="flex items-center justify-between bg-gray-800 text-gray-200 px-4 py-2 rounded-t-lg">
                      <span className="text-xs font-mono">Script de Extracao</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-gray-300 hover:text-white h-7 text-xs"
                        onClick={copiarScript}
                      >
                        {scriptCopiado ? (
                          <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Copiado!</>
                        ) : (
                          <><ClipboardList className="w-3.5 h-3.5 mr-1" /> Copiar Script</>
                        )}
                      </Button>
                    </div>
                    <pre className="bg-gray-900 text-green-400 p-4 rounded-b-lg text-xs overflow-x-auto max-h-[300px] overflow-y-auto font-mono">
                      {scriptExtracao}
                    </pre>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-800">
                      <strong>Nota:</strong> O script percorre todas as paginas do portal automaticamente (pode levar alguns minutos dependendo da quantidade de contratos). 
                      Ao finalizar, um arquivo JSON com todos os contratos sera baixado. Depois, use a aba "Upload de Arquivo JSON" para importar.
                    </p>
                  </div>
                </div>
              )}

              {contratosImportar.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {contratosImportar.length} contrato(s) encontrado(s) no arquivo
                    </p>
                    <Button onClick={confirmarImportacao} disabled={importando}>
                      {importando ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importando...</>
                      ) : (
                        <><Upload className="w-4 h-4 mr-2" /> Confirmar Importacao</>
                      )}
                    </Button>
                  </div>

                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">No</th>
                          <th className="px-3 py-2 text-left">Favorecido</th>
                          <th className="px-3 py-2 text-left">CNPJ</th>
                          <th className="px-3 py-2 text-left">Vigencia</th>
                          <th className="px-3 py-2 text-left">Fiscal</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {contratosImportar.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">{(c.n || c['n'] || '').replace(/-Contrato$/i, '')}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate" title={c.favorecido}>{c.favorecido}</td>
                            <td className="px-3 py-2 font-mono text-xs">{c['cpf-cnpj'] || c['cpf/cnpj'] || ''}</td>
                            <td className="px-3 py-2 text-xs">{c.vigencia}</td>
                            <td className="px-3 py-2 text-xs">{c.fiscal}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatarMoeda(parseValorBR(c.valor))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-medium">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right">Total:</td>
                          <td className="px-3 py-2 text-right">
                            {formatarMoeda(contratosImportar.reduce((acc, c) => acc + parseValorBR(c.valor), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{resultadoImportacao.importados}</p>
                    <p className="text-sm text-gray-500">Importados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{resultadoImportacao.duplicados}</p>
                    <p className="text-sm text-gray-500">Duplicados (ignorados)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-red-600">{resultadoImportacao.erros?.length || 0}</p>
                    <p className="text-sm text-gray-500">Erros</p>
                  </CardContent>
                </Card>
              </div>

              {resultadoImportacao.erros?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 mb-2">Erros encontrados:</p>
                  {resultadoImportacao.erros.map((e: any, i: number) => (
                    <p key={i} className="text-xs text-red-600">- {e.numero}: {e.erro}</p>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setShowImportar(false)}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={showConfirmarExclusao} onOpenChange={setShowConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato{' '}
              <strong>{contratoParaExcluir?.numero_contrato}</strong> - {contratoParaExcluir?.fornecedor_razao_social}?
              <br /><br />
              <span className="text-red-600 font-medium">
                Esta ação não pode ser desfeita. Todos os dados vinculados (itens, medições, documentos) serão permanentemente excluídos.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoContrato}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusaoContrato}
              disabled={excluindoContrato}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {excluindoContrato ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Sim, excluir</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function ContratosOrgaoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.CONTRATOS}>
      <ContratosOrgaoPageContent />
    </ModuleGuard>
  )
}
