/**
 * ============================================================================
 * UNIDADE DE DISPUTA — o que tem relógio, status, ranking e lances
 * ============================================================================
 *
 * O motor disputa UNIDADES: o ITEM (base UNITARIO/TOTAL_ITEM) ou o LOTE (base
 * TOTAL_LOTE — `rateio-lote.ts`). As duas guardam o MESMO estado, com os
 * mesmos nomes de coluna (`itens_licitacao` e `lotes_licitacao`):
 *
 *   status_disputa, disputa_iniciada_em, ultimo_lance_em,
 *   inicio_tempo_aleatorio, tempo_aleatorio_sorteado, disputa_encerrada_em,
 *   melhor_lance_valor, melhor_lance_fornecedor_id
 *
 * Por isso relógio (`relogio-disputa.ts`), regras do lance (`modelo-lance.ts`)
 * e as estratégias dos modos (aberto, aberto-fechado… — que só mudam status e
 * tempos) valem para as duas sem cópia: recebem o ESTADO da unidade, não a
 * entidade. Quem grava o estado é o serviço dono da unidade (DisputaService
 * para item, DisputaLoteService para lote); o DisputaTimerService trata as
 * duas pelo mesmo laço (`relogioDaUnidade`).
 *
 * Na sala (board, socket, REST) a unidade é identificada pelo `id` (id do item
 * ou id do lote) — o frontend não precisa saber qual é: `itemId` nas mensagens
 * é "id da unidade". `tipoUnidade` diz o que é, para a tela mostrar o lote.
 */
import { calcularRelogio, SaidaRelogio } from './relogio-disputa';
import { OrigemLance } from './modelo-lance';

export type TipoUnidadeDisputa = 'ITEM' | 'LOTE';

/** Estado de disputa comum a item e lote (colunas homônimas). */
export interface EstadoUnidadeDisputa {
  status_disputa: string | null | undefined;
  disputa_iniciada_em: Date | string | null | undefined;
  ultimo_lance_em: Date | string | null | undefined;
  inicio_tempo_aleatorio?: Date | string | null;
  tempo_aleatorio_sorteado?: number | null;
  disputa_encerrada_em?: Date | string | null;
  melhor_lance_valor?: number | string | null;
  melhor_lance_fornecedor_id?: string | null;
}

/** Tempos do relógio (do resolvedor de parâmetros). */
export interface TemposDisputa {
  tempoInicialMinutos: number;
  prorrogacaoMinutos: number;
}

/** Relógio de QUALQUER unidade (item ou lote) — a fórmula única. */
export function relogioDaUnidade(u: EstadoUnidadeDisputa, tempos: TemposDisputa, agora?: number): SaidaRelogio {
  return calcularRelogio({
    status: u.status_disputa,
    disputaIniciadaEm: u.disputa_iniciada_em,
    ultimoLanceEm: u.ultimo_lance_em,
    tempoInicialMinutos: tempos.tempoInicialMinutos,
    prorrogacaoMinutos: tempos.prorrogacaoMinutos,
    inicioTempoAleatorio: u.inicio_tempo_aleatorio,
    tempoAleatorioSorteadoSegundos: u.tempo_aleatorio_sorteado,
    agora,
  });
}

/** Estado gravado ao abrir a disputa da unidade (modo aberto). */
export function estadoAoIniciar(agora: Date) {
  return {
    status_disputa: 'EM_DISPUTA',
    disputa_iniciada_em: agora,
    ultimo_lance_em: agora,
    inicio_tempo_aleatorio: null,
    tempo_aleatorio_sorteado: null,
    disputa_encerrada_em: null,
  };
}

/** Estado de "volta ao início" (reinício da sessão). */
export const ESTADO_REINICIADO = {
  status_disputa: 'AGUARDANDO',
  disputa_iniciada_em: null,
  disputa_encerrada_em: null,
  ultimo_lance_em: null,
  inicio_tempo_aleatorio: null,
  tempo_aleatorio_sorteado: null,
  melhor_lance_valor: null,
  melhor_lance_fornecedor_id: null,
} as const;

/** Coluna do board (3 abas) a partir do status gravado. */
export function colunaDoStatus(status: string | null | undefined): 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO' {
  if (status === 'EM_DISPUTA' || status === 'TEMPO_ALEATORIO') return 'EM_DISPUTA';
  if (status === 'ENCERRADO' || status === 'NEGOCIACAO') return 'ENCERRADO';
  return 'AGUARDANDO';
}

/**
 * Exclusão direta do próprio lance (IN 73 art. 21 §3º): só lance da etapa
 * aberta, só o ÚLTIMO do fornecedor na unidade, uma única vez por unidade,
 * dentro do prazo do parâmetro. Pura — usada por item e por lote.
 */
export function podeExcluirLanceDireto(
  lance: { id: string; origem: OrigemLance | string; created_at: Date | string },
  ultimoProprioId: string | null,
  jaExcluiu: boolean,
  prazoSegundos: number,
  agora: number,
): { pode: boolean; segundosRestantes: number; motivo?: string } {
  const restante = Math.max(0, Math.floor((new Date(lance.created_at).getTime() + prazoSegundos * 1000 - agora) / 1000));
  if (lance.origem !== OrigemLance.LANCE) return { pode: false, segundosRestantes: 0, motivo: 'Só lances da etapa aberta podem ser excluídos' };
  if (lance.id !== ultimoProprioId) return { pode: false, segundosRestantes: 0, motivo: 'Só o seu último lance pode ser excluído (IN 73 art. 21 §3º)' };
  if (jaExcluiu) return { pode: false, segundosRestantes: 0, motivo: 'A exclusão do próprio lance só pode ser feita uma única vez (IN 73 art. 21 §3º)' };
  if (restante <= 0) return { pode: false, segundosRestantes: 0, motivo: `Prazo de ${prazoSegundos} segundos para exclusão direta expirou. Solicite ao pregoeiro.` };
  return { pode: true, segundosRestantes: restante };
}
