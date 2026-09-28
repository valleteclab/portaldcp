"use client"

/**
 * ETAPA 5 — RESERVA ORÇAMENTÁRIA (Entrega 3A; mockup Reserva.dc.html).
 * Informação orçamentária estruturada: dotação (unidade orçamentária,
 * programa, projeto/atividade, elemento, fonte) e leis (LDO/LOA/PPA) das
 * tabelas do órgão; LINHAS POR EXERCÍCIO (contrato de 12 meses cruza o ano:
 * RESERVADO no exercício corrente, PREVISÃO nos seguintes); emissão gera a
 * peça DO pelo modelo; "Renovar dotação" na virada do exercício cria a nova
 * versão e a tarefa da Contabilidade. Ou "Anexar a informação feita fora".
 * API: /api/fase-interna/:id/reserva (+ /emitir, /retificar, /renovar, /devolver).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, CalendarClock, FileText, History, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { abrirArquivoAutenticado } from "@/lib/arquivo-autenticado"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { EtapaShell } from "@/components/fase-interna/etapas/EtapaShell"
import { PERMISSAO_LIVRE, type PermissaoTrabalho } from "@/lib/fase-interna/permissao-etapa"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { DotacaoDialog, LeiDialog } from "@/components/fase-interna/etapas/CadastroOrcamentoDialogs"
import { erroDaApi, fmtDia, fmtMoeda } from "@/lib/fase-interna/telas"

interface Linha {
  exercicio: number
  valor: number
  situacao: "RESERVADO" | "PREVISAO"
  numero_reserva?: string | null
}

interface ReservaVersao {
  id: string
  versao: number
  status: "RASCUNHO" | "EMITIDA" | "DEVOLVIDA" | "SUBSTITUIDA"
  exercicio_base: number | null
  dotacao_id: string | null
  unidade_orcamentaria: string | null
  programa: string | null
  projeto_atividade: string | null
  elemento_despesa: string | null
  fonte_recurso: string | null
  lei_ldo_id: string | null
  lei_loa_id: string | null
  lei_ppa_id: string | null
  lei_ldo: string | null
  lei_loa: string | null
  lei_ppa: string | null
  declaracao_adequacao: boolean
  declaracao_lrf: boolean
  observacao: string | null
  motivo_renovacao: string | null
  motivo_devolucao: string | null
  documento_id: string | null
  emitida_em: string | null
  emitida_por_nome: string | null
  linhas: Linha[]
  total: number
  created_at: string
}

interface ReservaTela {
  licitacao: { id: string; numero_processo: string; objeto: string; fase: string; sigiloso: boolean }
  exercicio_corrente: number
  valor_estimado: number | null
  atual: ReservaVersao | null
  historico: ReservaVersao[]
  precisa_renovar: boolean
  conferencia: { bloqueios: string[]; avisos: string[]; total: number } | null
  peca: { documento_id: string; status: string; anexada: boolean; tem_arquivo: boolean; versao: number; da_reserva_atual: boolean } | null
  tarefa_renovacao: { id: string; titulo: string } | null
  opcoes: {
    dotacoes: Array<{ id: string; exercicio: number; unidade_orcamentaria: string; programa: string | null; projeto_atividade: string; elemento_despesa: string; fonte_recurso: string; saldo: number | null }>
    leis: Array<{ id: string; tipo: "LDO" | "LOA" | "PPA"; numero: string; exercicio: number; rotulo: string }>
  }
}

const STATUS: Record<string, { t: string; c: string }> = {
  RASCUNHO: { t: "Rascunho", c: "bg-blue-50 text-blue-900 border-blue-200" },
  EMITIDA: { t: "Emitida", c: "bg-green-50 text-green-900 border-green-200" },
  DEVOLVIDA: { t: "Devolvida sem saldo", c: "bg-red-50 text-red-900 border-red-200" },
  SUBSTITUIDA: { t: "Substituída", c: "bg-slate-50 text-slate-700 border-slate-200" },
}
const selectCls = "w-full h-9 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
const numero = (v: string) => Number(String(v).replace(/\./g, "").replace(",", "."))

export default function ReservaPage() {
  const { id } = useParams() as { id: string }
  // Isolamento das peças: a permissão de quem vê nesta etapa (EtapaShell)
  const [perm, setPerm] = useState<PermissaoTrabalho>(PERMISSAO_LIVRE)
  const { pedirTexto, dialogo } = useDialogoConfirmacao()
  const [d, setD] = useState<ReservaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizacao, setAtualizacao] = useState(0)
  const [linhas, setLinhas] = useState<Array<{ exercicio: string; valor: string; situacao: "RESERVADO" | "PREVISAO"; numero_reserva: string }>>([])
  const [observacao, setObservacao] = useState("")
  const [salvando, setSalvando] = useState<"idle" | "salvando" | "salvo">("idle")
  const [ocupado, setOcupado] = useState(false)
  const [novaDotacao, setNovaDotacao] = useState(false)
  const [novaLei, setNovaLei] = useState<null | "LDO" | "LOA" | "PPA">(null)
  const [renovar, setRenovar] = useState(false)
  const [renovarForm, setRenovarForm] = useState({ exercicio: "", motivo: "" })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aplicar = (j: ReservaTela, manterLinhas = false) => {
    setD(j)
    // Gravação de outro campo não descarta a linha que o usuário ainda está digitando
    if (!manterLinhas) setLinhas(
      (j.atual?.linhas || []).map((l) => ({
        exercicio: String(l.exercicio),
        valor: l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        situacao: l.situacao,
        numero_reserva: l.numero_reserva ?? "",
      })),
    )
    setObservacao(j.atual?.observacao ?? "")
  }

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${id}/reserva`)
      if (!r.ok) throw new Error(await erroDaApi(r))
      aplicar(await r.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const chamar = async (metodo: string, caminho: string, corpo?: unknown, manterLinhas = false) => {
    const r = await authFetch(`${API_URL}/api/fase-interna/${id}/reserva${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
    if (!r.ok) throw new Error(await erroDaApi(r))
    const j = (await r.json()) as ReservaTela
    aplicar(j, manterLinhas)
    setAtualizacao((n) => n + 1)
    return j
  }

  const salvar = async (corpo: Record<string, unknown>) => {
    setSalvando("salvando")
    try {
      await chamar("PUT", "", corpo, !("linhas" in corpo))
      setSalvando("salvo")
    } catch (e) {
      setSalvando("idle")
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const salvarLinhas = (novas: typeof linhas) => {
    setLinhas(novas)
    if (timer.current) clearTimeout(timer.current)
    const completas = novas.every((l) => l.exercicio && l.valor && numero(l.valor) > 0)
    if (!completas) return
    timer.current = setTimeout(
      () =>
        salvar({
          linhas: novas.map((l) => ({ exercicio: Number(l.exercicio), valor: numero(l.valor), situacao: l.situacao, numero_reserva: l.numero_reserva || null })),
        }),
      900,
    )
  }

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" aria-label="Carregando a reserva" />
      </div>
    )
  }

  const r = d.atual
  const editavel = (!r || r.status === "RASCUNHO" || r.status === "DEVOLVIDA") && perm.pode
  const dotacaoSel = d.opcoes.dotacoes.find((x) => x.id === r?.dotacao_id) ?? null
  const totalLocal = linhas.reduce((s, l) => s + (numero(l.valor) || 0), 0)
  const leisDo = (tipo: "LDO" | "LOA" | "PPA") => d.opcoes.leis.filter((l) => l.tipo === tipo)
  const estado = STATUS[r?.status ?? "RASCUNHO"]

  return (
    <EtapaShell
      onPermissao={setPerm}
      licitacaoId={id}
      tela="reserva"
      titulo="Informação orçamentária"
      subtitulo={
        <span>
          Art. 72, IV, e art. 150 da Lei 14.133/2021; LC 101/2000, arts. 15 a 17
          {r ? ` · versão ${r.versao}` : ""}
          {editavel ? ` · ${salvando === "salvando" ? "salvando…" : "rascunho salvo automaticamente"}` : ""}
        </span>
      }
      atualizacao={atualizacao}
      acoes={
        r?.status === "EMITIDA" ? (
          <>
            {r.documento_id && (
              <Button variant="outline" onClick={() => abrirArquivoAutenticado(`${API_URL}/api/fase-interna/documento/${r.documento_id}/arquivo`)}>
                <FileText className="w-4 h-4 mr-1" /> Ver informação (PDF)
              </Button>
            )}
            <Button
              variant="outline"
              disabled={ocupado || !perm.pode}
              onClick={async () => {
                const m = await pedirTexto({ titulo: "Retificar a informação orçamentária", mensagem: "Cria uma versão nova para corrigir a classificação. A atual fica no histórico.", rotulo: "Motivo", obrigatorio: true, confirmarRotulo: "Criar versão nova" })
                if (m) acao(() => chamar("POST", "/retificar", { motivo: m }), "Versão nova criada — ajuste e emita de novo")
              }}
            >
              <History className="w-4 h-4 mr-1" /> Retificar
            </Button>
            <Button
              variant={d.precisa_renovar ? "default" : "outline"}
              disabled={ocupado || !perm.pode}
              onClick={() => {
                setRenovarForm({ exercicio: String(Math.max(d.exercicio_corrente, (r.exercicio_base ?? d.exercicio_corrente) + 1)), motivo: "" })
                setRenovar(true)
              }}
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Renovar dotação
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={ocupado || !r || r.status !== "RASCUNHO" || !perm.pode}
              onClick={async () => {
                const m = await pedirTexto({ titulo: "Devolver sem saldo", mensagem: "Registra que não há dotação suficiente para a despesa. O pedido volta para quem o fez.", rotulo: "Motivo", obrigatorio: true, confirmarRotulo: "Devolver" })
                if (m) acao(() => chamar("POST", "/devolver", { motivo: m }), "Pedido devolvido sem saldo")
              }}
            >
              Devolver sem saldo
            </Button>
            <Button disabled={ocupado || !r || !!d.conferencia?.bloqueios.length || !perm.pode} title={d.conferencia?.bloqueios.join(" ") || "Emite a informação orçamentária pelo modelo"} onClick={() => acao(() => chamar("POST", "/emitir"), "Informação orçamentária emitida e saldo reservado")}>
              {ocupado ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} Emitir e reservar saldo
            </Button>
          </>
        )
      }
    >
      {dialogo}
      <DotacaoDialog
        aberto={novaDotacao}
        exercicioSugerido={d.exercicio_corrente}
        onFechar={() => setNovaDotacao(false)}
        onSalvo={async (dot) => {
          setNovaDotacao(false)
          await salvar({ dotacao_id: dot.id })
        }}
      />
      <LeiDialog
        aberto={!!novaLei}
        tipoSugerido={novaLei ?? undefined}
        onFechar={() => setNovaLei(null)}
        onSalvo={async (lei) => {
          setNovaLei(null)
          await salvar({ [lei.tipo === "LDO" ? "lei_ldo_id" : lei.tipo === "LOA" ? "lei_loa_id" : "lei_ppa_id"]: lei.id })
        }}
      />

      {d.precisa_renovar && (
        <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-950 flex gap-2" role="alert">
          <CalendarClock className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>
            <b>Virada de exercício.</b> A informação foi emitida para {r?.exercicio_base}. Se o contrato não foi assinado até 31/12, renove a dotação: o sistema
            cria a versão nova e a tarefa de nova informação orçamentária.
          </span>
        </div>
      )}
      {d.tarefa_renovacao && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950" role="status">
          Tarefa aberta: <b>{d.tarefa_renovacao.titulo}</b>. Conclui ao emitir esta versão (ou ao anexar a informação feita fora).
        </div>
      )}
      {r?.status === "DEVOLVIDA" && r.motivo_devolucao && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="status">
          Devolvido sem saldo: {r.motivo_devolucao}. Ajuste a dotação ou os valores e emita.
        </div>
      )}

      <CaminhosDaPeca licitacaoId={id} tipo="DO" titulo="Informação orçamentária (DO)" fazerAqui="preencher e emitir a informação" atualizacao={atualizacao} onAtualizado={carregar} compacto />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Classificação da despesa">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900">Dotação orçamentária</h2>
              <span className={`text-[11px] border rounded px-1.5 py-0.5 ${estado.c}`}>{estado.t}</span>
            </div>
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[14rem] space-y-1">
                <Label htmlFor="res-dot">Dotação (tabela do órgão)</Label>
                <select id="res-dot" className={selectCls} disabled={!editavel} value={r?.dotacao_id ?? ""} onChange={(e) => salvar({ dotacao_id: e.target.value || null })}>
                  <option value="">{d.opcoes.dotacoes.length ? "Selecione…" : "Nenhuma dotação cadastrada"}</option>
                  {d.opcoes.dotacoes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.exercicio} · {x.projeto_atividade} · {x.elemento_despesa} · Fonte {x.fonte_recurso}
                    </option>
                  ))}
                </select>
              </div>
              {editavel && (
                <Button size="sm" variant="outline" onClick={() => setNovaDotacao(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Cadastrar dotação
                </Button>
              )}
            </div>
            {r?.projeto_atividade && (
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2 text-sm">
                <div><dt className="text-xs text-gray-600">Unidade orçamentária</dt><dd>{r.unidade_orcamentaria}</dd></div>
                {r.programa && <div><dt className="text-xs text-gray-600">Programa</dt><dd>{r.programa}</dd></div>}
                <div><dt className="text-xs text-gray-600">Projeto / atividade</dt><dd>{r.projeto_atividade}</dd></div>
                <div><dt className="text-xs text-gray-600">Elemento de despesa</dt><dd>{r.elemento_despesa}</dd></div>
                <div><dt className="text-xs text-gray-600">Fonte</dt><dd>{r.fonte_recurso}</dd></div>
              </dl>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Distribuição por exercício">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900">Distribuição por exercício</h2>
              {editavel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const ultimo = linhas.length ? Math.max(...linhas.map((l) => Number(l.exercicio) || d.exercicio_corrente)) + 1 : d.exercicio_corrente
                    setLinhas([...linhas, { exercicio: String(ultimo), valor: "", situacao: ultimo === d.exercicio_corrente ? "RESERVADO" : "PREVISAO", numero_reserva: "" }])
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Exercício
                </Button>
              )}
            </div>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-700">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2">Exercício</th>
                    <th scope="col" className="text-right px-3 py-2">Valor</th>
                    <th scope="col" className="text-right px-3 py-2">Saldo na dotação</th>
                    <th scope="col" className="text-left px-3 py-2">Situação</th>
                    <th scope="col" className="text-left px-3 py-2">Nº da reserva</th>
                    <th scope="col" className="px-2 py-2"><span className="sr-only">Remover</span></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const saldo = dotacaoSel && Number(l.exercicio) === dotacaoSel.exercicio ? dotacaoSel.saldo : null
                    const muda = (patch: Partial<(typeof linhas)[number]>) => salvarLinhas(linhas.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">
                          <Input aria-label="Exercício" className="h-8 w-24" inputMode="numeric" disabled={!editavel} value={l.exercicio} onChange={(e) => muda({ exercicio: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input aria-label={`Valor em ${l.exercicio}`} className="h-8 w-36 ml-auto text-right" inputMode="decimal" disabled={!editavel} value={l.valor} onChange={(e) => muda({ valor: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-700">{saldo !== null ? fmtMoeda(saldo) : Number(l.exercicio) > d.exercicio_corrente ? `LOA ${l.exercicio}` : "—"}</td>
                        <td className="px-3 py-2">
                          <select aria-label="Situação" className="h-8 rounded-md border px-2 text-sm bg-white" disabled={!editavel} value={l.situacao} onChange={(e) => muda({ situacao: e.target.value as "RESERVADO" | "PREVISAO" })}>
                            <option value="RESERVADO">Reservar agora</option>
                            <option value="PREVISAO">Previsão — confirmar na LOA</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input aria-label="Número da reserva" className="h-8 w-28" disabled={!editavel} value={l.numero_reserva} onChange={(e) => muda({ numero_reserva: e.target.value })} />
                        </td>
                        <td className="px-2 py-2">
                          {editavel && (
                            <button type="button" aria-label={`Remover ${l.exercicio}`} className="text-gray-500 hover:text-red-700" onClick={() => salvarLinhas(linhas.filter((_, j) => j !== i))}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {!linhas.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-sm text-gray-600">Informe o valor de cada exercício (um contrato de 12 meses pode cruzar o ano).</td>
                    </tr>
                  )}
                  <tr className="border-t bg-gray-50 font-medium">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{fmtMoeda(totalLocal)}</td>
                    <td className="px-3 py-2 text-right text-xs font-normal text-gray-600" colSpan={4}>
                      Valor estimado da pesquisa: {d.licitacao.sigiloso ? `${fmtMoeda(d.valor_estimado)} (sigiloso)` : fmtMoeda(d.valor_estimado)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600">
              <b>Virada de exercício:</b> se o contrato não for assinado até 31/12, use &quot;Renovar dotação&quot; em janeiro — o sistema cria a versão nova e a tarefa de nova informação orçamentária.
            </p>
          </section>

          <section className="rounded-lg border bg-white p-4 space-y-3" aria-label="Declarações e leis">
            <h2 className="text-sm font-semibold text-gray-900">Declarações</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" disabled={!editavel} checked={!!r?.declaracao_adequacao} onChange={(e) => salvar({ declaracao_adequacao: e.target.checked })} />
              Adequação à LOA, LDO e PPA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" disabled={!editavel} checked={!!r?.declaracao_lrf} onChange={(e) => salvar({ declaracao_lrf: e.target.checked })} />
              Compatível com os arts. 15, 16 e 17 da LRF
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["LDO", "LOA", "PPA"] as const).map((tipo) => {
                const campo = tipo === "LDO" ? "lei_ldo_id" : tipo === "LOA" ? "lei_loa_id" : "lei_ppa_id"
                const valor = (r?.[campo] as string | null) ?? ""
                return (
                  <div key={tipo} className="space-y-1">
                    <Label htmlFor={`lei-${tipo}`}>Lei da {tipo}{tipo === "LDO" ? " *" : ""}</Label>
                    <select id={`lei-${tipo}`} className={selectCls} disabled={!editavel} value={valor} onChange={(e) => salvar({ [campo]: e.target.value || null })}>
                      <option value="">{leisDo(tipo).length ? "Selecione…" : "Nenhuma cadastrada"}</option>
                      {leisDo(tipo).map((l) => (
                        <option key={l.id} value={l.id}>{l.rotulo}</option>
                      ))}
                    </select>
                    {editavel && (
                      <button type="button" className="text-xs text-blue-800 hover:underline" onClick={() => setNovaLei(tipo)}>
                        + cadastrar {tipo}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-600">A lei vem de uma tabela única, então despacho, informação orçamentária e parecer citam sempre o mesmo número.</p>
            <div className="space-y-1">
              <Label htmlFor="res-obs">Observação</Label>
              <Textarea id="res-obs" rows={2} disabled={!editavel} value={observacao} onChange={(e) => setObservacao(e.target.value)} onBlur={() => observacao !== (r?.observacao ?? "") && salvar({ observacao })} />
            </div>
          </section>
        </div>

        <aside className="space-y-4" aria-label="Conferência e histórico">
          <section className="rounded-lg border bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Antes de emitir</h2>
            {!r ? (
              <p className="text-sm text-gray-600">Escolha a dotação e informe os valores por exercício.</p>
            ) : r.status === "EMITIDA" ? (
              <p className="text-sm text-green-800">
                Emitida em {fmtDia(r.emitida_em)}{r.emitida_por_nome ? ` por ${r.emitida_por_nome}` : ""} para o exercício {r.exercicio_base}.
              </p>
            ) : (
              <>
                {(d.conferencia?.bloqueios || []).map((b) => (
                  <p key={b} className="text-sm text-orange-900 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />{b}</p>
                ))}
                {(d.conferencia?.avisos || []).map((a) => (
                  <p key={a} className="text-sm text-amber-900">{a}</p>
                ))}
                {!d.conferencia?.bloqueios.length && <p className="text-sm text-green-800">Pronta para emitir.</p>}
              </>
            )}
          </section>
          {d.historico.length > 0 && (
            <section className="rounded-lg border bg-white p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Versões anteriores</h2>
              <ul className="space-y-2 text-sm">
                {d.historico.map((h) => (
                  <li key={h.id} className="border-t pt-2 first:border-t-0 first:pt-0">
                    <p>
                      Versão {h.versao} · {STATUS[h.status]?.t ?? h.status} · {fmtMoeda(h.total)}
                    </p>
                    <p className="text-xs text-gray-600">
                      {h.exercicio_base ? `Exercício ${h.exercicio_base} · ` : ""}
                      {h.linhas.map((l) => `${l.exercicio}: ${fmtMoeda(l.valor)}`).join("; ")}
                    </p>
                  </li>
                ))}
              </ul>
              {r?.motivo_renovacao && <p className="text-xs text-gray-700">Motivo da versão atual: {r.motivo_renovacao}</p>}
            </section>
          )}
          <p className="text-xs text-gray-600">
            Tabelas de dotações e leis: <Link className="text-blue-800 hover:underline" href="/orgao/configuracoes/orcamento">Configurações › Orçamento</Link>.
          </p>
        </aside>
      </div>

      <Dialog open={renovar && !!r} onOpenChange={(v) => !v && setRenovar(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Renovar dotação</DialogTitle>
            <DialogDescription>
              A informação emitida para {r?.exercicio_base} vira histórico. A versão nova soma no novo exercício o valor do exercício encerrado, volta tudo para
              previsão e cria a tarefa de nova informação orçamentária (Contabilidade).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ren-ex">Novo exercício</Label>
              <Input id="ren-ex" inputMode="numeric" value={renovarForm.exercicio} onChange={(e) => setRenovarForm({ ...renovarForm, exercicio: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ren-mot">Motivo</Label>
              <Textarea id="ren-mot" rows={2} placeholder="Ex.: contrato não assinado até 31/12." value={renovarForm.motivo} onChange={(e) => setRenovarForm({ ...renovarForm, motivo: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenovar(false)} disabled={ocupado}>Cancelar</Button>
            <Button
              disabled={ocupado}
              onClick={() =>
                acao(async () => {
                  await chamar("POST", "/renovar", { exercicio: Number(renovarForm.exercicio), motivo: renovarForm.motivo || undefined })
                  setRenovar(false)
                }, "Dotação renovada: versão nova criada e tarefa aberta")
              }
            >
              Renovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EtapaShell>
  )
}
