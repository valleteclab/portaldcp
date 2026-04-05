"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Award,
  Building2,
  Clock,
  FileCheck,
  ShieldCheck,
  ShieldX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { API_URL, authFetch } from '@/lib/api'

interface RankingItem {
  posicao: number
  fornecedorId: string
  razaoSocial: string
  cpfCnpj: string
  porte: string | null
  valorTotal: number
  status: string
  isConvocado: boolean
}

interface HabilitacaoStatus {
  sessaoId: string
  licitacaoId: string
  etapa: string
  convocado: RankingItem | null
  ranking: RankingItem[]
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
}

const DOCUMENTOS_OBRIGATORIOS = [
  { tipo: 'CONTRATO_SOCIAL', nome: 'Contrato Social ou Estatuto' },
  { tipo: 'CERTIDAO_NEGATIVA_FEDERAL', nome: 'Certidão Negativa de Débitos Federais' },
  { tipo: 'CERTIDAO_FGTS', nome: 'Certidão de Regularidade do FGTS' },
  { tipo: 'CERTIDAO_TRABALHISTA', nome: 'Certidão Negativa de Débitos Trabalhistas' },
  { tipo: 'CERTIDAO_ESTADUAL', nome: 'Certidão Negativa de Débitos Estaduais' },
  { tipo: 'CERTIDAO_MUNICIPAL', nome: 'Certidão Negativa de Débitos Municipais' },
]

// Validações locais dos documentos (até integração de upload de docs de habilitação)
type DocStatus = 'PENDENTE' | 'VALIDO' | 'INVALIDO'
type DocMap = Record<string, DocStatus>

export default function HabilitacaoPage() {
  const params = useParams()
  const licitacaoId = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [sessaoId, setSessaoId] = useState<string | null>(null)
  const [habilitacao, setHabilitacao] = useState<HabilitacaoStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [docStatus, setDocStatus] = useState<DocMap>({})
  const [erro, setErro] = useState<string | null>(null)

  const carregarDados = useCallback(async () => {
    try {
      const [licRes, sessaoRes] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}`),
      ])
      if (licRes.ok) setLicitacao(await licRes.json())
      if (!sessaoRes.ok) { setErro('Sessão de disputa não encontrada para esta licitação.'); return }
      const sessao = await sessaoRes.json()
      setSessaoId(sessao.id)
      await carregarHabilitacao(sessao.id)
    } catch {
      setErro('Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [licitacaoId])

  const carregarHabilitacao = async (sid: string) => {
    const res = await authFetch(`${API_URL}/api/sessao/${sid}/habilitacao`)
    if (res.ok) {
      const data: HabilitacaoStatus = await res.json()
      setHabilitacao(data)
      // Inicializa status dos documentos como PENDENTE ao trocar de convocado
      if (data.convocado) {
        setDocStatus(
          Object.fromEntries(DOCUMENTOS_OBRIGATORIOS.map(d => [d.tipo, 'PENDENTE' as DocStatus]))
        )
      }
    }
  }

  useEffect(() => { carregarDados() }, [carregarDados])

  const convocarFornecedor = async (fornecedorId: string) => {
    if (!sessaoId) return
    setProcessando(true)
    try {
      await authFetch(`${API_URL}/api/sessao/${sessaoId}/habilitacao/convocar/${fornecedorId}`, { method: 'PUT' })
      await carregarHabilitacao(sessaoId)
    } catch { setErro('Erro ao convocar fornecedor.') }
    finally { setProcessando(false) }
  }

  const habilitarFornecedor = async () => {
    if (!sessaoId || !habilitacao?.convocado) return
    const pendentes = Object.values(docStatus).filter(s => s === 'PENDENTE').length
    if (pendentes > 0) { setErro(`${pendentes} documento(s) ainda não foram verificados.`); return }
    const invalidos = Object.values(docStatus).filter(s => s === 'INVALIDO').length
    if (invalidos > 0) { setErro(`${invalidos} documento(s) inválido(s). Inabilite o fornecedor ou corrija os documentos.`); return }

    setProcessando(true)
    setErro(null)
    try {
      await authFetch(
        `${API_URL}/api/sessao/${sessaoId}/habilitacao/aprovar/${habilitacao.convocado.fornecedorId}`,
        { method: 'PUT' }
      )
      await carregarHabilitacao(sessaoId)
    } catch { setErro('Erro ao aprovar habilitação.') }
    finally { setProcessando(false) }
  }

  const inabilitarFornecedor = async () => {
    if (!sessaoId || !habilitacao?.convocado || !motivo.trim()) {
      setErro('Informe o motivo da inabilitação.')
      return
    }
    setProcessando(true)
    setErro(null)
    try {
      await authFetch(
        `${API_URL}/api/sessao/${sessaoId}/habilitacao/reprovar/${habilitacao.convocado.fornecedorId}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) }
      )
      setMotivo('')
      await carregarHabilitacao(sessaoId)
    } catch { setErro('Erro ao reprovar habilitação.') }
    finally { setProcessando(false) }
  }

  const toggleDoc = (tipo: string, valido: boolean) => {
    setDocStatus(prev => ({ ...prev, [tipo]: valido ? 'VALIDO' : 'INVALIDO' }))
  }

  const formatarMoeda = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const getStatusBadge = (s: DocStatus) => {
    const map = {
      VALIDO: { label: 'Válido', cls: 'bg-green-100 text-green-800', Icon: CheckCircle },
      INVALIDO: { label: 'Inválido', cls: 'bg-red-100 text-red-800', Icon: XCircle },
      PENDENTE: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800', Icon: Clock },
    }
    const { label, cls, Icon } = map[s]
    return <Badge className={cls}><Icon className="mr-1 h-3 w-3" />{label}</Badge>
  }

  if (loading) return (
    <div className="flex min-h-[400px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  )

  const convocado = habilitacao?.convocado ?? null
  const docValidos = Object.values(docStatus).filter(s => s === 'VALIDO').length
  const docTotal = DOCUMENTOS_OBRIGATORIOS.length
  const etapaPos = ['INTENCAO_RECURSO', 'PRAZO_RECURSAL', 'ANALISE_RECURSOS', 'ADJUDICACAO', 'HOMOLOGACAO', 'ENCERRAMENTO']
  const habilitacaoConcluida = habilitacao ? etapaPos.includes(habilitacao.etapa) : false

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/orgao/licitacoes/${licitacaoId}`}>
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Habilitação</h1>
          <p className="text-muted-foreground">
            {licitacao?.numero_processo} — Art. 62-70, Lei 14.133/2021
          </p>
        </div>
        {habilitacao && (
          <Badge className="ml-auto text-sm" variant="outline">{habilitacao.etapa.replace(/_/g, ' ')}</Badge>
        )}
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {erro}
        </div>
      )}

      {habilitacaoConcluida && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Habilitação concluída. Sessão avançou para <strong className="ml-1">{habilitacao?.etapa}</strong>.
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Ranking de classificados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordem de Classificação</CardTitle>
            <CardDescription>Clique para convocar manualmente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {habilitacao?.ranking.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum fornecedor classificado.</p>
            )}
            {habilitacao?.ranking.map((item) => (
              <div
                key={item.fornecedorId}
                className={`rounded-lg border p-3 transition-colors ${
                  item.isConvocado ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-lg font-bold text-slate-400">#{item.posicao}</span>
                  {item.posicao === 1 && (
                    <Badge className="bg-green-100 text-green-800">
                      <Award className="mr-1 h-3 w-3" />Menor Preço
                    </Badge>
                  )}
                  {item.isConvocado && (
                    <Badge className="bg-blue-100 text-blue-800">Convocado</Badge>
                  )}
                  {item.porte && (
                    <Badge variant="outline" className="text-xs">{item.porte}</Badge>
                  )}
                </div>
                <p className="text-sm font-medium">{item.razaoSocial}</p>
                <p className="text-sm font-medium text-green-600">{formatarMoeda(item.valorTotal)}</p>
                {!item.isConvocado && !habilitacaoConcluida && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full text-xs"
                    disabled={processando}
                    onClick={() => convocarFornecedor(item.fornecedorId)}
                  >
                    Convocar para habilitação
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Documentos do convocado */}
        <div className="col-span-2 space-y-4">
          {!convocado && !habilitacaoConcluida && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                Nenhum fornecedor convocado. Selecione o 1º classificado na lista ao lado
                e clique em "Convocar para habilitação", ou use o endpoint da sessão.
              </CardContent>
            </Card>
          )}

          {convocado && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {convocado.razaoSocial}
                      </CardTitle>
                      <CardDescription>
                        CNPJ: {convocado.cpfCnpj}
                        {convocado.porte && ` · ${convocado.porte}`}
                        {' · '}Posição #{convocado.posicao}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Proposta</p>
                      <p className="text-xl font-bold text-green-600">{formatarMoeda(convocado.valorTotal)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex justify-between text-sm">
                        <span>Documentos verificados</span>
                        <span className="font-medium">{docValidos}/{docTotal}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${(docValidos / docTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileCheck className="h-5 w-5" />
                    Documentos de Habilitação
                  </CardTitle>
                  <CardDescription>
                    Verifique cada documento. Use ✓ para válido e ✗ para inválido.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {DOCUMENTOS_OBRIGATORIOS.map((doc) => {
                    const status = docStatus[doc.tipo] ?? 'PENDENTE'
                    return (
                      <div key={doc.tipo} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-slate-400" />
                          <p className="text-sm font-medium">{doc.nome}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(status)}
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                            title="Válido"
                            onClick={() => toggleDoc(doc.tipo, true)}
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            title="Inválido"
                            onClick={() => toggleDoc(doc.tipo, false)}
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {/* Decisão */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Decisão de Habilitação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={processando || docValidos < docTotal}
                      onClick={habilitarFornecedor}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Habilitar — avançar para intenção de recurso
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      placeholder="Motivo da inabilitação (obrigatório)..."
                      rows={2}
                    />
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={processando || !motivo.trim()}
                      onClick={inabilitarFornecedor}
                    >
                      <ShieldX className="mr-2 h-4 w-4" />
                      Inabilitar — convocar próximo classificado
                    </Button>
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Art. 68, Lei 14.133/2021 — se reprovado, o próximo classificado é convocado automaticamente
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
