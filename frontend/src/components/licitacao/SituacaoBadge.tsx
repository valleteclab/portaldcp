import { Badge } from "@/components/ui/badge"
import { COR_SITUACAO, ROTULO_SITUACAO, situacaoDaLicitacao } from "@/lib/licitacao-situacao"

/**
 * Selo da SITUAÇÃO da licitação (E1). Por padrão não mostra nada quando a
 * licitação está ATIVA (a fase já diz tudo); `mostrarAtiva` força o selo.
 */
export function SituacaoBadge({
  licitacao,
  mostrarAtiva = false,
  className = "",
}: {
  licitacao: { situacao?: string | null; fase?: string | null } | null | undefined
  mostrarAtiva?: boolean
  className?: string
}) {
  const situacao = situacaoDaLicitacao(licitacao)
  if (situacao === "ATIVA" && !mostrarAtiva) return null
  return (
    <Badge className={`${COR_SITUACAO[situacao]} ${className}`} title="Situação do processo">
      {ROTULO_SITUACAO[situacao]}
    </Badge>
  )
}
