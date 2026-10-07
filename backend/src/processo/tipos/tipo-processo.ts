import { TipoProcesso } from '../entities/processo.entity';

/**
 * CONTRATO DE "TIPO DE PROCESSO".
 *
 * Cada tipo declara, em código, o que o motor genérico precisa saber para
 * conduzir um processo daquele tipo:
 *  - o CATÁLOGO de documentos (o que uma etapa pode produzir);
 *  - os CAMPOS disponíveis para a condição do fluxo desenhado;
 *  - os REQUISITOS legais (o que o fluxo não pode pular);
 *  - os GANCHOS (o que acontece quando a última etapa conclui).
 *
 * Quais tipos existem, o rótulo e se estão disponíveis ficam em DADOS
 * (`tipos_processo`, entity `TipoProcessoRegistro`). Aqui só o "como".
 *
 * Nesta etapa só CONTRATACAO está implementado, delegando ao que já existe na
 * fase interna. ADITIVO, RENOVACAO, PAGAMENTO e AVULSO são esqueleto.
 */

export interface DocumentoDoCatalogo {
  /** Código curto (DFD, ETP, TR…); é o `tipo` em `documentos_fase_interna` na CONTRATACAO. */
  codigo: string;
  titulo: string;
  /** Etapa (código do catálogo de etapas) que costuma produzir o documento, se houver. */
  etapa: string | null;
  fundamento: string | null;
}

export interface CampoCondicao {
  campo: string;
  rotulo: string;
  operadores: ReadonlyArray<string>;
  /** Tipo do valor esperado (numero, texto, opcao) ou null (manual). */
  valor: string | null;
  opcoes?: ReadonlyArray<string>;
}

export interface RequisitoDoTipo {
  codigo: string;
  tipo: string;
  etapa: string;
  outra_etapa: string | null;
  fundamento: string;
  mensagem: string;
  ativo: boolean;
}

/** Processo já aberto, como o gancho o recebe. */
export interface ProcessoParaGancho {
  id: string;
  orgao_id: string;
  tipo: TipoProcesso;
  numero: string;
  referencia_tipo: string | null;
  referencia_id: string | null;
}

export interface DefinicaoTipoProcesso {
  tipo: TipoProcesso;
  rotulo: string;
  descricao: string;
  /** Tabela de conteúdo (LICITACAO…) ou null quando o processo não tem objeto de conteúdo próprio. */
  referencia_tipo: string | null;
  /** Já funciona no sistema. Esqueleto → `false` (toda operação recusa com mensagem clara). */
  implementado: boolean;
  /** Pode ser aberto diretamente por `POST /processos` (sem passar pelo objeto de conteúdo). */
  abertura_direta: boolean;
  /** Usa o fluxo desenhado (construtor). O AVULSO não tem fluxo. */
  tem_fluxo: boolean;
  catalogoDocumentos(): DocumentoDoCatalogo[];
  camposCondicao(): CampoCondicao[];
  requisitosLegais(): Promise<RequisitoDoTipo[]>;
  /** O que acontece quando a última etapa do fluxo conclui. */
  aoConcluirUltimaEtapa(processo: ProcessoParaGancho): Promise<void>;
}

/** Ordem de apresentação e semente do registro em dados. */
export const ORDEM_TIPOS: TipoProcesso[] = [
  TipoProcesso.CONTRATACAO,
  TipoProcesso.AVULSO,
  TipoProcesso.OFICIO,
  TipoProcesso.ADITIVO,
  TipoProcesso.RENOVACAO,
  TipoProcesso.PAGAMENTO,
];

/** Esqueleto de tipo ainda não implementado: tudo vazio, ganchos inertes. */
export function esqueletoDeTipo(
  tipo: TipoProcesso,
  rotulo: string,
  descricao: string,
  referencia_tipo: string | null,
): DefinicaoTipoProcesso {
  return {
    tipo,
    rotulo,
    descricao,
    referencia_tipo,
    implementado: false,
    abertura_direta: false,
    tem_fluxo: true,
    catalogoDocumentos: () => [],
    camposCondicao: () => [],
    requisitosLegais: async () => [],
    aoConcluirUltimaEtapa: async () => undefined,
  };
}

/**
 * Processo AVULSO: sem fluxo e sem objeto de conteúdo. Nesta etapa só a
 * autuação (abrir, obter, listar); tramitação e juntada de documentos do
 * avulso ficam para a próxima etapa (as tabelas ainda exigem `licitacao_id`).
 */
export function definicaoAvulso(): DefinicaoTipoProcesso {
  return {
    tipo: TipoProcesso.AVULSO,
    rotulo: 'Processo avulso',
    descricao: 'Processo sem fluxo desenhado: só autuação, tramitação e juntada de documentos (feitos no sistema ou anexados).',
    referencia_tipo: null,
    implementado: true,
    abertura_direta: true,
    tem_fluxo: false,
    catalogoDocumentos: () => [],
    camposCondicao: () => [],
    requisitosLegais: async () => [],
    aoConcluirUltimaEtapa: async () => undefined,
  };
}

/**
 * OFÍCIO: processo livre (sem fluxo desenhado) — escreve, assina e envia. O
 * número do ofício sai ao juntar o documento (sequência do setor, por ano).
 */
export function definicaoOficio(): DefinicaoTipoProcesso {
  return {
    tipo: TipoProcesso.OFICIO,
    rotulo: 'Ofício',
    descricao: 'Escreve, assina e envia para outro setor. O número sai na sequência do setor ao enviar.',
    referencia_tipo: null,
    implementado: true,
    abertura_direta: true,
    tem_fluxo: false,
    catalogoDocumentos: () => [{ codigo: 'OFICIO', titulo: 'Ofício', etapa: null, fundamento: null }],
    camposCondicao: () => [],
    requisitosLegais: async () => [],
    aoConcluirUltimaEtapa: async () => undefined,
  };
}

/**
 * Processo de ADITIVO: nasce ligado a um contrato (`processos.contrato_id`) e
 * o resultado é o termo aditivo cadastrado (referência TERMO_ADITIVO). Nesta
 * etapa só a autuação e a ligação com o termo; tramitação, peças e fluxo do
 * aditivo entram com a tela do processo (as tabelas ainda exigem `licitacao_id`).
 * O cadastro do aditivo e seus efeitos no contrato seguem como sempre.
 */
export function definicaoAditivo(): DefinicaoTipoProcesso {
  return {
    tipo: TipoProcesso.ADITIVO,
    rotulo: 'Termo aditivo',
    descricao: 'Aditivo de contrato (prazo, valor, objeto) ou apostilamento: processo ligado ao contrato, cujo resultado é o termo cadastrado.',
    referencia_tipo: 'TERMO_ADITIVO',
    implementado: true,
    abertura_direta: true,
    tem_fluxo: false,
    catalogoDocumentos: () => [],
    camposCondicao: () => [],
    requisitosLegais: async () => [],
    aoConcluirUltimaEtapa: async () => undefined,
  };
}

/**
 * Processo de RENOVACAO: mesma mecânica do aditivo (nasce ligado ao contrato;
 * o resultado é o termo cadastrado). A renovação, no cadastro atual, é um termo
 * com `renovacao_ciclo = true`; o vínculo só aceita esse termo.
 */
export function definicaoRenovacao(): DefinicaoTipoProcesso {
  return {
    ...definicaoAditivo(),
    tipo: TipoProcesso.RENOVACAO,
    rotulo: 'Renovação de contrato',
    descricao: 'Renovação/prorrogação do contrato: processo ligado ao contrato, cujo resultado é o termo de renovação cadastrado.',
  };
}

/** Lista fixa dos esqueletos (o registro em dados nasce daqui). */
export function esqueletosFuturos(): DefinicaoTipoProcesso[] {
  return [
    esqueletoDeTipo(TipoProcesso.PAGAMENTO, 'Pagamento', 'Liquidação e pagamento de medição/nota — próxima etapa.', 'MEDICAO'),
  ];
}
