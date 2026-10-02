import { TipoProcesso } from '../entities/processo.entity';

/**
 * ETAPAS PADRÃO dos processos sem fluxo desenhado (ADITIVO, RENOVACAO).
 * Cada etapa, exceto a última (RESULTADO), conclui quando uma peça é juntada
 * aos autos com a chave da etapa; o RESULTADO conclui quando o termo é
 * cadastrado e ligado ao processo. O construtor de fluxo genérico (por tipo)
 * substituirá isto depois — a forma de leitura fica a mesma.
 */
export interface EtapaPadrao {
  chave: string;
  rotulo: string;
  /** Palavras (sem acento, minúsculas) para sugerir o setor que costuma fazer a etapa. */
  setor_palavras: string[];
  tipo_peca: string | null;
  titulo_peca: string | null;
  resultado?: boolean;
}

const TIPOS_COM_ETAPAS_PADRAO: TipoProcesso[] = [TipoProcesso.ADITIVO, TipoProcesso.RENOVACAO];

const COMUNS: EtapaPadrao[] = [
  { chave: 'RESERVA', rotulo: 'Reserva de recurso', setor_palavras: ['orcament', 'financ', 'contabil'], tipo_peca: 'RESERVA_DOTACAO', titulo_peca: 'Reserva de dotação orçamentária' },
  { chave: 'PARECER', rotulo: 'Parecer jurídico', setor_palavras: ['juridic', 'procurad'], tipo_peca: 'PARECER_PROCESSO', titulo_peca: 'Parecer jurídico' },
  { chave: 'AUTORIZACAO', rotulo: 'Autorização', setor_palavras: ['gabinete', 'secretari', 'presidencia', 'autoridade'], tipo_peca: 'AUTORIZACAO_PROCESSO', titulo_peca: 'Autorização da autoridade competente' },
];

const ETAPAS: Partial<Record<TipoProcesso, EtapaPadrao[]>> = {
  [TipoProcesso.ADITIVO]: [
    { chave: 'PEDIDO', rotulo: 'Pedido', setor_palavras: ['contrato', 'gestao', 'compras'], tipo_peca: 'PEDIDO_ADITIVO', titulo_peca: 'Pedido de aditivo e justificativa' },
    ...COMUNS,
    { chave: 'TERMO', rotulo: 'Termo aditivo', setor_palavras: ['contrato', 'compras', 'licitac'], tipo_peca: null, titulo_peca: null, resultado: true },
  ],
  [TipoProcesso.RENOVACAO]: [
    { chave: 'VANTAJOSIDADE', rotulo: 'Vantajosidade', setor_palavras: ['contrato', 'gestao', 'compras'], tipo_peca: 'VANTAJOSIDADE', titulo_peca: 'Demonstração de vantajosidade da renovação' },
    ...COMUNS,
    { chave: 'TERMO', rotulo: 'Termo de renovação', setor_palavras: ['contrato', 'compras', 'licitac'], tipo_peca: null, titulo_peca: null, resultado: true },
  ],
};

export function temEtapasPadrao(tipo: TipoProcesso): boolean {
  return TIPOS_COM_ETAPAS_PADRAO.includes(tipo);
}

export function etapasPadraoDe(tipo: TipoProcesso): EtapaPadrao[] {
  return ETAPAS[tipo] ?? [];
}

export type EstadoEtapa = 'CONCLUIDA' | 'ATUAL' | 'FUTURA';

export interface EtapaCalculada extends EtapaPadrao {
  ordem: number;
  estado: EstadoEtapa;
}

/**
 * Estado de cada etapa: concluídas (peça juntada / resultado ligado), a ATUAL
 * (a primeira não concluída) e as futuras. Processo encerrado não tem atual.
 */
export function calcularEtapas(
  tipo: TipoProcesso,
  chavesComPeca: ReadonlySet<string>,
  temResultado: boolean,
  encerrado = false,
): EtapaCalculada[] {
  let achouAtual = false;
  return etapasPadraoDe(tipo).map((e, i) => {
    const feita = e.resultado ? temResultado : chavesComPeca.has(e.chave);
    let estado: EstadoEtapa;
    if (feita) estado = 'CONCLUIDA';
    else if (!achouAtual && !encerrado) {
      estado = 'ATUAL';
      achouAtual = true;
    } else estado = 'FUTURA';
    return { ...e, ordem: i + 1, estado };
  });
}

export function etapaAtual(etapas: EtapaCalculada[]): EtapaCalculada | null {
  return etapas.find((e) => e.estado === 'ATUAL') ?? null;
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Setor do órgão que melhor combina com as palavras da etapa (por ordem de palavra); null se nenhum. */
export function sugerirSetor<T extends { id: string; nome: string }>(palavras: string[], setores: T[]): T | null {
  for (const palavra of palavras) {
    const achado = setores.find((s) => semAcento(s.nome).includes(palavra));
    if (achado) return achado;
  }
  return null;
}
