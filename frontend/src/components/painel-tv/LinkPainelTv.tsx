"use client"

/**
 * Atalho "Painel para TV" (o testador da homologação não achou o link, que só
 * existia em Configurações › Painel para TV). O administrador vai direto à aba
 * onde gera o link da TV; os demais veem quem gera.
 */
import { useSyncExternalStore } from "react"
import Link from "next/link"
import { Tv } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

const ROTA = "/orgao/configuracoes?tab=painel-tv"
const semAssinatura = () => () => undefined
function ehAdminLocal(): boolean {
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null")
    return !u || u.role === "ADMIN"
  } catch {
    return false
  }
}
const EXPLICACAO = "Link para a TV do setor de licitação (sem login): processos em andamento, prazos e sessões do dia."

export function LinkPainelTv({ className }: { className?: string }) {
  // login do órgão (sem usuário) ou usuário ADMIN: gera o link (no servidor: nada)
  const admin = useSyncExternalStore(semAssinatura, ehAdminLocal, () => null)
  if (admin === null) return null
  if (admin) {
    return (
      <Button asChild variant="outline" size="sm" className={className} title={EXPLICACAO}>
        <Link href={ROTA}>
          <Tv className="w-4 h-4 mr-1.5" aria-hidden="true" /> Painel para TV
        </Link>
      </Button>
    )
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      title={EXPLICACAO}
      onClick={() => toast.info("O link da TV é gerado pelo administrador do órgão em Configurações › Painel para TV. Peça a ele o endereço para abrir na TV.")}
    >
      <Tv className="w-4 h-4 mr-1.5" aria-hidden="true" /> Painel para TV
    </Button>
  )
}
