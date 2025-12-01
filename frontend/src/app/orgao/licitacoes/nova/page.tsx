"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  FileText, 
  Package, 
  ClipboardList,
  Calendar,
  Save,
  Upload,
  Settings,
  CircleCheck,
  Circle,
  CircleX,
  Loader2,
  PenLine,
  Download,
  FileUp,
  Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DadosBasicosTab,
  ClassificacaoTab,
  ItensTab,
  DocumentosTab,
  CronogramaTab,
  ConfiguracoesTab,
  DadosBasicos,
  Classificacao,
  ItemLicitacao,
  DocumentoLicitacao,
  Cronograma,
  Configuracoes,
  StatusAba,
  MODALIDADES,
  CRITERIOS_JULGAMENTO
} from "@/components/cadastro-licitacao"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const abas = [
  { id: 'dados-basicos', label: 'Dados Básicos', icon: FileText },
  { id: 'classificacao', label: 'Classificação', icon: ClipboardList },
  { id: 'itens', label: 'Itens', icon: Package },
  { id: 'documentos', label: 'Documentos', icon: Upload },
  { id: 'cronograma', label: 'Cronograma', icon: Calendar },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
]

// Tipos de modo da fase interna
type ModoFaseInterna = 'elaborar' | 'importar' | 'anexar' | null

export default function NovaLicitacaoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const modoParam = searchParams.get('modo') as ModoFaseInterna
  
  const [modoFaseInterna, setModoFaseInterna] = useState<ModoFaseInterna>(modoParam)
  const [activeTab, setActiveTab] = useState('dados-basicos')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modoImportacao, setModoImportacao] = useState(false)
  const [faseInternaConcluida, setFaseInternaConcluida] = useState(false)
  const [orgaoId, setOrgaoId] = useState<string | null>(null)

  // Buscar órgão ao carregar
  useEffect(() => {
    const buscarOrgao = async () => {
      try {
        // Primeiro tenta pegar do localStorage (usuário logado)
        const orgaoSalvo = localStorage.getItem('orgao')
        if (orgaoSalvo) {
          const orgao = JSON.parse(orgaoSalvo)
          setOrgaoId(orgao.id)
          return
        }
        
        // Se não tiver, busca o primeiro órgão disponível
        const res = await fetch(`${API_URL}/api/orgaos`)
        if (res.ok) {
          const orgaos = await res.json()
          if (orgaos.length > 0) {
            setOrgaoId(orgaos[0].id)
            localStorage.setItem('orgao', JSON.stringify(orgaos[0]))
          }
        }
      } catch (e) {
        console.error('Erro ao buscar órgão:', e)
      }
    }
    buscarOrgao()
  }, [])

  // Verificar se fase interna foi concluída (vindo da elaboração)
  useEffect(() => {
    if (modoParam) {
      setModoFaseInterna(modoParam)
      const concluida = localStorage.getItem('fase_interna_concluida')
      if (concluida === 'true') {
        setFaseInternaConcluida(true)
      }
    }
  }, [modoParam])

  const [statusAbas, setStatusAbas] = useState<Record<string, StatusAba>>({
    'dados-basicos': 'pendente',
    'classificacao': 'pendente',
    'itens': 'pendente',
    'documentos': 'pendente',
    'cronograma': 'pendente',
    'configuracoes': 'pendente',
  })

  // Estados dos formulários
  const [dadosBasicos, setDadosBasicos] = useState<DadosBasicos>({
    numero_processo: '',
    objeto: '',
    objeto_detalhado: '',
    justificativa: '',
  })

  const [classificacao, setClassificacao] = useState<Classificacao>({
    modalidade: 'PREGAO_ELETRONICO',
    tipo_contratacao: 'COMPRA',
    criterio_julgamento: 'MENOR_PRECO',
    modo_disputa: 'ABERTO',
    exclusivo_mpe: false,
    tratamento_diferenciado_mpe: true,
    cota_reservada: false,
    percentual_cota_reservada: 25,
  })

  const [itens, setItens] = useState<ItemLicitacao[]>([])

  const [documentos, setDocumentos] = useState<DocumentoLicitacao[]>([])

  const [cronograma, setCronograma] = useState<Cronograma>({
    data_publicacao_edital: '',
    data_limite_impugnacao: '',
    data_inicio_acolhimento: '',
    data_fim_acolhimento: '',
    data_abertura_sessao: '',
  })

  const [configuracoes, setConfiguracoes] = useState<Configuracoes>({
    intervalo_minimo_lances: 3,
    tempo_prorrogacao: 2,
    diferenca_minima_lances: 0,
    permite_lances_intermediarios: true,
    pregoeiro_nome: '',
    equipe_apoio: '',
    sigilo_orcamento: 'PUBLICO',
    justificativa_sigilo: '',
  })

  // Validação e atualização de status das abas
  const atualizarStatusAba = (aba: string, status: StatusAba) => {
    setStatusAbas(prev => ({ ...prev, [aba]: status }))
  }

  const validarDadosBasicos = () => {
    return dadosBasicos.numero_processo && dadosBasicos.objeto
  }

  const validarClassificacao = () => {
    return classificacao.modalidade && classificacao.tipo_contratacao
  }

  const validarItens = () => {
    return itens.length > 0 && itens.every(i => i.descricao && i.quantidade > 0)
  }

  const validarCronograma = () => {
    return cronograma.data_abertura_sessao !== ''
  }

  // Calcular valor total
  const calcularValorTotal = () => {
    return itens.reduce((total, item) => total + (item.quantidade * item.valor_unitario), 0)
  }

  // Salvar licitação
  const salvarLicitacao = async (publicar: boolean = false) => {
    setLoading(true)
    setError(null)

    try {
      // Validações
      if (!orgaoId) {
        throw new Error('Órgão não identificado. Faça login novamente.')
      }
      if (!validarDadosBasicos()) {
        throw new Error('Preencha os dados básicos (número do processo e objeto)')
      }
      if (itens.length === 0) {
        throw new Error('Adicione pelo menos um item à licitação')
      }

      const payload = {
        orgao_id: orgaoId,
        numero_processo: dadosBasicos.numero_processo,
        objeto: dadosBasicos.objeto,
        objeto_detalhado: dadosBasicos.objeto_detalhado,
        justificativa: dadosBasicos.justificativa,
        modalidade: classificacao.modalidade,
        tipo_contratacao: classificacao.tipo_contratacao,
        criterio_julgamento: classificacao.criterio_julgamento,
        modo_disputa: classificacao.modo_disputa,
        exclusivo_mpe: classificacao.exclusivo_mpe,
        tratamento_diferenciado_mpe: classificacao.tratamento_diferenciado_mpe,
        cota_reservada: classificacao.cota_reservada,
        percentual_cota_reservada: classificacao.percentual_cota_reservada,
        valor_total_estimado: calcularValorTotal(),
        data_publicacao_edital: cronograma.data_publicacao_edital || null,
        data_limite_impugnacao: cronograma.data_limite_impugnacao || null,
        data_inicio_acolhimento: cronograma.data_inicio_acolhimento || null,
        data_fim_acolhimento: cronograma.data_fim_acolhimento || null,
        data_abertura_sessao: cronograma.data_abertura_sessao || null,
        intervalo_minimo_lances: configuracoes.intervalo_minimo_lances,
        tempo_prorrogacao: configuracoes.tempo_prorrogacao,
        diferenca_minima_lances: configuracoes.diferenca_minima_lances,
        permite_lances_intermediarios: configuracoes.permite_lances_intermediarios,
        pregoeiro_nome: configuracoes.pregoeiro_nome,
        equipe_apoio: configuracoes.equipe_apoio,
        sigilo_orcamento: configuracoes.sigilo_orcamento,
        justificativa_sigilo: configuracoes.justificativa_sigilo,
      }

      const res = await fetch(`${API_URL}/api/licitacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Erro ao criar licitação')
      }

      const licitacao = await res.json()

      // Salvar itens
      if (itens.length > 0) {
        for (const item of itens) {
          await fetch(`${API_URL}/api/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              licitacao_id: licitacao.id,
              numero_item: item.numero,
              descricao: item.descricao,
              quantidade: item.quantidade,
              unidade: item.unidade,
              valor_unitario_estimado: item.valor_unitario,
              codigo_catmat: item.codigo_catmat,
              codigo_catser: item.codigo_catser,
            }),
          })
        }
      }

      router.push('/orgao/licitacoes')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Navegação entre abas
  const irParaProximaAba = () => {
    const indexAtual = abas.findIndex(a => a.id === activeTab)
    if (indexAtual < abas.length - 1) {
      setActiveTab(abas[indexAtual + 1].id)
    }
  }

  const irParaAbaAnterior = () => {
    const indexAtual = abas.findIndex(a => a.id === activeTab)
    if (indexAtual > 0) {
      setActiveTab(abas[indexAtual - 1].id)
    }
  }

  const getStatusIcon = (status: StatusAba) => {
    switch (status) {
      case 'completo':
        return <CircleCheck className="h-4 w-4 text-green-500" />
      case 'incompleto':
        return <CircleX className="h-4 w-4 text-orange-500" />
      default:
        return <Circle className="h-4 w-4 text-slate-300" />
    }
  }

  // Tela de escolha do modo da fase interna
  if (modoFaseInterna === null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Nova Licitação</h1>
            <p className="text-muted-foreground">Escolha como deseja iniciar o processo</p>
          </div>
        </div>

        {/* Info sobre Fase Interna */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800">Fase Interna (Planejamento) - Lei 14.133/2021</p>
                <p className="text-sm text-blue-700 mt-1">
                  A fase interna é obrigatória e deve ser concluída <strong>antes</strong> da publicação do edital. 
                  Ela inclui: ETP, Termo de Referência, Pesquisa de Preços, Parecer Jurídico, entre outros documentos.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Opções */}
        <div className="grid grid-cols-3 gap-6">
          {/* Opção 1: Elaborar no Sistema */}
          <Card 
            className="cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all"
            onClick={() => router.push('/orgao/licitacoes/nova/fase-interna')}
          >
            <CardHeader className="text-center pb-2">
              <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-2">
                <PenLine className="h-8 w-8 text-blue-600" />
              </div>
              <CardTitle className="text-lg">Elaborar no Sistema</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <CardDescription className="text-sm">
                Crie todos os documentos da fase interna diretamente aqui: ETP, Termo de Referência, Pesquisa de Preços, etc.
              </CardDescription>
              <p className="text-xs text-muted-foreground mt-3">Recomendado para novos processos</p>
            </CardContent>
          </Card>

          {/* Opção 2: Importar */}
          <Card 
            className="cursor-pointer hover:border-green-500 hover:shadow-lg transition-all"
            onClick={() => setModoFaseInterna('importar')}
          >
            <CardHeader className="text-center pb-2">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-2">
                <Download className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-lg">Importar de Outro Sistema</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <CardDescription className="text-sm">
                Importe um processo já existente de outro sistema como PNCP, SEI, ou sistema próprio do órgão.
              </CardDescription>
              <p className="text-xs text-muted-foreground mt-3">Para processos já iniciados</p>
            </CardContent>
          </Card>

          {/* Opção 3: Apenas Anexar */}
          <Card 
            className="cursor-pointer hover:border-purple-500 hover:shadow-lg transition-all"
            onClick={() => setModoFaseInterna('anexar')}
          >
            <CardHeader className="text-center pb-2">
              <div className="w-16 h-16 mx-auto bg-purple-100 rounded-full flex items-center justify-center mb-2">
                <FileUp className="h-8 w-8 text-purple-600" />
              </div>
              <CardTitle className="text-lg">Anexar Documentos</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <CardDescription className="text-sm">
                A fase interna já foi feita fora do sistema. Apenas anexe os documentos para registro.
              </CardDescription>
              <p className="text-xs text-muted-foreground mt-3">Fase interna já concluída</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => {
          setModoFaseInterna(null)
          setFaseInternaConcluida(false)
          localStorage.removeItem('fase_interna_docs')
          localStorage.removeItem('fase_interna_modo')
          localStorage.removeItem('fase_interna_concluida')
          router.push('/orgao/licitacoes/nova')
        }}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nova Licitação</h1>
          <p className="text-muted-foreground">
            {modoFaseInterna === 'elaborar' && faseInternaConcluida && '✓ Fase interna concluída - Preencha os dados da licitação'}
            {modoFaseInterna === 'elaborar' && !faseInternaConcluida && 'Modo: Elaborar fase interna no sistema'}
            {modoFaseInterna === 'importar' && 'Modo: Importar de outro sistema'}
            {modoFaseInterna === 'anexar' && 'Modo: Anexar documentos já elaborados'}
          </p>
        </div>
      </div>

      {/* Mensagem de erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Navegação por abas */}
      <div className="grid grid-cols-6 gap-2">
        {abas.map((aba) => {
          const Icon = aba.icon
          const isActive = activeTab === aba.id
          const status = statusAbas[aba.id]
          
          return (
            <button
              key={aba.id}
              onClick={() => setActiveTab(aba.id)}
              className={`p-3 rounded-lg border text-center transition-all ${
                isActive 
                  ? 'border-blue-500 bg-blue-50' 
                  : status === 'completo'
                    ? 'border-green-300 bg-green-50'
                    : status === 'incompleto'
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className={`h-5 w-5 mx-auto mb-1 ${
                isActive ? 'text-blue-600' : 
                status === 'completo' ? 'text-green-600' :
                status === 'incompleto' ? 'text-orange-600' :
                'text-slate-400'
              }`} />
              <p className={`text-xs font-medium ${
                isActive ? 'text-blue-600' : 
                status === 'completo' ? 'text-green-600' :
                status === 'incompleto' ? 'text-orange-600' :
                'text-slate-600'
              }`}>
                {aba.label}
              </p>
              <div className="mt-1">
                {getStatusIcon(status)}
              </div>
            </button>
          )
        })}
      </div>

      {/* Conteúdo das abas */}
      <div className="min-h-[400px]">
        {activeTab === 'dados-basicos' && (
          <DadosBasicosTab 
            dados={dadosBasicos}
            onChange={setDadosBasicos}
            modoImportacao={modoImportacao}
            onToggleModo={() => setModoImportacao(!modoImportacao)}
          />
        )}

        {activeTab === 'classificacao' && (
          <ClassificacaoTab 
            dados={classificacao}
            onChange={setClassificacao}
          />
        )}

        {activeTab === 'itens' && (
          <ItensTab 
            itens={itens}
            onChange={setItens}
          />
        )}

        {activeTab === 'documentos' && (
          <DocumentosTab 
            documentos={documentos}
            onChange={setDocumentos}
          />
        )}

        {activeTab === 'cronograma' && (
          <CronogramaTab 
            dados={cronograma}
            onChange={setCronograma}
          />
        )}

        {activeTab === 'configuracoes' && (
          <ConfiguracoesTab 
            dados={configuracoes}
            onChange={setConfiguracoes}
          />
        )}
      </div>

      {/* Botões de navegação */}
      <div className="flex justify-between pt-4 border-t">
        <Button 
          variant="outline" 
          onClick={irParaAbaAnterior}
          disabled={activeTab === abas[0].id}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" disabled={loading}>
            <Save className="mr-2 h-4 w-4" /> Salvar Rascunho
          </Button>
          
          {activeTab !== abas[abas.length - 1].id ? (
            <Button onClick={irParaProximaAba}>
              Próximo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={() => salvarLicitacao()}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Criar Licitação
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
