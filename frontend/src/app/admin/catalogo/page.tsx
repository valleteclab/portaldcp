'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Package,
  Wrench,
  RefreshCw,
  Search,
  Loader2,
  Database,
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  FolderTree
} from 'lucide-react'

import { API_URL, adminFetch } from '@/lib/api'

interface ItemCatalogo {
  id: string
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  unidade_padrao: string
  valor_referencia?: number
  classificacao?: {
    id: string
    codigo: string
    nome: string
  }
  ativo: boolean
}

interface Classificacao {
  id: string
  codigo: string
  nome: string
  tipo: 'MATERIAL' | 'SERVICO'
  ativo: boolean
}

interface Estatisticas {
  totalClassificacoes: number
  totalItens: number
  classificacoesPorTipo: { tipo: string; total: number }[]
}

interface ResultadoMigracao {
  migrados: number
  jaExistentes: number
  erros: number
  detalhes: { codigo: string; descricao: string; status: string }[]
}

export default function CatalogoAdminPage() {
  const [loading, setLoading] = useState(true)
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null)
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([])
  const [itens, setItens] = useState<ItemCatalogo[]>([])
  const [termoBusca, setTermoBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | 'MATERIAL' | 'SERVICO'>('TODOS')
  
  // Estados para migração
  const [migrando, setMigrando] = useState(false)
  const [resultadoMigracao, setResultadoMigracao] = useState<ResultadoMigracao | null>(null)
  const [showResultado, setShowResultado] = useState(false)
  
  // Estados para seed
  const [executandoSeed, setExecutandoSeed] = useState(false)

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      // Carregar estatísticas
      const resEstat = await adminFetch(`${API_URL}/api/catalogo-proprio/estatisticas`)
      if (resEstat.ok) {
        const data = await resEstat.json()
        setEstatisticas(data)
      }

      // Carregar classificações
      const resClass = await adminFetch(`${API_URL}/api/catalogo-proprio/classificacoes?limite=100`)
      if (resClass.ok) {
        const data = await resClass.json()
        setClassificacoes(data)
      }

      // Carregar itens
      const resItens = await adminFetch(`${API_URL}/api/catalogo-proprio/itens?limite=100`)
      if (resItens.ok) {
        const data = await resItens.json()
        setItens(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const executarMigracao = async () => {
    setMigrando(true)
    setResultadoMigracao(null)
    try {
      const response = await adminFetch(`${API_URL}/api/catalogo-proprio/migrar-itens-pca`, {
        method: 'POST'
      })
      
      if (response.ok) {
        const resultado = await response.json()
        setResultadoMigracao(resultado)
        setShowResultado(true)
        // Recarregar dados após migração
        await carregarDados()
      } else {
        const error = await response.json()
        alert(`Erro na migração: ${error.message || 'Erro desconhecido'}`)
      }
    } catch (error: any) {
      console.error('Erro na migração:', error)
      alert(`Erro na migração: ${error.message}`)
    } finally {
      setMigrando(false)
    }
  }

  const executarSeed = async () => {
    setExecutandoSeed(true)
    try {
      const response = await adminFetch(`${API_URL}/api/catalogo-proprio/seed`, {
        method: 'POST'
      })
      
      if (response.ok) {
        const resultado = await response.json()
        alert(`✅ Seed executado!\n\nClassificações criadas: ${resultado.classificacoes}\nJá existentes: ${resultado.existentes}`)
        await carregarDados()
      } else {
        const error = await response.json()
        alert(`Erro no seed: ${error.message || 'Erro desconhecido'}`)
      }
    } catch (error: any) {
      console.error('Erro no seed:', error)
      alert(`Erro no seed: ${error.message}`)
    } finally {
      setExecutandoSeed(false)
    }
  }

  const itensFiltrados = itens.filter(item => {
    const matchTermo = !termoBusca || 
      item.descricao.toLowerCase().includes(termoBusca.toLowerCase()) ||
      item.codigo.toLowerCase().includes(termoBusca.toLowerCase())
    const matchTipo = tipoFiltro === 'TODOS' || item.tipo === tipoFiltro
    return matchTermo && matchTipo
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="w-8 h-8 text-blue-600" />
            Catálogo de Itens
          </h1>
          <p className="text-gray-500 mt-1">
            Gerencie o catálogo global de materiais e serviços
          </p>
        </div>
        <Button onClick={carregarDados} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total de Classificações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-purple-600" />
              {estatisticas?.totalClassificacoes || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total de Itens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              {estatisticas?.totalItens || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Materiais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-green-600" />
              {estatisticas?.classificacoesPorTipo?.find(c => c.tipo === 'MATERIAL')?.total || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Serviços
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="w-5 h-5 text-orange-600" />
              {estatisticas?.classificacoesPorTipo?.find(c => c.tipo === 'SERVICO')?.total || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ações de Administração */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Ações de Administração
          </CardTitle>
          <CardDescription>
            Ferramentas para gerenciar o catálogo global
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Botão de Migração */}
            <div className="p-4 border rounded-lg bg-blue-50">
              <h3 className="font-semibold text-blue-800 mb-2">
                Migrar Itens do PCA para Catálogo
              </h3>
              <p className="text-sm text-blue-600 mb-4">
                Importa todos os itens únicos dos PCAs existentes para o catálogo global.
                Os itens ficarão disponíveis para todos os órgãos.
              </p>
              <Button 
                onClick={executarMigracao} 
                disabled={migrando}
                className="w-full"
              >
                {migrando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Migrando...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                    Executar Migração
                  </>
                )}
              </Button>
            </div>

            {/* Botão de Seed */}
            <div className="p-4 border rounded-lg bg-purple-50">
              <h3 className="font-semibold text-purple-800 mb-2">
                Criar Classificações Padrão
              </h3>
              <p className="text-sm text-purple-600 mb-4">
                Cria as classificações padrão de materiais e serviços.
                Útil para inicializar o catálogo.
              </p>
              <Button 
                onClick={executarSeed} 
                disabled={executandoSeed}
                variant="outline"
                className="w-full"
              >
                {executandoSeed ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Executando...
                  </>
                ) : (
                  <>
                    <FolderTree className="w-4 h-4 mr-2" />
                    Criar Classificações
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classificações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="w-5 h-5" />
            Classificações ({classificacoes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {classificacoes.map(c => (
              <div key={c.id} className="p-3 border rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm text-gray-500">{c.codigo}</span>
                  <span className="mx-2">-</span>
                  <span className="text-sm">{c.nome}</span>
                </div>
                <Badge variant={c.tipo === 'MATERIAL' ? 'default' : 'secondary'}>
                  {c.tipo === 'MATERIAL' ? 'Material' : 'Serviço'}
                </Badge>
              </div>
            ))}
            {classificacoes.length === 0 && (
              <p className="text-gray-500 col-span-3 text-center py-4">
                Nenhuma classificação encontrada. Clique em "Criar Classificações" acima.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Itens do Catálogo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Itens do Catálogo ({itensFiltrados.length})
          </CardTitle>
          <CardDescription>
            <div className="flex items-center gap-4 mt-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar por código ou descrição..."
                  value={termoBusca}
                  onChange={(e) => setTermoBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={tipoFiltro === 'TODOS' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setTipoFiltro('TODOS')}
                >
                  Todos
                </Button>
                <Button 
                  variant={tipoFiltro === 'MATERIAL' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setTipoFiltro('MATERIAL')}
                >
                  <Package className="w-4 h-4 mr-1" />
                  Materiais
                </Button>
                <Button 
                  variant={tipoFiltro === 'SERVICO' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setTipoFiltro('SERVICO')}
                >
                  <Wrench className="w-4 h-4 mr-1" />
                  Serviços
                </Button>
              </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24">Tipo</TableHead>
                <TableHead className="w-24">Unidade</TableHead>
                <TableHead>Classificação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensFiltrados.slice(0, 50).map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                  <TableCell className="max-w-md truncate">{item.descricao}</TableCell>
                  <TableCell>
                    <Badge variant={item.tipo === 'MATERIAL' ? 'default' : 'secondary'}>
                      {item.tipo === 'MATERIAL' ? 'Material' : 'Serviço'}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.unidade_padrao}</TableCell>
                  <TableCell>
                    {item.classificacao ? (
                      <span className="text-sm">
                        <span className="font-mono text-gray-500">{item.classificacao.codigo}</span>
                        {' - '}
                        {item.classificacao.nome}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {itensFiltrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                    Nenhum item encontrado. Execute a migração para importar itens do PCA.
                  </TableCell>
                </TableRow>
              )}
              {itensFiltrados.length > 50 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-4">
                    Mostrando 50 de {itensFiltrados.length} itens. Use a busca para filtrar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Resultado da Migração */}
      <Dialog open={showResultado} onOpenChange={setShowResultado}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Resultado da Migração
            </DialogTitle>
            <DialogDescription>
              Resumo da migração de itens do PCA para o catálogo
            </DialogDescription>
          </DialogHeader>
          
          {resultadoMigracao && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-700">
                    {resultadoMigracao.migrados}
                  </div>
                  <div className="text-sm text-green-600">Migrados</div>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-700">
                    {resultadoMigracao.jaExistentes}
                  </div>
                  <div className="text-sm text-yellow-600">Já Existentes</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-700">
                    {resultadoMigracao.erros}
                  </div>
                  <div className="text-sm text-red-600">Erros</div>
                </div>
              </div>

              {/* Detalhes */}
              {resultadoMigracao.detalhes.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Detalhes:</h4>
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resultadoMigracao.detalhes.map((d, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm">{d.codigo}</TableCell>
                            <TableCell className="max-w-xs truncate">{d.descricao}</TableCell>
                            <TableCell>
                              {d.status === 'migrado' && (
                                <Badge className="bg-green-100 text-green-800">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Migrado
                                </Badge>
                              )}
                              {d.status === 'ja_existe' && (
                                <Badge className="bg-yellow-100 text-yellow-800">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Já existe
                                </Badge>
                              )}
                              {d.status.startsWith('erro') && (
                                <Badge className="bg-red-100 text-red-800">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Erro
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <Button onClick={() => setShowResultado(false)} className="w-full">
                Fechar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
