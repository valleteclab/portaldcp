"use client"

/**
 * ETAPA 8 — CONFORMIDADE ANTES DA PUBLICAÇÃO (Entrega 4; mockup Conformidade).
 * O motor de conformidade cruza as peças dos autos entre si (enquadramento,
 * vinculação ao processo, marca, preço, cronologia, leis, exercício,
 * duplicidade, assinaturas, prazo) e só libera a publicação sem bloqueio
 * aberto. Cada achado mostra a descrição, as evidências clicáveis (abrem a
 * peça na folha — o visor dos autos do parecer) e a ação: corrigir a peça,
 * justificar (atenção; a justificativa vai para os autos) ou abrir.
 * API: GET /api/fase-interna/:id/conformidade, POST …/conformidade/revisar,
 *      POST …/conformidade/achados/:achadoId/justificar.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, Loader2, RefreshCw, Send, ShieldAlert, ShieldCheck } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { VisorDosAutos, type PecaAberta, type PecaDosAutos } from "@/components/fase-interna/etapas/VisorDosAutos"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { avisarTarefasAtualizadas } from "@/lib/tarefas"
import { erroDaApi, fmtDia } from "@/lib/fase-interna/telas"

interface Evidencia {
  documento_id: string | null
  tipo: string | null
  titulo: string
  folha: number | null
  trecho: string | null
}
interface Achado {
  id: string
  regra: string
  regra_descricao: string
  titulo: string
  severidade: "BLOQUEIO" | "ATENCAO"
  etapa: string
  portao: string
  status: "ABERTO" | "JUSTIFICADO" | "RESOLVIDO"
  mensagem: string
  evidencias: Evidencia[]
  exige_justificativa: boolean
  pode_justificar: boolean
  justificativa: string | null
  justificado_por_nome: string | null
  justificado_em: string | null
  resolvido_em: string | null
  resolvido_por_nome: string | null
  motivo_resolucao: string | null
  acao: { tipo: string; rotulo: string; destino: string }
  tarefa: { id: string; status: string } | null
}
interface RegraTela {
  codigo: string
  descricao: string
  severidade: string
  etapa: string
  portao: string
  situacao: "APROVADA" | "COM_ACHADO" | "NAO_SE_APLICA" | "NAO_AVALIADA" | "ERRO"
  motivo: string | null
}
interface ConformidadeTela {
  licitacao: { id: string; numero_processo: string; numero_dispensa: string | null; objeto: string; modalidade: string; fase: string; fase_interna: boolean; fundamento: string | null }
  ativo: boolean
  aplicavel: boolean
  motivo: string | null
  revisao: { em: string; por_nome: string | null; origem: string } | null
  contagem: { bloqueios: number; atencoes: number; justificados: number; resolvidos: number; aprovadas: number; avaliadas: number; impedem_publicar: number }
  achados: Achado[]
  resolvidos: Achado[]
  regras: RegraTela[]
  aviso: {
    dispensa: boolean
    publicacao_prevista: string | null
    inicio_recebimento: string | null
    fim_recebimento: string | null
    dias_uteis: number | null
    minimo: number | null
    fundamento: string | null
    atende: boolean | null
    minimo_fim: string | null
    canais: Array<{ nome: string; situacao: string }>
  }
  assinaturas: Array<{ documento_id: string; tipo: string; titulo: string; folhas: string | null; situacao: string; ok: boolean }>
  publicar: { pode: boolean; pendencias: number; rotulo: string }
  autos: PecaDosAutos[]
  justificativas: Array<{ regra: string; titulo: string; justificativa: string; justificado_por_nome: string | null; justificado_em: string | null }>
}

const fmtDataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

const ROTULO_ORIGEM: Record<string, string> = { MANUAL: "revisão manual", AUTOMATICA: "revisão automática", TELA: "primeira abertura" }
const SITUACAO_REGRA: Record<RegraTela["situacao"], { texto: string; cls: string }> = {
  APROVADA: { texto: "Aprovada", cls: "text-[#1F4E79]" },
  COM_ACHADO: { texto: "Com achado", cls: "text-[#9A4308] font-semibold" },
  NAO_SE_APLICA: { texto: "Não se aplica", cls: "text-slate-500" },
  NAO_AVALIADA: { texto: "Não avaliada", cls: "text-slate-500" },
  ERRO: { texto: "Erro ao avaliar", cls: "text-red-700" },
}

export default function ConformidadePage() {
  const { id } = useParams() as { id: string }
  const { pedirTexto, dialogo } = useDialogoConfirmacao()
  const [d, setD] = useState<ConformidadeTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)
  const [visor, setVisor] = useState<PecaAberta | null>(null)
  const [verRegras, setVerRegras] = useState(false)
  const [verResolvidos, setVerResolvidos] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/conformidade`)
      if (!r.ok) throw new Error(await erroDaApi(r))
      setD(await r.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  // Link da tarefa: …/conformidade#achado-<id> → rola até o achado
  useEffect(() => {
    if (!d || typeof window === "undefined" || !window.location.hash.startsWith("#achado-")) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [d])

  const chamar = async (rota: string, corpo: unknown, sucesso: string) => {
    setOcupado(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/${rota}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo ?? {}),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      setD(await r.json())
      setAtualizacao((n) => n + 1)
      avisarTarefasAtualizadas()
      toast.success(sucesso)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const justificar = async (a: Achado) => {
    const texto = await pedirTexto({
      titulo: `Justificar — ${a.titulo}`,
      mensagem: <span className="text-sm">{a.mensagem} A justificativa vai para os autos do processo.</span>,
      rotulo: "Justificativa",
      obrigatorio: true,
      minimo: 20,
      valorInicial: a.justificativa ?? "",
      confirmarRotulo: "Registrar justificativa",
    })
    if (texto) await chamar(`conformidade/achados/${a.id}/justificar`, { justificativa: texto }, "Justificativa registrada nos autos.")
  }

  const abrirEvidencia = (e: Evidencia) => {
    if (!e.tipo) return
    setVisor({ documento_id: e.documento_id, tipo: e.tipo, folha: e.folha, trecho: e.trecho })
  }

  const regrasPorPortao = useMemo(() => {
    const g: Record<string, RegraTela[]> = {}
    for (const r of d?.regras ?? []) (g[r.portao] ??= []).push(r)
    return g
  }, [d])

  if (erro) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-600 mb-2" aria-hidden="true" />
        <p>{erro}</p>
        <Link href={`/orgao/processos/${id}`} className="text-blue-800 hover:underline text-sm">Voltar ao processo</Link>
      </div>
    )
  }
  if (!d) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando a conformidade" />
      </div>
    )
  }

  const av = d.aviso
  return (
    <EtapaShell
      licitacaoId={id}
      tela="conformidade"
      titulo="Conformidade antes da publicação"
      subtitulo={
        <span>
          Etapa 8 · O sistema cruza todas as peças dos autos entre si e só libera a publicação sem bloqueios abertos.
          {d.revisao && (
            <span className="block text-xs text-gray-600 mt-0.5">
              Última revisão: {fmtDataHora(d.revisao.em)} · {ROTULO_ORIGEM[d.revisao.origem] ?? d.revisao.origem}
              {d.revisao.por_nome && d.revisao.origem === "MANUAL" ? ` por ${d.revisao.por_nome}` : ""}
            </span>
          )}
        </span>
      }
      atualizacao={atualizacao}
      acoes={
        d.aplicavel ? (
          <Button variant="outline" disabled={ocupado} onClick={() => chamar("conformidade/revisar", {}, "Revisão concluída.")}>
            {ocupado ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" aria-hidden="true" />} Revisar agora
          </Button>
        ) : null
      }
    >
      {dialogo}
      {!d.ativo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="status">
          O motor de conformidade está desligado nesta instalação (FASE_INTERNA_CONFORMIDADE=false): nada é bloqueado.
        </div>
      )}
      {!d.aplicavel && d.motivo && (
        <div className="rounded-lg border bg-slate-50 px-4 py-2.5 text-sm text-gray-800" role="status">
          {d.motivo}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* VERIFICAÇÕES */}
        <section aria-label="Verificações" className="rounded-lg border bg-white p-5 space-y-1 min-w-0">
          <div className="flex gap-2 flex-wrap mb-3">
            <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-[#FBEBDD] text-[#9A4308]">
              {d.contagem.bloqueios} {d.contagem.bloqueios === 1 ? "bloqueio" : "bloqueios"}
            </span>
            <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-[#EFEBE2] text-[#4A5361]">
              {d.contagem.atencoes} {d.contagem.atencoes === 1 ? "atenção" : "atenções"}
            </span>
            {d.contagem.justificados > 0 && (
              <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">{d.contagem.justificados} justificado(s)</span>
            )}
            <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-[#E3ECF5] text-[#1F4E79]">
              {d.contagem.aprovadas} {d.contagem.aprovadas === 1 ? "regra aprovada" : "regras aprovadas"}
            </span>
          </div>

          {!d.achados.length && (
            <p className="flex items-center gap-2 text-sm text-green-800 py-3">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" /> Nenhum achado aberto — as peças estão conformes entre si.
            </p>
          )}

          <ul>
            {d.achados.map((a) => (
              <li key={a.id} id={`achado-${a.id}`} className="flex gap-4 py-3.5 border-t items-start scroll-mt-24">
                <div className={`w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide pt-0.5 ${a.severidade === "BLOQUEIO" ? "text-[#9A4308]" : "text-[#4A5361]"}`}>
                  {a.severidade === "BLOQUEIO" ? "Bloqueio" : "Atenção"}
                  <span className="block font-mono normal-case tracking-normal text-[10px] text-gray-500">{a.regra}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-gray-900">{a.titulo}</p>
                  <p className="text-sm text-gray-700 leading-snug">{a.mensagem}</p>
                  {a.evidencias.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {a.evidencias.map((e, i) => (
                        <button
                          key={`${e.documento_id ?? e.titulo}-${i}`}
                          type="button"
                          onClick={() => abrirEvidencia(e)}
                          disabled={!e.tipo || !e.documento_id}
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-slate-50 disabled:opacity-70 disabled:cursor-default"
                          title={e.trecho ? `Trecho: ${e.trecho}` : "Abrir a peça"}
                        >
                          <FileText className="w-3 h-3" aria-hidden="true" />
                          {e.titulo}
                          {e.folha != null && ` · fl. ${e.folha}`}
                        </button>
                      ))}
                    </div>
                  )}
                  {a.status === "JUSTIFICADO" && (
                    <p className="text-xs text-slate-700 bg-slate-50 rounded px-2 py-1">
                      Justificado por {a.justificado_por_nome ?? "—"} em {fmtDia(a.justificado_em)}: “{a.justificativa}”
                    </p>
                  )}
                  {a.exige_justificativa && a.status === "ABERTO" && <p className="text-xs text-[#9A4308]">Precisa de justificativa para publicar.</p>}
                  {a.tarefa?.status === "ABERTA" && <p className="text-xs text-gray-600">Tarefa aberta para o responsável pela peça.</p>}
                </div>
                <div className="shrink-0 flex flex-col gap-1.5 items-end">
                  {d.aplicavel && a.pode_justificar ? (
                    <Button variant="outline" className="h-11" disabled={ocupado} onClick={() => justificar(a)}>
                      {a.status === "JUSTIFICADO" ? "Rever justificativa" : "Justificar"}
                    </Button>
                  ) : null}
                  {a.acao.tipo === "ABRIR" && a.evidencias[0] ? (
                    <Button variant="outline" className="h-11" onClick={() => abrirEvidencia(a.evidencias[0])}>
                      Abrir
                    </Button>
                  ) : a.acao.tipo !== "JUSTIFICAR" ? (
                    <Button asChild variant="outline" className="h-11">
                      <Link href={a.acao.destino}>{a.acao.tipo === "AGENDAR" ? "Abrir a reserva" : a.acao.rotulo}</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {d.resolvidos.length > 0 && (
            <div className="border-t pt-3">
              <button type="button" className="flex items-center gap-1 text-sm font-medium text-gray-800" onClick={() => setVerResolvidos((v) => !v)} aria-expanded={verResolvidos}>
                {verResolvidos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Resolvidos ({d.contagem.resolvidos})
              </button>
              {verResolvidos && (
                <ul className="mt-2 space-y-1.5">
                  {d.resolvidos.map((a) => (
                    <li key={a.id} className="text-sm text-gray-700 flex gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        <span className="font-mono text-xs text-gray-500 mr-1">{a.regra}</span>
                        {a.titulo} — {a.motivo_resolucao ?? "resolvido"} ({fmtDia(a.resolvido_em)})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t pt-3">
            <button type="button" className="flex items-center gap-1 text-sm font-medium text-gray-800" onClick={() => setVerRegras((v) => !v)} aria-expanded={verRegras}>
              {verRegras ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Regras conferidas ({d.contagem.avaliadas} avaliadas)
            </button>
            {verRegras && (
              <div className="mt-2 space-y-3">
                {(["A", "B", "C"] as const).map((p) => (
                  <div key={p}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Portão {p} — {p === "A" ? "limite e fracionamento (pesquisa)" : p === "B" ? "art. 72 (autorização)" : "antes de publicar"}
                    </p>
                    <ul className="divide-y">
                      {(regrasPorPortao[p] ?? []).map((r) => (
                        <li key={r.codigo} className="flex gap-3 py-1.5 text-sm">
                          <span className="w-24 shrink-0 font-mono text-xs text-gray-600 pt-0.5">{r.codigo}</span>
                          <span className="flex-1 min-w-0">
                            {r.descricao}
                            {r.motivo && r.situacao !== "APROVADA" && <span className="block text-xs text-gray-500">{r.motivo}</span>}
                          </span>
                          <span className={`text-xs shrink-0 ${SITUACAO_REGRA[r.situacao]?.cls ?? ""}`}>{SITUACAO_REGRA[r.situacao]?.texto ?? r.situacao}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* PUBLICAÇÃO */}
        <aside aria-label="Publicação" className="space-y-5">
          <section className="rounded-lg border bg-white p-5 space-y-3">
            <h2 className="font-serif text-xl font-semibold text-gray-900">{av.dispensa ? "Aviso de contratação direta" : "Aviso / edital"}</h2>
            <dl className="text-sm space-y-2">
              <div>
                <dt className="font-medium text-gray-800">Publicação prevista</dt>
                <dd className="font-mono text-gray-900">{av.publicacao_prevista ? fmtDia(av.publicacao_prevista) : "ao publicar"}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-800">Início do recebimento de propostas</dt>
                <dd className="font-mono text-gray-900">{fmtDataHora(av.inicio_recebimento)}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-800">Fim do recebimento</dt>
                <dd className="font-mono text-gray-900">{fmtDataHora(av.fim_recebimento)}</dd>
              </div>
            </dl>
            {av.minimo ? (
              av.fim_recebimento ? (
                <p className={`text-sm font-medium ${av.atende ? "text-[#1F4E79]" : "text-[#9A4308]"}`}>
                  {av.dias_uteis ?? "—"} dias úteis de divulgação — mínimo de {av.minimo} {av.atende ? "atendido" : `não atendido (fim a partir de ${fmtDia(av.minimo_fim)})`} ({av.fundamento})
                </p>
              ) : (
                <p className="text-sm text-gray-700">Mínimo de {av.minimo} dias úteis ({av.fundamento}), contados no calendário do órgão — as datas são definidas ao publicar.</p>
              )
            ) : null}
            <div className="border-t pt-2 space-y-1.5">
              <p className="text-sm font-semibold">Canais</p>
              {av.canais.map((c) => (
                <div key={c.nome} className="flex justify-between gap-2 text-sm">
                  <span>{c.nome}</span>
                  <span className="text-[#1F4E79] font-medium text-right">{c.situacao}</span>
                </div>
              ))}
            </div>
            {d.publicar.pode ? (
              <Button asChild className="w-full h-12">
                <Link href={`/orgao/processos/${id}#titulo-etapa-publicacao`}>
                  <Send className="w-4 h-4 mr-1" aria-hidden="true" /> Publicar
                </Link>
              </Button>
            ) : (
              <Button disabled className="w-full h-12" aria-describedby="motivo-publicar">
                <ShieldAlert className="w-4 h-4 mr-1" aria-hidden="true" /> {d.aplicavel ? d.publicar.rotulo : "Publicação já feita"}
              </Button>
            )}
            {!d.publicar.pode && d.aplicavel && (
              <p id="motivo-publicar" className="text-xs text-gray-600">
                Bloqueios e atenções que exigem justificativa impedem a publicação. As demais regras (itens, aviso, prazo) são conferidas no checklist do processo.
              </p>
            )}
          </section>

          <section className="rounded-lg border bg-white p-5 space-y-2">
            <h2 className="font-serif text-xl font-semibold text-gray-900">Assinaturas</h2>
            {!d.assinaturas.length && <p className="text-sm text-gray-600">Nenhuma peça nos autos ainda.</p>}
            {d.assinaturas.map((s) => (
              <div key={s.documento_id} className="flex justify-between gap-2 text-sm">
                <span className="min-w-0">
                  {s.titulo}
                  {s.folhas && <span className="font-mono text-xs text-gray-500"> · {s.folhas}</span>}
                </span>
                <span className={`font-medium whitespace-nowrap ${s.ok ? "text-[#1F4E79]" : "text-[#9A4308]"}`}>{s.situacao}</span>
              </div>
            ))}
          </section>

          {d.justificativas.length > 0 && (
            <section className="rounded-lg border bg-white p-5 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Justificativas nos autos</h2>
              <ul className="space-y-1.5 text-sm text-gray-700">
                {d.justificativas.map((j, i) => (
                  <li key={i}>
                    <span className="font-mono text-xs text-gray-500 mr-1">{j.regra}</span>
                    {j.justificativa}
                    <span className="block text-xs text-gray-500">
                      {j.justificado_por_nome ?? "—"}, {fmtDia(j.justificado_em)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <Dialog open={!!visor} onOpenChange={(v) => !v && setVisor(null)}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Autos do processo {d.licitacao.numero_processo}</DialogTitle>
            <DialogDescription>A peça abre na folha do achado; o trecho fica destacado.</DialogDescription>
          </DialogHeader>
          <VisorDosAutos autos={d.autos} aberta={visor} onAbrir={setVisor} altura="h-[70vh]" />
        </DialogContent>
      </Dialog>
    </EtapaShell>
  )
}
