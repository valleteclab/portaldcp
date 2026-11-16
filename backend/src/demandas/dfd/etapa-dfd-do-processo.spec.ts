import { acaoDaEtapaDfdAberta } from './etapa-dfd-do-processo';

const passos = [
  { acao: { id: 'a1', tipo: 'DEMANDA' } },
  { acao: { id: 'a2', tipo: 'APROVACAO' } },
  { acao: { id: 'a3', tipo: 'DFD' } },
];

describe('acaoDaEtapaDfdAberta', () => {
  it('devolve a ação quando a tarefa aberta é da etapa DFD', () => {
    expect(acaoDaEtapaDfdAberta({ instancia: { status: 'EM_ANDAMENTO' }, passos, tarefas: [{ acao_id: 'a1', status: 'CONCLUIDA' }, { acao_id: 'a3', status: 'ABERTA' }] })).toBe('a3');
  });

  it('não aceita outra etapa em andamento', () => {
    expect(acaoDaEtapaDfdAberta({ instancia: { status: 'EM_ANDAMENTO' }, passos, tarefas: [{ acao_id: 'a2', status: 'ABERTA' }] })).toBeNull();
  });

  it('não aceita execução encerrada, indeferida ou ausente', () => {
    expect(acaoDaEtapaDfdAberta({ instancia: { status: 'INDEFERIDA' }, passos, tarefas: [{ acao_id: 'a3', status: 'ABERTA' }] })).toBeNull();
    expect(acaoDaEtapaDfdAberta(null)).toBeNull();
  });
});
