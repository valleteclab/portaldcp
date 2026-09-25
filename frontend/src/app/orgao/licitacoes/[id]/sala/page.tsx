import { redirect } from 'next/navigation'

// Compatibilidade (plano E8): a sala única do órgão é /orgao/processos/[id]/sessao.
export default async function SalaLegadaOrgao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/orgao/processos/${id}/sessao`)
}
