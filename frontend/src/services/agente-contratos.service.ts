import { API_URL, getAuthHeaders } from '@/lib/api'

export interface AgenteLog {
  id: string
  tipo_acao: string
  orgao_id: string
  contrato_numero?: string
  contrato_id?: string
  fornecedor_id?: string
  cnpj_fornecedor?: string
  status: 'SUCESSO' | 'ERRO' | 'PENDENTE'
  mensagem?: string
  detalhes?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CicloAgenteResult {
  total_processado: number
  contratos_importados: number
  erros: number
  detalhes: Array<{
    numero_contrato: string
    status: 'importado' | 'ja_existente' | 'erro'
    mensagem: string
  }>
}

export interface AgenteEstatisticas {
  total_acoes: number
  sucessos: number
  erros: number
  contratos_importados_7dias: number
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
      throw new Error(error.message || 'Erro ao executar ciclo do agente')
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
      throw new Error('Erro ao carregar estatísticas')
    }

    return response.json()
  },
}
