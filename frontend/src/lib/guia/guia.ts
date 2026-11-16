/**
 * Guia de primeiros passos — tipos da API (`/api/guia`) e regras de exibição
 * puras (sem React). Os passos e quem pode cada um vêm do servidor.
 */
import { API_URL, authFetch } from '@/lib/api'

export type SituacaoPasso = 'CONCLUIDO' | 'ATUAL' | 'A_FAZER'

export interface PessoaGuia {
  nome: string
  email: string | null
}

export interface TelaPasso {
  rota: string
  alvo: string | null
  balao: string
}

export interface PassoGuia {
  chave: string
  titulo: string
  o_que_fazer: string
  quem: string
  por_que: string | null
  conclui_quando: string
  situacao: SituacaoPasso
  tela: TelaPasso | null
  pode_agir: boolean
  quem_pode: PessoaGuia[]
}

export type ChaveRoteiro = 'FLUXO' | 'DISPENSA'

export interface RoteiroGuia {
  chave: ChaveRoteiro
  titulo: string
  descricao: string
  iniciado: boolean
  bloqueio: string | null
  referencia: string | null
  passos: PassoGuia[]
  concluidos: number
  total: number
}

export interface ProgressoGuia {
  roteiros: RoteiroGuia[]
  concluidos: number
  total: number
}

export const LETRA_ROTEIRO: Record<ChaveRoteiro, string> = { FLUXO: 'A', DISPENSA: 'B' }

export async function carregarGuia(): Promise<ProgressoGuia> {
  const r = await authFetch(`${API_URL}/api/guia`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function comecarRoteiroDispensa(): Promise<ProgressoGuia> {
  const r = await authFetch(`${API_URL}/api/guia/dispensa/comecar`, { method: 'POST' })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
  return j
}

export function passoAtual(r: RoteiroGuia | null | undefined): PassoGuia | null {
  return r?.passos.find((p) => p.situacao === 'ATUAL') ?? null
}

/** Número do passo (1, 2, …) dentro do roteiro. */
export function numeroDoPasso(r: RoteiroGuia, chave: string): number {
  return r.passos.findIndex((p) => p.chave === chave) + 1
}

export function situacaoDoRoteiro(r: RoteiroGuia): 'CONCLUIDO' | 'EM_ANDAMENTO' | 'NAO_INICIADO' {
  if (r.total > 0 && r.concluidos === r.total) return 'CONCLUIDO'
  return r.iniciado && !r.bloqueio ? 'EM_ANDAMENTO' : 'NAO_INICIADO'
}

/** Como chamar quem pode o passo: "Maria (maria@x)", até três pessoas. */
export function rotuloPessoas(pessoas: PessoaGuia[]): string {
  return pessoas.map((p) => (p.email ? `${p.nome} (${p.email})` : p.nome)).join(', ')
}

/**
 * Passagem para outra pessoa: o passo atual mudou, quem está logado podia o
 * anterior e não pode o novo. Devolve o passo concluído e o seguinte.
 */
export function passagemDeVez(
  antes: RoteiroGuia | null | undefined,
  depois: RoteiroGuia | null | undefined,
): { concluido: PassoGuia; proximo: PassoGuia } | null {
  const a = passoAtual(antes)
  const d = passoAtual(depois)
  if (!a || !d || a.chave === d.chave) return null
  if (!a.pode_agir || d.pode_agir) return null
  const concluido = depois!.passos.find((p) => p.chave === a.chave)
  return concluido?.situacao === 'CONCLUIDO' ? { concluido, proximo: d } : null
}

/** Caminho da rota sem `?…` e `#…` (para saber se a tela do passo já está aberta). */
export function caminhoDaRota(rota: string): string {
  return rota.split(/[?#]/)[0]
}
