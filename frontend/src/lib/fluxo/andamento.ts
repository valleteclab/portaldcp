/**
 * Andamento do processo (espelho de backend/src/workflow/andamento/andamento.ts).
 * Igual para o processo livre (ofício, avulso) e para o fluxo desenhado.
 */

export type SituacaoNo = "CONCLUIDA" | "EM_ANDAMENTO" | "A_REALIZAR"

export interface NoAndamento {
  chave: string
  titulo: string
  tipo: string | null
  responsavel: string | null
  situacao: SituacaoNo
  desde: string | null
  concluida_em: string | null
  prazo_em: string | null
  atrasada: boolean
  devolvida: boolean
  obrigatoria_lei: string | null
  /** Tarefa aberta desta etapa (situação EM_ANDAMENTO) — id para concluir/devolver/indeferir. */
  tarefa_id: string | null
}

export interface Andamento {
  modo: "LIVRE" | "FLUXO"
  fluxo: { id: string; nome: string; versao: number } | null
  instancia_id: string | null
  nos: NoAndamento[]
  concluidas: number
  total: number
  atual: NoAndamento | null
  encerrado: boolean
  /** Quem está vendo pode concluir/devolver a etapa atual (fluxo desenhado). */
  pode_agir?: boolean
}

const DIA = 24 * 60 * 60 * 1000

/** "hoje", "há 1 dia", "há 3 dias" — contado em dias corridos no fuso de Brasília. */
export function haQuantoTempo(iso: string | null, agora: Date = new Date()): string | null {
  if (!iso) return null
  const dia = (d: Date) => Math.floor((d.getTime() - 3 * 60 * 60 * 1000) / DIA)
  const dias = dia(agora) - dia(new Date(iso))
  if (dias <= 0) return "hoje"
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`
}

/** "09/10" no fuso de Brasília. */
export function diaMes(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
}
