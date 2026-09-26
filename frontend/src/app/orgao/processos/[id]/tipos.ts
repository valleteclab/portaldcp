/**
 * Tipos da tela do processo (/orgao/processos/[id]) — espelham as leituras do
 * backend: GET /licitacoes/:id/processo-completo, GET
 * /licitacoes/:id/conferencia-publicacao e GET
 * /publicacao/licitacao/:id/divulgacao. A tela não decide regra: mostra.
 */

/** Ato disponível devolvido pelo backend (processo-completo.atos_disponiveis). */
export interface AtoDisponivel {
  ato: string
  rotulo: string
  fase_para: string | null
  situacao_para: string | null
  requer_motivo: boolean
  requer_dados: boolean
  endpoint: string | null
  disponivel: boolean
  pendencias: string[]
}

/** Ação do menu "Mais ações" (processo-completo.acoes_menu — máquina de estados). */
export interface AcaoDoMenu {
  ato: string
  rotulo: string
  disponivel: boolean
  /** Pendências do ato ou o motivo de a fase não o admitir (texto do backend). */
  motivos: string[]
  fora_da_fase: boolean
  requer_motivo: boolean
  endpoint: string | null
}

export interface ItemProcesso {
  id: string
  numero_item: number
  descricao: string
  quantidade: number
  unidade_medida?: string
  valor_unitario_estimado?: number
  valor_unitario_homologado?: number
  valor_total_homologado?: number
  fornecedor_vencedor_id?: string
  fornecedor_vencedor_nome?: string
  status: string
}

export interface PropostaProcesso {
  /** null enquanto o recebimento está aberto (sigilo) */
  id: string | null
  status: string
  valor_total_proposta?: number | null
  data_envio?: string | null
  /** null enquanto o recebimento está aberto (sigilo) */
  razao_social: string | null
  sigilo?: boolean
}

export interface ContratoProcesso {
  id: string
  numero_contrato: string
  fornecedor_razao_social?: string
  valor_global?: number
  status?: string
  data_assinatura?: string | null
  arquivo_contrato?: string | null
  documento_assinatura_id?: string | null
  assinatura_status?: string | null
  arquivo_assinado_url?: string | null
  assinados?: number | string | null
  total_signatarios?: number | string | null
  signatarios_resumo?: string | null
}

export interface LicitacaoProcesso {
  id: string
  numero_processo: string
  numero_edital?: string
  objeto: string
  modalidade: string
  fase: string
  /** ATIVA, SUSPENSA, REVOGADA, ANULADA, DESERTA, FRACASSADA, CONCLUIDA */
  situacao?: string
  fase_anterior?: string | null
  srp: boolean
  valor_total_estimado?: number
  valor_homologado?: number
  data_homologacao?: string
  selecao_externa: boolean
  plataforma_externa?: string | null
  numero_processo_externo?: string | null
  url_externa?: string | null
  tipo_contratacao?: string
  criterio_julgamento?: string
  data_fim_acolhimento?: string | null
  data_abertura_sessao?: string | null
  data_limite_impugnacao?: string | null
  data_inicio_acolhimento?: string | null
  data_publicacao_edital?: string | null
  data_divulgacao_oficial?: string | null
  meio_divulgacao_oficial?: string | null
  natureza_objeto?: string | null
  dispensa_lances_inicio?: string | null
  dispensa_lances_fim?: string | null
  link_pncp?: string | null
  numero_controle_pncp?: string | null
  created_at?: string
  fundamento_legal?: string | null
  unidade_compradora?: string | null
  agente_contratacao?: string | null
  autoridade?: { nome: string; cargo: string | null; origem: "HOMOLOGACAO" | "CADASTRO" } | null
  sem_pca?: boolean
  preparacao_automatica?: {
    status: "EXECUTANDO" | "CONCLUIDA" | "ERRO"
    etapa?: string
    log?: string[]
    erro?: string
    concluida_em?: string
  } | null
}

export interface ProcessoCompleto {
  licitacao: LicitacaoProcesso
  item_pca?: { id: string; numero_item: number; descricao_objeto: string; valor_estimado: number } | null
  demanda?: { id: string; titulo?: string; status: string } | null
  itens: ItemProcesso[]
  /** Peças da fase interna (documentos_fase_interna) */
  documentos: Array<{ id: string; tipo: string; titulo?: string; status?: string; origem?: string; created_at?: string }>
  contratos: ContratoProcesso[]
  atas: Array<{ id: string; numero_ata: string; fornecedor_razao_social?: string; valor_total?: number; status?: string }>
  propostas: PropostaProcesso[]
  propostas_em_sigilo?: boolean
  pncp?: Array<{ tipo: string; status: string; numero_controle_pncp?: string | null; erro_mensagem?: string | null; tentativas?: number; updated_at?: string }>
  checklist: {
    vinculado_pca: boolean
    possui_itens: boolean
    possui_documentos: boolean
    fase_interna_concluida: boolean
    resultado_registrado: boolean
    homologado: boolean
    contrato_gerado: boolean
  }
  atos_disponiveis?: AtoDisponivel[]
  acoes_menu?: AcaoDoMenu[]
}

/** GET /licitacoes/:id/conferencia-publicacao */
export interface ItemConferencia {
  chave: "DOCUMENTOS" | "AUTORIZACAO" | "AVISO" | "EDITAL" | "ITENS" | "PCA" | "ME_EPP" | "OUTRAS"
  rotulo: string
  fundamento: string
  estado: "OK" | "PENDENTE" | "ALERTA"
  bloqueia: boolean
  detalhe: string | null
  pendencias: string[]
  acao:
    | "ABRIR_FASE_INTERNA"
    | "GERAR_AVISO"
    | "ANEXAR_EDITAL"
    | "CADASTRAR_ITENS"
    | "CANCELAR_PUBLICACAO"
    | "VINCULAR_PCA"
    | "CONFIGURAR_ME_EPP"
    | null
}

export interface ConferenciaPrePublicacao {
  aplicavel: boolean
  fase: string
  aguardando_divulgacao: boolean
  itens: ItemConferencia[]
  bloqueantes: number
  pode_publicar: boolean
}

/** GET /publicacao/licitacao/:id/divulgacao (o backend decide tudo). */
export interface SituacaoDivulgacao {
  estado: "NAO_PUBLICADO" | "AGUARDANDO" | "CONFIRMADA" | "EXTERNA"
  integrado_pncp: boolean
  data_divulgacao_oficial?: string | null
  meio_divulgacao_oficial?: string | null
  compra: {
    id: string
    status: string
    tentativas: number
    max_tentativas: number
    ultima_tentativa: string | null
    proximo_envio: string | null
    numero_controle_pncp?: string | null
    erro_mensagem: string | null
    erro_status_http: number | null
  } | null
  banner: {
    tipo: "ERRO" | "AGUARDANDO"
    titulo: string
    mensagem: string
    pendencias: Array<{ campo: string; texto: string }>
    pode_reenviar: boolean
    reenviar_id: string | null
    pode_registrar_diario_oficial: boolean
  } | null
}

/** Regras do chat da dispensa na fase atual (GET .../dispensa/mensagens/regras — Etapa A). */
export interface RegrasChat {
  modo?: string
  rotulo?: string
  explicacao?: string
  orgao_pode_enviar?: boolean
  exige_assunto?: boolean
  interlocutores?: Array<{ fornecedor_id: string; razao_social: string }>
}

export interface MensagemDispensa {
  id: string
  autor_tipo: string
  autor_nome: string
  mensagem: string
  assunto?: string | null
  created_at?: string
}

export const fmtMoeda = (v?: number | string | null) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/** Situação do processo diferente de ATIVA/SUSPENSA = encerrado. */
export const SITUACOES_ENCERRADAS = ["REVOGADA", "ANULADA", "DESERTA", "FRACASSADA", "CONCLUIDA"]
