import { redirect } from "next/navigation"

/** Compatibilidade de URL: a fase interna fica na tela do processo (Entrega 3A). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/orgao/processos/${id}#fluxo-fase-interna`)
}
