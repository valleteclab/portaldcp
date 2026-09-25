"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Building2, Calendar, ChevronLeft, ChevronRight, DollarSign, Eye, FileText, Gavel, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { SituacaoBadge } from "@/components/licitacao/SituacaoBadge"
import { API_URL, authFetch } from "@/lib/api"
import { ROTULO_SITUACAO } from "@/lib/licitacao-situacao"
import { COR_FASE, ROTULO_FASE, ROTULO_MODALIDADE, ROTULO_STATUS_PROPOSTA, dataHoraBR, moedaBR } from "@/lib/licitacao-rotulos"

interface LicitacaoLista {
  id: string
  numero_processo: string
  numero_edital?: string
  objeto: string
  modalidade: string
  fase: string
  situacao: string
  valor_total_estimado: number | null
  sigilo_orcamento?: "PUBLICO" | "SIGILOSO"
  data_abertura_sessao: string | null
  orgao: { nome: string; cidade?: string; uf?: string } | null
  minha_proposta: { id: string; status: string; requer_confirmacao: boolean } | null
}

interface Pagina {
  itens: LicitacaoLista[]
  total: number
  pagina: number
  limite: number
}

const FASES_SALA = ["ANALISE_PROPOSTAS", "EM_DISPUTA", "JULGAMENTO", "HABILITACAO", "RECURSO", "ADJUDICACAO", "HOMOLOGACAO"]
const LIMITE = 20

/**
 * LICITAÇÕES DO FORNECEDOR (plano E8 item 7): filtro, busca e paginação NO
 * SERVIDOR (GET /api/portal-fornecedor/licitacoes) — todas as fases públicas,
 * inclusive impugnação, recurso, adjudicação e homologação; a proposta do
 * fornecedor vem junto (identidade pelo token).
 */
export default function LicitacoesDisponiveisPage() {
  const [busca, setBusca] = useState("")
  const [buscaAplicada, setBuscaAplicada] = useState("")
  const [modalidade, setModalidade] = useState("all")
  const [fase, setFase] = useState("all")
  const [situacao, setSituacao] = useState("all")
  const [participando, setParticipando] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<Pagina | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Busca com atraso curto (não consulta a cada tecla)
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 400)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => {
    let ativo = true
    const q = new URLSearchParams({ pagina: String(pagina), limite: String(LIMITE) })
    if (buscaAplicada) q.set("busca", buscaAplicada)
    if (modalidade !== "all") q.set("modalidade", modalidade)
    if (fase !== "all") q.set("fase", fase)
    if (situacao !== "all") q.set("situacao", situacao)
    if (participando) q.set("participando", "true")
    setLoading(true)
    setErro(null)
    authFetch(`${API_URL}/api/portal-fornecedor/licitacoes?${q.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Entre com a conta de fornecedor." : "Não foi possível carregar as licitações.")
        return r.json()
      })
      .then((j: Pagina) => ativo && setDados(j))
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => ativo && setLoading(false))
    return () => {
      ativo = false
    }
  }, [buscaAplicada, modalidade, fase, situacao, participando, pagina])

  const trocar = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setPagina(1)
  }
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Licitações</h1>
        <p className="text-muted-foreground">Oportunidades publicadas e as licitações em que você participa</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por objeto, número ou órgão..."
                className="pl-10"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <Select value={modalidade} onValueChange={trocar(setModalidade)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Modalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as modalidades</SelectItem>
                {Object.entries(ROTULO_MODALIDADE).map(([v, r]) => (
                  <SelectItem key={v} value={v}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fase} onValueChange={trocar(setFase)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Fase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as fases</SelectItem>
                {Object.entries(ROTULO_FASE).map(([v, r]) => (
                  <SelectItem key={v} value={v}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={situacao} onValueChange={trocar(setSituacao)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                {Object.entries(ROTULO_SITUACAO).map(([v, r]) => (
                  <SelectItem key={v} value={v}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Switch
                checked={participando}
                onCheckedChange={(v) => {
                  setParticipando(v)
                  setPagina(1)
                }}
              />
              Só as que participo
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultados ({dados?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {erro ? (
            <div className="py-8 text-center text-red-700">{erro}</div>
          ) : loading && !dados ? (
            <div className="py-8 text-center text-muted-foreground">Carregando licitações...</div>
          ) : !dados || dados.itens.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="mx-auto mb-4 h-12 w-12 opacity-20" />
              <p>Nenhuma licitação encontrada com estes filtros</p>
              <p className="text-sm">Novas licitações aparecem aqui quando publicadas pelos órgãos</p>
            </div>
          ) : (
            <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
              {dados.itens.map((l) => {
                const proposta = l.minha_proposta
                const salaDisponivel = !!proposta && proposta.status !== "RASCUNHO" && (FASES_SALA.includes(l.fase) || l.modalidade === "DISPENSA_ELETRONICA")
                return (
                  <div key={l.id} className="rounded-lg border p-4 transition-colors hover:bg-slate-50">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-blue-600">{l.numero_edital || l.numero_processo}</span>
                          <Badge className={COR_FASE[l.fase] || "bg-gray-100 text-gray-800"}>{ROTULO_FASE[l.fase] || l.fase}</Badge>
                          <SituacaoBadge licitacao={l} />
                          <Badge variant="outline">{ROTULO_MODALIDADE[l.modalidade] || l.modalidade}</Badge>
                          {proposta && (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                              Minha proposta: {ROTULO_STATUS_PROPOSTA[proposta.status] || proposta.status}
                            </Badge>
                          )}
                          {proposta?.requer_confirmacao && <Badge className="bg-amber-100 text-amber-800">Confirmar proposta (edital retificado)</Badge>}
                        </div>
                        <h3 className="mb-2 text-lg font-medium">{l.objeto}</h3>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            <span>
                              {l.orgao?.nome || "Órgão não informado"}
                              {l.orgao?.cidade ? ` — ${l.orgao.cidade}/${l.orgao.uf || ""}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            <span>{l.sigilo_orcamento === "SIGILOSO" ? <span className="text-amber-600">Sigiloso</span> : moedaBR(l.valor_total_estimado)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>Abertura: {dataHoraBR(l.data_abertura_sessao)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {salaDisponivel && (
                          <Link href={`/fornecedor/licitacoes/${l.id}/sessao`}>
                            <Button size="sm">
                              <Gavel className="mr-1 h-4 w-4" />
                              Sala
                            </Button>
                          </Link>
                        )}
                        <Link href={`/fornecedor/licitacoes/${l.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="mr-1 h-4 w-4" />
                            Ver detalhes
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {dados && dados.total > dados.limite && (
            <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
              <span>
                Página {dados.pagina} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina <= 1 || loading} onClick={() => setPagina((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={pagina >= totalPaginas || loading} onClick={() => setPagina((p) => p + 1)}>
                  Próxima <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
