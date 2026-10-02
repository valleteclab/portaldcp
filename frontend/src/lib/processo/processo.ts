import { API_URL, authFetch } from "@/lib/api"

/**
 * PROCESSO ELETRÔNICO — tipos e cliente da API genérica (`/api/processos`).
 *
 * Só o lado do órgão. O órgão e quem age vêm sempre do token (JWT); nada disso
 * é enviado no corpo. Para o tipo CONTRATACAO (licitação) as rotas de
 * tramitação ainda respondem pelo legado e NÃO têm pode_agir/enviar/receber:
 * a tela mostra só leitura e leva à licitação.
 */

export type TipoProcesso = "CONTRATACAO" | "ADITIVO" | "RENOVACAO" | "PAGAMENTO" | "AVULSO"
export type SituacaoProcesso = "ABERTO" | "ENCERRADO"

export const ROTULO_TIPO: Record<string, string> = {
  CONTRATACAO: "Contratação",
  ADITIVO: "Termo aditivo",
  RENOVACAO: "Renovação de contrato",
  PAGAMENTO: "Pagamento",
  AVULSO: "Avulso",
}

export function rotuloDoTipo(tipo: string | null | undefined): string {
  return (tipo && ROTULO_TIPO[tipo]) || tipo || "Processo"
}

/** Tipos com tramitação própria nesta API (os demais seguem pela licitação). */
export function temTramitacaoPropria(tipo: string): boolean {
  return tipo === "ADITIVO" || tipo === "RENOVACAO" || tipo === "AVULSO"
}

export interface ProcessoResumo {
  id: string
  orgao_id: string
  tipo: TipoProcesso
  numero: string
  objeto: string
  situacao: SituacaoProcesso
  referencia_tipo: string | null
  referencia_id: string | null
  contrato_id: string | null
  setor_origem_id: string | null
  aberto_por_nome: string | null
  origem: string | null
  aberto_em: string
  encerrado_em: string | null
  motivo_encerramento: string | null
  /** Só na listagem: com quem o processo está (null = sem tramitação). */
  esta_com?: { setor_nome: string | null; usuario_nome: string | null; recebida: boolean } | null
}

export interface ConteudoContrato {
  id: string
  numero_contrato: string
  objeto: string | null
  fornecedor_razao_social: string | null
}

export interface ConteudoTermo {
  id: string
  numero_termo: string | null
  tipo: string | null
  status: string | null
  objeto: string | null
  data_assinatura: string | null
  renovacao_ciclo: boolean | null
}

export interface ConteudoLicitacao {
  id: string
  numero_processo: string | null
  numero_edital: string | null
  modalidade: string | null
  fase: string | null
  situacao: string | null
  valor_total_estimado: number | string | null
  fundamento_legal: string | null
}

export interface ProcessoVisao extends ProcessoResumo {
  /** ADITIVO/RENOVACAO: { contrato, termo }; CONTRATACAO: a licitação. */
  conteudo: ({ contrato?: ConteudoContrato | null; termo?: ConteudoTermo | null } & Partial<ConteudoLicitacao>) | null
}

export interface ComQuemEsta {
  setor_id: string | null
  setor_nome: string | null
  usuario_id: string | null
  usuario_nome: string | null
  texto: string
  recebida: boolean
  desde: string
  enviado_por: string | null
  despacho: string | null
}

export interface Movimentacao {
  id: string
  sequencia: number
  tipo: "ABERTURA" | "ENVIO" | "DEVOLUCAO"
  de_setor_id: string | null
  de_setor_nome: string | null
  de_usuario_nome: string | null
  para_setor_nome: string | null
  para_usuario_nome: string | null
  despacho: string
  recebida_em: string | null
  created_at: string
}

export interface EventoLinhaDoTempo {
  quando: string
  tipo: "ABERTURA" | "ENVIO" | "DEVOLUCAO" | "RECEBIMENTO" | "PECA" | "ENCERRAMENTO"
  titulo: string
  detalhe: string | null
  por: string | null
}

export type SituacaoPosse = "SEM_TRAMITACAO" | "AGUARDANDO_RECEBIMENTO" | "COM_O_RESPONSAVEL"

/** Resposta de `GET :id/tramitacao` dos tipos com tramitação própria. */
export interface Tramitacao {
  processo_id: string
  disponivel: boolean
  situacao_posse?: SituacaoPosse
  com_quem_esta: ComQuemEsta | null
  pode_agir?: boolean
  pode_receber?: boolean
  atual?: Movimentacao | null
  movimentacoes?: Movimentacao[]
  linha_do_tempo?: EventoLinhaDoTempo[]
}

export interface Peca {
  id: string
  numero_peca: number
  etapa: string | null
  tipo_peca: string | null
  titulo: string
  texto: string | null
  arquivo_url: string | null
  arquivo_nome: string | null
  folha_inicial: number
  folha_final: number
  criado_por_nome: string | null
  created_at: string
}

export interface Autos {
  processo_id: string
  disponivel: boolean
  autuacao?: string
  total_folhas?: number
  juntadas: Peca[]
}

export type EstadoEtapa = "CONCLUIDA" | "ATUAL" | "FUTURA"

export interface Etapa {
  chave: string
  rotulo: string
  ordem: number
  estado: EstadoEtapa
  tipo_peca: string | null
  titulo_peca: string | null
  resultado?: boolean
  setor_palavras?: string[]
  setor_sugerido?: { id: string; nome: string } | null
}

export interface Fluxo {
  processo_id: string
  disponivel: boolean
  tem_fluxo: boolean
  etapas: Etapa[] | null
  etapa_atual: Etapa | null
}

export interface SetorDestino {
  id: string
  nome: string
  chefe_usuario_id?: string | null
}

export interface UsuarioDestino {
  id: string
  nome: string
  cargo: string | null
  setor_id: string | null
}

export interface Destinos {
  processo_id: string
  setores: SetorDestino[]
  usuarios: UsuarioDestino[]
  sugerido: { setor_id: string; setor_nome: string; motivo: string } | null
}

/** Erro de API com mensagem pronta para mostrar ao usuário. */
export class ErroApi extends Error {
  status: number
  constructor(mensagem: string, status: number) {
    super(mensagem)
    this.status = status
  }
}

function mensagemDoErro(status: number, corpo: { message?: string | string[] } | null, padrao: string): string {
  const msg = Array.isArray(corpo?.message) ? corpo.message.join("; ") : corpo?.message
  // Rota inexistente no servidor (Nest: "Cannot GET /api/processos/...") — servidor ainda sem o módulo novo
  if (status === 404 && typeof msg === "string" && /^Cannot (GET|POST|PUT|PATCH|DELETE) /i.test(msg)) {
    return "Esta função ainda não está disponível neste servidor. Tente novamente depois da próxima atualização do sistema."
  }
  if (status === 401) return "Sua sessão expirou. Entre novamente."
  if (status === 403) return msg || "Você não tem permissão para esta ação."
  if (status === 404) return msg || "Processo não encontrado."
  if (status >= 500) return "O servidor não conseguiu concluir o pedido. Tente novamente em instantes."
  return msg || padrao
}

/** Chama `/api/processos...` com a sessão do usuário; lança `ErroApi` com texto em português. */
export async function chamarProcessos<T>(caminho: string, opcoes?: { metodo?: string; corpo?: unknown; padrao?: string }): Promise<T> {
  const padrao = opcoes?.padrao || "Não foi possível concluir a operação."
  let res: Response
  try {
    res = await authFetch(`${API_URL}/api/processos${caminho}`, {
      method: opcoes?.metodo || "GET",
      body: opcoes?.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    })
  } catch {
    throw new ErroApi("Sem conexão com o servidor. Verifique sua internet e tente de novo.", 0)
  }
  if (!res.ok) {
    const corpo = await res.json().catch(() => null)
    throw new ErroApi(mensagemDoErro(res.status, corpo, padrao), res.status)
  }
  return (await res.json()) as T
}

export const textoDoErro = (e: unknown, padrao = "Não foi possível concluir a operação.") => (e instanceof Error && e.message ? e.message : padrao)

export interface OpcaoDeModelo {
  id: string
  nome: string
  padrao_sistema: boolean
  do_orgao: boolean
  html: string
}

export interface ModeloDaPeca {
  processo_id: string
  etapa: string | null
  titulo: string
  html: string
  modelo_id: string | null
  modelos: OpcaoDeModelo[]
  ia_disponivel: boolean
}

export interface RascunhoDaPeca {
  processo_id: string
  titulo: string
  html: string
  ia_modelo: string
  lacunas: number
}

export const temLacuna = (html: string) => /<mark>[\s\S]*?<\/mark>/i.test(html)

/** Anexa um arquivo feito fora do sistema (`POST /api/uploads`, pasta `processo`) e devolve a URL para `arquivo_url`. */
export async function enviarArquivoDoProcesso(arquivo: File): Promise<{ url: string; nome: string }> {
  const form = new FormData()
  form.append("file", arquivo)
  form.append("tipo", "processo")
  let res: Response
  try {
    res = await authFetch(`${API_URL}/api/uploads`, { method: "POST", body: form })
  } catch {
    throw new ErroApi("Sem conexão com o servidor. Verifique sua internet e tente de novo.", 0)
  }
  if (!res.ok) {
    const corpo = await res.json().catch(() => null)
    throw new ErroApi(mensagemDoErro(res.status, corpo, "Não foi possível enviar o arquivo."), res.status)
  }
  const dados = await res.json()
  return { url: dados.url as string, nome: (dados.originalname as string) || arquivo.name }
}

/** Texto de "folhas": "fl. 5" ou "fls. 5–6". */
export function rotuloFolhas(inicial: number, final: number): string {
  return inicial === final ? `fl. ${inicial}` : `fls. ${inicial}–${final}`
}

/** URL completa de um arquivo anexado (a API devolve caminho relativo). */
export function urlDoArquivo(url: string): string {
  return url.startsWith("http") ? url : `${API_URL}${url.startsWith("/") ? url : `/${url}`}`
}

/** "Setor · Pessoa" de quem está com o processo. */
export function textoPosse(c: Pick<ComQuemEsta, "setor_nome" | "usuario_nome" | "texto"> | null | undefined): string {
  if (!c) return "Sem tramitação"
  return c.texto || [c.setor_nome, c.usuario_nome].filter(Boolean).join(" · ") || "Órgão"
}

/**
 * Posse do processo de CONTRATAÇÃO: a rota legada devolve outro formato
 * (`setor`, `usuario`, `de`, `status`); aqui vira o mesmo `ComQuemEsta`.
 */
export function normalizarPosse(entrada: unknown): ComQuemEsta | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bruto = entrada as any
  if (!bruto) return null
  if (typeof bruto.texto === "string") return bruto as ComQuemEsta
  if (bruto.status === "SEM_TRAMITACAO" || (!bruto.setor && !bruto.usuario)) return null
  const setor = bruto.setor?.nome ?? null
  const usuario = bruto.usuario?.nome ?? null
  return {
    setor_id: bruto.setor?.id ?? null,
    setor_nome: setor,
    usuario_id: bruto.usuario?.id ?? null,
    usuario_nome: usuario,
    texto: [setor, usuario].filter(Boolean).join(" · ") || "Órgão",
    recebida: !!bruto.recebido_em,
    desde: bruto.recebido_em || bruto.desde,
    enviado_por: bruto.de?.usuario_nome ?? null,
    despacho: bruto.despacho ?? null,
  }
}

const FUSO = "America/Sao_Paulo"

/** "30/09/2026 14:05" no horário de Brasília (evita deslocar hora/dia). */
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** "30/09/2026" no horário de Brasília. */
export function soData(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("pt-BR", { timeZone: FUSO })
}
