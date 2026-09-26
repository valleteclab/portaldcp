"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"

interface ModoQuadro {
  aplica: boolean
  com_lances: boolean
  congelado: boolean
  fonte: "ESCOLHA" | "SUGERIDO" | "PROCESSO" | "LEGADO" | "NAO_SE_APLICA"
  referencia: string
  rotulo: string
  descricao: string
  editavel: boolean
  opcoes: Array<{ com_lances: boolean; rotulo: string; explicacao: string }>
  padrao_do_orgao: boolean
  escolhido_por: { nome: string | null; em: string } | null
}

const fmt = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

/**
 * DISPUTA DA DISPENSA — escolha do agente no processo (fase interna, Entrega
 * 5): "Com disputa de lances (sessão de lances em tempo real)" ou "Sem disputa
 * de lances (só recebimento de propostas no prazo do aviso)". Na fase interna
 * grava na hora (PUT /api/fase-interna/:id/modo-disputa, com quem escolheu no
 * histórico); publicado, mostra a escolha congelada. Sem escolha, vem marcado
 * o padrão sugerido do órgão. Usado em "Editar processo › Classificação" e no
 * quadro do aviso da conformidade.
 */
export function EscolhaDisputaDispensa({ licitacaoId, onAlterado, compacto = false }: { licitacaoId: string; onAlterado?: () => void; compacto?: boolean }) {
  const [modo, setModo] = useState<ModoQuadro | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/publicacao`)
      if (!r.ok) return
      const q = await r.json()
      setModo(q.modo_disputa ?? null)
    } catch {
      /* sem o quadro, o campo não aparece */
    }
  }, [licitacaoId])
  useEffect(() => {
    carregar()
  }, [carregar])

  const escolher = async (comLances: boolean) => {
    if (!modo || !modo.editavel || salvando) return
    if (modo.com_lances === comLances && modo.fonte === "ESCOLHA") return
    setSalvando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/modo-disputa`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ com_lances: comLances }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      setModo(j?.modo_disputa ?? null)
      toast.success(comLances ? "Dispensa com disputa de lances." : "Dispensa sem disputa de lances (só propostas no prazo do aviso).")
      onAlterado?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (!modo?.aplica) return null
  return (
    <fieldset className="space-y-2" disabled={!modo.editavel || salvando} aria-describedby={`disputa-${licitacaoId}-nota`}>
      <legend className={`font-semibold text-gray-900 ${compacto ? "text-sm" : "text-sm mb-1"}`}>
        Disputa da dispensa {salvando && <Loader2 className="inline w-3 h-3 animate-spin ml-1" aria-hidden="true" />}
      </legend>
      {modo.opcoes.map((o) => (
        <label key={String(o.com_lances)} className={`flex gap-2 items-start text-sm ${modo.editavel ? "cursor-pointer" : ""}`}>
          <input
            type="radio"
            name={`disputa-${licitacaoId}`}
            className="mt-1"
            checked={modo.com_lances === o.com_lances}
            onChange={() => escolher(o.com_lances)}
          />
          <span>
            <b>{o.rotulo}</b>
            {!compacto && <span className="block text-xs text-gray-600">{o.explicacao}</span>}
          </span>
        </label>
      ))}
      <p id={`disputa-${licitacaoId}-nota`} className="text-xs text-gray-600">
        Base: {modo.referencia}.{" "}
        {modo.congelado
          ? "Escolha congelada na publicação — não muda depois de publicar."
          : modo.fonte === "SUGERIDO"
            ? `Padrão sugerido pelo órgão (${modo.padrao_do_orgao ? "com" : "sem"} lances) — escolha para este processo; fica gravada ao publicar.`
            : `Escolhida${modo.escolhido_por ? ` por ${modo.escolhido_por.nome ?? "usuário do órgão"} em ${fmt(modo.escolhido_por.em)}` : ""}; pode mudar até a publicação.`}
      </p>
    </fieldset>
  )
}
