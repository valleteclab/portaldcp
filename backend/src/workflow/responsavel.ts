/**
 * Quem responde por uma tarefa do fluxo — a mesma regra do motor para
 * concluir/devolver (`chaveDoResponsavel`), em função pura para listar as
 * etapas de cada pessoa (Central de Aprovações) e esconder os botões de quem
 * não pode agir. O login do próprio órgão vê e age em todas.
 */
export function ehResponsavelDaTarefa(
  tarefa: { responsavel_tipo: string; responsaveis: unknown },
  instancia: { iniciado_por_id: string | null },
  quem: { ehLoginDoOrgao: boolean; atorId: string; usuarioId: string | null; setorId: string | null },
): boolean {
  if (quem.ehLoginDoOrgao) return true;
  const lista = Array.isArray(tarefa.responsaveis) ? (tarefa.responsaveis as unknown[]).map(String) : [];
  switch (String(tarefa.responsavel_tipo).toUpperCase()) {
    case 'SOLICITANTE':
      return !!instancia.iniciado_por_id && instancia.iniciado_por_id === quem.atorId;
    case 'USUARIO':
      return lista.includes(quem.atorId);
    case 'SETOR':
      return !!quem.setorId && lista.includes(quem.setorId);
    default:
      return false;
  }
}
