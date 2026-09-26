/**
 * ITENS OBRIGATÓRIOS PARA CONCLUIR A FASE INTERNA E PUBLICAR (todas as
 * modalidades) — regra pura, usada pela pré-condição dos atos
 * CONCLUIR_FASE_INTERNA/PUBLICAR (`transicoes/definicoes.ts`) e, por defesa,
 * pelo envio da compra ao PNCP (`pncp/fila/pncp-envios.service.ts`).
 *
 * A contratação precisa de pelo menos um item ATIVO (não cancelado) com
 * quantidade e valor unitário estimado maiores que zero. No leilão o valor
 * estimado do item é o preço mínimo do bem (gravado pelo cadastro do bem) e
 * no concurso é o prêmio — ambos ficam em `itens_licitacao`, então a regra é
 * a mesma para todas as modalidades.
 */
export interface ItemParaPublicacao {
  status?: string | null;
  quantidade?: number | string | null;
  valor_unitario_estimado?: number | string | null;
}

export const PENDENCIA_SEM_ITENS = 'Cadastre pelo menos um item com quantidade e valor estimado';

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export function itemValidoParaPublicacao(i: ItemParaPublicacao): boolean {
  const status = String(i.status ?? 'ATIVO');
  if (status === 'CANCELADO') return false;
  return numero(i.quantidade) > 0 && numero(i.valor_unitario_estimado) > 0;
}

/** Pendência (texto para a tela) ou null quando há item válido. */
export function pendenciaItensParaPublicacao(itens: ItemParaPublicacao[]): string | null {
  if ((itens || []).some(itemValidoParaPublicacao)) return null;
  const ativos = (itens || []).filter((i) => String(i.status ?? 'ATIVO') !== 'CANCELADO').length;
  if (ativos === 0) return `${PENDENCIA_SEM_ITENS} — o processo não tem itens (aba Itens do processo).`;
  return `${PENDENCIA_SEM_ITENS} — nenhum dos ${ativos} item(ns) tem quantidade e valor unitário estimado maiores que zero.`;
}
