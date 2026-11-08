"use client"

/**
 * O construtor de fluxo antigo (desenho da fase interna) saiu em 11/2026 —
 * "um motor só". Os fluxos agora são desenhados em Configurações › Fluxos de
 * processo. Este endereço continua existindo só para links e favoritos antigos.
 */
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function FluxoAntigoRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/orgao/configuracoes/fluxos")
  }, [router])
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-gray-600">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Abrindo os fluxos de processo…
    </div>
  )
}
