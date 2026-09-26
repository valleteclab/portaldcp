"use client"

/**
 * MOLDURA DAS TELAS POR ETAPA (Entrega 3A — mockups DFD/ETP/Pesquisa/Reserva):
 * "← Voltar ao processo", identificação do processo e a barra das 8 etapas
 * (1 Demanda › 2 ETP › … › 8 Publicação; o controle interno só quando o
 * órgão o ativou) com a situação vinda de
 * GET /api/fase-interna/:id/etapas. As etapas com tela própria viram link;
 * as demais levam ao quadro "Fluxo da fase interna" do processo.
 */
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, ChevronRight, Circle, CircleDashed, Clock } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { avisarTarefasAtualizadas } from "@/lib/tarefas"
import { ETAPAS_DA_BARRA, rotaDaTela, type TelaEtapa } from "@/lib/fase-interna/telas"

interface LicitacaoCabecalho {
  id: string
  numero_processo?: string
  objeto?: string
  modalidade?: string
  fase?: string
}

interface EtapasResposta {
  etapas: Array<{ etapa: string; situacao: string; passos: Array<{ passo: string; situacao: string }> }>
}

const ROTULO_SIT: Record<string, string> = {
  CONCLUIDO: "concluída",
  EM_ANDAMENTO: "em andamento",
  DISPONIVEL: "a fazer",
  AGUARDANDO: "aguardando",
  NAO_REALIZADO: "não realizada",
  CANCELADO: "cancelada",
}

function Icone({ s }: { s: string | null }) {
  const cls = "w-3.5 h-3.5 shrink-0"
  if (s === "CONCLUIDO") return <CheckCircle2 className={`${cls} text-green-700`} aria-hidden="true" />
  if (s === "EM_ANDAMENTO") return <Clock className={`${cls} text-blue-700`} aria-hidden="true" />
  if (s === "DISPONIVEL") return <Circle className={`${cls} text-blue-700`} aria-hidden="true" />
  return <CircleDashed className={`${cls} text-slate-400`} aria-hidden="true" />
}

export function EtapaShell({
  licitacaoId,
  tela,
  titulo,
  subtitulo,
  acoes,
  atualizacao,
  children,
}: {
  licitacaoId: string
  tela: TelaEtapa
  titulo: string
  subtitulo?: React.ReactNode
  acoes?: React.ReactNode
  /** Muda quando a tela grava algo: recarrega a situação das etapas. */
  atualizacao?: unknown
  children: React.ReactNode
}) {
  const [lic, setLic] = useState<LicitacaoCabecalho | null>(null)
  const [situacoes, setSituacoes] = useState<Record<string, string>>({})

  useEffect(() => {
    authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
      .then(async (r) => (r.ok ? setLic(await r.json()) : null))
      .catch(() => null)
  }, [licitacaoId])

  const carregarEtapas = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/etapas`)
      if (!r.ok) return
      const j = (await r.json()) as EtapasResposta
      const mapa: Record<string, string> = {}
      for (const e of j.etapas || []) for (const p of e.passos || []) mapa[p.passo] = p.situacao
      setSituacoes(mapa)
      avisarTarefasAtualizadas()
    } catch {
      /* barra sem situação */
    }
  }, [licitacaoId])
  useEffect(() => {
    carregarEtapas()
  }, [carregarEtapas, atualizacao])

  return (
    <div className="max-w-7xl mx-auto px-0 sm:px-2 py-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href={`/orgao/processos/${licitacaoId}`} className="inline-flex items-center gap-1.5 text-sm text-blue-800 hover:underline">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar ao processo
        </Link>
        {lic?.numero_processo && (
          <span className="text-xs text-gray-600 truncate max-w-full">
            Processo {lic.numero_processo}
            {lic.objeto ? ` · ${lic.objeto.length > 90 ? `${lic.objeto.slice(0, 87)}…` : lic.objeto}` : ""}
          </span>
        )}
      </div>

      <nav aria-label="Etapas da fase interna" className="overflow-x-auto -mx-1 px-1">
        <ol className="flex items-center gap-1 min-w-max text-xs">
          {ETAPAS_DA_BARRA.filter((e) => !e.opcional || situacoes[e.passo] !== undefined || e.tela === tela).map((e, i, lista) => {
            const sit = situacoes[e.passo] ?? null
            const atual = e.tela === tela
            const conteudo = (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                  atual ? "border-blue-700 bg-blue-50 text-blue-900 font-semibold" : "border-slate-200 bg-white text-slate-700"
                }`}
                title={sit ? ROTULO_SIT[sit] ?? sit : "sem peça nesta etapa"}
              >
                <Icone s={sit} />
                <span className="font-mono text-[10px] text-slate-500">{e.numero}</span>
                {e.titulo}
              </span>
            )
            return (
              <li key={e.passo} className="flex items-center gap-1">
                {e.tela ? (
                  <Link href={rotaDaTela(licitacaoId, e.tela)} aria-current={atual ? "page" : undefined}>
                    {conteudo}
                  </Link>
                ) : (
                  <Link href={`/orgao/processos/${licitacaoId}#fluxo-fase-interna`}>{conteudo}</Link>
                )}
                {i < lista.length - 1 && <ChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
      </nav>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">{titulo}</h1>
          {subtitulo && <div className="text-sm text-gray-600 mt-0.5">{subtitulo}</div>}
        </div>
        {acoes && <div className="flex items-center gap-2 flex-wrap">{acoes}</div>}
      </header>

      {children}
    </div>
  )
}
