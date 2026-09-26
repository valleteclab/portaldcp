/**
 * MOTOR DE CONFORMIDADE (Entrega 4; SPEC §4; plano §5.1) — tipos.
 *
 * Regra = função PURA `(contexto) => AchadoCalculado[]`, registrada na lista
 * `REGRAS` com código, descrição, severidade, etapa em que roda e o portão.
 * O contexto é montado UMA vez por revisão (processo, peças com o texto —
 * geradas e, das anexadas, o que o PDF deixa extrair —, itens, cotações,
 * reserva, limites e calendário) e entregue a todas as regras.
 */
import type { CalendarioDiasUteis } from '../../common/prazos/dias-uteis';
import type { ConsumoDoLimiteProcesso } from '../../parametros-licitacao/consumo-limite.service';
import type { ItemPesquisaPrecos } from '../types/pesquisa-precos.type';
import type { LinhaInstrucaoPortao } from './art72';
import type { PaginaDeTexto } from './texto';

export type Severidade = 'BLOQUEIO' | 'ATENCAO';

/**
 * Etapa em que a regra roda (e o portão que a aplica):
 *  - PESQUISA → portão A (limite e fracionamento), etapa 4;
 *  - AUTORIZACAO → portão B (art. 72), etapa 6;
 *  - PUBLICACAO → portão C (conformidade antes de publicar), etapa 8.
 */
export type EtapaRegra = 'PESQUISA' | 'AUTORIZACAO' | 'PUBLICACAO';
export type Portao = 'A' | 'B' | 'C';

/** Ato protegido que está para ser praticado (a avaliação dos portões). */
export type AtoProtegido = 'CONCLUIR_PESQUISA' | 'AUTORIZAR' | 'PUBLICAR';

export interface Evidencia {
  documento_id: string | null;
  tipo: string | null;
  titulo: string;
  folha: number | null;
  trecho: string | null;
}

/** O que a tela oferece no achado. */
export type AcaoAchado = 'CORRIGIR_PECA' | 'JUSTIFICAR' | 'ABRIR' | 'AGENDAR' | 'RESOLVER';

export interface AchadoCalculado {
  regra: string;
  /** Identifica a OCORRÊNCIA dentro da regra (estável entre revisões: é a chave da idempotência). */
  chave: string;
  severidade: Severidade;
  titulo: string;
  mensagem: string;
  evidencias: Evidencia[];
  /** Achado ATENÇÃO que precisa de justificativa para publicar (ex.: marca "ou similar", art. 41, I). */
  exige_justificativa?: boolean;
  /** Tipo da peça cujo responsável recebe a tarefa (o do passo da peça). */
  tipo_peca_responsavel?: string | null;
  acao?: AcaoAchado;
  /** Este achado não gera tarefa (ex.: assinaturas pendentes — o portal já avisa os signatários). */
  sem_tarefa?: boolean;
}

export interface PecaConformidade {
  documento_id: string;
  tipo: string;
  titulo: string;
  versao: number;
  status: string;
  origem: string;
  anexada: boolean;
  /** Dia da peça (AAAA-MM-DD, Brasília) — `data_documento` da Entrega 1. */
  data_documento: string | null;
  folha_inicial: number | null;
  folha_final: number | null;
  nao_se_aplica: boolean;
  /** Seções (peça feita no sistema). */
  secoes: Record<string, string>;
  /** Texto por página (anexada) ou por seção (feita aqui). */
  paginas: PaginaDeTexto[];
  /** Peça anexada cujo PDF não deu texto (sem OCR — a IA sobre PDFs é a Entrega 7). */
  sem_texto: boolean;
  /** Impressão do texto (compara duas peças "do mesmo tipo"). */
  impressao: string | null;
  exige_assinatura: boolean;
  signatarios_faltantes: string[];
  desatualizada: { texto: string; motivo?: string } | null;
  justificativa_marca: string | null;
  /** Origem externa (aba Documentos) — `documentos_licitacao.id`. */
  id_externo?: string | null;
}

/** Documento da aba Documentos de um tipo de peça, que NÃO virou a peça (juntado de novo). */
export interface AnexoAvulso {
  documento_id: string;
  tipo: string;
  titulo: string;
  impressao: string | null;
  data_documento: string | null;
}

export interface Cronograma {
  data_publicacao_edital: string | null;
  data_inicio_acolhimento: string | null;
  data_fim_acolhimento: string | null;
  data_abertura_sessao: string | null;
}

export interface ContextoConformidade {
  /** Hoje (AAAA-MM-DD, Brasília) e o instante da revisão. */
  hoje: string;
  agora: Date;
  processo: {
    id: string;
    orgao_id: string;
    numero_processo: string;
    numero_dispensa: string | null;
    objeto: string;
    modalidade: string;
    tipo_contratacao: string | null;
    criterio_julgamento: string | null;
    regime_execucao: string | null;
    natureza_objeto: string | null;
    fase: string;
    situacao: string | null;
    contratacao_direta: boolean;
    selecao_externa: boolean;
    /** Código (`ART75_II`...) e a referência ("art. 75, II"). */
    fundamento_legal: string | null;
    fundamento_referencia: string | null;
    /** Inciso do art. 75 do processo ('II') — null fora do art. 75. */
    inciso_art75: string | null;
    sigiloso: boolean;
    justificativa_sigilo: string | null;
    valor_estimado: number | null;
    exercicio: number;
    cronograma: Cronograma;
    /** Data pretendida da contratação (DFD), se informada. */
    data_pretendida: string | null;
    /** Dispensa: com (true) ou sem (false) disputa de lances — escolha do processo (Entrega 5); null fora da dispensa. */
    dispensa_com_lances?: boolean | null;
    /** O regulamento local do órgão adota a IN SEGES 67/2021? */
    regulamento_adota_in67?: boolean;
  };
  /** Instrução do processo (`getInstrucao().itens`). */
  instrucao: LinhaInstrucaoPortao[];
  /** Peças ATIVAS (versão atual; pode haver mais de uma do mesmo tipo — DUP-01). */
  pecas: PecaConformidade[];
  anexos_avulsos: AnexoAvulso[];
  pesquisa: {
    metodo: 'MENOR' | 'MEDIA' | 'MEDIANA' | null;
    justificativa_metodo: string | null;
    publicacao_prevista: string | null;
    itens: ItemPesquisaPrecos[];
  } | null;
  reserva: {
    status: string;
    exercicio_base: number | null;
    linhas: Array<{ exercicio: number; valor: number; situacao: string }>;
    /** Números das leis escolhidas na tabela única (ex.: { LDO: '1140/2024' }). */
    leis: Partial<Record<'LDO' | 'LOA' | 'PPA', string>>;
    documento_id: string | null;
  } | null;
  limite: ConsumoDoLimiteProcesso | null;
  calendario: CalendarioDiasUteis;
  /** Ato que está para ser praticado (avaliação do portão) — ausente na revisão comum. */
  ato_pretendido?: AtoProtegido | null;
}

export interface Regra {
  codigo: string;
  descricao: string;
  severidade: Severidade;
  etapa: EtapaRegra;
  portao: Portao;
  /**
   * A regra já é garantida pela pré-condição do próprio ato (ex.: PRAZO-01 =
   * `prazosDePublicacao` com as datas do pedido; A72-VIII = instrução
   * obrigatória): o portão não a repete como pendência (mesma regra, uma
   * mensagem só).
   */
  garantida_no_ato?: boolean;
  /** Achado desta regra não gera tarefa (a peça pendente já é a tarefa da etapa). */
  sem_tarefa?: boolean;
  /** null = aplica; texto = por que não se aplica a este processo agora. */
  aplicavel?: (ctx: ContextoConformidade) => string | null;
  avaliar: (ctx: ContextoConformidade) => AchadoCalculado[];
}

export interface AvaliacaoRegra {
  regra: Regra;
  aplicavel: boolean;
  motivo: string | null;
  achados: AchadoCalculado[];
  erro?: string;
}
