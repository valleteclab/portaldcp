/**
 * Mensagem para o fornecedor quando não há OS autorizada para medir. Se já
 * existe OS criada mas parada (aguardando autorização/rascunho), diz qual —
 * no 039/2023 3ªAD a OS-0265/2026 estava pendente há dias e o fornecedor só
 * lia "aguarde o órgão enviar uma OS", sem saber que ela já existia.
 */
export function mensagemSemOsAutorizada(
  pendentes: Array<{ numero: string; status: string }>,
): string {
  const lista = (pendentes || []).filter((p) => p && p.numero);
  if (lista.length === 0) {
    return 'Aguarde o órgão enviar uma Ordem de Serviço autorizada para emitir a medição.';
  }
  const rotulo = (s: string) =>
    String(s || '').toUpperCase() === 'RASCUNHO' ? 'em rascunho' : 'aguardando autorização';
  const partes = lista.map((p) => `${p.numero} (${rotulo(p.status)})`);
  return (
    `Já existe Ordem de Serviço criada para este contrato, mas ainda não autorizada: ${partes.join(', ')}. ` +
    `Solicite ao órgão a autorização para emitir a medição.`
  );
}
