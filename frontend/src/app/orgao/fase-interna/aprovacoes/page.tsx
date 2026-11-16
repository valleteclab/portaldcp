import { redirect } from "next/navigation"

/**
 * Compatibilidade de URL: a aprovação é etapa do fluxo do processo (11/2026),
 * na aba "Etapas de processo" da Central de Aprovações.
 */
export default function Page() {
  redirect("/orgao/aprovacoes?tab=etapas")
}
