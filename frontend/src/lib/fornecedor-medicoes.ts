import { API_URL, authFetch } from '@/lib/api'

export interface FornecedorContratoBase {
  id: string
  numero_contrato: string
  ano?: number
  status: string
  categoria?: string
  objeto: string
  valor_global: number
  data_vigencia_inicio?: string
  data_vigencia_fim: string
  orgao?: {
    id: string
    nome: string
    cidade?: string
    uf?: string
  }
}

export interface FornecedorMedicao {
  id: string
  numero_medicao: number
  periodo_inicio: string
  periodo_fim: string
  valor_medido: number
  status: string
  motivo_devolucao?: string
  data_submissao?: string
  created_at: string
}

export interface FornecedorResumoMedicoes {
  valor_global: number
  valor_medido_total: number
  valor_comprometido_total?: number
  valor_em_analise?: number
  saldo_disponivel: number
  percentual_fisico_total: number
  total_medicoes: number
  medicoes_aprovadas: number
  pendentes_ateste: number
  pendentes_aprovacao: number
}

export interface ContratoMedicaoOverview {
  contrato: FornecedorContratoBase
  medicoes: FornecedorMedicao[]
  resumo: FornecedorResumoMedicoes | null
  ultimaMedicao: FornecedorMedicao | null
  rascunho: FornecedorMedicao | null
  devolvidaEditavel: FornecedorMedicao | null
  devolvidas: FornecedorMedicao[]
  emAnalise: number
  temNovaMedicaoDisponivel: boolean
  acaoPrincipal: {
    tipo: 'nova' | 'continuar' | 'editar' | 'ver'
    label: string
    href: string
  }
}

export function formatarMoeda(valor: number) {
  return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarData(data?: string | null) {
  if (!data) return '-'
  const dateOnly = data.split('T')[0]
  const parts = dateOnly.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return new Date(data).toLocaleDateString('pt-BR')
}

export function calcularDiasRestantes(dataFim?: string) {
  if (!dataFim) return null
  const fim = new Date(dataFim)
  const hoje = new Date()
  return Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

export function obterStatusMedicaoLabel(status: string) {
  const labels: Record<string, string> = {
    RASCUNHO: 'Rascunho',
    SUBMETIDA: 'Submetida',
    AGUARDANDO_ATESTE: 'Em análise',
    AGUARDANDO_APROVACAO: 'Aguardando aprovação',
    APROVADA: 'Aprovada',
    REJEITADA: 'Rejeitada',
    DEVOLVIDA: 'Devolvida',
    PARCIALMENTE_ATESTADA: 'Parcialmente atestada',
  }
  return labels[status] || status
}

export function buildMedicaoActionHref(contratoId: string, acao: 'nova' | 'continuar' | 'editar' | 'ver', medicaoId?: string) {
  if (acao === 'nova' || acao === 'continuar' || acao === 'editar') {
    const params = new URLSearchParams({ acao })
    if (medicaoId) params.set('medicaoId', medicaoId)
    return `/fornecedor/contratos/${contratoId}/medicao-chat?${params.toString()}`
  }

  const params = new URLSearchParams({ tab: 'medicoes', acao })
  if (medicaoId) params.set('medicaoId', medicaoId)
  return `/fornecedor/contratos/${contratoId}?${params.toString()}`
}

export function getDevolvidaEditavel(medicoes: FornecedorMedicao[]) {
  return medicoes.find((medicao) => {
    if (medicao.status !== 'DEVOLVIDA') return false
    return !medicoes.some((outra) => outra.numero_medicao > medicao.numero_medicao)
  }) || null
}

export function buildContratoMedicaoOverview(contrato: FornecedorContratoBase, medicoes: FornecedorMedicao[], resumo: FornecedorResumoMedicoes | null): ContratoMedicaoOverview {
  const medicoesOrdenadas = [...medicoes].sort((a, b) => a.numero_medicao - b.numero_medicao)
  const ultimaMedicao = medicoesOrdenadas[medicoesOrdenadas.length - 1] || null
  const rascunho = medicoesOrdenadas.find((medicao) => medicao.status === 'RASCUNHO') || null
  const devolvidas = medicoesOrdenadas.filter((medicao) => medicao.status === 'DEVOLVIDA')
  const devolvidaEditavel = getDevolvidaEditavel(medicoesOrdenadas)
  const emAnalise = medicoesOrdenadas.filter((medicao) => ['SUBMETIDA', 'AGUARDANDO_ATESTE', 'AGUARDANDO_APROVACAO', 'PARCIALMENTE_ATESTADA'].includes(medicao.status)).length
  const temNovaMedicaoDisponivel = contrato.status === 'VIGENTE' && !rascunho && !devolvidaEditavel

  let acaoPrincipal: ContratoMedicaoOverview['acaoPrincipal']
  if (devolvidaEditavel) {
    acaoPrincipal = {
      tipo: 'editar',
      label: 'Corrigir medição',
      href: buildMedicaoActionHref(contrato.id, 'editar', devolvidaEditavel.id),
    }
  } else if (rascunho) {
    acaoPrincipal = {
      tipo: 'continuar',
      label: 'Continuar medição',
      href: buildMedicaoActionHref(contrato.id, 'continuar', rascunho.id),
    }
  } else if (temNovaMedicaoDisponivel) {
    acaoPrincipal = {
      tipo: 'nova',
      label: 'Fazer medição',
      href: buildMedicaoActionHref(contrato.id, 'nova'),
    }
  } else {
    acaoPrincipal = {
      tipo: 'ver',
      label: 'Ver medição enviada',
      href: buildMedicaoActionHref(contrato.id, 'ver', ultimaMedicao?.id),
    }
  }

  return {
    contrato,
    medicoes: medicoesOrdenadas,
    resumo,
    ultimaMedicao,
    rascunho,
    devolvidaEditavel,
    devolvidas,
    emAnalise,
    temNovaMedicaoDisponivel,
    acaoPrincipal,
  }
}

/**
 * Falha ao carregar a central de medições. A tela precisa distinguir "você não
 * tem contratos" de "não consegui buscar" — antes as duas viravam lista vazia,
 * e o fornecedor concluía que o contrato havia sumido do sistema.
 */
export class FalhaAoCarregarMedicoes extends Error {}

export async function carregarOverviewMedicoesFornecedor(): Promise<ContratoMedicaoOverview[]> {
  const fornecedorData = localStorage.getItem('fornecedor')
  if (!fornecedorData) throw new FalhaAoCarregarMedicoes('Sessão não encontrada. Entre novamente.')

  const fornecedor = JSON.parse(fornecedorData)
  const contratosRes = await authFetch(`${API_URL}/api/contratos?fornecedorId=${fornecedor.id}`)
  if (!contratosRes.ok) {
    throw new FalhaAoCarregarMedicoes(
      contratosRes.status === 401
        ? 'Sua sessão expirou. Entre novamente para ver seus contratos.'
        : 'Não foi possível carregar seus contratos. Tente novamente.',
    )
  }

  const contratosJson = await contratosRes.json()
  const contratos = (Array.isArray(contratosJson) ? contratosJson : (contratosJson.data || [])) as FornecedorContratoBase[]
  const contratosVigentesOuRecentes = contratos.filter((contrato) => ['VIGENTE', 'SUSPENSO'].includes(contrato.status))

  const overviews = await Promise.all(contratosVigentesOuRecentes.map(async (contrato) => {
    try {
      const [medicoesRes, resumoRes] = await Promise.all([
        authFetch(`${API_URL}/api/fornecedor/contratos/${contrato.id}/medicoes`),
        authFetch(`${API_URL}/api/fornecedor/contratos/${contrato.id}/medicoes/resumo`),
      ])

      const medicoes = medicoesRes.ok ? await medicoesRes.json() : []
      const resumo = resumoRes.ok ? await resumoRes.json() : null
      return buildContratoMedicaoOverview(contrato, medicoes, resumo)
    } catch {
      return buildContratoMedicaoOverview(contrato, [], null)
    }
  }))

  return overviews.sort((a, b) => {
    const prioridade = (item: ContratoMedicaoOverview) => {
      if (item.devolvidaEditavel) return 0
      if (item.rascunho) return 1
      if (item.temNovaMedicaoDisponivel) return 2
      if (item.emAnalise > 0) return 3
      return 4
    }
    return prioridade(a) - prioridade(b)
  })
}
