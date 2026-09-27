"use client"

/**
 * RASCUNHO DA IA NA ETAPA (F4a — "sempre com IA para fazer e humano revisar").
 * Faixa comum às telas das etapas (DFD, ETP, TR, autorização, parecer,
 * controle interno), no padrão visual do AssistenteEtp:
 *  - "Rascunho gerado pela IA em <data> — revise antes de emitir", com a
 *    prévia das seções (como TEXTO — nunca HTML cru da IA na tela);
 *  - Aceitar como base (só entra nas seções vazias — o texto que alguém já
 *    escreveu fica), Descartar e Gerar de novo;
 *  - sem rascunho: "Gerar com IA"; falhou: o motivo e "Gerar com IA";
 *  - aceito: nota discreta de quem aceitou e, emitida a peça, de quem revisou.
 * API: GET/POST /api/fase-interna/:id/rascunho-ia{,/gerar,/:rid/aceitar,/:rid/descartar}.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles, X } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { fmtBrasilia } from "@/lib/publicacao"
import { erroDaApi } from "@/lib/fase-interna/telas"

export type PecaRascunhoIa = "DFD" | "ETP" | "TR" | "AA" | "PJ" | "MCI" | "REGISTRO" | "TRAMITACAO"

export interface SecaoRascunhoIa {
  id: string
  titulo: string
  texto: string
  ja_preenchida_na_peca: boolean | null
}

export interface RascunhoIa {
  id: string
  status: "GERANDO" | "GERADO" | "FALHOU" | "ACEITO"
  origem_rascunho: string
  disparo: "AUTOMATICO" | "MANUAL"
  modelo_ia: string | null
  gerado_em: string | null
  gerado_por_nome: string | null
  erro: string | null
  secoes: SecaoRascunhoIa[]
  conclusao_sugerida: string | null
  decidido_por_nome: string | null
  decidido_em: string | null
  secoes_aplicadas: string[] | null
  revisado_por_nome: string | null
  revisado_em: string | null
}

export interface TelaRascunhoIa {
  peca: PecaRascunhoIa
  etapa: string | null
  titulo: string
  aviso: string
  ia_disponivel: boolean
  motivo_indisponivel: string | null
  fase_interna: boolean
  rascunho: RascunhoIa | null
}

export interface AceiteRascunhoIa {
  aplicadas: string[]
  mantidas: string[]
  documento_id: string | null
  campos: Record<string, string | null> | null
}

const ROTULO_CONCLUSAO: Record<string, string> = {
  FAVORAVEL: "favorável",
  FAVORAVEL_COM_RESSALVAS: "favorável com ressalvas",
  DESFAVORAVEL: "desfavorável",
  COM_APONTAMENTOS: "com apontamentos",
}

/** Parágrafos de texto de um HTML simples (p, li, br) — a sugestão é mostrada como texto. */
export const paragrafosDoRascunho = (html: string) =>
  String(html || "")
    .replace(/<\/(p|li|h[1-6])>|<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)

/** GET do rascunho vigente (hook para quem só quer ler — ex.: preencher um formulário). */
export async function carregarRascunhoIa(licitacaoId: string, peca: PecaRascunhoIa, etapa?: string | null): Promise<TelaRascunhoIa | null> {
  const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/rascunho-ia?peca=${peca}${etapa ? `&etapa=${encodeURIComponent(etapa)}` : ""}`, { cache: "no-store" }).catch(() => null)
  if (!r || !r.ok) return null
  return (await r.json()) as TelaRascunhoIa
}

export function RascunhoIaFaixa({
  licitacaoId,
  peca,
  etapa,
  somenteLeitura,
  atualizacao,
  rotuloAceitar = "Aceitar como base",
  explicacaoAceite,
  onAceito,
}: {
  licitacaoId: string
  peca: PecaRascunhoIa
  etapa?: string | null
  somenteLeitura?: boolean
  /** Muda quando a tela grava algo (recarrega). */
  atualizacao?: unknown
  rotuloAceitar?: string
  /** O que o aceite faz nesta tela (ex.: "gera o despacho com este texto"). */
  explicacaoAceite?: string
  onAceito?: (aceite: AceiteRascunhoIa) => void
}) {
  const [d, setD] = useState<TelaRascunhoIa | null>(null)
  const [ocupado, setOcupado] = useState<"gerar" | "aceitar" | "descartar" | null>(null)
  const [aberto, setAberto] = useState(true)
  const tentativas = useRef(0)

  const carregar = useCallback(async () => {
    const j = await carregarRascunhoIa(licitacaoId, peca, etapa)
    if (j) setD(j)
  }, [licitacaoId, peca, etapa])

  useEffect(() => {
    tentativas.current = 0
    carregar()
  }, [carregar, atualizacao])

  // Rascunho em preparo (ao chegar à etapa): consulta de novo por alguns minutos
  useEffect(() => {
    if (d?.rascunho?.status !== "GERANDO" || tentativas.current > 45) return
    const t = setTimeout(() => {
      tentativas.current += 1
      carregar()
    }, 4000)
    return () => clearTimeout(t)
  }, [d, carregar])

  const post = async (url: string, corpo: Record<string, unknown>, tipo: "gerar" | "aceitar" | "descartar") => {
    setOcupado(tipo)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/rascunho-ia${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json()
      setD(j)
      return j
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setOcupado(null)
    }
  }

  const gerar = async () => {
    const j = await post("/gerar", { peca, etapa: etapa ?? undefined }, "gerar")
    if (j?.rascunho?.status === "GERADO") {
      setAberto(true)
      toast.success("Rascunho gerado pela IA — revise antes de aceitar.")
    } else if (j?.rascunho?.status === "FALHOU") toast.error("A IA não conseguiu preparar o rascunho agora.")
  }
  const aceitar = async () => {
    if (!d?.rascunho) return
    const j = await post(`/${d.rascunho.id}/aceitar`, {}, "aceitar")
    if (!j) return
    const aceite = j.aceite as AceiteRascunhoIa
    if (["DFD", "ETP", "TR", "PJ"].includes(peca)) {
      toast.success(
        aceite.aplicadas.length
          ? `Rascunho aceito: ${aceite.aplicadas.length} ${aceite.aplicadas.length === 1 ? "seção preenchida" : "seções preenchidas"}${aceite.mantidas.length ? `; ${aceite.mantidas.length} com texto já escrito ${aceite.mantidas.length === 1 ? "foi mantida" : "foram mantidas"}` : ""}. Revise antes de emitir.`
          : "Nenhuma seção estava vazia — nada foi alterado na peça.",
      )
    } else if (peca === "AA") toast.success("Despacho gerado com o texto revisado. Ele só vale depois de assinado pela autoridade.")
    else toast.success("Texto da IA levado para o formulário — revise antes de concluir.")
    onAceito?.(aceite)
  }
  const descartar = async () => {
    if (!d?.rascunho) return
    const j = await post(`/${d.rascunho.id}/descartar`, {}, "descartar")
    if (j) toast.success("Rascunho da IA descartado.")
  }

  if (!d) return null
  const r = d.rascunho
  const podeAgir = !somenteLeitura && (d.fase_interna || peca === "TRAMITACAO")

  // Sem rascunho: oferece gerar (ou explica por que a IA não está disponível)
  if (!r) {
    if (!podeAgir) return null
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-950">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-800" aria-hidden="true" />
          {d.ia_disponivel ? "A IA pode preparar um rascunho desta peça para você revisar." : d.motivo_indisponivel || "IA indisponível."}
        </span>
        {d.ia_disponivel && (
          <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={gerar} disabled={!!ocupado}>
            {ocupado === "gerar" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Gerar com IA
          </Button>
        )}
      </div>
    )
  }

  if (r.status === "GERANDO") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-blue-950" role="status">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> A IA está preparando o rascunho desta peça…
      </div>
    )
  }

  if (r.status === "FALHOU") {
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
        <span>A IA não conseguiu preparar o rascunho{r.erro ? ` (${r.erro})` : ""}. Você pode tentar de novo ou fazer a peça normalmente.</span>
        {podeAgir && d.ia_disponivel && (
          <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={gerar} disabled={!!ocupado}>
            {ocupado === "gerar" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Gerar com IA
          </Button>
        )}
      </div>
    )
  }

  if (r.status === "ACEITO") {
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-700" role="status">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-700" aria-hidden="true" />
          {r.revisado_por_nome
            ? `Texto inicial preparado pela IA${r.modelo_ia ? ` (${r.modelo_ia})` : ""} — revisado por ${r.revisado_por_nome} em ${fmtBrasilia(r.revisado_em)}.`
            : `Rascunho da IA aceito como base por ${r.decidido_por_nome ?? "—"} em ${fmtBrasilia(r.decidido_em)} — revise antes de emitir.`}
        </span>
        {podeAgir && d.ia_disponivel && !r.revisado_por_nome && (
          <button type="button" className="text-blue-800 hover:underline inline-flex items-center gap-1" onClick={gerar} disabled={!!ocupado}>
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Gerar de novo
          </button>
        )}
      </div>
    )
  }

  // GERADO: a faixa de revisão
  return (
    <section className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2 text-sm" aria-label="Rascunho gerado pela IA">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-blue-950 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-800 shrink-0" aria-hidden="true" />
            Rascunho gerado pela IA em {fmtBrasilia(r.gerado_em)} — revise antes de emitir
          </p>
          <p className="text-[11px] text-blue-900 mt-0.5">
            {r.disparo === "AUTOMATICO" ? "Preparado quando o processo chegou a esta etapa" : `Pedido por ${r.gerado_por_nome ?? "—"}`}
            {r.modelo_ia ? ` · modelo ${r.modelo_ia}` : ""}
          </p>
        </div>
        <button type="button" className="text-blue-900 shrink-0" aria-label={aberto ? "Recolher o rascunho" : "Mostrar o rascunho"} onClick={() => setAberto((v) => !v)}>
          {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-blue-950">{d.aviso}</p>
      {r.conclusao_sugerida && (
        <p className="text-xs text-blue-950">
          Conclusão sugerida pela IA: <b>{ROTULO_CONCLUSAO[r.conclusao_sugerida] ?? r.conclusao_sugerida}</b> — a decisão é sua; ela não é preenchida sozinha.
        </p>
      )}
      {aberto && (
        <div className="space-y-2 max-h-96 overflow-y-auto rounded border bg-white p-2">
          {r.secoes.map((s) => (
            <div key={s.id} className="space-y-1">
              <p className="text-xs font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                {s.titulo}
                {s.ja_preenchida_na_peca && (
                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-normal text-slate-700">
                    já escrita na peça — será mantida
                  </span>
                )}
              </p>
              {paragrafosDoRascunho(s.texto).map((t, i) => (
                <p key={i} className="text-xs text-gray-800">{t}</p>
              ))}
            </div>
          ))}
        </div>
      )}
      {explicacaoAceite && <p className="text-[11px] text-blue-950">{explicacaoAceite}</p>}
      {podeAgir && (
        <div className="flex gap-1.5 justify-end flex-wrap">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={descartar} disabled={!!ocupado}>
            {ocupado === "descartar" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />} Descartar
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs bg-white" onClick={gerar} disabled={!!ocupado || !d.ia_disponivel} title={d.ia_disponivel ? "Pede um rascunho novo à IA (este é substituído)" : d.motivo_indisponivel ?? ""}>
            {ocupado === "gerar" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Gerar de novo
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={aceitar} disabled={!!ocupado}>
            {ocupado === "aceitar" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />} {rotuloAceitar}
          </Button>
        </div>
      )}
    </section>
  )
}
