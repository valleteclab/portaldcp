import { redirect } from 'next/navigation'

// Compatibilidade (plano E8): a janela de lances da dispensa agora é a sala única
// do fornecedor, /fornecedor/licitacoes/[id]/sessao.
export default async function LancesDispensaLegado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/fornecedor/licitacoes/${id}/sessao`)
}
