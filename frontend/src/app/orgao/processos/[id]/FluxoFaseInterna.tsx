"use client"

/**
 * FLUXO DA FASE INTERNA (Entrega 2 — mockup Main.dc.html). Na área da etapa
 * atual da tela do processo: as etapas (8 da SPEC + controle interno, quando o
 * órgão o ativou) com situação, responsável e prazo. A situação vem das peças
 * (feita aqui, anexada, assinada ou "não se aplica") e das dependências — a
 * ordem é sugestão. Cada passo leva à peça no quadro logo abaixo.
 * Fonte: GET /api/fase-interna/:id/etapas.
 */
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, ChevronDown, ChevronUp, Circle, CircleDashed, Clock, MinusCircle, XCircle } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { avisarTarefasAtualizadas, fmtDia, rotuloPrazo, type TarefaTela } from "@/lib/tarefas"

interface PassoEtapa {
  passo: string
  titulo: string
  situacao: "AGUARDANDO" | "DISPONIVEL" | "EM_ANDAMENTO" | "CONCLUIDO" | "NAO_REALIZADO" | "CANCELADO"
  pecas: Array<{ tipo: string; titulo: string; status: string; pronta: boolean }>
  pendencias: string[]
  peca_pendente: string | null
  tarefa: TarefaTela | null
  responsavel_previsto: { rotulo: string }
  prazo_dias_uteis: number | null
}

interface EtapaTela {
  etapa: string
  numero: number
  titulo: string
  situacao: "AGUARDANDO" | "DISPONIVEL" | "EM_ANDAMENTO" | "CONCLUIDA" | "NAO_REALIZADA" | "CANCELADA"
  nao_se_aplica: boolean
  passos: PassoEtapa[]
}

interface EtapasResposta {
  modo: "SIMPLES" | "POR_SETOR"
  controle_interno_ativo: boolean
  etapa_atual: string | null
  concluidas: number
  total: number
  etapas: EtapaTela[]
  historico: Array<{ acao: string; descricao: string; usuario_nome: string | null; created_at: string }>
}

const ROTULO_SITUACAO: Record<EtapaTela["situacao"], string> = {
  AGUARDANDO: "Aguardando etapa anterior",
  DISPONIVEL: "A fazer",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  NAO_REALIZADA: "Não realizada",
  CANCELADA: "Cancelada",
}

const TITULO_PASSO: Record<string, string> = {
  DFD: "Demanda",
  ETP: "Estudo técnico",
  TR: "Termo de referência",
  PESQUISA: "Pesquisa de preços",
  RESERVA: "Reserva orçamentária",
  AUTORIZACAO: "Autorização",
  MINUTAS: "Minutas",
  PARECER: "Parecer",
  CONTROLE_INTERNO: "Controle interno",
  PUBLICACAO: "Publicação",
}

function IconeSituacao({ s }: { s: EtapaTela["situacao"] }) {
  const cls = "w-4 h-4 shrink-0"
  if (s === "CONCLUIDA") return <CheckCircle2 className={`${cls} text-green-700`} aria-hidden="true" />
  if (s === "EM_ANDAMENTO") return <Clock className={`${cls} text-blue-700`} aria-hidden="true" />
  if (s === "DISPONIVEL") return <Circle className={`${cls} text-blue-700`} aria-hidden="true" />
  if (s === "CANCELADA") return <XCircle className={`${cls} text-slate-500`} aria-hidden="true" />
  if (s === "NAO_REALIZADA") return <MinusCircle className={`${cls} text-slate-500`} aria-hidden="true" />
  return <CircleDashed className={`${cls} text-slate-400`} aria-hidden="true" />
}

export function FluxoFaseInterna({ licitacaoId, atualizacao }: { licitacaoId: string; atualizacao?: unknown }) {
  const [dados, setDados] = useState<EtapasResposta | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [historico, setHistorico] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/etapas`)
      if (r.ok) {
        setDados(await r.json())
        avisarTarefasAtualizadas() // a tela sincroniza as tarefas: atualiza o badge do menu
      }
    } catch {
      /* quadro fica oculto */
    }
  }, [licitacaoId])
  useEffect(() => { carregar() }, [carregar, atualizacao])

  if (!dados?.etapas?.length) return null
  const atual = dados.etapa_atual

  const irParaPeca = (tipo: string | null) => {
    const el = tipo ? document.getElementById(`peca-${tipo}`) : null
    if (el) {
      history.replaceState(null, "", `#peca-${tipo}`)
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    } else {
      document.getElementById("area-etapa-atual")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <section id="fluxo-fase-interna" aria-label="Fluxo da fase interna" className="border rounded-md p-3 bg-white space-y-2 scroll-mt-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Fluxo da fase interna</h3>
        <span className="text-xs text-gray-600">
          {dados.concluidas} de {dados.total} etapas concluídas · {dados.modo === "SIMPLES" ? "modo simples (tudo com o agente)" : "por setor"}
        </span>
      </div>
      <p className="text-xs text-gray-600">
        A ordem é sugestão: qualquer peça pode ser feita ou anexada antes. A etapa conta quando a peça está pronta (feita aqui, anexada, assinada ou &quot;não se aplica&quot;).
      </p>

      <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {dados.etapas.map((e) => {
          const ehAtual = e.etapa === atual
          const passoPrincipal = e.passos.find((p) => p.tarefa?.status === "ABERTA") ?? e.passos[0]
          const tarefa = passoPrincipal?.tarefa
          const responsavel = tarefa && tarefa.status === "ABERTA" ? tarefa.responsavel.rotulo : passoPrincipal?.responsavel_previsto.rotulo
          const expandido = aberto === e.etapa
          return (
            <li key={e.etapa} className={`rounded border px-2 py-1.5 text-xs ${ehAtual ? "border-orange-400 bg-orange-50" : "bg-slate-50"}`}>
              <button
                type="button"
                className="w-full text-left"
                aria-expanded={expandido}
                onClick={() => setAberto(expandido ? null : e.etapa)}
              >
                <div className="flex items-center gap-1.5">
                  <IconeSituacao s={e.situacao} />
                  <span className="font-mono text-[11px] text-gray-500">{String(e.numero).padStart(2, "0")}</span>
                  <span className="font-medium text-gray-900 flex-1">{e.titulo}</span>
                  {expandido ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
                </div>
                <div className="mt-0.5 pl-5 text-gray-700">
                  {ROTULO_SITUACAO[e.situacao]}
                  {e.nao_se_aplica && " (não se aplica)"}
                  {tarefa?.status === "ABERTA" && (
                    <span className={tarefa.atrasada ? " text-orange-800 font-semibold" : ""}> · {rotuloPrazo(tarefa)}</span>
                  )}
                </div>
                {e.situacao !== "CONCLUIDA" && e.situacao !== "CANCELADA" && e.situacao !== "NAO_REALIZADA" && responsavel && (
                  <div className="pl-5 text-gray-600">Responsável: {responsavel}</div>
                )}
              </button>
              {expandido && (
                <ul className="mt-1.5 pl-5 space-y-1 border-t pt-1.5">
                  {e.passos.map((p) => (
                    <li key={p.passo}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{TITULO_PASSO[p.passo] ?? p.titulo}</span>
                        {p.situacao !== "CONCLUIDO" && p.passo !== "PUBLICACAO" && (
                          <button type="button" className="text-blue-800 hover:underline" onClick={() => irParaPeca(p.peca_pendente)}>
                            ir para a peça
                          </button>
                        )}
                      </div>
                      <div className="text-gray-600">
                        {p.pecas.map((x) => `${x.titulo}${x.pronta ? " ✓" : ""}`).join(" · ") || "Checklist de pré-publicação"}
                      </div>
                      {p.pendencias.length > 0 && p.situacao === "AGUARDANDO" && (
                        <div className="text-gray-600">Depois de: {p.pendencias.map((d) => TITULO_PASSO[d] ?? d).join(", ")}</div>
                      )}
                      {p.prazo_dias_uteis ? <div className="text-gray-600">Prazo padrão: {p.prazo_dias_uteis} dias úteis</div> : null}
                      {p.tarefa?.status === "CONCLUIDA" && (
                        <div className="text-green-800">
                          Concluída{p.tarefa.concluida_por_nome ? ` por ${p.tarefa.concluida_por_nome}` : ""} em {fmtDia(p.tarefa.concluida_em)}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      {dados.historico.length > 0 && (
        <div>
          <button type="button" className="text-xs text-blue-800 hover:underline" onClick={() => setHistorico((h) => !h)} aria-expanded={historico}>
            {historico ? "Ocultar histórico das etapas" : "Ver histórico das etapas e tarefas"}
          </button>
          {historico && (
            <ul className="mt-1 space-y-0.5 text-xs text-gray-700 max-h-48 overflow-y-auto">
              {dados.historico.map((h, i) => (
                <li key={i}>
                  <span className="text-gray-500">{new Date(h.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span> — {h.descricao}
                  {h.usuario_nome ? ` (${h.usuario_nome})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
