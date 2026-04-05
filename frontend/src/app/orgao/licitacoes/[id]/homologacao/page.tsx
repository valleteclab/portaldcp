"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Award, CheckCircle2, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { API_URL, authFetch } from "@/lib/api"

interface AdjItem {
  itemId: string
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  vencedor: { fornecedorId: string; razaoSocial: string; cpfCnpj: string; valor: number } | null
}

interface AdjStatus {
  sessaoId: string
  licitacaoId: string
  etapa: string
  itens: AdjItem[]
}

interface Licitacao {
  id: string
  numero?: string
  processo?: string
  objeto: string
  fase: string
}

export default function HomologacaoPage() {
  const params = useParams()
  const router = useRouter()
  const licitacaoId = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [sessaoId, setSessaoId] = useState<string | null>(null)
  const [adjStatus, setAdjStatus] = useState<AdjStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [homologado, setHomologado] = useState(false)

  useEffect(() => {
    const carregar = async () => {
      setLoading(true)
      setError(null)
      try {
        // Busca licitação
        const rLic = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
        if (!rLic.ok) throw new Error("Licitação não encontrada")
        const lic: Licitacao = await rLic.json()
        setLicitacao(lic)
        setHomologado(['HOMOLOGACAO', 'CONCLUIDO'].includes(lic.fase))

        // Busca sessão da licitação
        const rSessao = await authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}`)
        if (!rSessao.ok) {
          // Sem sessão registrada — apenas mostra licitação
          setLoading(false)
          return
        }
        const sessao = await rSessao.json()
        setSessaoId(sessao.id)

        // Busca itens adjudicados
        const rAdj = await authFetch(`${API_URL}/api/sessao/${sessao.id}/adjudicacao`)
        if (rAdj.ok) setAdjStatus(await rAdj.json())
      } catch (e: any) {
        setError(e.message || "Erro ao carregar dados")
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [licitacaoId])

  const homologar = async () => {
    setActionLoading(true)
    setActionError(null)
    try {
      // Avança fase da licitação: ADJUDICACAO → HOMOLOGACAO
      const r = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/avancar-fase`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      if (!r.ok) {
        const e = await r.json()
        throw new Error(e.message || "Erro ao homologar")
      }
      setHomologado(true)
      setConfirmDialog(false)
      // Atualiza licitação local
      setLicitacao(prev => prev ? { ...prev, fase: "HOMOLOGACAO" } : prev)
    } catch (e: any) {
      setActionError(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const totalValor = adjStatus?.itens
    .filter(i => i.vencedor)
    .reduce((acc, i) => acc + (i.vencedor?.valor || 0), 0) || 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href={`/orgao/licitacoes/${licitacaoId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Homologação</h1>
            <p className="text-sm text-slate-600">
              {licitacao?.numero || licitacao?.processo || licitacaoId} — {licitacao?.objeto}
            </p>
          </div>
          {licitacao && (
            <Badge className={homologado ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-amber-100 text-amber-800 border-amber-300"}>
              {homologado ? "Homologado" : licitacao.fase}
            </Badge>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin" />
              Carregando...
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-red-200">
            <CardContent className="py-8 text-center text-red-600">{error}</CardContent>
          </Card>
        ) : (
          <>
            {/* Aviso legal */}
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-4 text-sm text-amber-800">
                <strong>Art. 71, §2º — Lei 14.133/2021:</strong> A homologação é ato da autoridade competente que ratifica o procedimento licitatório e autoriza a celebração do contrato.
              </CardContent>
            </Card>

            {/* Resumo dos itens adjudicados */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-emerald-600" />
                  Itens Adjudicados
                </CardTitle>
                <CardDescription>
                  Resumo do resultado final da sessão de disputa.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {adjStatus?.itens.length ? (
                  <>
                    {adjStatus.itens.map(item => (
                      <div key={item.itemId} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Item {item.numero}
                            </div>
                            <div className="font-medium text-slate-900">{item.descricao}</div>
                            <div className="text-sm text-slate-500">
                              {item.quantidade} {item.unidade}
                            </div>
                          </div>
                          {item.vencedor ? (
                            <div className="text-right space-y-1">
                              <div className="font-semibold text-emerald-700">
                                {item.vencedor.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </div>
                              <div className="text-sm text-slate-700">{item.vencedor.razaoSocial}</div>
                              <div className="text-xs text-slate-400">{item.vencedor.cpfCnpj}</div>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-slate-400">Sem vencedor</Badge>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-emerald-900">Valor total adjudicado</div>
                        <div className="text-xl font-bold text-emerald-700">
                          {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-6 text-center text-sm text-slate-400">
                    Nenhum item adjudicado encontrado. Verifique se a adjudicação foi concluída na Sala de Disputa V3.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ação de homologação */}
            {homologado ? (
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="py-6 text-center">
                  <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
                  <div className="text-lg font-semibold text-emerald-800">Processo Homologado</div>
                  <div className="mt-1 text-sm text-emerald-700">
                    A licitação foi homologada com sucesso. O processo avança para contratação.
                  </div>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => router.push(`/orgao/licitacoes/${licitacaoId}`)}
                  >
                    Voltar para a licitação
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Ação de Homologação</CardTitle>
                  <CardDescription>
                    Ao homologar, você ratifica todo o procedimento licitatório como autoridade competente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {actionError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {actionError}
                    </div>
                  )}
                  <Button
                    className="w-full bg-emerald-700 hover:bg-emerald-800"
                    size="lg"
                    onClick={() => setConfirmDialog(true)}
                    disabled={!adjStatus?.itens.some(i => i.vencedor)}
                  >
                    <Award className="mr-2 h-5 w-5" />
                    Homologar processo licitatório
                  </Button>
                  {!adjStatus?.itens.some(i => i.vencedor) && (
                    <p className="text-xs text-center text-slate-500">
                      É necessário concluir a adjudicação na Sala de Disputa V3 antes de homologar.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Dialog de confirmação */}
      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Homologação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Você está prestes a <strong>homologar</strong> o processo licitatório conforme Art. 71, §2º da Lei 14.133/2021.
            </p>
            <p>
              Esta ação é <strong>irreversível</strong> e autoriza a celebração do contrato com o(s) vencedor(es) adjudicado(s).
            </p>
            {totalValor > 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <span className="font-medium">Valor total: </span>
                {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-700 hover:bg-emerald-800"
              onClick={homologar}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Award className="mr-2 h-4 w-4" />
              )}
              Confirmar Homologação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
