import { redirect } from "next/navigation"

/**
 * Compatibilidade (Entrega 3A — "um processo, uma tela"): o antigo cockpit da
 * fase interna deu lugar à tela do processo (/orgao/processos/[id]), com o
 * quadro "Fluxo da fase interna", as peças e a aba "Tramitação"; cada etapa
 * abre a sua tela (/orgao/processos/[id]/fase-interna/{dfd,etp,tr,pesquisa,reserva}).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/orgao/processos/${id}#fluxo-fase-interna`)
}
