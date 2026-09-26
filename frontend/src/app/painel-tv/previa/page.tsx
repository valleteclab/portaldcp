"use client"

/**
 * PRÉ-VISUALIZAÇÃO DO PAINEL PARA TV — pelo login do administrador do órgão
 * (`GET /api/painel-tv-gestao/previa`), os mesmos dados que a TV recebe.
 * Aberta pelo botão "Abrir pré-visualização" de Configurações › Painel para TV.
 */
import { useCallback } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { PainelTv, ResultadoCarga } from "@/components/painel-tv/PainelTv"

export default function PreviaPainelTvPage() {
  const carregar = useCallback(async (signal: AbortSignal): Promise<ResultadoCarga> => {
    const r = await authFetch(`${API_URL}/api/painel-tv-gestao/previa`, { signal, cache: "no-store" })
    if (r.status === 401 || r.status === 403) {
      return { status: "fim", mensagem: "A pré-visualização é do administrador do órgão. Entre com a conta do órgão ou com um usuário administrador." }
    }
    if (!r.ok) return { status: "erro" }
    return { status: "ok", dados: await r.json() }
  }, [])

  return <PainelTv carregar={carregar} previa />
}
