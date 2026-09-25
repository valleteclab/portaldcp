import { RedirecionarSalaLegada } from '@/components/sala/RedirecionarSalaLegada'

// Compatibilidade (plano E8): a sala do fornecedor é /fornecedor/licitacoes/[id]/sessao.
export default function SalaV3LegadaFornecedor() {
  return <RedirecionarSalaLegada area="fornecedor" />
}
