'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { 
  Plus, 
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
  Loader2
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useModulosOrgao } from '@/hooks/useModulosOrgao'

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
}

import { API_URL, authFetch } from '@/lib/api'

const STATUS_CONTRATO = {
  'VIGENTE': { label: 'Vigente', cor: 'bg-green-100 text-green-800', icon: CheckCircle },
  'ENCERRADO': { label: 'Encerrado', cor: 'bg-gray-100 text-gray-800', icon: Clock },
  'RESCINDIDO': { label: 'Rescindido', cor: 'bg-red-100 text-red-800', icon: AlertTriangle },
  'SUSPENSO': { label: 'Suspenso', cor: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle }
}

function ContratosOrgaoPageContent() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [contratosAVencer, setContratosAVencer] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    status: '',
    ano: ''
  })
  const { temAcesso } = useModulosOrgao()
  const temAlmoxarifado = temAcesso(ModuloSistema.ALMOXARIFADO)

  // Estados para importação
  const [showImportar, setShowImportar] = useState(false)
  const [contratosImportar, setContratosImportar] = useState<any[]>([])
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<any>(null)
  const [abaImportacao, setAbaImportacao] = useState<'upload' | 'script'>('upload')
  const [scriptCopiado, setScriptCopiado] = useState(false)

  const scriptExtracao = `// Script de Extração - Portal de Transparência
// Cole este script no Console do navegador (F12) enquanto estiver na página de contratos do portal
(async () => {
  const baseUrl = window.location.origin + window.location.pathname;
  const todos = [];
  let pagina = 1;
  let temProxima = true;
  
  console.log('Iniciando extração de contratos...');
  
  while (temProxima) {
    const url = pagina === 1 ? baseUrl : baseUrl + '?data_publicacao_inicial=&data_publicacao_final=&offset=' + pagina;
    console.log('Página ' + pagina + '...');
    
    try {
      const resp = await fetch(url);
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const tabela = doc.querySelector('table');
      
      if (!tabela) { console.log('Tabela não encontrada na página ' + pagina); break; }
      
      const linhas = tabela.querySelectorAll('tbody tr');
      if (linhas.length === 0) { temProxima = false; break; }
      
      const headers = Array.from(tabela.querySelectorAll('thead th')).map(th => th.textContent.trim().toLowerCase().replace(/[\\s\\/]+/g, '-'));
      
      linhas.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= headers.length) {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = cells[i]?.textContent?.trim() || ''; });
          todos.push(obj);
        }
      });
      
      // Verifica se tem próxima página
      const proxLink = doc.querySelector('a[href*="offset=' + (pagina + 1) + '"]');
      if (!proxLink || linhas.length < 30) { temProxima = false; }
      else { pagina++; }
      
      // Pequena pausa para não sobrecarregar o servidor
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error('Erro na página ' + pagina + ':', e);
      temProxima = false;
    }
  }
  
  console.log('Total extraído: ' + todos.length + ' contratos');
  
  // Gera e baixa o arquivo JSON
  const blob = new Blob([JSON.stringify(todos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'contratos_portal_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  
  console.log('Arquivo JSON baixado com sucesso!');
})();`

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
  }, [])

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

  const formatarMoeda = (valor: number) => {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-2">Contrato</th>
                    <th className="text-left py-3 px-2">Fornecedor</th>
                    <th className="text-left py-3 px-2">Objeto</th>
                    <th className="text-right py-3 px-2">Valor</th>
                    <th className="text-center py-3 px-2">Vigência</th>
                    <th className="text-center py-3 px-2">Status</th>
                    <th className="text-center py-3 px-2">PNCP</th>
                    <th className="text-center py-3 px-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contratosFiltrados.map((contrato) => {
                    const StatusIcon = STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.icon || Clock
                    const diasRestantes = calcularDiasRestantes(contrato.data_vigencia_fim)
                    
                    return (
                      <tr key={contrato.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <p className="font-medium">{contrato.numero_contrato}</p>
                          <p className="text-xs text-gray-500">{contrato.numero_processo}</p>
                        </td>
                        <td className="py-3 px-2">
                          <p className="font-medium">{contrato.fornecedor_razao_social}</p>
                          <p className="text-xs text-gray-500">{contrato.fornecedor_cnpj}</p>
                        </td>
                        <td className="py-3 px-2 max-w-xs truncate">{contrato.objeto}</td>
                        <td className="py-3 px-2 text-right">
                          <div className="font-medium">{formatarMoeda(contrato.valor_global)}</div>
                          {contrato.saldo_total_em_valor !== undefined && (
                            <div className="text-xs text-gray-500">
                              Saldo: {formatarMoeda(contrato.saldo_total_em_valor)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <p className="text-sm">{formatarData(contrato.data_vigencia_fim)}</p>
                          {contrato.status === 'VIGENTE' && diasRestantes <= 30 && (
                            <Badge variant="secondary" className="text-xs">
                              {diasRestantes}d
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <Badge className={STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.cor || ''}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.label || contrato.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {contrato.enviado_pncp ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-500 mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
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
                            {temAlmoxarifado && contrato.status === 'VIGENTE' && (
                              <Button variant="ghost" size="sm" asChild title="Requisições deste contrato" className="text-green-600 hover:text-green-700 hover:bg-green-50">
                                <Link href={`/orgao/almoxarifado/requisicoes?contrato=${contrato.id}`}>
                                  <ClipboardList className="w-4 h-4" />
                                </Link>
                              </Button>
                            )}
                            {!contrato.enviado_pncp && (
                              <Button variant="ghost" size="sm" title="Enviar ao PNCP">
                                <Send className="w-4 h-4" />
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
                            <td className="px-3 py-2 text-right font-medium">{c.valor}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-medium">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right">Total:</td>
                          <td className="px-3 py-2 text-right">
                            {contratosImportar.reduce((acc, c) => acc + parseValorBR(c.valor), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
