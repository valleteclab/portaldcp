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
  Search, 
  FileText, 
  Calendar, 
  Building2, 
  DollarSign,
  Filter,
  ExternalLink,
  Download,
  Clock,
  AlertCircle,
  Zap,
  FileCheck
} from 'lucide-react'

interface ContratacaoDireta {
  id: string
  numero_processo: string
  ano: number
  tipo: string
  status: string
  objeto: string
  justificativa: string
  valor_estimado: number
  valor_contratado: number
  data_publicacao: string
  data_limite_propostas: string
  dispensa_eletronica: boolean
  fornecedor_razao_social: string
  hipotese_dispensa: string
  hipotese_inexigibilidade: string
  fundamentacao_legal: string
  orgao: {
    id: string
    nome: string
    cidade: string
    uf: string
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS = {
  'PUBLICADO': { label: 'Publicado', cor: 'bg-blue-100 text-blue-800' },
  'EM_COTACAO': { label: 'Em Cotação', cor: 'bg-yellow-100 text-yellow-800' },
  'ADJUDICADO': { label: 'Adjudicado', cor: 'bg-purple-100 text-purple-800' },
  'HOMOLOGADO': { label: 'Homologado', cor: 'bg-green-100 text-green-800' },
  'CONTRATADO': { label: 'Contratado', cor: 'bg-green-100 text-green-800' },
  'CANCELADO': { label: 'Cancelado', cor: 'bg-red-100 text-red-800' }
}

const HIPOTESES_DISPENSA = {
  'I': 'Obras até R$ 100.000',
  'II': 'Outros até R$ 50.000',
  'III': 'Guerra',
  'IV': 'Emergência',
  'V': 'Deserta/Fracassada',
  'VIII': 'Calamidade',
  'DISPENSA_ELETRONICA': 'Dispensa Eletrônica'
}

export default function ContratacaoDiretaPublicaPage() {
  const [contratacoes, setContratacoes] = useState<ContratacaoDireta[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    tipo: '',
    uf: '',
    dispensaEletronica: ''
  })

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/contratacao-direta/publicos`)
      if (response.ok) {
        setContratacoes(await response.json())
      }
    } catch (error) {
      console.error('Erro ao carregar contratações:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarData = (data: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const formatarMoeda = (valor: number) => {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const contratacoesFiltradas = contratacoes.filter(c => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!c.objeto.toLowerCase().includes(busca) && 
          !c.numero_processo.toLowerCase().includes(busca) &&
          !c.orgao?.nome.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.tipo && c.tipo !== filtros.tipo) return false
    if (filtros.uf && c.orgao?.uf !== filtros.uf) return false
    if (filtros.dispensaEletronica === 'true' && !c.dispensa_eletronica) return false
    if (filtros.dispensaEletronica === 'false' && c.dispensa_eletronica) return false
    return true
  })

  const dispensas = contratacoesFiltradas.filter(c => c.tipo === 'DISPENSA')
  const inexigibilidades = contratacoesFiltradas.filter(c => c.tipo === 'INEXIGIBILIDADE')
  const ufs = [...new Set(contratacoes.map(c => c.orgao?.uf).filter(Boolean))].sort()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Contratação Direta</h1>
              <p className="text-gray-600 mt-1">
                Dispensas e Inexigibilidades conforme Lei 14.133/2021
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/licitacoes">Licitações</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/credenciamento">Credenciamento</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros de Pesquisa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar por objeto, número ou órgão..."
                    className="pl-10"
                    value={filtros.busca}
                    onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                  />
                </div>
              </div>
              <Select value={filtros.tipo || 'all'} onValueChange={(v) => setFiltros({ ...filtros, tipo: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="DISPENSA">Dispensa</SelectItem>
                  <SelectItem value="INEXIGIBILIDADE">Inexigibilidade</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtros.dispensaEletronica || 'all'} onValueChange={(v) => setFiltros({ ...filtros, dispensaEletronica: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Modalidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="true">Dispensa Eletrônica</SelectItem>
                  <SelectItem value="false">Dispensa Comum</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtros.uf || 'all'} onValueChange={(v) => setFiltros({ ...filtros, uf: v === 'all' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ufs.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="todas">
          <TabsList className="mb-4">
            <TabsTrigger value="todas">
              Todas ({contratacoesFiltradas.length})
            </TabsTrigger>
            <TabsTrigger value="dispensas">
              <FileCheck className="w-4 h-4 mr-2" />
              Dispensas ({dispensas.length})
            </TabsTrigger>
            <TabsTrigger value="inexigibilidades">
              <FileText className="w-4 h-4 mr-2" />
              Inexigibilidades ({inexigibilidades.length})
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Carregando...</p>
            </div>
          ) : (
            <>
              <TabsContent value="todas">
                <ListaContratacoes contratacoes={contratacoesFiltradas} />
              </TabsContent>
              <TabsContent value="dispensas">
                <ListaContratacoes contratacoes={dispensas} />
              </TabsContent>
              <TabsContent value="inexigibilidades">
                <ListaContratacoes contratacoes={inexigibilidades} />
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-gray-400 text-sm">
          © {new Date().getFullYear()} LicitaFácil. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  )
}

function ListaContratacoes({ contratacoes }: { contratacoes: ContratacaoDireta[] }) {
  const formatarData = (data: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const formatarMoeda = (valor: number) => {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  if (contratacoes.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">Nenhuma contratação encontrada.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {contratacoes.map((cont) => (
        <Card key={cont.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={STATUS[cont.status as keyof typeof STATUS]?.cor || 'bg-gray-100'}>
                    {STATUS[cont.status as keyof typeof STATUS]?.label || cont.status}
                  </Badge>
                  <Badge variant="outline">
                    {cont.tipo === 'DISPENSA' ? 'Dispensa' : 'Inexigibilidade'}
                  </Badge>
                  {cont.dispensa_eletronica && (
                    <Badge variant="secondary">
                      <Zap className="w-3 h-3 mr-1" />
                      Eletrônica
                    </Badge>
                  )}
                </div>
                
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {cont.numero_processo}
                </h3>
                
                <p className="text-gray-600 mb-2 line-clamp-2">{cont.objeto}</p>
                
                <p className="text-sm text-gray-500 mb-4">
                  <strong>Fundamentação:</strong> {cont.fundamentacao_legal}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Building2 className="w-4 h-4" />
                    <span className="truncate">{cont.orgao?.nome}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span>{formatarData(cont.data_publicacao)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <DollarSign className="w-4 h-4" />
                    <span>{formatarMoeda(cont.valor_estimado)}</span>
                  </div>
                  {cont.dispensa_eletronica && cont.data_limite_propostas && (
                    <div className="flex items-center gap-2 text-yellow-600">
                      <Clock className="w-4 h-4" />
                      <span>Até: {formatarData(cont.data_limite_propostas)}</span>
                    </div>
                  )}
                </div>

                {cont.fornecedor_razao_social && (
                  <div className="mt-3 p-2 bg-green-50 rounded text-sm text-green-700">
                    <strong>Contratado:</strong> {cont.fornecedor_razao_social}
                    {cont.valor_contratado && ` - ${formatarMoeda(cont.valor_contratado)}`}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <Button asChild>
                  <Link href={`/contratacao-direta/${cont.id}`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Ver Detalhes
                  </Link>
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Documentos
                </Button>
                {cont.dispensa_eletronica && cont.status === 'EM_COTACAO' && (
                  <Button variant="secondary" size="sm">
                    <Zap className="w-4 h-4 mr-2" />
                    Enviar Proposta
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
