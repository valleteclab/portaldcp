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
  DollarSign,
  Filter,
  ExternalLink,
  Download,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

interface Licitacao {
  id: string
  numero_processo: string
  numero_edital: string
  objeto: string
  modalidade: string
  fase: string
  valor_total_estimado: number | string
  data_abertura_sessao: string
  data_publicacao_edital: string
  orgao: {
    id: string
    nome: string
    cidade: string
    uf: string
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const MODALIDADES = [
  { value: 'PREGAO_ELETRONICO', label: 'Pregão Eletrônico' },
  { value: 'CONCORRENCIA', label: 'Concorrência' },
  { value: 'DISPENSA_ELETRONICA', label: 'Dispensa Eletrônica' },
  { value: 'INEXIGIBILIDADE', label: 'Inexigibilidade' },
  { value: 'CONCURSO', label: 'Concurso' },
  { value: 'LEILAO', label: 'Leilão' },
  { value: 'DIALOGO_COMPETITIVO', label: 'Diálogo Competitivo' }
]

const FASES = [
  { value: 'PUBLICADO', label: 'Publicado' },
  { value: 'ACOLHIMENTO_PROPOSTAS', label: 'Recebendo Propostas' },
  { value: 'EM_DISPUTA', label: 'Em Disputa' },
  { value: 'HABILITACAO', label: 'Habilitação' },
  { value: 'HOMOLOGACAO', label: 'Homologação' },
  { value: 'CONCLUIDO', label: 'Concluído' }
]

export default function LicitacoesPublicasPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    modalidade: '',
    fase: '',
    uf: ''
  })

  useEffect(() => {
    carregarLicitacoes()
  }, [])

  const carregarLicitacoes = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/licitacoes/publicas`)
      if (response.ok) {
        const data = await response.json()
        setLicitacoes(data)
      }
    } catch (error) {
      console.error('Erro ao carregar licitações:', error)
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
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getModalidadeLabel = (modalidade: string) => {
    const mod = MODALIDADES.find(m => m.value === modalidade)
    return mod?.label || modalidade
  }

  const getFaseBadge = (fase: string) => {
    const cores: Record<string, string> = {
      'PUBLICADO': 'bg-blue-100 text-blue-800',
      'ACOLHIMENTO_PROPOSTAS': 'bg-green-100 text-green-800',
      'EM_DISPUTA': 'bg-yellow-100 text-yellow-800',
      'HABILITACAO': 'bg-purple-100 text-purple-800',
      'HOMOLOGACAO': 'bg-indigo-100 text-indigo-800',
      'CONCLUIDO': 'bg-gray-100 text-gray-800'
    }

    const labels: Record<string, string> = {
      'PUBLICADO': 'Publicado',
      'ACOLHIMENTO_PROPOSTAS': 'Recebendo Propostas',
      'EM_DISPUTA': 'Em Disputa',
      'HABILITACAO': 'Habilitação',
      'HOMOLOGACAO': 'Homologação',
      'CONCLUIDO': 'Concluído'
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${cores[fase] || 'bg-gray-100 text-gray-800'}`}>
        {labels[fase] || fase}
      </span>
    )
  }

  const licitacoesFiltradas = licitacoes.filter(lic => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!lic.objeto.toLowerCase().includes(busca) && 
          !lic.numero_processo.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.modalidade && lic.modalidade !== filtros.modalidade) return false
    if (filtros.fase && lic.fase !== filtros.fase) return false
    if (filtros.uf && lic.orgao?.uf !== filtros.uf) return false
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Portal de Licitações</h1>
              <p className="text-gray-600 mt-1">
                Consulte editais, documentos e participe das licitações públicas
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/contratos">
                  <FileText className="w-4 h-4 mr-2" />
                  Contratos
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/atas">
                  <FileText className="w-4 h-4 mr-2" />
                  Atas de Registro
                </Link>
              </Button>
              <Button asChild>
                <Link href="/login">
                  Área do Fornecedor
                </Link>
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
                    placeholder="Buscar por objeto ou número do processo..."
                    className="pl-10"
                    value={filtros.busca}
                    onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                  />
                </div>
              </div>
              <Select
                value={filtros.modalidade}
                onValueChange={(value) => setFiltros({ ...filtros, modalidade: value === 'all' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Modalidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {MODALIDADES.map(mod => (
                    <SelectItem key={mod.value} value={mod.value}>{mod.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filtros.fase}
                onValueChange={(value) => setFiltros({ ...filtros, fase: value === 'all' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {FASES.map(fase => (
                    <SelectItem key={fase.value} value={fase.value}>{fase.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Resultados */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-gray-600">
            {licitacoesFiltradas.length} licitação(ões) encontrada(s)
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Carregando licitações...</p>
          </div>
        ) : licitacoesFiltradas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Nenhuma licitação encontrada com os filtros selecionados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {licitacoesFiltradas.map((licitacao) => (
              <Card key={licitacao.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{getModalidadeLabel(licitacao.modalidade)}</Badge>
                        {getFaseBadge(licitacao.fase)}
                      </div>
                      
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {licitacao.numero_processo}
                        {licitacao.numero_edital && ` - ${licitacao.numero_edital}`}
                      </h3>
                      
                      <p className="text-gray-600 mb-4 line-clamp-2">
                        {licitacao.objeto}
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <Building2 className="w-4 h-4" />
                          <span>{licitacao.orgao?.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <Calendar className="w-4 h-4" />
                          <span>{formatarData(licitacao.data_abertura_sessao)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <DollarSign className="w-4 h-4" />
                          <span>{formatarMoeda(licitacao.valor_total_estimado)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <Clock className="w-4 h-4" />
                          <span>{licitacao.orgao?.cidade}/{licitacao.orgao?.uf}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 lg:items-end">
                      <Button asChild>
                        <Link href={`/licitacoes/${licitacao.id}`}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ver Detalhes
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Edital
                      </Button>
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
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-semibold mb-4">LicitaFácil</h4>
              <p className="text-gray-400 text-sm">
                Plataforma de licitações eletrônicas conforme Lei 14.133/2021
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Links Úteis</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/licitacoes" className="hover:text-white">Licitações</Link></li>
                <li><Link href="/contratos" className="hover:text-white">Contratos</Link></li>
                <li><Link href="/atas" className="hover:text-white">Atas de Registro de Preço</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Acesso</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/login" className="hover:text-white">Portal do Fornecedor</Link></li>
                <li><Link href="/orgao-login" className="hover:text-white">Portal do Órgão</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
            © {new Date().getFullYear()} LicitaFácil. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
