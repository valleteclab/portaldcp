import { ItemDisputa } from '../disputa.service';
import {
  EtapaSessao,
  SessaoDisputa,
  StatusSessao,
} from '../../sessao/entities/sessao-disputa.entity';

export type SalaModo =
  | 'ABERTO'
  | 'ABERTO_FECHADO'
  | 'FECHADO_ABERTO'
  | 'FECHADO';
export type SalaStatus =
  | 'AGENDADA'
  | 'EM_SESSAO'
  | 'SUSPENSA'
  | 'ENCERRADA'
  | 'CANCELADA';
export type SalaEtapa =
  | 'ABERTURA'
  | 'ANALISE_PROPOSTAS'
  | 'DISPUTA'
  | 'ACEITACAO'
  | 'NEGOCIACAO'
  | 'HABILITACAO'
  | 'BENEFICIO_MPE'
  | 'RECURSOS'
  | 'ADJUDICACAO'
  | 'HOMOLOGACAO'
  | 'ENCERRAMENTO';

export interface SalaCronometria {
  modo: SalaModo;
  baseLegal: string;
  intervaloMinimoLancesMinutos: number;
  /** Art. 56, §3º - Decremento minimo entre lances conforme edital */
  diferencaMinimaLances?: number;
  /** VALOR (R$ na base do lance) ou PERCENTUAL */
  tipoDiferencaMinimaLances?: 'VALOR' | 'PERCENTUAL';
  /** Unidade dos lances: UNITARIO | TOTAL_ITEM | TOTAL_LOTE */
  baseLance?: string;
  etapaAbertaMinutos?: number;
  janelaGatilhoProrrogacaoMinutos?: number;
  duracaoProrrogacaoMinutos?: number;
  fechamentoIminenteAleatorioMaxMinutos?: number;
  lanceFinalFechadoMinutos?: number;
  faixaClassificacaoPercentual?: number;
  usaTempoAleatorioNoModoAberto: boolean;
  /** Mantido por compatibilidade: todos os modos rodam no motor único (sempre false). */
  requerFluxoEspecificoNaV3: boolean;
  /** Fases do modo, na ordem (para a tela mostrar a jornada). */
  fases?: string[];
  observacao?: string;
}

export interface SalaContexto {
  id: string;
  licitacaoId: string;
  status: SalaStatus;
  etapa: {
    codigo: SalaEtapa;
    origem: EtapaSessao;
  };
  modo: SalaModo;
  /** Critério de julgamento (menor preço, maior desconto, maior lance...). */
  criterioJulgamento?: string | null;
  disputaPorItem: boolean;
  pregoeiro: {
    id: string | null;
    nome: string | null;
  };
  operacao: {
    chatHabilitado: boolean;
    anonimizacaoAtiva: boolean;
    suspensa: boolean;
    motivoSuspensao: string | null;
  };
  cronometria: SalaCronometria;
  licitacao: {
    id: string;
    numero: string | null;
    processo: string | null;
    objeto: string;
  } | null;
}

export interface SalaItemBoard {
  id: string;
  numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  /** Na unidade da base do lance (comparável com os lances). */
  valorReferencia: number;
  valorReferenciaUnitario?: number;
  baseLance?: string;
  status: ItemDisputa['status'];
  cronometro: {
    tempoRestanteSegundos: number;
    fase: 'ETAPA_ABERTA' | 'PRORROGACAO' | 'TEMPO_ALEATORIO' | 'LANCE_FECHADO' | 'ENCERRADO';
    /** Tempo aleatório: o restante é sigiloso (IN 73 art. 24 §1º) — a tela não mostra contagem. */
    oculto?: boolean;
  };
  /** Modo e fase do item (motor de modos — E2.4). */
  modoDisputa?: string;
  /** AGUARDANDO | ABERTA | ALEATORIO | FECHADA | REINICIO_DEMAIS | ENCERRADA */
  faseModo?: string;
  fimFaseEm?: string | null;
  participacaoRestrita?: boolean;
  classificadosFase?: number | null;
  possoDarLance?: boolean;
  meuLanceFechado?: number | null;
  lancesFechadosRecebidos?: number | null;
  valorPrimeiraColocacao?: number | null;
  melhorLance?: {
    valor: number;
    fornecedorId: string;
    fornecedorNome: string;
  };
  totalPropostas: number;
  totalLances: number;
  meuMelhorLance?: number | null;
  minhaPosicao?: number | null;
  minhaPropostaInicial?: number | null;
  /** Unidade de disputa: LOTE na disputa por lote (base TOTAL_LOTE); ausente = item. */
  tipoUnidade?: ItemDisputa['tipoUnidade'];
  /** LOTE: itens do lote (o valor global do lote vai em `valorReferencia` e nos lances). */
  itensDoLote?: ItemDisputa['itensDoLote'];
  /** LOTE, visão do fornecedor: cotou todos os itens (senão não disputa o lote). */
  elegivel?: boolean;
  itensNaoCotados?: number[];
}

const MODOS_SALA: SalaModo[] = ['ABERTO', 'ABERTO_FECHADO', 'FECHADO_ABERTO', 'FECHADO'];

/**
 * Modo da disputa. Fonte: `licitacao.modo_disputa` (Lei 14.133 art. 56); os
 * booleanos `modo_aberto`/`modo_aberto_fechado` da sessão são legado e só
 * valem quando a licitação não vem junto.
 */
export function inferirModoDisputa(
  sessao: Pick<SessaoDisputa, 'modo_aberto' | 'modo_aberto_fechado'>,
  modoDaLicitacao?: string | null,
): SalaModo {
  if (modoDaLicitacao && (MODOS_SALA as string[]).includes(modoDaLicitacao)) return modoDaLicitacao as SalaModo;
  if (sessao.modo_aberto && sessao.modo_aberto_fechado) {
    return 'ABERTO_FECHADO';
  }

  if (!sessao.modo_aberto && sessao.modo_aberto_fechado) {
    return 'FECHADO_ABERTO';
  }

  if (sessao.modo_aberto) {
    return 'ABERTO';
  }

  return 'FECHADO';
}

export function mapearStatusSessao(status: StatusSessao): SalaStatus {
  switch (status) {
    case StatusSessao.SUSPENSA:
      return 'SUSPENSA';
    case StatusSessao.ENCERRADA:
      return 'ENCERRADA';
    case StatusSessao.CANCELADA:
      return 'CANCELADA';
    case StatusSessao.AGUARDANDO_INICIO:
      return 'AGENDADA';
    case StatusSessao.EM_ANDAMENTO:
    case StatusSessao.MODO_ABERTO:
    case StatusSessao.MODO_FECHADO:
    case StatusSessao.RANDOM_ENCERRANDO:
    default:
      return 'EM_SESSAO';
  }
}

export function mapearEtapaSessao(etapa: EtapaSessao): SalaEtapa {
  switch (etapa) {
    case EtapaSessao.ANALISE_PROPOSTAS:
    case EtapaSessao.DESCLASSIFICACAO_PROPOSTAS:
      return 'ANALISE_PROPOSTAS';
    case EtapaSessao.DISPUTA_LANCES:
    case EtapaSessao.RANDOM_ENCERRAMENTO:
      return 'DISPUTA';
    case EtapaSessao.ACEITACAO_PROPOSTA:
      return 'ACEITACAO';
    case EtapaSessao.NEGOCIACAO:
      return 'NEGOCIACAO';
    case EtapaSessao.CONVOCACAO_HABILITACAO:
    case EtapaSessao.ANALISE_HABILITACAO:
      return 'HABILITACAO';
    case EtapaSessao.BENEFICIO_MPE:
      return 'BENEFICIO_MPE';
    case EtapaSessao.INTENCAO_RECURSO:
    case EtapaSessao.PRAZO_RECURSAL:
    case EtapaSessao.ANALISE_RECURSOS:
      return 'RECURSOS';
    case EtapaSessao.ADJUDICACAO:
      return 'ADJUDICACAO';
    case EtapaSessao.HOMOLOGACAO:
      return 'HOMOLOGACAO';
    case EtapaSessao.ENCERRAMENTO:
      return 'ENCERRAMENTO';
    case EtapaSessao.ABERTURA_SESSAO:
    default:
      return 'ABERTURA';
  }
}

export function montarCronometriaSessao(
  sessao: Pick<
    SessaoDisputa,
    | 'modo_aberto'
    | 'modo_aberto_fechado'
    | 'intervalo_minimo_lances_minutos'
    | 'tempo_inatividade_minutos'
    | 'tempo_prorrogacao_minutos'
    | 'tempo_aleatorio_max_minutos'
    | 'etapa_aberta_minutos_hibrido'
    | 'lance_final_fechado_minutos'
  >,
  diferencaMinimaLances?: number | null,
  modoDaLicitacao?: string | null,
): SalaCronometria {
  const modo = inferirModoDisputa(sessao, modoDaLicitacao);
  const decremento = diferencaMinimaLances && diferencaMinimaLances > 0
    ? diferencaMinimaLances
    : undefined;
  const comum = {
    modo,
    intervaloMinimoLancesMinutos: sessao.intervalo_minimo_lances_minutos,
    diferencaMinimaLances: decremento,
    usaTempoAleatorioNoModoAberto: false,
    requerFluxoEspecificoNaV3: false,
  };

  if (modo === 'ABERTO') {
    return {
      ...comum,
      baseLegal: 'IN SEGES/ME 73/2022, art. 23',
      etapaAbertaMinutos: sessao.tempo_inatividade_minutos,
      janelaGatilhoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      duracaoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      fases: ['Etapa aberta', 'Prorrogações automáticas', 'Encerramento automático'],
      observacao:
        `Lances abertos por ${sessao.tempo_inatividade_minutos} min; lance nos últimos ${sessao.tempo_prorrogacao_minutos} min ` +
        `prorroga ${sessao.tempo_prorrogacao_minutos} min, sucessivamente; sem lance na prorrogação, o item encerra. ` +
        'Com diferença de pelo menos 5% entre 1º e 2º, o pregoeiro pode reiniciar a disputa para as demais colocações (Lei 14.133, art. 56 §4º).',
    };
  }

  if (modo === 'ABERTO_FECHADO') {
    // Padrões da IN SEGES/ME 73/2022, art. 24 (15 min, até 10 min aleatórios, 5 min fechado)
    const etapa = sessao.etapa_aberta_minutos_hibrido ?? 15;
    const aleatorioMax = Math.min(10, sessao.tempo_aleatorio_max_minutos ?? 10);
    const fechado = sessao.lance_final_fechado_minutos ?? 5;
    return {
      ...comum,
      baseLegal: 'IN SEGES/ME 73/2022, art. 24',
      etapaAbertaMinutos: etapa,
      fechamentoIminenteAleatorioMaxMinutos: aleatorioMax,
      lanceFinalFechadoMinutos: fechado,
      faixaClassificacaoPercentual: 10,
      fases: ['Etapa aberta', 'Fechamento iminente (tempo aleatório)', 'Lance final fechado', 'Encerrado'],
      observacao:
        `Etapa aberta de ${etapa} min (sem prorrogação) → aviso de fechamento iminente → encerramento em até ${aleatorioMax} min, ` +
        'em momento aleatório (sigiloso) → a melhor oferta e as até 10% dela (mínimo 3; 20% com margem de preferência) enviam UM ' +
        `lance final fechado em ${fechado} min, sigiloso até o fim do prazo → classificação final pelo melhor valor de cada licitante.`,
    };
  }

  if (modo === 'FECHADO_ABERTO') {
    return {
      ...comum,
      baseLegal: 'IN SEGES/ME 73/2022, art. 25',
      faixaClassificacaoPercentual: 10,
      etapaAbertaMinutos: sessao.tempo_inatividade_minutos,
      janelaGatilhoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      duracaoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      fases: ['Propostas fechadas', 'Classificação automática (até 10%, mínimo 3)', 'Etapa aberta', 'Encerrado'],
      observacao:
        'As propostas são a etapa fechada. O sistema classifica automaticamente a melhor e as até 10% dela (mínimo 3; 20% com ' +
        'margem de preferência) para a etapa aberta, com as regras do art. 23; as demais permanecem na classificação pelo valor proposto.',
    };
  }

  return {
    ...comum,
    baseLegal: 'Lei 14.133/2021, art. 56, I',
    fases: ['Propostas fechadas', 'Classificação pelas propostas'],
    observacao:
      'Modo fechado: não há lances — a classificação é feita pelas propostas. Vedado isoladamente com menor preço ou maior desconto (art. 56 §1º).',
  };
}

export function montarContextoSessao(
  sessao: Pick<
    SessaoDisputa,
    | 'id'
    | 'licitacao_id'
    | 'status'
    | 'etapa'
    | 'modo_aberto'
    | 'modo_aberto_fechado'
    | 'disputa_por_item'
    | 'pregoeiro_id'
    | 'pregoeiro_nome'
    | 'chat_desabilitado'
    | 'anonimizacao_ativa'
    | 'motivo_suspensao'
    | 'intervalo_minimo_lances_minutos'
    | 'tempo_inatividade_minutos'
    | 'tempo_prorrogacao_minutos'
    | 'tempo_aleatorio_max_minutos'
    | 'etapa_aberta_minutos_hibrido'
    | 'lance_final_fechado_minutos'
  > & {
    licitacao?: {
      id: string;
      numero_edital?: string | null;
      numero_processo?: string | null;
      objeto: string;
      diferenca_minima_lances?: number | null;
      tipo_diferenca_minima_lances?: 'VALOR' | 'PERCENTUAL' | null;
      base_lance?: string | null;
      modo_disputa?: string | null;
      criterio_julgamento?: string | null;
    } | null;
  },
): SalaContexto {
  return {
    id: sessao.id,
    licitacaoId: sessao.licitacao_id,
    status: mapearStatusSessao(sessao.status),
    etapa: {
      codigo: mapearEtapaSessao(sessao.etapa),
      origem: sessao.etapa,
    },
    modo: inferirModoDisputa(sessao, sessao.licitacao?.modo_disputa),
    criterioJulgamento: sessao.licitacao?.criterio_julgamento ?? null,
    disputaPorItem: sessao.disputa_por_item,
    pregoeiro: {
      id: sessao.pregoeiro_id || null,
      nome: sessao.pregoeiro_nome || null,
    },
    operacao: {
      chatHabilitado: !sessao.chat_desabilitado,
      anonimizacaoAtiva: sessao.anonimizacao_ativa,
      suspensa: sessao.status === StatusSessao.SUSPENSA,
      motivoSuspensao: sessao.motivo_suspensao || null,
    },
    cronometria: {
      ...montarCronometriaSessao(sessao, sessao.licitacao?.diferenca_minima_lances, sessao.licitacao?.modo_disputa),
      tipoDiferencaMinimaLances: sessao.licitacao?.tipo_diferenca_minima_lances || 'VALOR',
      baseLance: sessao.licitacao?.base_lance || 'TOTAL_ITEM',
    },
    licitacao: sessao.licitacao
      ? {
          id: sessao.licitacao.id,
          numero: sessao.licitacao.numero_edital || null,
          processo: sessao.licitacao.numero_processo || null,
          objeto: sessao.licitacao.objeto,
        }
      : null,
  };
}

export function mapearItemBoard(item: ItemDisputa): SalaItemBoard {
  const faseCronometro = (): SalaItemBoard['cronometro']['fase'] => {
    if (item.status !== 'EM_DISPUTA') return 'ENCERRADO';
    if (item.faseModo === 'ALEATORIO') return 'TEMPO_ALEATORIO';
    if (item.faseModo === 'FECHADA') return 'LANCE_FECHADO';
    return item.emProrrogacao ? 'PRORROGACAO' : 'ETAPA_ABERTA';
  };
  return {
    id: item.id,
    numero: item.numero,
    descricao: item.descricao,
    quantidade: item.quantidade,
    unidade: item.unidade,
    valorReferencia: item.valorReferencia,
    valorReferenciaUnitario: item.valorReferenciaUnitario,
    baseLance: item.baseLance,
    status: item.status,
    cronometro: {
      // Tempo aleatório: nunca há contagem (sigiloso)
      tempoRestanteSegundos: item.status === 'EM_DISPUTA' && !item.tempoOculto ? item.tempoRestante : 0,
      fase: faseCronometro(),
      oculto: !!item.tempoOculto,
    },
    melhorLance: item.melhorLance,
    totalPropostas: item.totalPropostas,
    totalLances: item.totalLances,
    meuMelhorLance: item.meuMelhorLance ?? null,
    minhaPosicao: item.minhaPosicao ?? null,
    minhaPropostaInicial: item.minhaPropostaInicial ?? null,
    modoDisputa: item.modoDisputa,
    faseModo: item.faseModo,
    fimFaseEm: item.fimFaseEm ?? null,
    participacaoRestrita: item.participacaoRestrita ?? false,
    classificadosFase: item.classificadosFase ?? null,
    possoDarLance: item.possoDarLance,
    meuLanceFechado: item.meuLanceFechado ?? null,
    lancesFechadosRecebidos: item.lancesFechadosRecebidos ?? null,
    valorPrimeiraColocacao: item.valorPrimeiraColocacao ?? null,
    // Unidade LOTE (disputa por lote)
    ...(item.tipoUnidade ? { tipoUnidade: item.tipoUnidade } : {}),
    ...(item.itensDoLote ? { itensDoLote: item.itensDoLote } : {}),
    ...(item.elegivel !== undefined ? { elegivel: item.elegivel, itensNaoCotados: item.itensNaoCotados ?? [] } : {}),
  };
}
