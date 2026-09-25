import { redirect } from "next/navigation"

/** Compatibilidade de URL (E8): a fase interna tem uma só tela — o dossiê do módulo. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/orgao/fase-interna/processos/${id}`)
}
