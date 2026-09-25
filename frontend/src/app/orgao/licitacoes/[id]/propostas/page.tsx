import { redirect } from "next/navigation"

/** Compatibilidade de URL (E9): a página vive como sub-rota do processo. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/orgao/processos/${id}/propostas`)
}
