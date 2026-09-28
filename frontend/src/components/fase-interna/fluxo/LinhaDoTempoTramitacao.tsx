"use client"

/**
 * LINHA DO TEMPO DA TRAMITAÇÃO (F3b) — o que o papel mostra nos autos: cada
 * envio, recebimento e devolução, com o despacho, quem fez e quando (horário
 * de Brasília). Lançamento feito depois do fato aparece marcado ("lançado
 * depois"), com quem lançou e quando. O despacho é folha dos autos: "Ver
 * despacho (fl. N)". Fonte: GET /api/fase-interna/:id/tramitacao/linha-do-tempo.
 */
import { useCallback, useEffect, useState } from "react"
import { ArrowRight, CheckCircle2, CornerUpLeft, Loader2, Send } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { criarUltimaCarga } from "@/lib/fase-interna/telas"
import { rotuloDaFolha } from "@/lib/fase-interna/visao-fluxo"
import { abrirDespachoPdf, mensagemDoErro } from "./despacho"

type Pessoa = { setor_id: string | null; setor_nome: string | null; usuario_id: string | null; usuario_nome: string | null }

export interface EventoTramitacao {
  tipo: "ENVIO" | "DEVOLUCAO" | "RECEBIMENTO"
  tramitacao_id: string
  sequencia: number
  data: string
  de: Pessoa
  para: Pessoa
  por: { id: string | null; nome: string | null }
  despacho: string | null
  motivo: string | null
  prazo: string | null
  prazo_dias_uteis: number | null
  automatico: boolean
  lancado_posteriormente: boolean
  lancado_em: string | null
  lancado_por: { id: string | null; nome: string | null } | null
  folha: { folha_inicial: number | null; folha_final: number | null; url: string } | null
  /** Ato sem folha própria nos autos (posse inicial → "Termo de abertura (autuação)"). */
  nos_autos?: string | null
}

const nome = (p: Pessoa) => (p.setor_nome && p.usuario_nome ? `${p.setor_nome} (${p.usuario_nome})` : p.setor_nome || p.usuario_nome || "—")

const ESTILO = {
  ENVIO: { rotulo: "Envio", Icone: Send, cor: "text-blue-800 border-blue-700" },
  RECEBIMENTO: { rotulo: "Recebimento", Icone: CheckCircle2, cor: "text-green-800 border-green-700" },
  DEVOLUCAO: { rotulo: "Devolução", Icone: CornerUpLeft, cor: "text-red-800 border-red-700" },
} as const

export function LinhaDoTempoTramitacao({ licitacaoId, atualizacao }: { licitacaoId: string; atualizacao?: unknown }) {
  const [eventos, setEventos] = useState<EventoTramitacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ultima] = useState(criarUltimaCarga)

  const carregar = useCallback(async () => {
    const vale = ultima()
    // Estado só muda depois da resposta (nunca no mesmo tique do efeito)
    await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/tramitacao/linha-do-tempo`, { cache: "no-store" })
      .then(async (r) => {
        if (!vale()) return
        if (!r.ok) {
          setErro(await mensagemDoErro(r, "Não foi possível carregar a linha do tempo"))
          return
        }
        const lista = (await r.json()) as EventoTramitacao[]
        if (!vale()) return
        setErro(null)
        setEventos(lista)
      })
      .catch((e) => {
        if (vale()) setErro(e instanceof Error ? e.message : String(e))
      })
  }, [licitacaoId, ultima])
  useEffect(() => { carregar() }, [carregar, atualizacao])

  const verDespacho = async (url: string) => {
    const e = await abrirDespachoPdf(url)
    setErro(e)
  }

  return (
    <section aria-label="Linha do tempo da tramitação" className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">Linha do tempo</h3>
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      {eventos === null && !erro ? (
        <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando…</p>
      ) : eventos && eventos.length === 0 ? (
        <p className="text-sm text-gray-600">Ainda sem movimentação registrada. Use &quot;Enviar para&quot; no topo do processo.</p>
      ) : (
        <ol className="relative border-l border-gray-200 ml-2 space-y-4">
          {[...(eventos ?? [])].reverse().map((ev, i) => {
            const s = ESTILO[ev.tipo]
            const folha = rotuloDaFolha(ev.folha)
            return (
              <li key={`${ev.tramitacao_id}-${ev.tipo}-${i}`} className="ml-5">
                <span className={`absolute -left-[9px] mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-white ${s.cor}`} aria-hidden="true">
                  <s.Icone className="w-2.5 h-2.5" />
                </span>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
                  <b className={s.cor.split(" ")[0]}>{s.rotulo}</b>
                  <span className="text-gray-700">{nome(ev.de)}</span>
                  <ArrowRight className="w-3 h-3 text-gray-500" aria-label="para" />
                  <span className="font-medium text-gray-900">{nome(ev.para)}</span>
                </p>
                <p className="text-[11px] text-gray-600">
                  {fmtBrasilia(ev.data)}
                  {ev.por.nome ? ` · ${ev.tipo === "RECEBIMENTO" ? "recebido por" : "por"} ${ev.por.nome}` : ""}
                  {ev.automatico ? " · registrado automaticamente" : ""}
                  {ev.tipo !== "RECEBIMENTO" && ev.prazo ? ` · prazo ${fmtBrasilia(ev.prazo, false)}${ev.prazo_dias_uteis ? ` (${ev.prazo_dias_uteis} d.u.)` : ""}` : ""}
                </p>
                {ev.lancado_posteriormente && (
                  <p className="text-[11px] text-amber-900">
                    Lançado depois{ev.lancado_em ? ` em ${fmtBrasilia(ev.lancado_em)}` : ""}
                    {ev.lancado_por?.nome ? ` por ${ev.lancado_por.nome}` : ""} — ocorrido em {fmtBrasilia(ev.data)}
                  </p>
                )}
                {ev.tipo === "DEVOLUCAO" && ev.motivo ? (
                  <p className="mt-0.5 text-sm text-red-900 whitespace-pre-wrap">Motivo: {ev.motivo}</p>
                ) : ev.despacho ? (
                  <p className="mt-0.5 text-sm text-gray-800 whitespace-pre-wrap">{ev.despacho}</p>
                ) : null}
                {ev.folha?.url && (
                  <button type="button" className="text-[11px] text-blue-800 hover:underline" onClick={() => verDespacho(ev.folha!.url)}>
                    Ver despacho{folha ? ` (${folha})` : ""}
                  </button>
                )}
                {!ev.folha && ev.nos_autos && <p className="text-[11px] text-gray-600">Nos autos: {ev.nos_autos}</p>}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
