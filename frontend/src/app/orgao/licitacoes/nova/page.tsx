import { redirect } from "next/navigation"

/**
 * Compatibilidade de URL (E8): a criação de processo tem um caminho só — o
 * assistente da fase interna ("Novo processo"), que aceita ?modalidade= como
 * pré-seleção. Credenciamento tem cadastro próprio (hipótese, regra, vigência).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const modalidade = typeof sp.modalidade === "string" ? sp.modalidade : ""
  if (modalidade === "CREDENCIAMENTO") redirect("/orgao/credenciamentos")
  redirect(
    modalidade
      ? `/orgao/fase-interna/processos/novo?modalidade=${encodeURIComponent(modalidade)}`
      : "/orgao/fase-interna/processos/novo",
  )
}
