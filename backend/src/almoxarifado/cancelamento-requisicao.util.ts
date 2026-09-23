/**
 * Rastro do cancelamento de uma requisição/OS. Até 23/09/2026 o cancelamento
 * só carimbava "[Cancelada] motivo" nas observações: a OS-0257/2026 apareceu
 * cancelada com o motivo "nao" e ninguém soube dizer quem foi nem quando.
 */

export interface AutorCancelamento {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
}

export function nomeDoAutor(autor?: AutorCancelamento | null): string {
  const nome = String(autor?.nome || '').trim();
  if (nome) return nome;
  const email = String(autor?.email || '').trim();
  return email || 'usuário não identificado';
}

/** Entrada do histórico da requisição para o cancelamento. */
export function entradaHistoricoCancelamento(
  autor: AutorCancelamento | null | undefined,
  motivo: string | null | undefined,
  statusAnterior: string | null | undefined,
): {
  tipo_acao: string;
  descricao: string;
  detalhes: string;
  usuario_id: string | null;
  usuario_nome: string;
} {
  const quem = nomeDoAutor(autor);
  const motivoTexto = String(motivo || '').trim() || 'não informado';
  return {
    tipo_acao: 'CANCELADA',
    descricao: `Cancelada por: ${quem}`,
    detalhes: `Motivo: ${motivoTexto}. Status anterior: ${statusAnterior || '-'}.`,
    usuario_id: autor?.id || null,
    usuario_nome: quem,
  };
}
