"use client"

import { ROTULO_CRITERIO, ROTULO_MODO_DISPUTA } from "@/lib/licitacao-rotulos"
import { useState, useEffect, use, Fragment } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  FileText, 
  Package, 
  Send,
  AlertCircle,
  Info
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { API_URL, authFetch } from '@/lib/api'

interface LoteLicitacao {
  id: string
  numero: number
  descricao: string
  valor_total_estimado?: string | number | null
  tipo_beneficio_mpe?: string | null
}

interface ItemLicitacao {
  id: string
  lote_id?: string | null
  numero_item: number
  descricao_resumida: string
  quantidade: number
  unidade_medida: string
  valor_unitario_estimado: number
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  criterio_julgamento: string
  modo_disputa: string
  orgao?: { nome: string }
  data_abertura_sessao?: string
  sigilo_orcamento?: 'PUBLICO' | 'SIGILOSO'
}

const steps = [
  { id: 1, title: "Declarações", icon: FileText },
  { id: 2, title: "Itens e Valores", icon: Package },
  { id: 3, title: "Revisão e Envio", icon: Send },
]

export default function CadastrarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [loading, setLoading] = useState(true)

  const parseIsoLocal = (value?: string) => {
    if (!value) return undefined
    const match = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?\s*$/)
    if (!match) return undefined
    const [, ano, mes, dia, hora, min, seg = '00'] = match
    const date = new Date(
      parseInt(ano),
      parseInt(mes) - 1,
      parseInt(dia),
      parseInt(hora),
      parseInt(min),
      parseInt(seg)
    )
    return isNaN(date.getTime()) ? undefined : date
  }

  const envioEncerrado = () => {
    const abertura = parseIsoLocal(licitacao?.data_abertura_sessao)
    if (!abertura) return false
    return new Date() >= abertura
  }
  
  const [declaracoes, setDeclaracoes] = useState({
    termos: false,
    mpe: false,
    integridade: false,
    inexistenciaFatos: false,
    menor: false,
    reservaCargos: false,
    custosTrabalhistas: false,
    responsabilidade: false,
  })

  // ME/EPP (LC 123/2006 art. 48): itens exclusivos/cota só para ME/EPP (porte do cadastro + declaração)
  const [participacao, setParticipacao] = useState<{
    porte: string | null
    porteMpe: boolean
    itens: Array<{ itemId: string; numero: number; somenteMpe: boolean; ehCota: boolean }>
  } | null>(null)

  // Licitação por lote: os itens aparecem agrupados sob o lote, com o benefício ME/EPP no cabeçalho
  const [lotes, setLotes] = useState<LoteLicitacao[]>([])

  const [itensPropostos, setItensPropostos] = useState<Array<{
    id: string
    numero: number
    loteId: string | null
    descricao: string
    quantidade: number
    unidade: string
    valorEstimado: number
    valorProposto: number
    marca: string
    modelo: string
  }>>([])

  // Buscar dados da licitação e itens
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (localStorage.getItem('fornecedor')) {
          const resPropostas = await authFetch(`${API_URL}/api/propostas/minhas`)
          if (resPropostas.ok) {
            const propostas = await resPropostas.json()
            const existente = propostas.find((p: any) => p.licitacao_id === resolvedParams.id)
            if (existente) {
              router.replace(`/fornecedor/propostas/${existente.id}`)
              return
            }
          }
        }

        // Buscar licitação
        const resLicitacao = await authFetch(`${API_URL}/api/licitacoes/${resolvedParams.id}`)
        if (resLicitacao.ok) {
          const dataLicitacao = await resLicitacao.json()
          setLicitacao(dataLicitacao)
        }

        // Participação ME/EPP por item (o backend barra de qualquer forma; aqui é o aviso)
        if (localStorage.getItem('fornecedor')) {
          const resPart = await authFetch(`${API_URL}/api/julgamento/licitacao/${resolvedParams.id}/me-epp/participacao`)
          if (resPart.ok) setParticipacao(await resPart.json())
        }

        // Buscar itens da licitação
        const resItens = await authFetch(`${API_URL}/api/itens/licitacao/${resolvedParams.id}`)
        if (resItens.ok) {
          const dataItens = await resItens.json()
          setItensPropostos(dataItens.map((item: ItemLicitacao, i: number) => ({
            id: item.id,
            numero: item.numero_item ?? i + 1,
            loteId: item.lote_id ?? null,
            descricao: item.descricao_resumida,
            quantidade: item.quantidade,
            unidade: item.unidade_medida,
            valorEstimado: item.valor_unitario_estimado,
            valorProposto: 0,
            marca: '',
            modelo: ''
          })))
        }

        // Lotes (leitura pública da licitação divulgada)
        const resLotes = await authFetch(`${API_URL}/api/lotes/licitacao/${resolvedParams.id}`)
        if (resLotes.ok) {
          const dataLotes = await resLotes.json()
          if (Array.isArray(dataLotes)) setLotes([...dataLotes].sort((a, b) => Number(a.numero) - Number(b.numero)))
        }
      } catch (err) {
        console.error('Erro ao buscar dados:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [resolvedParams.id])

  const updateItemValue = (id: string, field: string, value: string | number) => {
    setItensPropostos(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ))
  }

  const exclusivos = new Map((participacao?.itens ?? []).filter((i) => i.somenteMpe).map((i) => [i.itemId, i]))
  const podeExclusivos = !!participacao?.porteMpe && declaracoes.mpe
  const bloqueado = (id: string) => exclusivos.has(id) && !podeExclusivos
  const itensPermitidos = itensPropostos.filter((i) => !bloqueado(i.id))
  const oQue = lotes.length > 0 && itensPropostos.some((i) => i.loteId) ? 'lotes' : 'itens'
  const avisoExclusivo = exclusivos.size === 0 || podeExclusivos
    ? null
    : participacao?.porteMpe
      ? `Há ${oQue} EXCLUSIVOS para ME/EPP ou de COTA RESERVADA (LC 123/2006, art. 48). Para cotá-los, marque a "Declaração ME/EPP" na etapa 1.`
      : `Há ${oQue} EXCLUSIVOS para ME/EPP ou de COTA RESERVADA (LC 123/2006, art. 48, I e III). Seu cadastro indica porte ${participacao?.porte ?? 'não informado'}: esses ${oQue} ficam fora da sua proposta.`

  // Grupos da tabela: um por lote (na ordem dos lotes) e, se houver, os itens sem lote
  type ItemProposto = (typeof itensPropostos)[number]
  const porLote = lotes.length > 0 && itensPropostos.some((i) => i.loteId)
  const grupos: Array<{ lote: LoteLicitacao | null; itens: ItemProposto[] }> = porLote
    ? [
        ...lotes.map((lote) => ({ lote, itens: itensPropostos.filter((i) => i.loteId === lote.id) })).filter((g) => g.itens.length > 0),
        ...(itensPropostos.some((i) => !i.loteId || !lotes.some((l) => l.id === i.loteId))
          ? [{ lote: null, itens: itensPropostos.filter((i) => !i.loteId || !lotes.some((l) => l.id === i.loteId)) }]
          : []),
      ]
    : [{ lote: null, itens: itensPropostos }]
  const lancePorLote = (licitacao as { base_lance?: string } | null)?.base_lance === 'TOTAL_LOTE'
  const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const colunasTabela = licitacao?.sigilo_orcamento !== 'SIGILOSO' ? 7 : 6

  const calcularTotalProposta = () => {
    return itensPermitidos.reduce((total, item) => {
      return total + (item.quantidade * (item.valorProposto || 0))
    }, 0)
  }

  const calcularTotalEstimado = () => {
    return itensPropostos.reduce((total, item) => {
      return total + (item.quantidade * item.valorEstimado)
    }, 0)
  }

  const canProceed = () => {
    if (currentStep === 1) {
      // Integridade é opcional (Art. 60 - apenas contratos acima de R$ 200 milhões)
      return (
        declaracoes.termos &&
        declaracoes.inexistenciaFatos &&
        declaracoes.menor &&
        declaracoes.custosTrabalhistas &&
        declaracoes.responsabilidade
      )
    }
    if (currentStep === 2) {
      return itensPermitidos.length > 0 && itensPermitidos.every(item => item.valorProposto > 0)
    }
    return true
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    
    try {
      if (envioEncerrado()) {
        setError('Não é possível enviar proposta após a abertura da sessão')
        setIsSubmitting(false)
        return
      }

      // Fornecedor logado (a identidade vai pelo token, não pelo corpo)
      if (!localStorage.getItem('fornecedor')) {
        setError('Você precisa estar logado para enviar uma proposta')
        setIsSubmitting(false)
        return
      }

      // Criar proposta
      const propostaData = {
        licitacao_id: resolvedParams.id,
        declaracao_termos: declaracoes.termos,
        declaracao_mpe: declaracoes.mpe,
        declaracao_integridade: declaracoes.integridade,
        declaracao_inexistencia_fatos: declaracoes.inexistenciaFatos,
        declaracao_menor: declaracoes.menor,
        declaracao_reserva_cargos: declaracoes.reservaCargos,
        declaracao_custos_trabalhistas: declaracoes.custosTrabalhistas,
        declaracao_responsabilidade: declaracoes.responsabilidade,
        valor_total_proposta: calcularTotalProposta(),
        itens: itensPermitidos.map(item => ({
          item_licitacao_id: item.id,
          valor_unitario: item.valorProposto,
          marca: item.marca || null,
          modelo: item.modelo || null,
        }))
      }

      const res = await authFetch(`${API_URL}/api/propostas`, {
        method: 'POST',
        body: JSON.stringify(propostaData)
      })

      if (!res.ok) {
        const errorData = await res.json()
        if (res.status === 409 && errorData?.propostaId) {
          router.replace(`/fornecedor/propostas/${errorData.propostaId}`)
          return
        }
        throw new Error(errorData.message || 'Erro ao enviar proposta')
      }

      const proposta = await res.json()

      // Enviar proposta (mudar status de RASCUNHO para ENVIADA)
      const resEnvio = await authFetch(`${API_URL}/api/propostas/${proposta.id}/enviar`, {
        method: 'PUT'
      })
      if (!resEnvio.ok) {
        const corpo = await resEnvio.json().catch(() => ({}))
        throw new Error(corpo.message || 'A proposta foi salva como rascunho, mas não foi enviada. Abra a proposta e envie novamente.')
      }

      // O detalhe da proposta mostra o status ENVIADA (sem alert())
      router.push(`/fornecedor/propostas/${proposta.id}`)
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar proposta')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cadastrar Proposta</h1>
          <p className="text-muted-foreground">{licitacao?.numero_processo} - {licitacao?.orgao?.nome}</p>
        </div>
      </div>

      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Erro</AlertTitle>
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {envioEncerrado() && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Envio encerrado</AlertTitle>
          <AlertDescription className="text-yellow-700">
            A abertura da sessão já ocorreu. Não é possível enviar uma nova proposta.
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline" className="bg-white">Critério: {ROTULO_CRITERIO[licitacao?.criterio_julgamento ?? ""] ?? licitacao?.criterio_julgamento}</Badge>
            <Badge variant="outline" className="bg-white">Modo: {ROTULO_MODO_DISPUTA[licitacao?.modo_disputa ?? ""] ?? licitacao?.modo_disputa}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === step.id
            const isCompleted = currentStep > step.id
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                  isActive ? 'bg-blue-600 text-white' : 
                  isCompleted ? 'bg-green-600 text-white' : 
                  'bg-slate-200 text-slate-600'
                }`}>
                  {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  <span className="font-medium">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-16 h-1 mx-2 ${
                    isCompleted ? 'bg-green-600' : 'bg-slate-200'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Termos e Declarações</CardTitle>
            <CardDescription>Confirme as declarações obrigatórias para participar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Importante</AlertTitle>
              <AlertDescription>
                As declarações marcadas com (*) são obrigatórias conforme a Lei 14.133/2021
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Termo de Aceitação *</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que cumpro e estou ciente de todas as declarações contidas no termo de aceitação.
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.termos} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, termos: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Declaração ME/EPP</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que não ultrapasso o limite de faturamento e cumpro os requisitos da LC 123/2006.
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.mpe} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, mpe: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50">
                <div className="flex-1">
                  <Label className="font-medium">Programa de Integridade</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que desenvolvo programa de integridade conforme Art. 60 da Lei 14.133/2021.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    Opcional — exigido apenas para contratos de grande vulto (acima de R$ 200 milhões)
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.integridade} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, integridade: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Inexistência de Fatos Impeditivos *</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro a inexistência de fatos impeditivos para participar desta licitação.
                  </p>
                </div>
                <Switch 
                  checked={declaracoes.inexistenciaFatos} 
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, inexistenciaFatos: v})} 
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Trabalho de Menor *</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que não emprego menor de 18 anos em trabalho noturno, perigoso ou insalubre.
                  </p>
                </div>
                <Switch
                  checked={declaracoes.menor}
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, menor: v})}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Custos Trabalhistas *</Label>
                  <p className="text-sm text-muted-foreground">
                    Declaro que a proposta compreende a integralidade dos custos para atendimento dos
                    direitos trabalhistas (Constituição, leis trabalhistas, normas infralegais e convenções coletivas vigentes).
                  </p>
                </div>
                <Switch
                  checked={declaracoes.custosTrabalhistas}
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, custosTrabalhistas: v})}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Responsabilidade pela Proposta *</Label>
                  <p className="text-sm text-muted-foreground">
                    Assumo total responsabilidade pela proposta e declaro que nos valores estão inclusos todos os
                    custos operacionais, encargos previdenciários, trabalhistas, tributários e comerciais.
                  </p>
                </div>
                <Switch
                  checked={declaracoes.responsabilidade}
                  onCheckedChange={(v) => setDeclaracoes({...declaracoes, responsabilidade: v})}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Itens da Licitação</CardTitle>
            <CardDescription>Informe os valores e especificações para cada item</CardDescription>
          </CardHeader>
          <CardContent>
            {porLote && lancePorLote && (
              <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                Licitação por lote, com lance pelo valor global do lote: informe o preço unitário de cada item; a disputa será pelo total do lote.
              </p>
            )}
            {avisoExclusivo && (
              <Alert className="mb-4 border-amber-300 bg-amber-50">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Participação exclusiva de ME/EPP</AlertTitle>
                <AlertDescription>
                  {avisoExclusivo}
                  {itensPermitidos.length === 0 && ' Todos os itens desta licitação são exclusivos: não é possível enviar proposta.'}
                </AlertDescription>
              </Alert>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  {licitacao?.sigilo_orcamento !== 'SIGILOSO' && (
                    <TableHead className="text-right">{(licitacao as any)?.modalidade === 'LEILAO' ? 'Preço mínimo' : 'Valor Ref.'}</TableHead>
                  )}
                  <TableHead className="text-right">Seu Valor Unit.</TableHead>
                  <TableHead>Marca/Modelo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => {
                  const beneficio = g.itens.map((i) => exclusivos.get(i.id)).find(Boolean)
                  const foraDaProposta = g.itens.length > 0 && g.itens.every((i) => bloqueado(i.id))
                  const cotados = g.itens.filter((i) => !bloqueado(i.id) && (i.valorProposto || 0) > 0).length
                  const totalLote = g.itens.reduce((t, i) => t + (bloqueado(i.id) ? 0 : i.quantidade * (i.valorProposto || 0)), 0)
                  const estimadoLote = g.itens.reduce((t, i) => t + Number(i.quantidade) * Number(i.valorEstimado || 0), 0)
                  return (
                    <Fragment key={g.lote?.id ?? 'sem-lote'}>
                      {g.lote && (
                        <TableRow className="bg-slate-100 hover:bg-slate-100">
                          <TableCell colSpan={colunasTabela} className="py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">
                                  Lote {g.lote.numero} — {g.lote.descricao}
                                </span>
                                {beneficio ? (
                                  <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
                                    {beneficio.ehCota ? 'Cota reservada ME/EPP' : 'Exclusivo ME/EPP'}
                                    {foraDaProposta ? ' — fora da sua proposta' : ''}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-slate-600">Ampla participação</Badge>
                                )}
                              </div>
                              <div className="text-sm text-slate-600">
                                {licitacao?.sigilo_orcamento !== 'SIGILOSO' && <span>Estimado do lote: {reais(estimadoLote)}</span>}
                                {!foraDaProposta && (
                                  <span className="ml-3 font-semibold text-blue-700">Sua proposta: {reais(totalLote)}</span>
                                )}
                              </div>
                            </div>
                            {lancePorLote && !foraDaProposta && cotados > 0 && cotados < g.itens.length && (
                              <p className="mt-1 text-xs text-amber-800">
                                O lance é pelo valor global do lote: cote os {g.itens.length} itens para disputá-lo (faltam {g.itens.length - cotados}).
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                      {!g.lote && porLote && (
                        <TableRow className="bg-slate-100 hover:bg-slate-100">
                          <TableCell colSpan={colunasTabela} className="py-2 font-semibold text-slate-900">Itens fora de lote</TableCell>
                        </TableRow>
                      )}
                      {g.itens.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium align-top">{item.numero}</TableCell>
                        <TableCell className="max-w-md align-top">
                          <p className="whitespace-pre-wrap break-words">{item.descricao}</p>
                          {/* Por lote, o benefício aparece uma vez, no cabeçalho do lote */}
                          {!g.lote && exclusivos.has(item.id) && (
                            <Badge variant="outline" className="mt-1 border-amber-400 text-amber-800">
                              {exclusivos.get(item.id)?.ehCota ? 'Cota reservada ME/EPP' : 'Exclusivo ME/EPP'}
                              {bloqueado(item.id) ? ' — fora da sua proposta' : ''}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center align-top">{Number(item.quantidade).toLocaleString('pt-BR')} {item.unidade}</TableCell>
                        {licitacao?.sigilo_orcamento !== 'SIGILOSO' && (
                          <TableCell className="text-right text-muted-foreground">
                            R$ {Number(item.valorEstimado).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            className="w-32 text-right"
                            placeholder="0,00"
                            value={item.valorProposto || ""}
                            disabled={bloqueado(item.id)}
                            onChange={(e) => updateItemValue(item.id, 'valorProposto', parseFloat(e.target.value) || 0)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-40"
                            placeholder="Marca / Modelo"
                            value={item.marca}
                            onChange={(e) => updateItemValue(item.id, 'marca', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          R$ {(item.quantidade * (item.valorProposto || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                      ))}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>

            <div className="mt-6 flex justify-end">
              <div className="bg-slate-100 p-4 rounded-lg text-right">
                {licitacao?.sigilo_orcamento !== 'SIGILOSO' && (
                  <p className="text-sm text-muted-foreground">Valor Estimado: R$ {calcularTotalEstimado().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                )}
                <p className="text-xl font-bold text-blue-600">
                  Total da Proposta: R$ {calcularTotalProposta().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Revisão da Proposta</CardTitle>
            <CardDescription>Confira os dados antes de enviar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Declarações Aceitas</h3>
                <ul className="space-y-1 text-sm">
                  {declaracoes.termos && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Termo de Aceitação</li>}
                  {declaracoes.mpe && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> ME/EPP</li>}
                  {declaracoes.integridade && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Programa de Integridade</li>}
                  {declaracoes.inexistenciaFatos && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Inexistência de Fatos Impeditivos</li>}
                  {declaracoes.menor && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Trabalho de Menor</li>}
                  {declaracoes.custosTrabalhistas && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Custos Trabalhistas</li>}
                  {declaracoes.responsabilidade && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" /> Responsabilidade pela Proposta</li>}
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2">Resumo Financeiro</h3>
                <div className="space-y-2 text-sm">
                  <p>Itens cotados: {itensPermitidos.filter(i => i.valorProposto > 0).length} de {itensPropostos.length}</p>
                  <p>Valor Estimado: R$ {calcularTotalEstimado().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-lg font-bold text-blue-600">
                    Total: R$ {calcularTotalProposta().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">Informação</AlertTitle>
              <AlertDescription className="text-blue-700">
                {['MELHOR_TECNICA', 'TECNICA_E_PRECO', 'MAIOR_RETORNO_ECONOMICO'].includes(licitacao?.criterio_julgamento ?? '') && (
                  <span className="mb-1 block font-medium">
                    Critério {licitacao?.criterio_julgamento === 'MAIOR_RETORNO_ECONOMICO' ? 'maior retorno econômico' : 'técnico'}: depois de enviar,
                    anexe a {licitacao?.criterio_julgamento === 'MAIOR_RETORNO_ECONOMICO' ? 'proposta de trabalho' : 'proposta técnica'} na página da proposta, até o fim do acolhimento.
                  </span>
                )}
                Você poderá alterar sua proposta até a abertura da sessão.
                Após a abertura da sessão, alterações só serão permitidas se solicitadas pelo pregoeiro 
                (ex: adequação de preços após fase de lances).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))} 
          disabled={currentStep === 1 || envioEncerrado()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        {currentStep < 3 ? (
          <Button 
            onClick={() => setCurrentStep(prev => Math.min(3, prev + 1))} 
            disabled={!canProceed() || envioEncerrado()}
          >
            Próximo <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button 
            onClick={handleSubmit} 
            disabled={!canProceed() || isSubmitting || envioEncerrado()}
            className="bg-green-600 hover:bg-green-700"
          >
            <Send className="mr-2 h-4 w-4" /> {isSubmitting ? 'Enviando...' : 'Enviar Proposta'}
          </Button>
        )}
      </div>
    </div>
  )
}
