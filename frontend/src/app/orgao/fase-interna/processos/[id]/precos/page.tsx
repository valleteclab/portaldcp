import { redirect } from "next/navigation"

/**
 * Compatibilidade (Entrega 3A): a pesquisa de preços tem UMA tela, dentro do
 * processo — /orgao/processos/[id]/fase-interna/pesquisa (o módulo detalhado
 * que ficava aqui virou componente dela). Mantém ?assistente=1.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const qs = sp?.assistente ? "?assistente=1" : ""
  redirect(`/orgao/processos/${id}/fase-interna/pesquisa${qs}`)
}
