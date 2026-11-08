"use client"

/**
 * Os fluxos de aprovação das peças saíram em 11/2026 — "um motor só": a
 * aprovação passou a ser uma etapa de Aprovação no fluxo do processo
 * (Configurações › Fluxos de processo). Este endereço fica só para links e
 * favoritos antigos.
 */
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function FluxosAprovacaoRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/orgao/configuracoes/fluxos")
  }, [router])
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-gray-600">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> A aprovação agora é uma etapa do fluxo do processo. Abrindo os fluxos…
    </div>
  )
}
