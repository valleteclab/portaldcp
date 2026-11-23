/**
 * Para onde vai a nota fiscal que o fornecedor envia numa ordem de fornecimento.
 * Cada órgão escolhe (Configurações › Dados do órgão):
 *  - ALMOXARIFADO: só a fila de Recebimentos (comportamento de sempre);
 *  - MEDICOES: só quem cuida das medições (tela Medições › Notas de fornecimento);
 *  - AMBOS: os dois recebem o aviso e veem a nota.
 * O aceite do material (baixa no contrato) continua sendo o do Recebimento em
 * qualquer destino — o que muda é quem é avisado e em que tela a nota aparece.
 */
export const DESTINOS_NOTA_FORNECIMENTO = ['ALMOXARIFADO', 'MEDICOES', 'AMBOS'] as const;
export type DestinoNotaFornecimento = (typeof DESTINOS_NOTA_FORNECIMENTO)[number];
export const DESTINO_NOTA_FORNECIMENTO_PADRAO: DestinoNotaFornecimento = 'ALMOXARIFADO';

export function normalizarDestinoNotaFornecimento(v: unknown): DestinoNotaFornecimento {
  return (DESTINOS_NOTA_FORNECIMENTO as readonly string[]).includes(String(v))
    ? (v as DestinoNotaFornecimento)
    : DESTINO_NOTA_FORNECIMENTO_PADRAO;
}

export const notaVaiParaMedicoes = (d: DestinoNotaFornecimento) => d === 'MEDICOES' || d === 'AMBOS';
export const notaVaiParaAlmoxarifado = (d: DestinoNotaFornecimento) => d === 'ALMOXARIFADO' || d === 'AMBOS';

/** Tela das Medições, já na aba das notas de fornecimento. */
export const LINK_NOTAS_FORNECIMENTO_MEDICOES = '/orgao/medicoes-v2?aba=notas-fornecimento';

interface UsuarioAviso {
  id: string;
  ativo?: boolean;
  eh_fiscal_contrato?: boolean;
  pode_receber_patrimonio?: boolean;
  pode_aprovar_requisicoes?: boolean;
}

/**
 * Quem é avisado da nota em cada fila. Medições: fiscal e gestor do contrato,
 * fiscal da ordem e os usuários marcados como fiscal de contrato; sem ninguém,
 * todos os usuários ativos (mesma regra do aviso de medição enviada).
 */
export function destinatariosDaNota<T extends UsuarioAviso>(
  destino: DestinoNotaFornecimento,
  usuarios: T[],
  responsaveisIds: Array<string | null | undefined>,
): { almoxarifado: T[]; medicoes: T[] } {
  const ativos = usuarios.filter((u) => u.ativo !== false);
  const almoxarifado = notaVaiParaAlmoxarifado(destino)
    ? ativos.filter((u) => u.pode_receber_patrimonio || u.pode_aprovar_requisicoes)
    : [];
  let medicoes: T[] = [];
  if (notaVaiParaMedicoes(destino)) {
    const ids = new Set(responsaveisIds.filter(Boolean) as string[]);
    medicoes = ativos.filter((u) => ids.has(u.id) || u.eh_fiscal_contrato);
    if (medicoes.length === 0) medicoes = ativos;
  }
  return { almoxarifado, medicoes };
}
