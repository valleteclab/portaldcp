"use client"

/**
 * Dispensa eletrônica depois do julgamento (homologação 08/11/2026):
 *  - HABILITAÇÃO DO VENCEDOR (Lei 14.133/2021, art. 72, V; IN SEGES 67/2021,
 *    art. 17): a agente confere os documentos e registra habilitado ou
 *    inabilitado (motivo) — inabilitado sai e o próximo da classificação é
 *    chamado. A homologação só libera com todos os vencedores habilitados;
 *  - CONTRAPROPOSTA (IN 67, art. 16): valor menor proposto ao vencedor do
 *    item; ele aceita ou recusa na sala. Aceita, vira o valor adjudicado.
 * Fonte: /api/licitacoes/:id/dispensa/pos-julgamento | habilitacao | negociacao.
 */
import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface Item { item_id: string; numero: number; descricao: string; quantidade: number; valor_unitario: number; valor_total: number }
interface Negociacao { id: string; item_id: string; valor_unitario: number; valor_anterior: number; status: string; motivo_recusa: string | null; created_at: string }
interface Vencedor {
  fornecedor_id: string
  razao_social: string
  itens: Item[]
  habilitacao: { resultado: string; motivo: string | null; conferidos: string[]; registrado_por_nome: string | null; created_at: string } | null
  negociacoes: Negociacao[]
}
interface Painel { documentos: string[]; vencedores: Vencedor[]; todos_habilitados: boolean }

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const ROTULO_NEG: Record<string, string> = { PENDENTE: "aguardando o fornecedor", ACEITA: "aceita", RECUSADA: "recusada", CANCELADA: "substituída" }

async function erro(r: Response, padrao: string) {
  const e = await r.json().catch(() => ({}))
  return (Array.isArray(e?.message) ? e.message.join(" ") : e?.message) || padrao
}

export function PosJulgamentoDispensa({ licitacaoId, onAtualizado }: { licitacaoId: string; onAtualizado: () => void }) {
  const [p, setP] = useState<Painel | null>(null)
  const [marcados, setMarcados] = useState<Record<string, string[]>>({})
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  const [valor, setValor] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const r = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/pos-julgamento`, { cache: "no-store" }).catch(() => null)
    if (r?.ok) setP(await r.json())
  }, [licitacaoId])
  useEffect(() => { carregar() }, [carregar])

  const enviar = async (chave: string, url: string, corpo: unknown, ok: string) => {
    setOcupado(chave)
    try {
      const r = await authFetch(`${API_URL}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      if (!r.ok) return toast.error(await erro(r, "Não foi possível registrar"))
      toast.success(ok)
      setP(await r.json().catch(() => p))
      await carregar()
      onAtualizado()
    } finally {
      setOcupado(null)
    }
  }

  if (!p || !p.vencedores.length) return null

  return (
    <section aria-labelledby="titulo-habilitacao-dispensa" className="space-y-3 rounded-lg border border-gray-200 p-4">
      <div>
        <h3 id="titulo-habilitacao-dispensa" className="font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-800" aria-hidden="true" /> Habilitação do vencedor e negociação
        </h3>
        <p className="text-xs text-gray-600">
          Confira os documentos de habilitação de cada vencedor antes de homologar (Lei 14.133/2021, art. 72, V; IN SEGES 67/2021, art. 17).
          Inabilitado, a proposta sai e o próximo da classificação é chamado. A contraproposta vai ao vencedor, que aceita ou recusa na sala (IN 67, art. 16).
        </p>
      </div>

      {p.vencedores.map((v) => {
        const h = v.habilitacao
        const conf = marcados[v.fornecedor_id] ?? []
        return (
          <div key={v.fornecedor_id} className="rounded-md border border-gray-100 bg-gray-50 p-3 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium">{v.razao_social}</p>
                <p className="text-xs text-gray-600">
                  {v.itens.map((i) => `Item ${i.numero}: ${moeda(i.valor_unitario)} × ${i.quantidade} = ${moeda(i.valor_total)}`).join(" · ")}
                </p>
              </div>
              {h?.resultado === "HABILITADO" ? (
                <span className="inline-flex items-center gap-1 text-sm text-green-800"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Habilitado</span>
              ) : (
                <span className="text-sm text-amber-800">Habilitação pendente</span>
              )}
            </div>

            {h?.resultado === "HABILITADO" ? (
              <p className="text-xs text-gray-600">
                Conferido por {h.registrado_por_nome || "—"} em {new Date(h.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}: {h.conferidos.join("; ")}.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Documentos conferidos</p>
                <div className="grid sm:grid-cols-2 gap-1">
                  {p.documentos.map((d) => (
                    <label key={d} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={conf.includes(d)}
                        onChange={(e) => setMarcados((m) => ({ ...m, [v.fornecedor_id]: e.target.checked ? [...conf, d] : conf.filter((x) => x !== d) }))}
                      />
                      {d}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap items-start">
                  <Button
                    size="sm"
                    disabled={!conf.length || ocupado === `hab-${v.fornecedor_id}`}
                    onClick={() => enviar(`hab-${v.fornecedor_id}`, `/api/licitacoes/${licitacaoId}/dispensa/habilitacao`, { fornecedor_id: v.fornecedor_id, resultado: "HABILITADO", conferidos: conf }, `${v.razao_social} habilitado.`)}
                  >
                    {ocupado === `hab-${v.fornecedor_id}` ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" aria-hidden="true" />}
                    Habilitar
                  </Button>
                  <div className="flex-1 min-w-[16rem] space-y-1">
                    <Textarea
                      rows={2}
                      placeholder="Motivo da inabilitação (ex.: CND federal vencida em 01/11/2026)"
                      value={motivo[v.fornecedor_id] ?? ""}
                      onChange={(e) => setMotivo((m) => ({ ...m, [v.fornecedor_id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-700"
                      disabled={(motivo[v.fornecedor_id] ?? "").trim().length < 10 || ocupado === `inab-${v.fornecedor_id}`}
                      onClick={() => enviar(`inab-${v.fornecedor_id}`, `/api/licitacoes/${licitacaoId}/dispensa/habilitacao`, { fornecedor_id: v.fornecedor_id, resultado: "INABILITADO", motivo: motivo[v.fornecedor_id], conferidos: conf }, "Inabilitado: o próximo da classificação foi chamado.")}
                    >
                      <XCircle className="w-4 h-4 mr-1" aria-hidden="true" />Inabilitar e chamar o próximo
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {v.itens.map((i) => {
              const ultima = v.negociacoes.find((n) => n.item_id === i.item_id)
              return (
                <div key={i.item_id} className="flex items-end gap-2 flex-wrap border-t border-gray-200 pt-2">
                  <div>
                    <label htmlFor={`neg-${i.item_id}`} className="text-xs text-gray-600">Contraproposta — item {i.numero} (valor unitário)</label>
                    <Input id={`neg-${i.item_id}`} type="number" step="0.01" className="h-9 w-40" placeholder={String(i.valor_unitario)} value={valor[i.item_id] ?? ""} onChange={(e) => setValor((x) => ({ ...x, [i.item_id]: e.target.value }))} />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!(Number(valor[i.item_id]) > 0) || ocupado === `neg-${i.item_id}`}
                    onClick={() => enviar(`neg-${i.item_id}`, `/api/licitacoes/${licitacaoId}/dispensa/negociacao`, { item_id: i.item_id, valor_unitario: Number(valor[i.item_id]) }, "Contraproposta enviada ao vencedor.")}
                  >
                    Enviar contraproposta
                  </Button>
                  {ultima && (
                    <span className="text-xs text-gray-700">
                      Última: {moeda(ultima.valor_unitario)} — {ROTULO_NEG[ultima.status] ?? ultima.status}
                      {ultima.motivo_recusa ? ` (${ultima.motivo_recusa})` : ""}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {!p.todos_habilitados && <p className="text-xs text-amber-800">A homologação libera quando todos os vencedores estiverem habilitados.</p>}
    </section>
  )
}
