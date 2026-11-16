/**
 * FILA AUTOMÁTICA DE LOTES/ITENS (dono, 09/11/2026 — como o Compras.gov.br e a
 * BLL): no máximo N unidades em disputa ao mesmo tempo; quando uma encerra, a
 * próxima da fila (ordem da numeração) abre sozinha depois do aviso prévio
 * anunciado na sala (0 a 10 min). Regra pura: o próximo passo da fila.
 */
export const MAX_SIMULTANEOS_FILA = 20;
export const MAX_AVISO_FILA_MIN = 10;

export type AcaoFila =
  | { tipo: 'CONCLUIR' }
  | { tipo: 'NADA' }
  | { tipo: 'INICIAR'; ids: string[] }
  | { tipo: 'AVISAR'; unidadeId: string; em: Date };

export function proximaAcaoDaFila(f: {
  maxSimultaneos: number;
  avisoMinutos: number;
  emDisputa: number;
  /** Unidades aguardando, já na ordem da fila. */
  aguardando: string[];
  proxima: { unidadeId: string; em: Date } | null;
  agora: Date;
}): AcaoFila {
  if (!f.aguardando.length) return f.emDisputa ? { tipo: 'NADA' } : { tipo: 'CONCLUIR' };
  const vagas = Math.max(0, f.maxSimultaneos - f.emDisputa);
  if (!vagas) return { tipo: 'NADA' };
  if (f.avisoMinutos <= 0) return { tipo: 'INICIAR', ids: f.aguardando.slice(0, vagas) };
  // Com aviso prévio: uma unidade por vez — anuncia, espera o prazo e abre
  if (f.proxima && f.aguardando.includes(f.proxima.unidadeId)) {
    return f.agora.getTime() >= f.proxima.em.getTime() ? { tipo: 'INICIAR', ids: [f.proxima.unidadeId] } : { tipo: 'NADA' };
  }
  return { tipo: 'AVISAR', unidadeId: f.aguardando[0], em: new Date(f.agora.getTime() + f.avisoMinutos * 60_000) };
}

/** Valida a configuração pedida pela pregoeira. Devolve a mensagem de erro ou null. */
export function erroConfiguracaoFila(maxSimultaneos: unknown, avisoMinutos: unknown): string | null {
  const m = Number(maxSimultaneos);
  const a = Number(avisoMinutos ?? 0);
  if (!Number.isInteger(m) || m < 1 || m > MAX_SIMULTANEOS_FILA) return `Informe de 1 a ${MAX_SIMULTANEOS_FILA} unidades em disputa ao mesmo tempo.`;
  if (!Number.isInteger(a) || a < 0 || a > MAX_AVISO_FILA_MIN) return `O aviso prévio vai de 0 a ${MAX_AVISO_FILA_MIN} minutos.`;
  return null;
}
