"use client"

/**
 * ASSISTENTE DO ETP (Entrega 3A; SPEC §6; mockup ETP.dc.html). Usa a IA que
 * o PortalDCP já tem (POST /api/fase-interna/:id/etp/assistente → IaService):
 *  - rascunho da seção a partir do DFD e dos itens;
 *  - indicação de marca (art. 41, I): reescrever pela função ou justificar;
 *  - coerência entre seções (necessidade × solução × TR);
 *  - incisos obrigatórios (§2º: I, IV, VI, VIII e XIII) vazios.
 * A sugestão NUNCA entra sem clique: "Aplicar na seção" grava o texto como
 * editado pelo usuário (origem IA_ACEITA, com o nome dele no histórico).
 */
import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Sparkles, X } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { erroDaApi } from "@/lib/fase-interna/telas"

export interface AnaliseEtp {
  incisos: Array<{ inciso: string; secao_id: string; titulo: string; obrigatorio: boolean; preenchido: boolean }>
  obrigatorios_vazios: Array<{ inciso: string; secao_id: string; titulo: string }>
  marca: Array<{ secao_id: string; trecho: string; marca: string; como_referencia: boolean; severidade: "BLOQUEIO" | "ATENCAO" | "JUSTIFICADO"; mensagem: string }>
  coerencia: Array<{ termo: string; ausente_em: string[]; mensagem: string }>
  riscos: { total: number; altos: number; peca: { status: string } | null }
  justificativa_marca: string | null
}

const COR_MARCA: Record<string, string> = {
  BLOQUEIO: "border-red-200 bg-red-50 text-red-900",
  ATENCAO: "border-amber-200 bg-amber-50 text-amber-950",
  JUSTIFICADO: "border-slate-200 bg-slate-50 text-slate-800",
}

function irParaSecao(secaoId: string) {
  document.getElementById(`secao-${secaoId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

const textoDe = (html: string) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

/** Parágrafos de texto de um HTML simples (p, li, br). */
const paragrafos = (html: string) =>
  String(html || "")
    .replace(/<\/(p|li|h[1-6])>|<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean)

export function AssistenteEtp({
  licitacaoId,
  analise,
  secoes,
  modelo,
  somenteLeitura,
  onAplicar,
  onJustificativaSalva,
}: {
  licitacaoId: string
  analise: AnaliseEtp | null
  secoes: Record<string, string>
  modelo: Array<{ id: string; titulo: string }>
  somenteLeitura: boolean
  /** Aplica a sugestão na seção (clique do usuário). */
  onAplicar: (secaoId: string, html: string) => void
  onJustificativaSalva: () => void
}) {
  const [secaoPedido, setSecaoPedido] = useState<string>("necessidade")
  const [pedindo, setPedindo] = useState<string | null>(null)
  const [sugestao, setSugestao] = useState<{ secaoId: string; html: string; substitui?: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [justificando, setJustificando] = useState(false)
  const [justificativa, setJustificativa] = useState("")

  const pedir = async (corpo: Record<string, unknown>, secaoId: string, substitui?: string) => {
    setPedindo(String(corpo.acao))
    setAviso(null)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/etp/assistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      const j = await r.json()
      if (!j.disponivel) {
        setAviso(j.mensagem || "Assistente de IA indisponível agora.")
        return
      }
      setSugestao({ secaoId, html: j.sugestao_html, substitui })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setPedindo(null)
    }
  }

  const aplicar = () => {
    if (!sugestao) return
    const atual = secoes[sugestao.secaoId] || ""
    let html = sugestao.html
    if (sugestao.substitui) {
      // Reescrita de um trecho: troca a frase no texto da seção (se o trecho não
      // for achado literalmente, acrescenta o texto novo — o usuário apaga o antigo)
      const novoTexto = textoDe(sugestao.html)
      html = atual.includes(sugestao.substitui) ? atual.replace(sugestao.substitui, novoTexto) : `${atual}${sugestao.html}`
    }
    onAplicar(sugestao.secaoId, html)
    setSugestao(null)
    toast.success("Sugestão aplicada — o texto fica registrado como editado por você.")
  }

  const salvarJustificativa = async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/etp/marca`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      setJustificando(false)
      toast.success("Justificativa do art. 41, I registrada no ETP")
      onJustificativaSalva()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const tituloSecao = (id: string) => modelo.find((m) => m.id === id)?.titulo.replace(/\s*\*$/, "") ?? id

  return (
    <div className="p-3 space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-800" aria-hidden="true" />
        <h2 className="font-semibold text-gray-900">Assistente do ETP</h2>
      </div>

      {/* Incisos do art. 18, §1º */}
      <section aria-label="Incisos do art. 18, §1º">
        <h3 className="text-xs font-semibold uppercase text-gray-600 mb-1">Art. 18, §1º · obrigatórios pelo §2º</h3>
        <ul className="space-y-0.5">
          {(analise?.incisos || []).map((i) => (
            <li key={i.inciso}>
              <button type="button" onClick={() => irParaSecao(i.secao_id)} className="w-full flex items-center gap-2 text-left rounded px-1 py-0.5 hover:bg-slate-50">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${i.preenchido ? "bg-blue-800" : i.obrigatorio ? "bg-orange-600" : "bg-slate-300"}`}
                  aria-hidden="true"
                />
                <span className="font-mono text-[11px] w-10 shrink-0">{i.inciso}{i.obrigatorio ? "*" : ""}</span>
                <span className="text-xs text-gray-800 truncate">{i.titulo}</span>
              </button>
            </li>
          ))}
          <li>
            <Link href={`/orgao/fase-interna/processos/${licitacaoId}/riscos`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${analise?.riscos.total ? "bg-blue-800" : "bg-slate-300"}`} aria-hidden="true" />
              <span className="font-mono text-[11px] w-10 shrink-0">—</span>
              Análise de riscos ({analise?.riscos.total ?? 0}{analise?.riscos.altos ? `, ${analise.riscos.altos} alto(s)` : ""})
            </Link>
          </li>
        </ul>
      </section>

      {/* Marca */}
      {(analise?.marca || []).map((m, idx) => (
        <section key={`${m.secao_id}-${m.marca}-${idx}`} className={`rounded-md border p-2.5 space-y-1.5 ${COR_MARCA[m.severidade]}`} aria-label="Indicação de marca">
          <p className="font-semibold text-xs flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            Indicação de marca · {tituloSecao(m.secao_id)} {m.severidade === "BLOQUEIO" ? "(bloqueio)" : m.severidade === "ATENCAO" ? "(atenção)" : "(justificada)"}
          </p>
          <p className="text-xs italic">&ldquo;{m.trecho}&rdquo;</p>
          <p className="text-xs">{m.mensagem}</p>
          {!somenteLeitura && m.severidade !== "JUSTIFICADO" && (
            <div className="flex gap-1 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs bg-white"
                disabled={!!pedindo}
                onClick={() => pedir({ acao: "REESCREVER_MARCA", trecho: m.trecho }, m.secao_id, m.trecho)}
              >
                {pedindo === "REESCREVER_MARCA" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Reescrever por função
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs bg-white"
                onClick={() => {
                  setJustificativa(analise?.justificativa_marca || "")
                  setJustificando(true)
                }}
              >
                Inserir justificativa
              </Button>
            </div>
          )}
        </section>
      ))}
      {justificando && (
        <section className="rounded-md border p-2.5 space-y-1.5 bg-white">
          <Label htmlFor="just-marca" className="text-xs">Justificativa da indicação de marca (art. 41, I)</Label>
          <Textarea
            id="just-marca"
            rows={4}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Padronização, compatibilidade com o que já existe, ser a única que atende ou uso apenas como referência (com 'ou similar/equivalente')…"
          />
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setJustificando(false)}>Cancelar</Button>
            <Button size="sm" className="h-7 text-xs" onClick={salvarJustificativa} disabled={justificativa.trim().length < 20}>Registrar</Button>
          </div>
        </section>
      )}

      {/* Coerência */}
      {(analise?.coerencia || []).length > 0 && (
        <section className="rounded-md border p-2.5 space-y-1 bg-slate-50" aria-label="Coerência entre seções">
          <p className="font-semibold text-xs flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" /> Coerência entre seções
          </p>
          <ul className="text-xs space-y-0.5 list-disc ml-4">
            {analise!.coerencia.map((c) => (
              <li key={c.termo}>{c.mensagem}</li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-600">Cada requisito da necessidade precisa aparecer na solução e no TR.</p>
        </section>
      )}

      {/* Obrigatórios vazios */}
      {(analise?.obrigatorios_vazios || []).length > 0 ? (
        <section className="rounded-md border border-orange-200 bg-orange-50 p-2.5 space-y-1" aria-label="Incisos obrigatórios vazios">
          <p className="font-semibold text-xs text-orange-950">Incisos obrigatórios pendentes</p>
          <ul className="text-xs space-y-0.5">
            {analise!.obrigatorios_vazios.map((i) => (
              <li key={i.inciso}>
                <button type="button" className="text-left hover:underline" onClick={() => { irParaSecao(i.secao_id); setSecaoPedido(i.secao_id) }}>
                  Inciso {i.inciso} — {i.titulo}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        analise && (
          <p className="text-xs text-green-800 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Incisos obrigatórios preenchidos
          </p>
        )
      )}

      {/* Pedir ao assistente */}
      {!somenteLeitura && (
        <section className="space-y-1.5 border-t pt-3" aria-label="Pedir ao assistente">
          <Label htmlFor="secao-pedido" className="text-xs">Rascunho de uma seção (a partir do DFD e dos itens)</Label>
          <select
            id="secao-pedido"
            className="w-full h-8 rounded-md border px-2 text-xs bg-white"
            value={secaoPedido}
            onChange={(e) => setSecaoPedido(e.target.value)}
          >
            {modelo.map((m) => (
              <option key={m.id} value={m.id}>{m.titulo.replace(/\s*\*$/, "")}</option>
            ))}
          </select>
          <Button size="sm" className="w-full h-8 text-xs" disabled={!!pedindo} onClick={() => pedir({ acao: "RASCUNHO", secao_id: secaoPedido }, secaoPedido)}>
            {pedindo === "RASCUNHO" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Pedir ao assistente
          </Button>
        </section>
      )}
      {aviso && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2" role="status">{aviso}</p>}
      {sugestao && (
        <section className="rounded-md border border-blue-200 bg-blue-50 p-2.5 space-y-2" aria-label="Sugestão do assistente">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-xs text-blue-950">Sugestão para: {tituloSecao(sugestao.secaoId)}</p>
            <button type="button" aria-label="Descartar sugestão" onClick={() => setSugestao(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Mostrada como TEXTO (nunca HTML cru da IA na tela) */}
          <div className="text-xs bg-white rounded border p-2 max-h-60 overflow-y-auto space-y-1.5">
            {paragrafos(sugestao.html).map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
          <p className="text-[11px] text-blue-950">Nada foi alterado. Ao aplicar, o texto fica registrado como editado por você — revise antes.</p>
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSugestao(null)}>Descartar</Button>
            <Button size="sm" className="h-7 text-xs" onClick={aplicar}>{sugestao.substitui ? "Substituir o trecho" : "Aplicar na seção"}</Button>
          </div>
        </section>
      )}
    </div>
  )
}
