"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Award, FileSignature, Gavel, Loader2, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SituacaoBadge } from "@/components/licitacao/SituacaoBadge"
import { API_URL, authFetch } from "@/lib/api"
import { COR_FASE, ROTULO_FASE, ROTULO_MODALIDADE, ROTULO_STATUS_PROPOSTA, dataHoraBR, moedaBR } from "@/lib/licitacao-rotulos"

interface Participacao {
  proposta: { id: string; status: string; valorTotal: number | null; dataEnvio: string | null; motivoDesclassificacao: string | null; requerConfirmacao: boolean }
  licitacao: {
    id: string
    numeroProcesso: string
    numeroEdital: string | null
    objeto: string
    modalidade: string
    fase: string
    situacao: string
    orgao: string | null
    dataAberturaSessao: string | null
    dataHomologacao: string | null
  }
  sessao: { id: string; status: string; etapa: string } | null
  resultado: { venceu: boolean; itens: Array<{ numero: number; descricao: string; valorTotal: number | null }>; valorTotal: number } | null
  contratos: Array<{ id: string; numero: string; status: string; valor: number }>
  atas: Array<{ id: string; numero: string; status: string; valor: number }>
  proximaAcao: { codigo: string; texto: string }
}

type Filtro = "all" | "ANDAMENTO" | "VENCIDAS" | "ENCERRADAS"

const EXTINTAS = ["REVOGADA", "ANULADA", "DESERTA", "FRACASSADA", "CONCLUIDA"]

function emAndamento(p: Participacao) {
  return !p.licitacao.dataHomologacao && !EXTINTAS.includes(p.licitacao.situacao) && !["CANCELADA", "RASCUNHO"].includes(p.proposta.status)
}

/** Botão da próxima ação (a regra é do backend: proximaAcaoParticipacao). */
function AcaoPrincipal({ p }: { p: Participacao }) {
  const lic = p.licitacao.id
  switch (p.proximaAcao.codigo) {
    case "ENTRAR_SALA":
      return (
        <Link href={`/fornecedor/licitacoes/${lic}/sessao`}>
          <Button size="sm"><Gavel className="mr-1 h-4 w-4" /> Entrar na sala</Button>
        </Link>
      )
    case "CONFIRMAR_PROPOSTA":
    case "ENVIAR_PROPOSTA":
      return (
        <Link href={`/fornecedor/propostas/${p.proposta.id}`}>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700">Abrir proposta</Button>
        </Link>
      )
    case "ASSINAR_CONTRATO":
      return p.contratos[0] ? (
        <Link href={`/fornecedor/contratos/${p.contratos.find((c) => c.status === "AGUARDANDO_ASSINATURA")?.id ?? p.contratos[0].id}`}>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><FileSignature className="mr-1 h-4 w-4" /> Assinar contrato</Button>
        </Link>
      ) : null
    default:
      return (
        <Link href={`/fornecedor/licitacoes/${lic}`}>
          <Button size="sm" variant="outline">Ver licitação</Button>
        </Link>
      )
  }
}

/**
 * MINHAS PARTICIPAÇÕES (plano E8 item 8): propostas do fornecedor (token) por
 * licitação — status, fase, próxima ação, resultado depois da homologação e os
 * contratos/atas gerados (GET /api/portal-fornecedor/participacoes).
 */
export default function ParticipacoesFornecedorPage() {
  const [dados, setDados] = useState<Participacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("all")

  useEffect(() => {
    authFetch(`${API_URL}/api/portal-fornecedor/participacoes`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Entre com a conta de fornecedor." : "Não foi possível carregar as participações.")
        return r.json()
      })
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"))
  }, [])

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return (dados ?? []).filter((p) => {
      if (b && ![p.licitacao.objeto, p.licitacao.numeroProcesso, p.licitacao.numeroEdital, p.licitacao.orgao].some((x) => x?.toLowerCase().includes(b))) return false
      if (filtro === "ANDAMENTO") return emAndamento(p)
      if (filtro === "VENCIDAS") return !!p.resultado?.venceu
      if (filtro === "ENCERRADAS") return !emAndamento(p)
      return true
    })
  }, [dados, busca, filtro])

  const total = dados?.length ?? 0
  const andamento = dados?.filter(emAndamento).length ?? 0
  const vencidas = dados?.filter((p) => p.resultado?.venceu).length ?? 0
  const valorVencido = dados?.reduce((s, p) => s + (p.resultado?.valorTotal ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Minhas Participações</h1>
        <p className="text-muted-foreground">Suas propostas, o andamento de cada licitação e o resultado</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { rotulo: "Total", valor: String(total) },
          { rotulo: "Em andamento", valor: String(andamento), cor: "text-blue-600" },
          { rotulo: "Vencidas", valor: String(vencidas), cor: "text-green-600" },
          { rotulo: "Valor adjudicado a você", valor: moedaBR(valorVencido), cor: "text-emerald-700" },
        ].map((c) => (
          <Card key={c.rotulo}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{c.rotulo}</p>
              <p className={`text-2xl font-bold ${c.cor ?? ""}`}>{c.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por objeto, número ou órgão..." className="pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ANDAMENTO">Em andamento</SelectItem>
                <SelectItem value="VENCIDAS">Vencidas</SelectItem>
                <SelectItem value="ENCERRADAS">Encerradas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Participações ({lista.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {erro ? (
            <p className="py-8 text-center text-red-700">{erro}</p>
          ) : !dados ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
            </div>
          ) : lista.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Gavel className="mx-auto mb-4 h-12 w-12 opacity-20" />
              <p>Nenhuma participação encontrada</p>
              <Link href="/fornecedor/licitacoes" className="text-sm text-blue-700 hover:underline">Ver licitações abertas</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {lista.map((p) => (
                <div key={p.proposta.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/fornecedor/licitacoes/${p.licitacao.id}`} className="font-semibold text-blue-600 hover:underline">
                          {p.licitacao.numeroEdital || p.licitacao.numeroProcesso}
                        </Link>
                        <Badge className={COR_FASE[p.licitacao.fase] || "bg-gray-100 text-gray-800"}>{ROTULO_FASE[p.licitacao.fase] || p.licitacao.fase}</Badge>
                        <SituacaoBadge licitacao={p.licitacao} />
                        <Badge variant="outline">{ROTULO_MODALIDADE[p.licitacao.modalidade] || p.licitacao.modalidade}</Badge>
                        <Badge variant="outline">Proposta: {ROTULO_STATUS_PROPOSTA[p.proposta.status] || p.proposta.status}</Badge>
                      </div>
                      <p className="font-medium">{p.licitacao.objeto}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.licitacao.orgao || "Órgão"} · proposta {moedaBR(p.proposta.valorTotal)} enviada em {dataHoraBR(p.proposta.dataEnvio)}
                        {p.licitacao.dataAberturaSessao ? ` · abertura ${dataHoraBR(p.licitacao.dataAberturaSessao)}` : ""}
                      </p>
                      {p.proposta.status === "DESCLASSIFICADA" && p.proposta.motivoDesclassificacao && (
                        <p className="text-sm text-red-700">Motivo da desclassificação: {p.proposta.motivoDesclassificacao}</p>
                      )}
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Próximo passo:</span> {p.proximaAcao.texto}
                      </p>
                      {p.resultado && (
                        <div className={`rounded-md border p-2 text-sm ${p.resultado.venceu ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                          {p.resultado.venceu ? (
                            <span className="flex items-center gap-1">
                              <Award className="h-4 w-4" /> Vencedor de {p.resultado.itens.length} item(ns): {p.resultado.itens.map((i) => i.numero).join(", ")} — {moedaBR(p.resultado.valorTotal)}
                            </span>
                          ) : (
                            "Resultado homologado — você não foi o vencedor."
                          )}
                        </div>
                      )}
                      {(p.contratos.length > 0 || p.atas.length > 0) && (
                        <div className="flex flex-wrap gap-3 text-sm">
                          {p.contratos.map((c) => (
                            <Link key={c.id} href={`/fornecedor/contratos/${c.id}`} className="text-blue-700 hover:underline">
                              Contrato {c.numero} ({c.status === "AGUARDANDO_ASSINATURA" ? "aguardando assinatura" : c.status.toLowerCase()})
                            </Link>
                          ))}
                          {p.atas.map((a) => (
                            <Link key={a.id} href={`/fornecedor/atas/${a.id}`} className="text-blue-700 hover:underline">
                              Ata {a.numero} ({a.status.toLowerCase().replace(/_/g, " ")})
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <AcaoPrincipal p={p} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
