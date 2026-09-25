/**
 * Credenciamento como processo (plano E7b — Lei 14.133/2021 arts. 78 I, 79 e
 * 74 IV): rótulos e formatadores comuns às telas do órgão, do fornecedor e
 * pública. A regra (hipótese × distribuição, vigência, prazos) é do backend.
 */

export const HIPOTESES: Record<string, { rotulo: string; descricao: string }> = {
  PARALELA_NAO_EXCLUDENTE: {
    rotulo: 'Art. 79, I — paralela e não excludente',
    descricao: 'Contratações simultâneas em condições padronizadas; demanda distribuída por critério objetivo.',
  },
  SELECAO_POR_TERCEIROS: {
    rotulo: 'Art. 79, II — seleção a critério de terceiros',
    descricao: 'O beneficiário do serviço escolhe o credenciado.',
  },
  MERCADO_FLUIDO: {
    rotulo: 'Art. 79, III — mercados fluidos',
    descricao: 'Preço cotado no momento da contratação (flutuação constante).',
  },
}

export const REGRAS: Record<string, string> = {
  RODIZIO: 'Rodízio (ordem do credenciamento)',
  SORTEIO: 'Sorteio auditável a cada demanda',
  DIVISAO_IGUALITARIA: 'Divisão igualitária (menor valor já contratado)',
  ESCOLHA_BENEFICIARIO: 'Escolha do beneficiário',
  COTACAO_MERCADO: 'Cotação de mercado no momento',
}

export const REGRAS_POR_HIPOTESE: Record<string, string[]> = {
  PARALELA_NAO_EXCLUDENTE: ['RODIZIO', 'SORTEIO', 'DIVISAO_IGUALITARIA'],
  SELECAO_POR_TERCEIROS: ['ESCOLHA_BENEFICIARIO'],
  MERCADO_FLUIDO: ['COTACAO_MERCADO'],
}

export const STATUS_INSCRICAO: Record<string, { label: string; cor: string }> = {
  PENDENTE: { label: 'Em análise', cor: 'bg-amber-100 text-amber-800' },
  CREDENCIADO: { label: 'Credenciado', cor: 'bg-green-100 text-green-800' },
  INDEFERIDO: { label: 'Indeferido', cor: 'bg-red-100 text-red-800' },
  DESCREDENCIADO: { label: 'Descredenciado', cor: 'bg-gray-200 text-gray-700' },
  ARQUIVADA: { label: 'Arquivada (vigência encerrada)', cor: 'bg-gray-100 text-gray-600' },
}

export const STATUS_HABILITACAO: Record<string, string> = {
  AGUARDANDO_ENVIO: 'Documentação em preenchimento',
  ENVIADA: 'Documentação entregue — em análise',
  EM_DILIGENCIA: 'Em diligência (complementação)',
  HABILITADO: 'Documentação aprovada',
  INABILITADO: 'Documentação reprovada',
  CANCELADA: 'Cancelada',
}

/** Situação do processo para as telas. */
export function situacaoCredenciamento(c: { fase?: string; situacao?: string }): { label: string; cor: string } {
  if (c.situacao === 'CONCLUIDA') return { label: 'Vigência encerrada', cor: 'bg-gray-100 text-gray-800' }
  if (c.situacao === 'SUSPENSA') return { label: 'Suspenso', cor: 'bg-orange-100 text-orange-800' }
  if (c.situacao === 'REVOGADA') return { label: 'Revogado', cor: 'bg-red-100 text-red-800' }
  if (c.situacao === 'ANULADA') return { label: 'Anulado', cor: 'bg-red-100 text-red-800' }
  if (c.fase === 'ACOLHIMENTO_PROPOSTAS') return { label: 'Inscrições abertas', cor: 'bg-green-100 text-green-800' }
  if (c.fase === 'PUBLICADO') return { label: 'Publicado (inscrições a abrir)', cor: 'bg-blue-100 text-blue-800' }
  return { label: 'Fase interna', cor: 'bg-slate-100 text-slate-700' }
}

export const moeda = (v: unknown) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 4 })

export const dataHora = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'

export const dataCurta = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

/** Valor para <input type="datetime-local"> (relógio do navegador). */
export function paraInputLocal(v: unknown): string {
  if (!v) return ''
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function deInputLocal(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Mensagem legível do erro do backend (message string, lista ou pendências). */
export async function erroDaResposta(res: Response, padrao: string): Promise<string> {
  const j = await res.json().catch(() => null)
  if (!j) return `${padrao} (HTTP ${res.status})`
  if (Array.isArray(j.pendencias) && j.pendencias.length) return j.pendencias.join(' • ')
  if (Array.isArray(j.message)) return j.message.join(' • ')
  if (typeof j.message === 'object' && j.message?.message) return String(j.message.message)
  return String(j.message || padrao)
}
