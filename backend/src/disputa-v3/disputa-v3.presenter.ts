import { ItemDisputa } from '../disputa-v2/disputa.service';
import {
  EtapaSessao,
  SessaoDisputa,
  StatusSessao,
} from '../sessao/entities/sessao-disputa.entity';

export type DisputaV3Modo =
  | 'ABERTO'
  | 'ABERTO_FECHADO'
  | 'FECHADO_ABERTO'
  | 'FECHADO';
export type DisputaV3Status =
  | 'AGENDADA'
  | 'EM_SESSAO'
  | 'SUSPENSA'
  | 'ENCERRADA'
  | 'CANCELADA';
export type DisputaV3Etapa =
  | 'ABERTURA'
  | 'ANALISE_PROPOSTAS'
  | 'DISPUTA'
  | 'NEGOCIACAO'
  | 'HABILITACAO'
  | 'BENEFICIO_MPE'
  | 'RECURSOS'
  | 'ADJUDICACAO'
  | 'HOMOLOGACAO'
  | 'ENCERRAMENTO';

export interface DisputaV3Cronometria {
  modo: DisputaV3Modo;
  baseLegal: string;
  intervaloMinimoLancesMinutos: number;
  /** Art. 56, §3º - Decremento minimo entre lances conforme edital */
  diferencaMinimaLances?: number;
  etapaAbertaMinutos?: number;
  janelaGatilhoProrrogacaoMinutos?: number;
  duracaoProrrogacaoMinutos?: number;
  fechamentoIminenteAleatorioMaxMinutos?: number;
  lanceFinalFechadoMinutos?: number;
  faixaClassificacaoPercentual?: number;
  usaTempoAleatorioNoModoAberto: boolean;
  requerFluxoEspecificoNaV3: boolean;
  observacao?: string;
}

export interface DisputaV3Contexto {
  id: string;
  licitacaoId: string;
  status: DisputaV3Status;
  etapa: {
    codigo: DisputaV3Etapa;
    origem: EtapaSessao;
  };
  modo: DisputaV3Modo;
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
  cronometria: DisputaV3Cronometria;
  licitacao: {
    id: string;
    numero: string | null;
    processo: string | null;
    objeto: string;
  } | null;
}

export interface DisputaV3ItemBoard {
  id: string;
  numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valorReferencia: number;
  status: ItemDisputa['status'];
  cronometro: {
    tempoRestanteSegundos: number;
    fase: 'ETAPA_ABERTA' | 'PRORROGACAO' | 'ENCERRADO';
  };
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
}

export function inferirModoDisputaV3(
  sessao: Pick<SessaoDisputa, 'modo_aberto' | 'modo_aberto_fechado'>,
): DisputaV3Modo {
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

export function mapearStatusSessaoV3(status: StatusSessao): DisputaV3Status {
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

export function mapearEtapaSessaoV3(etapa: EtapaSessao): DisputaV3Etapa {
  switch (etapa) {
    case EtapaSessao.ANALISE_PROPOSTAS:
    case EtapaSessao.DESCLASSIFICACAO_PROPOSTAS:
      return 'ANALISE_PROPOSTAS';
    case EtapaSessao.DISPUTA_LANCES:
    case EtapaSessao.RANDOM_ENCERRAMENTO:
      return 'DISPUTA';
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

export function montarCronometriaSessaoV3(
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
): DisputaV3Cronometria {
  const modo = inferirModoDisputaV3(sessao);
  const decremento = diferencaMinimaLances && diferencaMinimaLances > 0
    ? diferencaMinimaLances
    : undefined;

  if (modo === 'ABERTO') {
    return {
      modo,
      baseLegal: 'IN SEGES/ME 73/2022, art. 23',
      intervaloMinimoLancesMinutos: sessao.intervalo_minimo_lances_minutos,
      diferencaMinimaLances: decremento,
      etapaAbertaMinutos: sessao.tempo_inatividade_minutos,
      janelaGatilhoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      duracaoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      usaTempoAleatorioNoModoAberto: false,
      requerFluxoEspecificoNaV3: false,
      observacao:
        'Na V3, o modo aberto deve ser tratado como etapa aberta de duracao fixa com prorrogacao automatica sucessiva.',
    };
  }

  if (modo === 'ABERTO_FECHADO') {
    // Defaults conforme IN SEGES/ME 73/2022, art. 24; sobrescritos pela sessao quando configurados
    return {
      modo,
      baseLegal: 'IN SEGES/ME 73/2022, art. 24',
      intervaloMinimoLancesMinutos: sessao.intervalo_minimo_lances_minutos,
      diferencaMinimaLances: decremento,
      etapaAbertaMinutos: sessao.etapa_aberta_minutos_hibrido ?? sessao.tempo_inatividade_minutos ?? 15,
      fechamentoIminenteAleatorioMaxMinutos: sessao.tempo_aleatorio_max_minutos ?? 10,
      lanceFinalFechadoMinutos: sessao.lance_final_fechado_minutos ?? 5,
      usaTempoAleatorioNoModoAberto: false,
      requerFluxoEspecificoNaV3: true,
      observacao:
        'Este modo exige frontend e motor proprios na V3 para fechamento iminente e lance final fechado.',
    };
  }

  if (modo === 'FECHADO_ABERTO') {
    // Defaults conforme IN SEGES/ME 73/2022, art. 25; sobrescritos pela sessao quando configurados
    return {
      modo,
      baseLegal: 'IN SEGES/ME 73/2022, art. 25',
      intervaloMinimoLancesMinutos: sessao.intervalo_minimo_lances_minutos,
      diferencaMinimaLances: decremento,
      faixaClassificacaoPercentual: 10,
      etapaAbertaMinutos: sessao.etapa_aberta_minutos_hibrido ?? sessao.tempo_inatividade_minutos ?? 10,
      janelaGatilhoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      duracaoProrrogacaoMinutos: sessao.tempo_prorrogacao_minutos,
      usaTempoAleatorioNoModoAberto: false,
      requerFluxoEspecificoNaV3: true,
      observacao:
        'Este modo exige classificacao previa automatica para a etapa aberta e fluxo especifico na V3.',
    };
  }

  return {
    modo,
    baseLegal: 'Lei 14.133/2021, art. 56',
    intervaloMinimoLancesMinutos: sessao.intervalo_minimo_lances_minutos,
    diferencaMinimaLances: decremento,
    usaTempoAleatorioNoModoAberto: false,
    requerFluxoEspecificoNaV3: true,
    observacao:
      'Modo fechado nao utiliza cronometria de lances publicos; a V3 deve trata-lo com experiencia dedicada.',
  };
}

export function montarContextoSessaoV3(
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
    } | null;
  },
): DisputaV3Contexto {
  return {
    id: sessao.id,
    licitacaoId: sessao.licitacao_id,
    status: mapearStatusSessaoV3(sessao.status),
    etapa: {
      codigo: mapearEtapaSessaoV3(sessao.etapa),
      origem: sessao.etapa,
    },
    modo: inferirModoDisputaV3(sessao),
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
    cronometria: montarCronometriaSessaoV3(
      sessao,
      sessao.licitacao?.diferenca_minima_lances,
    ),
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

export function mapearItemBoardV3(item: ItemDisputa): DisputaV3ItemBoard {
  return {
    id: item.id,
    numero: item.numero,
    descricao: item.descricao,
    quantidade: item.quantidade,
    unidade: item.unidade,
    valorReferencia: item.valorReferencia,
    status: item.status,
    cronometro: {
      tempoRestanteSegundos:
        item.status === 'EM_DISPUTA' ? item.tempoRestante : 0,
      fase:
        item.status !== 'EM_DISPUTA'
          ? 'ENCERRADO'
          : item.emProrrogacao
            ? 'PRORROGACAO'
            : 'ETAPA_ABERTA',
    },
    melhorLance: item.melhorLance,
    totalPropostas: item.totalPropostas,
    totalLances: item.totalLances,
    meuMelhorLance: item.meuMelhorLance ?? null,
    minhaPosicao: item.minhaPosicao ?? null,
    minhaPropostaInicial: item.minhaPropostaInicial ?? null,
  };
}
