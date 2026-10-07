/**
 * Etapa DFD em andamento no fluxo do processo: a execução precisa estar em
 * andamento e a tarefa aberta precisa ser de um passo do tipo DFD. Devolve o
 * id da ação (para a peça `no:<acao_id>`) ou null.
 */
export function acaoDaEtapaDfdAberta(execucao: {
  instancia: { status: string };
  tarefas: Array<{ acao_id: string; status: string }>;
  passos: Array<{ acao: { id: string; tipo: string } }>;
} | null): string | null {
  if (!execucao || execucao.instancia.status !== 'EM_ANDAMENTO') return null;
  const aberta = execucao.tarefas.find((t) => t.status === 'ABERTA');
  if (!aberta) return null;
  const passo = execucao.passos.find((p) => p.acao.id === aberta.acao_id);
  return passo && String(passo.acao.tipo).toUpperCase() === 'DFD' ? passo.acao.id : null;
}
