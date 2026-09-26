"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
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

import { API_URL, authFetch } from '@/lib/api'
import { toast } from "sonner"
import Link from "next/link"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { JulgamentoTecnicoConfig } from "@/components/julgamento/JulgamentoTecnicoConfig"
import { ExigenciasHabilitacaoEditor } from "@/components/habilitacao/ExigenciasHabilitacaoEditor"

/** Valor de tempo da licitação em minutos (null = herda do órgão → padrão legal). */
function emMinutos(v: unknown, padrao: number): number {
  const n = Number(v)
  if (v === null || v === undefined || v === '' || !Number.isFinite(n) || n < 0) return padrao
  return n > 30 ? Math.round(n / 60) : n
}

export default function EditarLicitacaoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { confirmar, dialogo } = useDialogoConfirmacao()
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  // ?aba=itens (cockpit → "Editar itens")
  const abaInicial = useSearchParams().get("aba")
  const [abaAtiva, setAbaAtiva] = useState(abaInicial || "dados")
  const [orgaoId, setOrgaoId] = useState<string>("")
  
  // Estado PNCP
  const [enviadoPncp, setEnviadoPncp] = useState(false)
  const [linkPncp, setLinkPncp] = useState<string | null>(null)

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
    // Campos em MINUTOS (licitacoes.intervalo_minimo_lances / tempo_prorrogacao).
    // Intervalo de tempo entre lances do mesmo fornecedor não é exigência legal (0 = sem);
    // prorrogação do modo aberto: 2 min (IN SEGES 73/2022, art. 23).
    intervalo_minimo_lances: 0,
    tempo_prorrogacao: 2,
    diferenca_minima_lances: 0,
    permite_lances_intermediarios: true,
    pregoeiro_id: null,
    sigilo_orcamento: 'PUBLICO'
  })

  const [itens, setItens] = useState<ItemLicitacao[]>([])
  const [lotes, setLotes] = useState<LoteLicitacao[]>([])
  const [itensPca, setItensPca] = useState<ItemPCA[]>([])

  // Handler para mudanças na classificação que limpa itens/lotes quando necessário
  const handleClassificacaoChange = async (novaClassificacao: Classificacao) => {
    const mudouUsaLotes = novaClassificacao.usa_lotes !== classificacao.usa_lotes

    if (mudouUsaLotes) {
      if (novaClassificacao.usa_lotes) {
        // Mudou para usar lotes - perguntar se quer limpar itens soltos
        if (itens.length > 0 && itens.some(i => !i.lote_id)) {
          const limpar = await confirmar({
            titulo: 'Ativar lotes',
            mensagem: `Você tem ${itens.filter(i => !i.lote_id).length} item(ns) sem lote. Ao ativar lotes, esses itens ficarão "soltos" até serem vinculados a um lote.

Deseja limpar os itens existentes?`,
            confirmarRotulo: 'Limpar itens',
            cancelarRotulo: 'Manter itens',
          })
          if (limpar) setItens([])
        }
      } else {
        // Mudou para não usar lotes - perguntar se quer limpar lotes e itens
        if (lotes.length > 0) {
          const limpar = await confirmar({
            titulo: 'Desativar lotes',
            mensagem: `Você tem ${lotes.length} lote(s) com ${itens.filter(i => i.lote_id).length} item(ns). Ao desativar lotes, os lotes serão removidos.

Deseja também limpar os itens vinculados aos lotes?`,
            confirmarRotulo: 'Limpar itens dos lotes',
            cancelarRotulo: 'Manter itens sem lote',
          })
          if (limpar) {
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
  const abas = ['dados', 'classificacao', 'itens', ...(classificacao.usa_lotes ? ['lotes'] : []), 'cronograma', 'habilitacao', 'configuracoes']
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
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}`)
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
          fundamento_legal: data.fundamento_legal ?? null,
          criterio_julgamento: data.criterio_julgamento || 'MENOR_PRECO',
          modo_disputa: data.modo_disputa || 'ABERTO',
          tratamento_diferenciado_mpe: data.tratamento_diferenciado_mpe ?? true,
          modo_beneficio_mpe: data.modo_beneficio_mpe || 'GERAL',
          tipo_beneficio_mpe: data.tipo_beneficio_mpe || 'NENHUM',
          percentual_cota_reservada: data.percentual_cota_reservada || 0,
          modo_vinculacao_pca: data.modo_vinculacao_pca || 'POR_LICITACAO',
          base_lance: data.base_lance || 'TOTAL_ITEM',
          inversao_fases: !!data.inversao_fases,
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
          // Minutos. Esta tela gravava 60/120 (segundos) por engano: valores > 30 são
          // tratados como segundos legados e convertidos para minutos.
          intervalo_minimo_lances: emMinutos(data.intervalo_minimo_lances, 0),
          tempo_prorrogacao: emMinutos(data.tempo_prorrogacao, 2),
          diferenca_minima_lances: data.diferenca_minima_lances || 0,
          permite_lances_intermediarios: data.permite_lances_intermediarios ?? true,
          pregoeiro_id: data.pregoeiro_id || null,
          pregoeiro_nome_atual: data.pregoeiro_nome || '',
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
            tipo_item: item.tipo_item || undefined,
          }))
          setItens(itensMapeados)
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

  /**
   * Salva os dados do processo. Depois da publicação o backend só aceita os
   * campos internos (regras do edital → 409 com a lista `campos`); alterar o
   * edital publicado é pela "Retificação do edital" no cockpit, que versiona o
   * edital, confere o art. 55 e retifica no PNCP pela fila (E7).
   */
  const salvar = async () => {
    setSaving(true)
    setErroSalvar(null)
    try {
      const payload = {
        ...dadosBasicos,
        ...classificacao,
        // Disputa por lote só com lotes (sem lotes volta a disputa por item)
        ...(classificacao.base_lance === 'TOTAL_LOTE' && !classificacao.usa_lotes ? { base_lance: 'TOTAL_ITEM' } : {}),
        ...cronograma,
        // pregoeiro_nome_atual é só exibição (o nome sai do usuário vinculado)
        ...(({ pregoeiro_nome_atual: _nome, ...resto }) => resto)(configuracoes),
        itens,
        lotes,
        valor_total_estimado: itens.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0)
      }

      const res = await authFetch(`${API_URL}/api/licitacoes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success('Processo salvo')
        router.push(`/orgao/processos/${id}`)
        return
      }
      const error = await res.json().catch(() => ({}))
      const campos: string[] = Array.isArray(error?.campos) ? error.campos : []
      setErroSalvar(
        (error?.message || 'Erro ao salvar o processo') +
        (campos.length ? ` — campos: ${campos.join(', ')}. Use "Retificar edital" no processo.` : ''),
      )
    } catch (error) {
      console.error('Erro ao salvar:', error)
      setErroSalvar('Erro de conexão ao salvar o processo')
    } finally {
      setSaving(false)
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
      {dialogo}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push(`/orgao/processos/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Processo
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Editar processo</h1>
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
          <Button onClick={() => salvar()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
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
              Edital publicado: aqui só se alteram dados internos. Mudanças nas regras do edital
              (cronograma, objeto, critério, itens...) são feitas por{" "}
              <Link href={`/orgao/processos/${id}`} className="underline font-medium">Retificar edital</Link>{" "}
              no processo — a retificação vai ao PNCP automaticamente.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {erroSalvar && (
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-700">{erroSalvar}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="dados">Dados Básicos</TabsTrigger>
          <TabsTrigger value="classificacao">Classificação</TabsTrigger>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="lotes" disabled={!classificacao.usa_lotes}>Lotes</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="habilitacao">Habilitação</TabsTrigger>
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <DadosBasicosTab 
            dados={dadosBasicos} 
            onChange={setDadosBasicos}
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

        <TabsContent value="habilitacao">
          {/* Exigências de habilitação do edital (Lei 14.133 arts. 62–70) — plano E4 */}
          <ExigenciasHabilitacaoEditor licitacaoId={id} />
        </TabsContent>

        <TabsContent value="configuracoes">
          <ConfiguracoesTab dados={configuracoes} onChange={setConfiguracoes} />
          {/* Critério técnico (Lei 14.133 arts. 35–37): quesitos, pesos e banca do edital */}
          {["MELHOR_TECNICA", "TECNICA_E_PRECO"].includes(classificacao.criterio_julgamento) && (
            <JulgamentoTecnicoConfig licitacaoId={id} className="mt-6" />
          )}
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
          <Button variant="outline" onClick={() => router.push(`/orgao/processos/${id}`)}>
            Cancelar
          </Button>
          <Button onClick={() => salvar()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
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
