import { redirect } from "next/navigation"

/**
 * Compatibilidade de URL (E8): a casa única da licitação é o cockpit do
 * processo (/orgao/processos/[id]) — o antigo detalhe foi desmontado.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/orgao/processos/${id}`)
}
