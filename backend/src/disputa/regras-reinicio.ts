/**
 * REINÍCIO DA ETAPA DE LANCES — até quando o pregoeiro pode praticar o ato.
 *
 * A Lei 14.133/2021 não prevê "reabrir" fase já encerrada por conveniência. O
 * que existe é a ANULAÇÃO de ato viciado (autotutela — Súmula 473 do STF; art.
 * 71, III), com aproveitamento do que não foi atingido, e o reinício previsto
 * para a queda do sistema (IN SEGES 73/2022, art. 36). Daí as três situações:
 *
 *  - SIMPLES: lances ainda em curso (ou nem abertos) — basta a justificativa;
 *  - REFORCADO: lances encerrados, licitação em julgamento ou habilitação —
 *    refazer os lances desfaz aceitação e convocações; só se admite como
 *    anulação da etapa por vício, declarada e fundamentada pelo pregoeiro;
 *  - BLOQUEADO: aberto o prazo final de intenção de recurso, ou a licitação
 *    em recurso, adjudicada ou homologada — o desfazimento cabe à autoridade
 *    superior (decisão de recurso ou anulação, art. 71), não à sala.
 */
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { indiceFase } from '../licitacoes/transicoes/fases';

export const TAMANHO_MINIMO_VICIO = 30;

export type ModoReinicio = 'SIMPLES' | 'REFORCADO' | 'BLOQUEADO';

export interface SituacaoReinicio {
  modo: ModoReinicio;
  /** Por que está bloqueado, ou o que o reinício reforçado desfaz. */
  motivo: string | null;
  minimoJustificativa: number;
}

export function situacaoReinicio(e: { fase: string | null | undefined; janelaFinalDeRecursoAberta: boolean }): SituacaoReinicio {
  const i = indiceFase(e.fase);
  if (i >= indiceFase(FaseLicitacao.ADJUDICACAO)) {
    return {
      modo: 'BLOQUEADO',
      motivo:
        'A licitação já foi adjudicada: a etapa de lances não pode mais ser reiniciada pela sala. ' +
        'Havendo vício, o desfazimento cabe à autoridade superior, pela anulação (Lei 14.133/2021, art. 71, III).',
      minimoJustificativa: 0,
    };
  }
  if (i >= indiceFase(FaseLicitacao.RECURSO) || e.janelaFinalDeRecursoAberta) {
    return {
      modo: 'BLOQUEADO',
      motivo:
        'A fase recursal já foi aberta: a etapa de lances não pode mais ser reiniciada pela sala. ' +
        'Vício na disputa é resolvido na decisão do recurso ou pela anulação, pela autoridade superior (Lei 14.133/2021, arts. 165 e 71).',
      minimoJustificativa: 0,
    };
  }
  if (i >= indiceFase(FaseLicitacao.JULGAMENTO)) {
    return {
      modo: 'REFORCADO',
      motivo:
        'A etapa de lances já foi encerrada. Reiniciá-la agora ANULA a etapa: os lances são cancelados (ficam no retrato congelado), ' +
        'e a aceitação das propostas e as convocações em curso são desfeitas. Só cabe por vício que comprometa a disputa ' +
        '(Súmula 473 do STF; Lei 14.133/2021, art. 71, III), e o ato fica registrado na ata como anulação.',
      minimoJustificativa: TAMANHO_MINIMO_VICIO,
    };
  }
  return { modo: 'SIMPLES', motivo: null, minimoJustificativa: 1 };
}

/** Motivo da recusa (ou null) para o pedido de reinício, na situação dada. */
export function motivoReinicioRecusado(s: SituacaoReinicio, pedido: { justificativa: string; confirmaVicio?: boolean }): string | null {
  if (s.modo === 'BLOQUEADO') return s.motivo;
  const texto = (pedido.justificativa ?? '').trim();
  if (!texto) return 'Justificativa do reinício é obrigatória';
  if (s.modo === 'REFORCADO') {
    if (pedido.confirmaVicio !== true) {
      return 'A etapa de lances já foi encerrada: o reinício só é admitido como anulação da etapa por vício. Confirme que há vício que compromete a disputa.';
    }
    if (texto.length < TAMANHO_MINIMO_VICIO) {
      return `Descreva o vício que compromete a disputa (mín. ${TAMANHO_MINIMO_VICIO} caracteres).`;
    }
  }
  return null;
}
