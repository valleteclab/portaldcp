"use client"

/**
 * PAINEL DO GESTOR NA TV — `/painel-tv/<token>/andamento`, sem login.
 * Lê `GET /api/painel-tv/<token>/andamento` (só leitura, só o órgão do token).
 */
import { useCallback } from "react"
import { useParams } from "next/navigation"
import { API_URL } from "@/lib/api"
import { PainelTvAndamento, type ResultadoAndamento } from "@/components/painel-tv/PainelTvAndamento"

export default function PainelTvAndamentoPage() {
  const params = useParams()
  const token = String(params?.token ?? "")

  const carregar = useCallback(
    async (signal: AbortSignal): Promise<ResultadoAndamento> => {
      const r = await fetch(`${API_URL}/api/painel-tv/${encodeURIComponent(token)}/andamento`, { signal, cache: "no-store", credentials: "omit" })
      if (r.status === 404) {
        return { status: "fim", mensagem: "Este link de painel não existe ou foi revogado. Peça ao administrador do órgão um novo link (Configurações › Painel para TV)." }
      }
      if (r.status === 429) return { status: "adiado" }
      if (!r.ok) return { status: "erro" }
      return { status: "ok", dados: await r.json() }
    },
    [token],
  )

  return <PainelTvAndamento carregar={carregar} />
}
