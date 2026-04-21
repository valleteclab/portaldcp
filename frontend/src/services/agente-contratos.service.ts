import { API_URL, getAuthHeaders } from '@/lib/api'

export interface AgenteLog {
  id: string
  tipo_acao: string
  orgao_id: string
  contrato_numero?: string
  contrato_id?: string
  fornecedor_id?: string
  cnpj_fornecedor?: string
  status: 'SUCESSO' | 'ERRO' | 'PENDENTE' | 'AVISO'
  mensagem?: string
  detalhes?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AditivoPendente {
  nome: string
  tipo: string
  valor: string
  vigencia: string
  fiscal: string
  pdf_url: string
}

export interface ContratoComPendenciaAditivo {
  contrato_id: string
  numero_contrato: string
  status_contrato: string
  fornecedor_nome: string
  data_vigencia_fim?: string | null
  aditivos_portal_total: number
  termos_cadastrados_total: number
  pendentes_total: number
  link_contrato: string
  aditivos_pendentes: AditivoPendente[]
}

export interface CicloAgenteResult {
  contratos_analisados: number
  contratos_com_pendencias: number
  contratos_sem_pendencias: number
  contratos_sem_aditivos_no_portal: number
  erros: number
  pendencias: ContratoComPendenciaAditivo[]
  detalhes: Array<{
    numero_contrato: string
    status: 'pendencia' | 'sem_pendencia' | 'sem_aditivos' | 'erro'
    mensagem: string
  }>
}

export interface AgenteEstatisticas {
  total_acoes: number
  sucessos: number
  avisos: number
  erros: number
  contratos_com_pendencias_7dias: number
  ultima_execucao?: string
}

export const agenteContratosService = {
  async executarCiclo(orgaoId: string): Promise<CicloAgenteResult> {
    const response = await fetch(`${API_URL}/api/agente-contratos/executar`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orgao_id: orgaoId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erro ao executar verificacao de aditivos')
    }

    return response.json()
  },

  async obterLogs(orgaoId: string, limite: number = 50): Promise<AgenteLog[]> {
    const response = await fetch(
      `${API_URL}/api/agente-contratos/logs?orgao_id=${orgaoId}&limite=${limite}`,
      {
        headers: getAuthHeaders(),
      }
    )

    if (!response.ok) {
      throw new Error('Erro ao carregar logs')
    }

    return response.json()
  },

  async obterEstatisticas(orgaoId: string): Promise<AgenteEstatisticas> {
    const response = await fetch(
      `${API_URL}/api/agente-contratos/estatisticas?orgao_id=${orgaoId}`,
      {
        headers: getAuthHeaders(),
      }
    )

    if (!response.ok) {
      throw new Error('Erro ao carregar estatisticas')
    }

    return response.json()
  },
}
