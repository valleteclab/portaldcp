/**
 * ============================================================================
 * RELÓGIO DA DISPUTA — ÚNICA fórmula de tempo restante (plano E2 item 3)
 * ============================================================================
 *
 * Quem usa: DisputaTimerService (encerra itens), DisputaService (board/itens),
 * admin/monitoramento. Nenhum outro lugar calcula tempo restante.
 *
 * MODO ABERTO (IN SEGES 73/2022 art. 23; Lei 14.133 art. 56):
 *  - etapa inicial de `tempoInicialMs` (10 min);
 *  - lance nos últimos `prorrogacaoMs` (2 min) prorroga por `prorrogacaoMs`
 *    a partir do lance, sucessivamente;
 *  - sem lance na prorrogação (ou nos últimos 2 min da etapa inicial), encerra.
 *  O modo aberto NÃO usa tempo aleatório (IN 73 art. 23).
 *
 * TEMPO_ALEATORIO (gancho para o motor de modos — aberto-fechado, IN 73 art.
 * 24 §1º "até dez minutos aleatoriamente determinado pelo sistema"): o item
 * em status TEMPO_ALEATORIO encerra quando `inicioAleatorio + sorteadoMs`
 * passa. Quem sorteia e muda o status é a estratégia do modo.
 */

export type FaseRelogio = 'ETAPA_ABERTA' | 'PRORROGACAO' | 'TEMPO_ALEATORIO' | 'ENCERRADO';

export interface EntradaRelogio {
  status: string | null | undefined;
  disputaIniciadaEm: Date | string | null | undefined;
  ultimoLanceEm: Date | string | null | undefined;
  tempoInicialMinutos: number;
  prorrogacaoMinutos: number;
  /** Status TEMPO_ALEATORIO: início e duração sorteada (segundos). */
  inicioTempoAleatorio?: Date | string | null;
  tempoAleatorioSorteadoSegundos?: number | null;
  agora?: number;
}

export interface SaidaRelogio {
  fase: FaseRelogio;
  restanteMs: number;
  /** Inteiro, arredondado para baixo (o que a tela mostra). */
  restanteSegundos: number;
  emProrrogacao: boolean;
  /** O relógio já chegou a zero — o timer deve encerrar o item. */
  expirado: boolean;
}

const ms = (d: Date | string | null | undefined): number | null => (d ? new Date(d).getTime() : null);

function saida(fase: FaseRelogio, restanteMs: number): SaidaRelogio {
  const r = Math.max(0, restanteMs);
  return {
    fase: r > 0 ? fase : 'ENCERRADO',
    restanteMs: r,
    restanteSegundos: Math.floor(r / 1000),
    emProrrogacao: r > 0 && fase === 'PRORROGACAO',
    expirado: r <= 0,
  };
}

export function calcularRelogio(e: EntradaRelogio): SaidaRelogio {
  const agora = e.agora ?? Date.now();

  if (e.status === 'TEMPO_ALEATORIO') {
    const inicio = ms(e.inicioTempoAleatorio);
    const dur = Number(e.tempoAleatorioSorteadoSegundos) * 1000;
    if (inicio === null || !(dur > 0)) return saida('TEMPO_ALEATORIO', 0);
    return saida('TEMPO_ALEATORIO', inicio + dur - agora);
  }
  if (e.status !== 'EM_DISPUTA') {
    return { fase: 'ENCERRADO', restanteMs: 0, restanteSegundos: 0, emProrrogacao: false, expirado: false };
  }

  const T = Math.max(0, Number(e.tempoInicialMinutos) || 0) * 60_000;
  const P = Math.max(0, Number(e.prorrogacaoMinutos) || 0) * 60_000;
  const inicio = ms(e.disputaIniciadaEm) ?? agora;
  const ultimo = ms(e.ultimoLanceEm) ?? inicio;
  const decorrido = agora - inicio;
  const momentoUltimo = ultimo - inicio;

  // Etapa inicial, sem lance na janela final (últimos P min) ainda
  if (decorrido < T && momentoUltimo < T - P) {
    return saida('ETAPA_ABERTA', T - decorrido);
  }
  // Janela final/prorrogação: P a partir do último lance (ou do fim da etapa, se não houve lance nela)
  const fimProrrogacao = Math.max(ultimo + P, momentoUltimo < T - P ? inicio + T : ultimo + P);
  return saida('PRORROGACAO', fimProrrogacao - agora);
}
