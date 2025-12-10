"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Loader2, Save, Upload, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DadosBasicosTab } from "@/components/cadastro-licitacao/DadosBasicosTab"
import { ClassificacaoTab } from "@/components/cadastro-licitacao/ClassificacaoTab"
import { CronogramaTab } from "@/components/cadastro-licitacao/CronogramaTab"
import { ConfiguracoesTab } from "@/components/cadastro-licitacao/ConfiguracoesTab"
import { ItensTab } from "@/components/cadastro-licitacao/ItensTab"
import { LotesManager } from "@/components/cadastro-licitacao/LotesManager"
import { 
  DadosBasicos, Classificacao, Cronograma, Configuracoes, 
  ItemLicitacao, LoteLicitacao, ItemPCA 
} from "@/components/cadastro-licitacao/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function EditarLicitacaoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [atualizandoPncp, setAtualizandoPncp] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState("dados")
  const [orgaoId, setOrgaoId] = useState<string>("")
  
  // Estado PNCP
  const [enviadoPncp, setEnviadoPncp] = useState(false)
  const [linkPncp, setLinkPncp] = useState<string | null>(null)
  const [anoCompraPncp, setAnoCompraPncp] = useState<number | null>(null)
  const [sequencialCompraPncp, setSequencialCompraPncp] = useState<number | null>(null)

  // Estados do formulário
  const [dadosBasicos, setDadosBasicos] = useState<DadosBasicos>({
    numero_processo: '',
    objeto: '',
    objeto_detalhado: '',
    justificativa: ''
  })

  const [classificacao, setClassificacao] = useState<Classificacao>({
    modalidade: 'PREGAO_ELETRONICO',
    tipo_contratacao: 'BENS',
    criterio_julgamento: 'MENOR_PRECO',
    modo_disputa: 'ABERTO',
    tratamento_diferenciado_mpe: true,
    modo_beneficio_mpe: 'GERAL',
    tipo_beneficio_mpe: 'NENHUM',
    exclusivo_mpe: false,
    cota_reservada: false,
    percentual_cota_reservada: 0,
    modo_vinculacao_pca: 'POR_LICITACAO',
    usa_lotes: false
  })

  const [cronograma, setCronograma] = useState<Cronograma>({
    data_publicacao_edital: '',
    data_limite_impugnacao: '',
    data_inicio_acolhimento: '',
    data_fim_acolhimento: '',
    data_abertura_sessao: ''
  })

  const [configuracoes, setConfiguracoes] = useState<Configuracoes>({
    intervalo_minimo_lances: 60,
    tempo_prorrogacao: 120,
    diferenca_minima_lances: 0,
    permite_lances_intermediarios: true,
    pregoeiro_nome: '',
    equipe_apoio: '',
    sigilo_orcamento: 'PUBLICO'
  })

  const [itens, setItens] = useState<ItemLicitacao[]>([])
  const [itensOriginais, setItensOriginais] = useState<ItemLicitacao[]>([]) // Para comparar alterações
  const [lotes, setLotes] = useState<LoteLicitacao[]>([])
  const [itensPca, setItensPca] = useState<ItemPCA[]>([])
  const [modoImportacao, setModoImportacao] = useState(false)

  // Handler para mudanças na classificação que limpa itens/lotes quando necessário
  const handleClassificacaoChange = (novaClassificacao: Classificacao) => {
    const mudouUsaLotes = novaClassificacao.usa_lotes !== classificacao.usa_lotes
    
    if (mudouUsaLotes) {
      if (novaClassificacao.usa_lotes) {
        // Mudou para usar lotes - perguntar se quer limpar itens soltos
        if (itens.length > 0 && itens.some(i => !i.lote_id)) {
          const confirmar = confirm(
            `Você tem ${itens.filter(i => !i.lote_id).length} item(ns) sem lote.\n\n` +
            'Ao ativar lotes, esses itens ficarão "soltos" até serem vinculados a um lote.\n\n' +
            'Deseja limpar os itens existentes?'
          )
          if (confirmar) {
            setItens([])
          }
        }
      } else {
        // Mudou para não usar lotes - perguntar se quer limpar lotes e itens
        if (lotes.length > 0) {
          const confirmar = confirm(
            `Você tem ${lotes.length} lote(s) com ${itens.filter(i => i.lote_id).length} item(ns).\n\n` +
            'Ao desativar lotes, os lotes serão removidos.\n\n' +
            'Deseja também limpar os itens vinculados aos lotes?'
          )
          if (confirmar) {
            setItens(itens.filter(i => !i.lote_id)) // Mantém apenas itens sem lote
          } else {
            // Remove vinculação dos itens com lotes
            setItens(itens.map(i => ({ ...i, lote_id: undefined, lote_numero: undefined })))
          }
          setLotes([])
        }
      }
    }
    
    setClassificacao(novaClassificacao)
  }

  // Ordem das abas para navegação
  const abas = ['dados', 'classificacao', 'itens', ...(classificacao.usa_lotes ? ['lotes'] : []), 'cronograma', 'configuracoes']
  const abaAtualIndex = abas.indexOf(abaAtiva)
  const temAnterior = abaAtualIndex > 0
  const temProximo = abaAtualIndex < abas.length - 1

  const irParaAnterior = () => {
    if (temAnterior) setAbaAtiva(abas[abaAtualIndex - 1])
  }

  const irParaProximo = () => {
    if (temProximo) setAbaAtiva(abas[abaAtualIndex + 1])
  }

  useEffect(() => {
    carregarLicitacao()
  }, [id])

  const carregarLicitacao = async () => {
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${id}`)
      if (res.ok) {
        const data = await res.json()
        
        // Pegar orgaoId da licitação
        if (data.orgao_id) {
          setOrgaoId(data.orgao_id)
        }
        
        // Carregar dados PNCP
        if (data.enviado_pncp) {
          setEnviadoPncp(true)
          setLinkPncp(data.link_pncp || null)
          setAnoCompraPncp(data.ano_compra_pncp || null)
          setSequencialCompraPncp(data.sequencial_compra_pncp || null)
        }
        
        // Preencher dados básicos
        setDadosBasicos({
          numero_processo: data.numero_processo || '',
          objeto: data.objeto || '',
          objeto_detalhado: data.objeto_detalhado || '',
          justificativa: data.justificativa || '',
          codigo_unidade_compradora: data.codigo_unidade_compradora || '',
          nome_unidade_compradora: data.nome_unidade_compradora || ''
        })

        // Preencher classificação
        setClassificacao({
          modalidade: data.modalidade || 'PREGAO_ELETRONICO',
          tipo_contratacao: data.tipo_contratacao || 'BENS',
          criterio_julgamento: data.criterio_julgamento || 'MENOR_PRECO',
          modo_disputa: data.modo_disputa || 'ABERTO',
          tratamento_diferenciado_mpe: data.tratamento_diferenciado_mpe ?? true,
          modo_beneficio_mpe: data.modo_beneficio_mpe || 'GERAL',
          tipo_beneficio_mpe: data.tipo_beneficio_mpe || 'NENHUM',
          exclusivo_mpe: data.exclusivo_mpe || false,
          cota_reservada: data.cota_reservada || false,
          percentual_cota_reservada: data.percentual_cota_reservada || 0,
          modo_vinculacao_pca: data.modo_vinculacao_pca || 'POR_LICITACAO',
          item_pca_id: data.item_pca_id,
          item_pca: data.item_pca,
          sem_pca: data.sem_pca,
          justificativa_sem_pca: data.justificativa_sem_pca,
          usa_lotes: data.usa_lotes || false,
          justificativa_nao_parcelamento: data.justificativa_nao_parcelamento
        })

        // Preencher cronograma - usar data exatamente como veio do banco
        // Formato: YYYY-MM-DDTHH:mm:ss (sem Z, sem conversão)
        const formatarDataParaInput = (dataISO: string | null | undefined): string => {
          if (!dataISO) return ''
          // Remover Z e milissegundos, manter YYYY-MM-DDTHH:mm:ss
          let limpa = dataISO.replace('Z', '').replace(/\.\d+/, '')
          // Garantir formato completo YYYY-MM-DDTHH:mm:ss
          if (limpa.length === 16) limpa += ':00' // Adicionar segundos se faltar
          return limpa.slice(0, 19)
        }
        
        console.log('[LOAD] Datas do banco:', {
          inicio: data.data_inicio_acolhimento,
          fim: data.data_fim_acolhimento
        })
        
        setCronograma({
          data_publicacao_edital: formatarDataParaInput(data.data_publicacao_edital),
          data_limite_impugnacao: formatarDataParaInput(data.data_limite_impugnacao),
          data_inicio_acolhimento: formatarDataParaInput(data.data_inicio_acolhimento),
          data_fim_acolhimento: formatarDataParaInput(data.data_fim_acolhimento),
          data_abertura_sessao: formatarDataParaInput(data.data_abertura_sessao)
        })

        // Preencher configurações
        setConfiguracoes({
          intervalo_minimo_lances: data.intervalo_minimo_lances || 60,
          tempo_prorrogacao: data.tempo_prorrogacao || 120,
          diferenca_minima_lances: data.diferenca_minima_lances || 0,
          permite_lances_intermediarios: data.permite_lances_intermediarios ?? true,
          pregoeiro_nome: data.pregoeiro_nome || '',
          equipe_apoio: data.equipe_apoio || '',
          sigilo_orcamento: data.sigilo_orcamento || 'PUBLICO',
          justificativa_sigilo: data.justificativa_sigilo
        })

        // Preencher itens (mapeando campos do backend para o frontend)
        if (data.itens && Array.isArray(data.itens)) {
          const itensMapeados = data.itens.map((item: any) => ({
            id: item.id,
            numero: item.numero_item || item.numero,
            descricao: item.descricao_resumida || item.descricao || '',
            descricao_detalhada: item.descricao_detalhada,
            quantidade: parseFloat(item.quantidade) || 1,
            unidade: item.unidade_medida || item.unidade || 'UNIDADE',
            valor_unitario: parseFloat(item.valor_unitario_estimado || item.valor_unitario) || 0,
            codigo_catalogo: item.codigo_catalogo,
            codigo_catmat: item.codigo_catmat,
            codigo_catser: item.codigo_catser,
            lote_id: item.lote_id,
            lote_numero: item.numero_lote || item.lote_numero,
            item_pca_id: item.item_pca_id,
            item_pca_descricao: item.item_pca?.descricao_objeto || item.item_pca_descricao,
            item_pca_ano: item.item_pca?.pca?.ano_exercicio || item.item_pca_ano,
            sem_pca: item.sem_pca || false,
            justificativa_sem_pca: item.justificativa_sem_pca,
            tipo_participacao: item.tipo_participacao || 'AMPLA',
          }))
          setItens(itensMapeados)
          // Guardar cópia dos itens originais para comparar alterações
          setItensOriginais(JSON.parse(JSON.stringify(itensMapeados)))
        }
        
        // Preencher lotes
        if (data.lotes) setLotes(data.lotes)
      }
    } catch (error) {
      console.error('Erro ao carregar licitação:', error)
    } finally {
      setLoading(false)
    }
  }

  const salvar = async (atualizarPncp: boolean = false) => {
    setSaving(true)
    try {
      const payload = {
        ...dadosBasicos,
        ...classificacao,
        ...cronograma,
        ...configuracoes,
        itens,
        lotes,
        valor_total_estimado: itens.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0)
      }

      const res = await fetch(`${API_URL}/api/licitacoes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        // Se a licitação já foi enviada ao PNCP e o usuário quer atualizar
        if (atualizarPncp && enviadoPncp && anoCompraPncp && sequencialCompraPncp) {
          await retificarNoPncp()
        } else if (enviadoPncp) {
          // Perguntar se quer atualizar no PNCP
          const desejaAtualizar = confirm(
            '✅ Licitação salva com sucesso!\n\n' +
            'Esta licitação já foi enviada ao PNCP.\n' +
            'Deseja atualizar as informações no PNCP também?'
          )
          if (desejaAtualizar) {
            await retificarNoPncp()
          } else {
            router.push('/orgao/licitacoes')
          }
        } else {
          router.push('/orgao/licitacoes')
        }
      } else {
        const error = await res.json()
        alert(error.message || 'Erro ao salvar licitação')
      }
    } catch (error) {
      console.error('Erro ao salvar:', error)
      alert('Erro ao salvar licitação')
    } finally {
      setSaving(false)
    }
  }

  const retificarNoPncp = async () => {
    if (!anoCompraPncp || !sequencialCompraPncp) {
      alert('Dados do PNCP não encontrados')
      return
    }

    const justificativa = prompt(
      'Informe a justificativa para a retificação no PNCP:\n\n' +
      '(Obrigatório conforme regulamentação)'
    )

    if (!justificativa) {
      alert('Justificativa é obrigatória para retificação no PNCP')
      router.push('/orgao/licitacoes')
      return
    }

    setAtualizandoPncp(true)
    const erros: string[] = []
    
    try {
      const token = localStorage.getItem('orgao_token')
      
      // 1. Retificar dados da compra (incluindo datas do cronograma)
      // Formatar datas no padrão ISO 8601 (YYYY-MM-DDTHH:mm:ss) SEM converter para UTC
      const formatarDataPncp = (data: string) => {
        if (!data) return undefined
        // Se já tem T (datetime-local), completar com segundos se necessário
        if (data.includes('T')) {
          // Se tem apenas HH:mm (16 chars), adicionar :00
          if (data.length === 16) {
            return `${data}:00`
          }
          return data.slice(0, 19)
        }
        // Se é só data (YYYY-MM-DD), adicionar horário padrão
        return `${data}T00:00:00`
      }
      
      // Debug: ver datas antes de enviar
      console.log('[PNCP] Cronograma atual:', cronograma)
      console.log('[PNCP] Data início formatada:', formatarDataPncp(cronograma.data_inicio_acolhimento))
      console.log('[PNCP] Data fim formatada:', formatarDataPncp(cronograma.data_fim_acolhimento))
      
      const compraResponse = await fetch(
        `${API_URL}/api/pncp/compras/${anoCompraPncp}/${sequencialCompraPncp}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            licitacaoId: id,
            objetoCompra: dadosBasicos.objeto,
            informacaoComplementar: dadosBasicos.objeto_detalhado,
            // Datas do cronograma
            dataAberturaProposta: formatarDataPncp(cronograma.data_inicio_acolhimento),
            dataEncerramentoProposta: formatarDataPncp(cronograma.data_fim_acolhimento),
            justificativaRetificacao: justificativa
          })
        }
      )

      const compraData = await compraResponse.json()
      if (!compraResponse.ok || !compraData.sucesso) {
        erros.push(`Compra: ${compraData.message || 'Erro desconhecido'}`)
      }

      // 2. Processar itens - só retificar os que mudaram ou são novos
      if (itens.length > 0) {
        // Função para verificar se um item foi alterado
        const itemFoiAlterado = (itemAtual: ItemLicitacao): boolean => {
          const itemOriginal = itensOriginais.find(o => o.numero === itemAtual.numero)
          if (!itemOriginal) return true // Item novo
          
          // Comparar campos relevantes para o PNCP
          return (
            itemOriginal.descricao !== itemAtual.descricao ||
            itemOriginal.quantidade !== itemAtual.quantidade ||
            itemOriginal.valor_unitario !== itemAtual.valor_unitario ||
            itemOriginal.unidade !== itemAtual.unidade
          )
        }
        
        // Filtrar apenas itens alterados ou novos
        const itensParaProcessar = itens.filter(itemFoiAlterado)
        
        if (itensParaProcessar.length === 0) {
          console.log('[PNCP] Nenhum item foi alterado, pulando retificação de itens')
        } else {
          console.log(`[PNCP] ${itensParaProcessar.length} item(ns) alterado(s) para processar`)
        }
        
        for (const item of itensParaProcessar) {
          // Verificar se é item novo (não existe nos originais)
          const isNovoItem = !itensOriginais.find(o => o.numero === item.numero)
          
          try {
            if (isNovoItem) {
              // Item novo - incluir diretamente
              const incluirResponse = await fetch(
                `${API_URL}/api/pncp/compras/${anoCompraPncp}/${sequencialCompraPncp}/itens`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    licitacaoId: id,
                    numeroItem: item.numero,
                    descricao: item.descricao,
                    quantidade: item.quantidade,
                    valorUnitarioEstimado: item.valor_unitario,
                    unidadeMedida: item.unidade
                  })
                }
              )
              
              const incluirData = await incluirResponse.json()
              if (!incluirResponse.ok || !incluirData.sucesso) {
                erros.push(`Item ${item.numero} (novo): ${incluirData.message || 'Erro ao incluir'}`)
              }
            } else {
              // Item existente - retificar
              const itemResponse = await fetch(
                `${API_URL}/api/pncp/compras/${anoCompraPncp}/${sequencialCompraPncp}/itens/${item.numero}`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    licitacaoId: id,
                    descricao: item.descricao,
                    quantidade: item.quantidade,
                    valorUnitarioEstimado: item.valor_unitario,
                    valorTotal: item.quantidade * item.valor_unitario,
                    unidadeMedida: item.unidade,
                    justificativaRetificacao: justificativa
                  })
                }
              )
              
              const itemData = await itemResponse.json()
              if (!itemResponse.ok || !itemData.sucesso) {
                erros.push(`Item ${item.numero}: ${itemData.message || 'Erro'}`)
              }
            }
          } catch (itemError) {
            erros.push(`Item ${item.numero}: Erro de conexão`)
          }
        }
      }

      // Mostrar resultado
      if (erros.length === 0) {
        alert('✅ Licitação e itens atualizados no PNCP com sucesso!')
      } else {
        alert(`⚠️ Alguns erros ocorreram:\n\n${erros.join('\n')}`)
      }
    } catch (error) {
      console.error('Erro ao retificar no PNCP:', error)
      alert('⚠️ Licitação salva localmente, mas erro ao atualizar no PNCP')
    } finally {
      setAtualizandoPncp(false)
      router.push('/orgao/licitacoes')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Editar Licitação</h1>
            <p className="text-muted-foreground">{dadosBasicos.numero_processo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {enviadoPncp && linkPncp && (
            <Button variant="outline" size="sm" asChild>
              <a href={linkPncp} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Ver no PNCP
              </a>
            </Button>
          )}
          <Button onClick={() => salvar()} disabled={saving || atualizandoPncp}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : atualizandoPncp ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Atualizando PNCP...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Alerta PNCP */}
      {enviadoPncp && (
        <Alert className="bg-green-50 border-green-200">
          <Upload className="h-4 w-4 text-green-600" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              <Badge variant="outline" className="bg-green-100 text-green-700 mr-2">PNCP</Badge>
              Esta licitação já foi publicada no Portal Nacional de Contratações Públicas.
              Ao salvar, você poderá atualizar as informações no PNCP.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dados">Dados Básicos</TabsTrigger>
          <TabsTrigger value="classificacao">Classificação</TabsTrigger>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="lotes" disabled={!classificacao.usa_lotes}>Lotes</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <DadosBasicosTab 
            dados={dadosBasicos} 
            onChange={setDadosBasicos}
            modoImportacao={modoImportacao}
            onToggleModo={() => setModoImportacao(!modoImportacao)}
          />
        </TabsContent>

        <TabsContent value="classificacao">
          <ClassificacaoTab dados={classificacao} onChange={handleClassificacaoChange} orgaoId={orgaoId} />
        </TabsContent>

        <TabsContent value="itens">
          <ItensTab 
            itens={itens} 
            onChange={setItens}
            orgaoId={orgaoId}
            modoVinculacaoPca={classificacao.modo_vinculacao_pca}
            itemPcaSelecionado={classificacao.item_pca}
            usaLotes={classificacao.usa_lotes}
            lotes={lotes}
            modoBeneficioMpe={classificacao.modo_beneficio_mpe}
            enviadoPncp={enviadoPncp}
          />
        </TabsContent>

        <TabsContent value="lotes">
          <LotesManager
            lotes={lotes}
            itens={itens}
            itensPca={itensPca}
            onLotesChange={setLotes}
            onItensChange={setItens}
            onLoadItensPca={() => {}}
            orgaoId={orgaoId}
            enviadoPncp={enviadoPncp}
          />
        </TabsContent>

        <TabsContent value="cronograma">
          <CronogramaTab dados={cronograma} onChange={setCronograma} />
        </TabsContent>

        <TabsContent value="configuracoes">
          <ConfiguracoesTab dados={configuracoes} onChange={setConfiguracoes} />
        </TabsContent>
      </Tabs>

      {/* Navegação entre abas */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button 
          variant="outline" 
          onClick={irParaAnterior}
          disabled={!temAnterior}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/orgao/licitacoes')}>
            Cancelar
          </Button>
          <Button onClick={() => salvar()} disabled={saving || atualizandoPncp}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : atualizandoPncp ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Atualizando PNCP...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>

        <Button 
          onClick={irParaProximo}
          disabled={!temProximo}
        >
          Próximo
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
