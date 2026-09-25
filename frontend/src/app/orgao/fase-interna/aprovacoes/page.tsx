import { redirect } from "next/navigation"

/**
 * Compatibilidade de URL (E8): a aprovação dos documentos da fase interna é
 * pelo fluxo por etapa (Configurações › Fluxos de aprovação), na caixa da
 * Central de Aprovações — a antiga aprovação "por documento" foi removida.
 */
export default function Page() {
  redirect("/orgao/aprovacoes?tab=documentos")
}
