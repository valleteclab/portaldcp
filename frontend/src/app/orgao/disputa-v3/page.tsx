import { RedirecionarSalaLegada } from '@/components/sala/RedirecionarSalaLegada'

// Compatibilidade (plano E8): a sala do pregoeiro é /orgao/processos/[id]/sessao.
export default function SalaV3LegadaOrgao() {
  return <RedirecionarSalaLegada area="orgao" />
}
