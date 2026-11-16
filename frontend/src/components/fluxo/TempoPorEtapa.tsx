"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  detalheTempo,
  diasFmt,
  PERIODOS_TEMPO,
  resumoTempo,
  rotuloMes,
  versoesComTempo,
  type DetalheTempo,
  type EtapaComTempo,
  type ResumoTempo,
  type VersaoComTempo,
} from "@/lib/fluxo/tempo"

/**
 * ANDAMENTO › TEMPO POR ETAPA (mockup aprovado 07/10/2026): quanto cada etapa
 * de uma versão do fluxo leva de verdade, comparado com o prazo. Dias úteis.
 * Clicar numa etapa abre o detalhe (tendência, espera × análise, processos).
 */
const AZUL = "#1351b4"
const LARANJA = "#C2410C"

const cartao = "rounded-lg border border-gray-200 bg-white p-3"
const rotuloSecao = "text-[11px] font-bold uppercase tracking-wide text-gray-500"

function erroDe(e: unknown, padrao: string) {
  return e instanceof Error && e.message ? e.message : padrao
}

export function TempoPorEtapa() {
  const [versoes, setVersoes] = useState<VersaoComTempo[] | null>(null)
  const [fluxoId, setFluxoId] = useState<string>("")
  const [dias, setDias] = useState(90)
  const [responsavel, setResponsavel] = useState("TODOS")
  const [erroVersoes, setErroVersoes] = useState<string | null>(null)
  // Resultado da última consulta, com a chave (fluxo|período) que o gerou: "carregando" = a chave atual ainda não chegou
  const [resultado, setResultado] = useState<{ chave: string; dados: ResumoTempo | null; erro: string | null } | null>(null)
  const [etapaId, setEtapaId] = useState<string | null>(null)

  useEffect(() => {
    versoesComTempo()
      .then((v) => {
        setVersoes(v)
        if (v.length) setFluxoId((v.find((x) => x.ativo) ?? v[0]).id)
      })
      .catch((e) => setErroVersoes(erroDe(e, "Não foi possível carregar os fluxos.")))
  }, [])

  const chave = fluxoId ? `${fluxoId}|${dias}` : ""
  useEffect(() => {
    if (!fluxoId) return
    let vivo = true
    const k = `${fluxoId}|${dias}`
    resumoTempo(fluxoId, dias)
      .then((d) => vivo && setResultado({ chave: k, dados: d, erro: null }))
      .catch((e) => vivo && setResultado({ chave: k, dados: null, erro: erroDe(e, "Não foi possível calcular o tempo por etapa.") }))
    return () => {
      vivo = false
    }
  }, [fluxoId, dias])
  const carregando = !!chave && resultado?.chave !== chave
  // Enquanto a nova consulta não chega, mostra a anterior (sem piscar a tela)
  const dados = resultado?.dados ?? null
  const erro = erroVersoes ?? (resultado?.chave === chave ? resultado.erro : null)

  const responsaveis = useMemo(() => [...new Set((dados?.etapas ?? []).map((e) => e.responsavel).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, "pt-BR")), [dados])
  const etapas = useMemo(() => (dados?.etapas ?? []).filter((e) => responsavel === "TODOS" || e.responsavel === responsavel), [dados, responsavel])

  if (versoes && !versoes.length) {
    return (
      <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center text-sm text-gray-700">
        Nenhum processo seguiu um fluxo desenhado ainda. O tempo por etapa aparece quando os processos começarem a andar pelos fluxos de{" "}
        <Link href="/orgao/configuracoes/fluxos" className="text-[#1351b4] underline">Fluxos de processo</Link>.
      </div>
    )
  }

  if (etapaId && fluxoId) {
    return <DetalheEtapa fluxoId={fluxoId} etapaId={etapaId} dias={dias} onVoltar={() => setEtapaId(null)} />
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[min(260px,100%)]">
          <label className="text-xs font-semibold text-gray-700" id="rot-fluxo">Fluxo</label>
          <Select value={fluxoId} onValueChange={(v) => setFluxoId(v)}>
            <SelectTrigger aria-labelledby="rot-fluxo" className="bg-white"><SelectValue placeholder="Carregando…" /></SelectTrigger>
            <SelectContent>
              {(versoes ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.nome} — versão {v.versao}{v.ativo ? " (ativa)" : v.status === "DESATIVADO" ? " (desativada)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-52">
          <label className="text-xs font-semibold text-gray-700" id="rot-periodo">Etapas concluídas em</label>
          <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
            <SelectTrigger aria-labelledby="rot-periodo" className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS_TEMPO.map((p) => <SelectItem key={p.dias} value={String(p.dias)}>{p.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-52">
          <label className="text-xs font-semibold text-gray-700" id="rot-resp">Responsável</label>
          <Select value={responsavel} onValueChange={setResponsavel}>
            <SelectTrigger aria-labelledby="rot-resp" className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              {responsaveis.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {carregando && <Loader2 className="h-5 w-5 animate-spin text-gray-500 mb-2.5" aria-label="Calculando" />}
      </div>

      {erro && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2 items-center">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />{erro}
        </p>
      )}

      {dados && (
        <>
          <section aria-label="Resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className={cartao}>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{dados.resumo.processos_concluidos}</p>
              <p className="text-xs text-gray-600">processos concluídos no período</p>
            </div>
            <div className={cartao}>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{diasFmt(dados.resumo.tempo_total_medio_dias_uteis)} <span className="text-sm font-medium text-gray-500">dias úteis</span></p>
              <p className="text-xs text-gray-600">do início ao fim do fluxo · prazo somado {dados.resumo.prazo_somado_dias_uteis}</p>
            </div>
            <div className={cartao}>
              <p className={`text-xl font-bold tabular-nums ${dados.resumo.pct_no_prazo !== null && dados.resumo.pct_no_prazo < 80 ? "text-orange-800" : "text-gray-900"}`}>
                {dados.resumo.pct_no_prazo === null ? "—" : `${dados.resumo.pct_no_prazo}%`}
              </p>
              <p className="text-xs text-gray-600">das etapas concluídas no prazo</p>
            </div>
            {dados.resumo.pior_etapa ? (
              <button type="button" onClick={() => setEtapaId(dados.resumo.pior_etapa!.acao_id)} className="text-left rounded-lg border border-orange-300 bg-orange-50 p-3">
                <p className="text-base font-bold text-orange-900">{dados.resumo.pior_etapa.nome}</p>
                <p className="text-xs text-orange-900">etapa que mais passa do prazo: +{diasFmt(dados.resumo.pior_etapa.excesso_dias_uteis)} dias úteis em média</p>
              </button>
            ) : (
              <div className={cartao}>
                <p className="text-base font-bold text-gray-900">Nenhuma etapa</p>
                <p className="text-xs text-gray-600">passa do prazo, em média, no período</p>
              </div>
            )}
          </section>

          <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_300px]">
            <BarrasEtapas etapas={etapas} onAbrir={setEtapaId} />
            <aside className="space-y-4 min-w-0">
              <section className="rounded-lg border border-gray-200 bg-white p-3 space-y-2" aria-labelledby="t-agora">
                <div>
                  <div className={rotuloSecao}>Agora</div>
                  <h2 id="t-agora" className="text-base font-semibold text-gray-900">Processos em cada etapa</h2>
                </div>
                {etapas.some((e) => e.abertas_agora) ? (
                  <ul className="space-y-1.5 text-sm">
                    {etapas.filter((e) => e.abertas_agora).map((e) => (
                      <li key={e.acao_id} className="flex justify-between gap-2">
                        <span className="truncate">{e.nome}</span>
                        <span className="tabular-nums shrink-0"><b>{e.abertas_agora}</b>{e.atrasadas_agora ? <span className="text-orange-800"> · {e.atrasadas_agora} acima do prazo</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">Nenhum processo em andamento nesta versão.</p>
                )}
              </section>
              <section className="rounded-lg border border-gray-200 bg-white p-3 space-y-2" aria-labelledby="t-retrabalho">
                <div>
                  <div className={rotuloSecao}>Retrabalho</div>
                  <h2 id="t-retrabalho" className="text-base font-semibold text-gray-900">Etapas mais refeitas</h2>
                </div>
                {etapas.some((e) => e.refeita) ? (
                  <ul className="space-y-1.5 text-sm">
                    {[...etapas].filter((e) => e.refeita).sort((a, b) => b.refeita - a.refeita).map((e) => (
                      <li key={e.acao_id} className="flex justify-between gap-2">
                        <span className="min-w-0">{e.nome}{e.refeita_por[0] ? <span className="text-gray-500"> — devolvida por {e.refeita_por[0].etapa}</span> : null}</span>
                        <b className="tabular-nums shrink-0">{e.refeita}×</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">Nenhuma devolução no período.</p>
                )}
                <p className="text-xs text-gray-500">Cada devolução reabre a etapa e o tempo dela volta a contar.</p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function BarrasEtapas({ etapas, onAbrir }: { etapas: EtapaComTempo[]; onAbrir: (id: string) => void }) {
  const escala = Math.max(10, ...etapas.map((e) => Math.max(e.media_dias_uteis ?? 0, e.prazo_dias_uteis ?? 0))) * 1.15
  const pct = (v: number) => `${Math.min(100, (v / escala) * 100)}%`
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 space-y-3 min-w-0" aria-labelledby="t-etapas">
      <div className="flex flex-wrap justify-between gap-2 items-baseline">
        <div>
          <div className={rotuloSecao}>Tempo médio por etapa</div>
          <h2 id="t-etapas" className="text-base font-semibold text-gray-900">Onde o tempo vai, na ordem do fluxo</h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-600 items-center">
          <span className="flex gap-1.5 items-center"><span className="w-3.5 h-2.5 rounded-sm" style={{ background: AZUL }} />dentro do prazo</span>
          <span className="flex gap-1.5 items-center"><span className="w-3.5 h-2.5 rounded-sm" style={{ background: LARANJA }} />acima do prazo</span>
          <span className="flex gap-1.5 items-center"><span className="w-0.5 h-3.5 bg-gray-900" />prazo</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[190px_minmax(0,1fr)_76px_80px] gap-3 pb-2 border-b text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <span>Etapa · responsável</span>
            <span>Média (dias úteis) × prazo</span>
            <span className="text-right">No prazo</span>
            <span className="text-right">Concluídas</span>
          </div>
          {etapas.map((e) => {
            const acima = e.media_dias_uteis !== null && !!e.prazo_dias_uteis && e.media_dias_uteis > e.prazo_dias_uteis
            return (
              <button
                key={e.acao_id}
                type="button"
                onClick={() => onAbrir(e.acao_id)}
                className="w-full grid grid-cols-[190px_minmax(0,1fr)_76px_80px] gap-3 items-center py-2.5 border-b border-gray-100 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1351b4]"
              >
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-gray-900 truncate">{e.nome}</span>
                  <span className="text-xs text-gray-500 truncate">{e.responsavel ?? "Sem responsável"}</span>
                </span>
                <span className="relative h-7 rounded bg-slate-100">
                  {e.media_dias_uteis !== null && (
                    <span className="absolute left-0 top-1 h-5 rounded-sm" style={{ width: pct(e.media_dias_uteis), background: acima ? LARANJA : AZUL }} />
                  )}
                  {e.prazo_dias_uteis ? <span className="absolute -top-0.5 h-8 w-0.5 bg-gray-900" style={{ left: pct(e.prazo_dias_uteis) }} aria-hidden="true" /> : null}
                  <span className={`absolute top-1 text-[13px] font-bold whitespace-nowrap tabular-nums ${acima ? "text-orange-800" : "text-gray-900"}`} style={{ left: `calc(${pct(e.media_dias_uteis ?? 0)} + 8px)` }}>
                    {e.media_dias_uteis === null ? "sem conclusão no período" : diasFmt(e.media_dias_uteis)}
                    {e.media_dias_uteis !== null && <span className="font-normal text-gray-500"> / prazo {e.prazo_dias_uteis ?? "—"}</span>}
                  </span>
                </span>
                <span className={`text-right text-sm font-semibold tabular-nums ${acima ? "text-orange-800" : "text-gray-900"}`}>
                  {e.avaliadas ? `${Math.round((e.no_prazo / e.avaliadas) * 100)}%` : "—"}
                </span>
                <span className="text-right text-sm text-gray-700 tabular-nums">{e.concluidas}</span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-gray-500">Clique numa etapa para ver a tendência, onde o tempo fica e os processos que mais demoraram.</p>
    </section>
  )
}

function DetalheEtapa({ fluxoId, etapaId, dias, onVoltar }: { fluxoId: string; etapaId: string; dias: number; onVoltar: () => void }) {
  const [d, setD] = useState<DetalheTempo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [soAcima, setSoAcima] = useState(false)

  useEffect(() => {
    let vivo = true
    detalheTempo(fluxoId, etapaId, dias)
      .then((x) => vivo && setD(x))
      .catch((e) => vivo && setErro(erroDe(e, "Não foi possível abrir a etapa.")))
    return () => {
      vivo = false
    }
  }, [fluxoId, etapaId, dias])

  const voltar = (
    <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1 text-sm font-semibold text-[#1351b4] hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />Tempo por etapa
    </button>
  )
  if (erro) return <div className="space-y-3">{voltar}<p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p></div>
  if (!d) return <div className="space-y-3">{voltar}<Loader2 className="h-6 w-6 animate-spin text-gray-500" aria-label="Carregando" /></div>

  const prazo = d.prazo_dias_uteis
  const maxMes = Math.max(prazo ?? 0, ...d.meses.map((m) => m.media_dias_uteis ?? 0), 1) * 1.2
  const processos = soAcima ? d.processos.filter((p) => p.acima_do_prazo) : d.processos
  const esperaPct = d.espera && d.espera.espera_dias_uteis !== null && d.espera.analise_dias_uteis !== null && d.espera.espera_dias_uteis + d.espera.analise_dias_uteis > 0
    ? Math.round((d.espera.espera_dias_uteis / (d.espera.espera_dias_uteis + d.espera.analise_dias_uteis)) * 100)
    : null

  return (
    <div className="space-y-4 min-w-0">
      {voltar}
      <header className="space-y-1">
        <div className={rotuloSecao}>{d.fluxo.nome} — versão {d.fluxo.versao} · etapa {d.posicao} de {d.total_etapas}</div>
        <h2 className="text-xl font-bold text-gray-900">{d.nome}</h2>
        <p className="text-sm text-gray-700">Responsável: {d.responsavel ?? "—"} · prazo da etapa: {prazo ? `${prazo} dias úteis` : "sem prazo"}</p>
      </header>

      <section aria-label="Resumo da etapa" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className={cartao}>
          <p className={`text-xl font-bold tabular-nums ${prazo && d.media_dias_uteis !== null && d.media_dias_uteis > prazo ? "text-orange-800" : "text-gray-900"}`}>{diasFmt(d.media_dias_uteis)}</p>
          <p className="text-xs text-gray-600">dias úteis em média{prazo ? ` (prazo ${prazo})` : ""}</p>
        </div>
        <div className={cartao}>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{d.avaliadas ? `${d.no_prazo} de ${d.avaliadas}` : "—"}</p>
          <p className="text-xs text-gray-600">concluídas no prazo{d.avaliadas ? ` (${Math.round((d.no_prazo / d.avaliadas) * 100)}%)` : ""}</p>
        </div>
        <div className={cartao}>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{d.mais_rapida === null ? "—" : `${d.mais_rapida} a ${d.mais_lenta}`}</p>
          <p className="text-xs text-gray-600">dias úteis: a mais rápida e a mais lenta</p>
        </div>
        <div className={cartao}>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{d.devolveu}×</p>
          <p className="text-xs text-gray-600">devolveu o processo para ajuste{d.refeita ? ` · refeita ${d.refeita}×` : ""}</p>
        </div>
      </section>

      <div className="grid gap-4 items-start lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 space-y-3" aria-labelledby="t-mes">
          <div>
            <div className={rotuloSecao}>Tendência</div>
            <h3 id="t-mes" className="text-base font-semibold text-gray-900">Média por mês de conclusão</h3>
          </div>
          {d.meses.length ? (
            <>
              <div className="relative h-48 flex items-end gap-4 px-2 border-b border-gray-300">
                {prazo ? (
                  <>
                    <span className="absolute left-0 right-0 border-t-2 border-dashed border-gray-900" style={{ bottom: `${(prazo / maxMes) * 100}%` }} aria-hidden="true" />
                    <span className="absolute right-0 text-[11px] font-semibold text-gray-900" style={{ bottom: `calc(${(prazo / maxMes) * 100}% + 4px)` }}>prazo {prazo}</span>
                  </>
                ) : null}
                {d.meses.map((m) => {
                  const acima = !!prazo && (m.media_dias_uteis ?? 0) > prazo
                  return (
                    <div key={m.mes} className="flex-1 h-full flex flex-col items-center justify-end gap-1 min-w-0">
                      <span className={`text-xs font-bold tabular-nums ${acima ? "text-orange-800" : "text-gray-900"}`}>{diasFmt(m.media_dias_uteis)}</span>
                      <span className="w-full max-w-14 rounded-t" style={{ height: `${((m.media_dias_uteis ?? 0) / maxMes) * 100}%`, background: acima ? LARANJA : AZUL }} />
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-4 px-2 text-xs text-gray-600">
                {d.meses.map((m) => <span key={m.mes} className="flex-1 text-center">{rotuloMes(m.mes)} ({m.concluidas})</span>)}
              </div>
              <p className="text-xs text-gray-500">Entre parênteses, quantas foram concluídas no mês.</p>
            </>
          ) : (
            <p className="text-sm text-gray-600">Nenhuma conclusão no período.</p>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 space-y-3" aria-labelledby="t-onde">
          <div>
            <div className={rotuloSecao}>Onde o tempo fica</div>
            <h3 id="t-onde" className="text-base font-semibold text-gray-900">{d.espera ? "Recebimento × análise" : "Quem conclui"}</h3>
          </div>
          {d.espera && esperaPct !== null && (
            <div className="space-y-1.5">
              <div className="flex h-6 rounded overflow-hidden" role="img" aria-label={`${esperaPct}% esperando recebimento`}>
                <span style={{ width: `${esperaPct}%`, background: "#FDBA74" }} />
                <span style={{ width: `${100 - esperaPct}%`, background: AZUL }} />
              </div>
              <div className="flex justify-between text-sm gap-2">
                <span><b className="tabular-nums">{diasFmt(d.espera.espera_dias_uteis)} d</b> esperando ser recebido</span>
                <span><b className="tabular-nums">{diasFmt(d.espera.analise_dias_uteis)} d</b> em análise</span>
              </div>
              <p className="text-sm text-gray-700">{esperaPct}% do tempo o processo ficou parado antes de alguém dar &quot;Receber processo&quot;.</p>
            </div>
          )}
          {d.por_pessoa ? (
            <ul className="space-y-1.5 text-sm border-t border-gray-100 pt-2">
              {d.por_pessoa.map((p) => (
                <li key={p.nome} className="flex justify-between gap-2">
                  <span className="truncate">{p.nome}</span>
                  <span className="tabular-nums shrink-0">{p.concluidas} {p.concluidas === 1 ? "conclusão" : "conclusões"} · <b>{diasFmt(p.media_dias_uteis)} d</b></span>
                </li>
              ))}
            </ul>
          ) : (
            !d.espera && <p className="text-sm text-gray-600">A média por pessoa aparece para o administrador do órgão.</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4 space-y-2" aria-labelledby="t-proc">
        <div className="flex flex-wrap justify-between gap-2 items-baseline">
          <div>
            <div className={rotuloSecao}>Processos</div>
            <h3 id="t-proc" className="text-base font-semibold text-gray-900">Os que mais demoraram nesta etapa</h3>
          </div>
          <label className="flex gap-2 items-center text-sm text-gray-700">
            <input type="checkbox" className="h-4 w-4" checked={soAcima} onChange={(e) => setSoAcima(e.target.checked)} /> Só os acima do prazo
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-2 font-bold">Processo</th>
                <th className="py-2 px-2 font-bold">Objeto</th>
                {d.por_pessoa ? <th className="py-2 px-2 font-bold">Quem concluiu</th> : null}
                <th className="py-2 px-2 font-bold text-right">Dias úteis</th>
                <th className="py-2 px-2 font-bold text-right">Rodadas</th>
              </tr>
            </thead>
            <tbody>
              {processos.map((p, i) => (
                <tr key={`${p.processo_id}-${i}`} className="border-t border-gray-100">
                  <td className="py-2 pr-2">{p.processo_id ? <Link href={`/orgao/processo/${p.processo_id}`} className="font-semibold text-[#1351b4] hover:underline">{p.numero ?? "—"}</Link> : "—"}</td>
                  <td className="py-2 px-2 text-gray-700">{p.objeto ?? "—"}</td>
                  {d.por_pessoa ? <td className="py-2 px-2 text-gray-700">{p.quem ?? "—"}</td> : null}
                  <td className={`py-2 px-2 text-right font-bold tabular-nums ${p.acima_do_prazo ? "text-orange-800" : "text-gray-900"}`}>{p.dias_uteis}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.rodadas}</td>
                </tr>
              ))}
              {!processos.length && (
                <tr><td colSpan={5} className="py-3 text-gray-600">Nenhum processo{soAcima ? " acima do prazo" : ""} no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
