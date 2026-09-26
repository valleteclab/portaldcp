"use client"

/**
 * PAINEL PARA TV — a URL que vai na TV (`/painel-tv/<token>`), sem login.
 * Lê `GET /api/painel-tv/<token>` (só leitura, só o órgão do token). Link
 * revogado ou inválido: a tela avisa e para de consultar.
 */
import { useCallback } from "react"
import { useParams } from "next/navigation"
import { API_URL } from "@/lib/api"
import { PainelTv, ResultadoCarga } from "@/components/painel-tv/PainelTv"

export default function PainelTvPage() {
  const params = useParams()
  const token = String(params?.token ?? "")

  const carregar = useCallback(
    async (signal: AbortSignal): Promise<ResultadoCarga> => {
      const r = await fetch(`${API_URL}/api/painel-tv/${encodeURIComponent(token)}`, { signal, cache: "no-store", credentials: "omit" })
      if (r.status === 404) {
        return { status: "fim", mensagem: "Este link de painel não existe ou foi revogado. Peça ao administrador do órgão um novo link (Configurações › Painel para TV)." }
      }
      if (r.status === 429) return { status: "adiado" }
      if (!r.ok) return { status: "erro" }
      return { status: "ok", dados: await r.json() }
    },
    [token],
  )

  return <PainelTv carregar={carregar} />
}
