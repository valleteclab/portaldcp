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
 * Entrega 5 (etapa 8): "Publicar" pratica o PUBLICAR aqui mesmo (aviso,
 * prazo no calendário do órgão, portão C), o quadro mostra o modo da dispensa
 * e a situação de cada canal, e o Diário Oficial vira peça da publicação.
 * Entrega 6: "Gerar autos (PDF)" (capa, índice, folhas numeradas).

 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, Loader2, Newspaper, RefreshCw, Send, ShieldAlert, ShieldCheck } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErroPendencias } from "@/components/licitacao/ErroPendencias"
import { PainelPrazos } from "../../PublicacaoEdital"
import { useDivulgacaoAviso } from "../../useDivulgacaoAviso"
import { BotaoGerarAutos } from "../../BotaoGerarAutos"
import { EscolhaDisputaDispensa } from "@/components/licitacao/EscolhaDisputaDispensa"
import type { ModoDisputaDispensa } from "../../tipos"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { PERMISSAO_LIVRE, type PermissaoTrabalho } from "@/lib/fase-interna/permissao-etapa"
import { VisorDosAutos, type PecaAberta, type PecaDosAutos } from "@/components/fase-interna/etapas/VisorDosAutos"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { avisarTarefasAtualizadas } from "@/lib/tarefas"
import { erroDaApi, fmtDia } from "@/lib/fase-interna/telas"
import { TRAVAS_DA_LEI, textoDaTrava } from "@/lib/fase-interna/travas"
import { AjudaTravaDaLei } from "@/components/fase-interna/fluxo/AjudaTravaDaLei"

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
    canais: Array<{ chave?: string; nome: string; situacao: string; ok?: boolean; detalhe?: string | null }>
    modo_disputa?: ModoDisputaDispensa | null
  }
  /** Entrega 5 — etapa 8 ligada à divulgação (PNCP / Diário Oficial). */
  publicacao: QuadroPublicacao
  assinaturas: Array<{ documento_id: string; tipo: string; titulo: string; folhas: string | null; situacao: string; ok: boolean }>
  publicar: { pode: boolean; pendencias: number; rotulo: string }
  autos: PecaDosAutos[]
  justificativas: Array<{ regra: string; titulo: string; justificativa: string; justificado_por_nome: string | null; justificado_em: string | null }>
}

interface QuadroPublicacao {
  estado: "NAO_PUBLICADO" | "AGUARDANDO" | "CONFIRMADA" | "EXTERNA"
  etapa8: { situacao: "PENDENTE" | "AGUARDANDO_CONFIRMACAO" | "CONCLUIDA"; texto: string }
  integrado_pncp: boolean
  data_divulgacao_oficial: string | null
  modo_disputa: ModoDisputaDispensa | null
  diario_oficial: {
    pode_registrar: boolean
    confirma_divulgacao: boolean
    registros: Array<{ id: string; versao: number; vigente: boolean; numero: string | null; data_publicacao: string | null; pagina: string | null; link: string | null; anexada: boolean; folhas: string | null }>
  }
  controle_interno: { ativo: boolean; manifestado: boolean; aviso: string | null }
}

const fmtDataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

/** Com os segundos: "Revisar agora" duas vezes no mesmo minuto mostra a revisão nova (homologação). */
const fmtDataHoraSeg = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"

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
  // Isolamento das peças: a permissão de quem vê nesta etapa (EtapaShell)
  const [perm, setPerm] = useState<PermissaoTrabalho>(PERMISSAO_LIVRE)
  const { pedirTexto, dialogo } = useDialogoConfirmacao()
  const [d, setD] = useState<ConformidadeTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [atualizacao, setAtualizacao] = useState(0)
  const [visor, setVisor] = useState<PecaAberta | null>(null)
  const [verRegras, setVerRegras] = useState(false)
  const [verResolvidos, setVerResolvidos] = useState(false)
  const [dialogoDo, setDialogoDo] = useState(false)
  // Publicar pela etapa 8 (Entrega 5): o mesmo PUBLICAR do processo (portão C incluso)
  const publicarAqui = !!d && d.aplicavel && d.aviso.dispensa
  const divulgacao = useDivulgacaoAviso(id, d?.licitacao.fase ?? "", publicarAqui)

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

  const publicar = async () => {
    if (await divulgacao.divulgar()) {
      avisarTarefasAtualizadas()
      setAtualizacao((n) => n + 1)
      await carregar()
    }
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
      onPermissao={setPerm}
      licitacaoId={id}
      tela="conformidade"
      titulo="Conformidade antes da publicação"
      subtitulo={
        <span>
          Etapa 8 · O sistema cruza todas as peças dos autos entre si e só libera a publicação sem bloqueios abertos.
          {d.revisao && (
            <span className="block text-xs text-gray-600 mt-0.5">
              Última revisão: {fmtDataHoraSeg(d.revisao.em)} · {ROTULO_ORIGEM[d.revisao.origem] ?? d.revisao.origem}
              {d.revisao.por_nome && d.revisao.origem === "MANUAL" ? ` por ${d.revisao.por_nome}` : ""}
            </span>
          )}
        </span>
      }
      atualizacao={atualizacao}
      acoes={
        <div className="flex gap-2 flex-wrap">
          <BotaoGerarAutos licitacaoId={id} numeroProcesso={d.licitacao.numero_processo} />
          {d.aplicavel ? (
            <Button variant="outline" disabled={ocupado} onClick={() => chamar("conformidade/revisar", {}, "Revisão concluída.")}>
              {ocupado ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" aria-hidden="true" />} Revisar agora
            </Button>
          ) : null}
        </div>
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
          {textoDaTrava(d.motivo)}
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
                    <p className="text-xs font-semibold text-gray-700">
                      {TRAVAS_DA_LEI[p].rotulo} <AjudaTravaDaLei destaque={p} />
                    </p>
                    <ul className="divide-y">
                      {(regrasPorPortao[p] ?? []).map((r) => (
                        <li key={r.codigo} className="flex gap-3 py-1.5 text-sm">
                          <span className="w-24 shrink-0 font-mono text-xs text-gray-600 pt-0.5">{r.codigo}</span>
                          <span className="flex-1 min-w-0">
                            {r.descricao}
                            {r.motivo && r.situacao !== "APROVADA" && <span className="block text-xs text-gray-500">{textoDaTrava(r.motivo)}</span>}
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

        {/* PUBLICAÇÃO (etapa 8 — Entrega 5) */}
        <aside aria-label="Publicação" className="space-y-5">
          <section className="rounded-lg border bg-white p-5 space-y-3">
            <h2 className="font-serif text-xl font-semibold text-gray-900">{av.dispensa ? "Aviso de contratação direta" : "Aviso / edital"}</h2>
            <p
              role="status"
              className={`text-sm rounded px-2 py-1.5 ${
                d.publicacao.etapa8.situacao === "CONCLUIDA"
                  ? "bg-green-50 text-green-900"
                  : d.publicacao.etapa8.situacao === "AGUARDANDO_CONFIRMACAO"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-slate-50 text-gray-800"
              }`}
            >
              {d.publicacao.etapa8.texto}
            </p>
            {av.modo_disputa?.aplica &&
              (d.aplicavel ? (
                <EscolhaDisputaDispensa licitacaoId={id} compacto onAlterado={carregar} />
              ) : (
                <p className="text-sm">
                  <span className="font-medium text-gray-800">Disputa: </span>
                  {av.modo_disputa.descricao}
                  <span className="block text-xs text-gray-600">{av.modo_disputa.referencia} · escolha congelada na publicação</span>
                </p>
              ))}
            {publicarAqui ? (
              <div className="space-y-2">
                <div>
                  <label htmlFor="fim-propostas-conf" className="text-sm font-medium text-gray-800">
                    Fim do recebimento de propostas
                  </label>
                  <Input
                    id="fim-propostas-conf"
                    type="datetime-local"
                    value={divulgacao.fimPropostas}
                    onChange={(e) => divulgacao.setFimPropostas(e.target.value)}
                    className="mt-1 font-mono"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Início: na confirmação da publicação pelo PNCP. Mínimo de {av.minimo ?? 3} dias úteis ({av.fundamento ?? "art. 75, §3º"}), no calendário do
                    órgão — já sugerido. Horário de Brasília.
                  </p>
                </div>
                <PainelPrazos prazos={divulgacao.prazos} carregando={divulgacao.calculando} />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button type="button" size="sm" variant="outline" onClick={divulgacao.gerarAviso} disabled={divulgacao.gerando || !divulgacao.fimPropostas}>
                    {divulgacao.gerando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    {divulgacao.aviso ? "Gerar de novo" : "Gerar aviso (PDF)"}
                  </Button>
                  {divulgacao.aviso ? (
                    <button type="button" className="text-sm text-blue-800 hover:underline" onClick={divulgacao.abrirAviso}>
                      Conferir aviso v{divulgacao.aviso.versao}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-600">Gere e confira o aviso (é o documento publicado no PNCP).</span>
                  )}
                </div>
              </div>
            ) : (
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
            )}
            {!publicarAqui && av.minimo ? (
              av.fim_recebimento ? (
                <p className={`text-sm font-medium ${av.atende ? "text-[#1F4E79]" : "text-[#9A4308]"}`}>
                  {av.dias_uteis ?? "—"} dias úteis de divulgação — mínimo de {av.minimo}{" "}
                  {av.atende ? "atendido" : `não atendido (fim a partir de ${fmtDia(av.minimo_fim)})`} ({av.fundamento})
                </p>
              ) : (
                <p className="text-sm text-gray-700">
                  Mínimo de {av.minimo} dias úteis ({av.fundamento}), contados no calendário do órgão — as datas são definidas ao publicar.
                </p>
              )
            ) : null}
            <div className="border-t pt-2 space-y-1.5">
              <p className="text-sm font-semibold">Canais</p>
              {av.canais.map((c) => (
                <div key={c.nome} className="flex justify-between gap-2 text-sm">
                  <span>{c.nome}</span>
                  <span className={`font-medium text-right ${c.ok ? "text-green-800" : "text-[#1F4E79]"}`}>
                    {c.chave === "SITIO" && c.ok && c.detalhe ? (
                      <Link href={c.detalhe} className="hover:underline" target="_blank">
                        {c.situacao}
                      </Link>
                    ) : (
                      c.situacao
                    )}
                    {c.detalhe && c.chave !== "SITIO" && <span className="block text-xs font-normal text-gray-600">{c.detalhe}</span>}
                  </span>
                </div>
              ))}
            </div>
            {d.publicacao.controle_interno.aviso && (
              <p className="text-xs rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900" role="note">
                {d.publicacao.controle_interno.aviso}{" "}
                <Link href={`/orgao/processos/${id}/fase-interna/controle-interno`} className="underline">
                  Abrir o controle interno
                </Link>
              </p>
            )}
            {publicarAqui ? (
              <>
                <Button
                  className="w-full h-12"
                  disabled={!d.publicar.pode || !divulgacao.aviso || divulgacao.divulgando || !divulgacao.fimPropostas}
                  aria-describedby="motivo-publicar"
                  onClick={publicar}
                >
                  {divulgacao.divulgando ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : d.publicar.pode ? (
                    <Send className="w-4 h-4 mr-1" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 mr-1" aria-hidden="true" />
                  )}{" "}
                  {d.publicar.rotulo}
                </Button>
                <ErroPendencias erro={divulgacao.erro} />
                <p id="motivo-publicar" className="text-xs text-gray-600">
                  {!d.publicar.pode
                    ? "Bloqueios e atenções que exigem justificativa impedem a publicação."
                    : !divulgacao.aviso
                      ? "Gere o aviso antes de publicar."
                      : "Publicar pratica o ato PUBLICAR (trava da lei de publicar, itens, aviso e prazo conferidos de novo) e envia o aviso ao PNCP."}
                </p>
              </>
            ) : d.publicar.pode ? (
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
            {!publicarAqui && !d.publicar.pode && d.aplicavel && (
              <p id="motivo-publicar" className="text-xs text-gray-600">
                Bloqueios e atenções que exigem justificativa impedem a publicação. As demais regras (itens, aviso, prazo) são conferidas no checklist do
                processo.
              </p>
            )}
          </section>

          {d.publicacao.diario_oficial.pode_registrar || d.publicacao.diario_oficial.registros.length > 0 ? (
            <section className="rounded-lg border bg-white p-5 space-y-2" aria-labelledby="titulo-diario-oficial">
              <h2 id="titulo-diario-oficial" className="font-serif text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Newspaper className="w-5 h-5" aria-hidden="true" /> Diário Oficial
              </h2>
              {d.publicacao.diario_oficial.confirma_divulgacao && (
                <p className="text-xs text-amber-900 bg-amber-50 rounded px-2 py-1">
                  Órgão sem integração com o PNCP: o registro no Diário Oficial é a divulgação oficial (art. 176, parágrafo único) — o prazo corre dessa data.
                </p>
              )}
              {d.publicacao.diario_oficial.registros.length === 0 && <p className="text-sm text-gray-600">Nenhuma publicação registrada.</p>}
              <ul className="space-y-1 text-sm">
                {d.publicacao.diario_oficial.registros.map((r) => (
                  <li key={r.id} className={r.vigente ? "" : "text-gray-500 line-through"}>
                    {r.numero} — {r.data_publicacao ? fmtDia(`${r.data_publicacao}T12:00:00-03:00`) : "—"}
                    {r.anexada ? " · página anexada" : ""}
                    {r.folhas ? ` · ${r.folhas}` : ""}
                    {!r.vigente && ` (substituído — v${r.versao})`}
                  </li>
                ))}
              </ul>
              {d.publicacao.diario_oficial.pode_registrar && (
                <Button variant="outline" className="h-11" disabled={!perm.pode} title={perm.motivo ?? undefined} onClick={() => setDialogoDo(true)}>
                  {d.publicacao.diario_oficial.registros.length ? "Registrar nova publicação" : "Registrar a publicação"}
                </Button>
              )}
            </section>
          ) : null}

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

      <RegistrarDiarioOficialDialog
        licitacaoId={id}
        aberto={dialogoDo}
        confirmaDivulgacao={d.publicacao.diario_oficial.confirma_divulgacao}
        onFechar={() => setDialogoDo(false)}
        onRegistrado={async () => {
          setDialogoDo(false)
          avisarTarefasAtualizadas()
          setAtualizacao((n) => n + 1)
          await carregar()
        }}
      />

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

/**
 * Registro da publicação no Diário Oficial do órgão (peça PDO da etapa 8):
 * número/edição, data e página — e, opcional, a página em PDF (entra nos
 * autos com folhas). Órgão sem PNCP aguardando: é a divulgação oficial.
 * API: POST /api/fase-interna/:id/publicacao/diario-oficial (multipart).
 */
function RegistrarDiarioOficialDialog({
  licitacaoId,
  aberto,
  confirmaDivulgacao,
  onFechar,
  onRegistrado,
}: {
  licitacaoId: string
  aberto: boolean
  confirmaDivulgacao: boolean
  onFechar: () => void
  onRegistrado: () => void
}) {
  const [numero, setNumero] = useState("")
  const [data, setData] = useState("")
  const [pagina, setPagina] = useState("")
  const [link, setLink] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)

  useEffect(() => {
    if (!aberto) return
    setNumero("")
    setData(hoje)
    setPagina("")
    setLink("")
    setArquivo(null)
    setErro(null)
  }, [aberto, hoje])

  const enviar = async () => {
    setEnviando(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append("numero_edicao", numero.trim())
      fd.append("data_publicacao", data)
      if (pagina.trim()) fd.append("pagina", pagina.trim())
      if (link.trim()) fd.append("link", link.trim())
      if (arquivo) fd.append("arquivo", arquivo)
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/publicacao/diario-oficial`, { method: "POST", body: fd })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json()
      toast.success(j.confirmou_divulgacao ? "Publicação registrada — divulgação oficial confirmada (o prazo corre desta data)." : "Publicação no Diário Oficial registrada nos autos.")
      onRegistrado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !enviando && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publicação no Diário Oficial</DialogTitle>
          <DialogDescription>
            O registro vira peça da publicação nos autos.{" "}
            {confirmaDivulgacao ? "Sem integração com o PNCP, ele é a divulgação oficial (art. 176, parágrafo único)." : "A divulgação oficial continua sendo a do PNCP."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="do-numero" className="text-sm font-medium">Número / edição</label>
            <Input id="do-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: nº 1.234" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="do-data" className="text-sm font-medium">Data da publicação</label>
              <Input id="do-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label htmlFor="do-pagina" className="text-sm font-medium">Página</label>
              <Input id="do-pagina" value={pagina} onChange={(e) => setPagina(e.target.value)} placeholder="Ex.: 12" className="mt-1" />
            </div>
          </div>
          <div>
            <label htmlFor="do-link" className="text-sm font-medium">Link (opcional)</label>
            <Input id="do-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className="mt-1" />
          </div>
          <div>
            <label htmlFor="do-arquivo" className="text-sm font-medium">Página do diário em PDF (opcional)</label>
            <Input id="do-arquivo" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="mt-1" />
          </div>
          {erro && (
            <p className="text-sm text-red-700" role="alert">
              {erro}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando || !numero.trim() || !data}>
            {enviando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
