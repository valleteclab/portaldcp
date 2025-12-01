'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Search, 
  FileText, 
  Calendar, 
  Building2, 
  Filter,
  ExternalLink,
  Download,
  Users,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react'

interface Credenciamento {
  id: string
  numero_edital: string
  ano: number
  tipo: string
  status: string
  objeto: string
  data_publicacao: string
  data_inicio_inscricoes: string
  data_fim_inscricoes: string
  inscricao_permanente: boolean
  valor_estimado: number
  orgao: {
    id: string
    nome: string
    cidade: string
    uf: string
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_CREDENCIAMENTO = {
  'PUBLICADO': { label: 'Publicado', cor: 'bg-blue-100 text-blue-800' },
  'EM_ANDAMENTO': { label: 'Inscrições Abertas', cor: 'bg-green-100 text-green-800' },
  'ENCERRADO': { label: 'Encerrado', cor: 'bg-gray-100 text-gray-800' }
}

const TIPOS = {
  'CREDENCIAMENTO': 'Credenciamento',
  'PRE_QUALIFICACAO': 'Pré-Qualificação'
}

export default function CredenciamentoPublicoPage() {
  const [credenciamentos, setCredenciamentos] = useState<Credenciamento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    tipo: '',
    uf: ''
  })

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/credenciamento/publicos`)
      if (response.ok) {
        setCredenciamentos(await response.json())
      }
    } catch (error) {
      console.error('Erro ao carregar credenciamentos:', error)
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

  const credenciamentosFiltrados = credenciamentos.filter(c => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!c.objeto.toLowerCase().includes(busca) && 
          !c.numero_edital.toLowerCase().includes(busca) &&
          !c.orgao?.nome.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.tipo && c.tipo !== filtros.tipo) return false
    if (filtros.uf && c.orgao?.uf !== filtros.uf) return false
    return true
  })

  const ufs = [...new Set(credenciamentos.map(c => c.orgao?.uf).filter(Boolean))].sort()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Credenciamento e Pré-Qualificação</h1>
              <p className="text-gray-600 mt-1">
                Editais de credenciamento conforme Art. 79 da Lei 14.133/2021
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/licitacoes">Licitações</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/contratacao-direta">Contratação Direta</Link>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <SelectItem value="CREDENCIAMENTO">Credenciamento</SelectItem>
                  <SelectItem value="PRE_QUALIFICACAO">Pré-Qualificação</SelectItem>
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

        {/* Resultados */}
        <div className="mb-4">
          <p className="text-gray-600">
            {credenciamentosFiltrados.length} credenciamento(s) encontrado(s)
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Carregando...</p>
          </div>
        ) : credenciamentosFiltrados.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Nenhum credenciamento encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {credenciamentosFiltrados.map((cred) => (
              <Card key={cred.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={STATUS_CREDENCIAMENTO[cred.status as keyof typeof STATUS_CREDENCIAMENTO]?.cor || 'bg-gray-100'}>
                          {STATUS_CREDENCIAMENTO[cred.status as keyof typeof STATUS_CREDENCIAMENTO]?.label || cred.status}
                        </Badge>
                        <Badge variant="outline">
                          {TIPOS[cred.tipo as keyof typeof TIPOS] || cred.tipo}
                        </Badge>
                        {cred.inscricao_permanente && (
                          <Badge variant="secondary">
                            <Clock className="w-3 h-3 mr-1" />
                            Permanente
                          </Badge>
                        )}
                      </div>
                      
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Edital nº {cred.numero_edital}
                      </h3>
                      
                      <p className="text-gray-600 mb-4 line-clamp-2">{cred.objeto}</p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Building2 className="w-4 h-4" />
                          <span className="truncate">{cred.orgao?.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <Calendar className="w-4 h-4" />
                          <span>Publicado: {formatarData(cred.data_publicacao)}</span>
                        </div>
                        {!cred.inscricao_permanente && cred.data_fim_inscricoes && (
                          <div className="flex items-center gap-2 text-gray-500">
                            <Clock className="w-4 h-4" />
                            <span>Até: {formatarData(cred.data_fim_inscricoes)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-gray-500">
                          <Users className="w-4 h-4" />
                          <span>{cred.orgao?.cidade}/{cred.orgao?.uf}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 lg:items-end">
                      <Button asChild>
                        <Link href={`/credenciamento/${cred.id}`}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ver Detalhes
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Edital
                      </Button>
                      {cred.status === 'EM_ANDAMENTO' && (
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/credenciamento/${cred.id}/inscrever`}>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Inscrever-se
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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
