import { redirect } from 'next/navigation'

// Compatibilidade (plano E8): a sala única do fornecedor é /fornecedor/licitacoes/[id]/sessao.
export default async function SalaLegadaFornecedor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/fornecedor/licitacoes/${id}/sessao`)
}
