import { redirect } from 'next/navigation'

// Compatibilidade (plano E8): a abertura da sessão (conferências + "abrir sessão
// pública") agora é o primeiro estado da sala única /orgao/processos/[id]/sessao.
export default async function IniciarSessaoLegada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/orgao/processos/${id}/sessao`)
}
