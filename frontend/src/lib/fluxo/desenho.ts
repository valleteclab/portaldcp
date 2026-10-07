import { API_URL, authFetch } from "@/lib/api"

/** Tela "Desenhar o fluxo" (mockup aprovado em 06/10/2026) — espelho de backend/src/workflow/desenho. */

export type TipoResponsavel = "SETOR" | "USUARIO" | "SOLICITANTE"
export type Canal = "WHATSAPP" | "EMAIL" | "TEAMS"

export interface Avisos {
  canais: Canal[]
  teams_canal_id?: string | null
  chegada: boolean
  vespera_prazo: boolean
}

export interface Notificar {
  destinatarios: Array<{ tipo: TipoResponsavel; id?: string }>
  canais: Canal[]
  teams_canal_id?: string | null
  mensagem: string
}

export interface EtapaDesenho {
  chave: string
  tipo: string
  nome: string
  responsavel_tipo: TipoResponsavel
  responsaveis: string[]
  prazo_dias_uteis: number | null
  devolver_para: string | null
  aceita_documento_externo: boolean
  avisos: Avisos | null
  notificar: Notificar | null
  obrigatoria_lei?: string | null
  /** Modelo de documento escolhido para a etapa ("Documento produzido"); nulo = o padrão. */
  modelo_documento_id: string | null
}

export interface Desenho {
  modelo: { id: string; nome: string; descricao: string | null; tipo_processo: string | null; versao: number; status: string; familia_id: string }
  etapas: EtapaDesenho[]
  editavel: boolean
  etapas_exigidas: string[]
  pendencias_para_ativar: string[]
  versoes: Array<{ id: string; versao: number; status: string; em_andamento: number }>
}

export interface FluxoResumo {
  familia_id: string
  nome: string
  tipo_processo: string | null
  ativo: { id: string; versao: number } | null
  rascunho: { id: string; versao: number } | null
  em_andamento: number
}

export interface ItemCatalogo {
  tipo: string
  rotulo: string
  descricao: string
  grupo: "CONTRATACAO" | "GERAL"
  documento: { produz: boolean; aceita_externo: boolean }
  obrigatoria_lei: { fundamento: string; dispensa: string | null } | null
  automatico: boolean
  disponivel: boolean
  tipo_documento: string | null
}

export interface OpcoesDesenho {
  setores: Array<{ id: string; nome: string }>
  usuarios: Array<{ id: string; nome: string; cargo: string | null; setor_id: string | null }>
  teams: Array<{ id: string; nome: string; webhook_mascarado: string }>
}

export const TIPOS_PROCESSO_FLUXO: Array<{ valor: string; rotulo: string }> = [
  { valor: "CONTRATACAO", rotulo: "Contratação" },
  { valor: "ADITIVO", rotulo: "Termo aditivo" },
  { valor: "RENOVACAO", rotulo: "Renovação de contrato" },
  { valor: "AVULSO", rotulo: "Processo avulso" },
]

export const rotuloTipoProcesso = (t: string | null | undefined) => TIPOS_PROCESSO_FLUXO.find((x) => x.valor === t)?.rotulo ?? "Sem tipo definido"

export class ErroFluxo extends Error {
  constructor(mensagem: string, public readonly erros: string[] = []) {
    super(mensagem)
  }
}

export async function apiFluxo<T>(caminho: string, opcoes?: { metodo?: string; corpo?: unknown }): Promise<T> {
  const r = await authFetch(`${API_URL}/api/workflows${caminho}`, {
    method: opcoes?.metodo ?? "GET",
    headers: opcoes?.corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opcoes?.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) {
    const m = j?.message
    const erros: string[] = Array.isArray(j?.erros) ? j.erros : Array.isArray(m) ? m : []
    throw new ErroFluxo(typeof m === "string" ? m : erros.join(" ") || `Erro ${r.status}`, erros)
  }
  return j as T
}
