import { andamentoDoFluxo, andamentoLivre, type PassoDoFluxo, type TarefaDoFluxo } from './andamento';
import { travasFaltando } from '../nos/catalogo-nos';

const agora = new Date('2026-10-08T12:00:00-03:00');
const fluxo = { id: 'f1', nome: 'Contratação — Câmara', versao: 3 };
const passos: PassoDoFluxo[] = [
  { acao_id: 'a1', titulo: 'Demanda', tipo: 'DEMANDA', responsavel: 'Diretoria Administrativa' },
  { acao_id: 'a2', titulo: 'Aprovação', tipo: 'APROVACAO', responsavel: 'Diretoria Geral' },
  { acao_id: 'a3', titulo: 'Parecer jurídico', tipo: 'PARECER_JURIDICO', responsavel: 'Procuradoria' },
];
const tarefa = (acao_id: string, status: string, created_at: string, extra: Partial<TarefaDoFluxo> = {}): TarefaDoFluxo => ({ id: `t-${acao_id}-${status}`, acao_id, status, created_at, concluida_em: null, prazo_em: null, ...extra });

describe('andamentoDoFluxo', () => {
  it('mostra concluída, em andamento e a realizar na ordem do desenho', () => {
    const a = andamentoDoFluxo({
      fluxo, instancia_id: 'i1', status_instancia: 'EM_ANDAMENTO', passos, agora,
      tarefas: [tarefa('a1', 'CONCLUIDA', '2026-10-01T10:00:00Z', { concluida_em: '2026-10-02T10:00:00Z' }), tarefa('a2', 'ABERTA', '2026-10-02T10:00:00Z')],
    });
    expect(a.nos.map((n) => n.situacao)).toEqual(['CONCLUIDA', 'EM_ANDAMENTO', 'A_REALIZAR']);
    expect(a.atual?.titulo).toBe('Aprovação');
    expect(a.atual?.desde).toBe('2026-10-02T10:00:00.000Z');
    expect(a.concluidas).toBe(1);
    expect(a.total).toBe(3);
    expect(a.encerrado).toBe(false);
  });

  it('marca o cadeado só nas etapas exigidas por lei', () => {
    const a = andamentoDoFluxo({ fluxo, instancia_id: 'i1', status_instancia: 'EM_ANDAMENTO', passos, agora, tarefas: [] });
    expect(a.nos.map((n) => n.obrigatoria_lei)).toEqual([null, null, 'Lei 14.133, art. 53']);
  });

  it('prazo vencido marca atraso; prazo futuro não', () => {
    const vencida = andamentoDoFluxo({ fluxo, instancia_id: 'i1', status_instancia: 'EM_ANDAMENTO', passos, agora, tarefas: [tarefa('a1', 'ABERTA', '2026-10-01T10:00:00Z', { prazo_em: '2026-10-07T23:59:00-03:00' })] });
    expect(vencida.atual?.atrasada).toBe(true);
    const futura = andamentoDoFluxo({ fluxo, instancia_id: 'i1', status_instancia: 'EM_ANDAMENTO', passos, agora, tarefas: [tarefa('a1', 'ABERTA', '2026-10-01T10:00:00Z', { prazo_em: '2026-10-09T23:59:00-03:00' })] });
    expect(futura.atual?.atrasada).toBe(false);
  });

  it('devolução: a etapa devolvida volta a "a realizar" e a anterior reabre', () => {
    const a = andamentoDoFluxo({
      fluxo, instancia_id: 'i1', status_instancia: 'EM_ANDAMENTO', passos, agora,
      tarefas: [
        tarefa('a1', 'CONCLUIDA', '2026-10-01T10:00:00Z'),
        tarefa('a2', 'DEVOLVIDA', '2026-10-02T10:00:00Z'),
        tarefa('a1', 'ABERTA', '2026-10-03T10:00:00Z'),
      ],
    });
    expect(a.nos.map((n) => [n.situacao, n.devolvida])).toEqual([['EM_ANDAMENTO', false], ['A_REALIZAR', true], ['A_REALIZAR', false]]);
  });

  it('execução concluída fica encerrada e sem etapa atual', () => {
    const a = andamentoDoFluxo({ fluxo, instancia_id: 'i1', status_instancia: 'CONCLUIDA', passos: passos.slice(0, 1), agora, tarefas: [tarefa('a1', 'CONCLUIDA', '2026-10-01T10:00:00Z')] });
    expect(a.encerrado).toBe(true);
    expect(a.atual).toBeNull();
  });

  it('a etapa em andamento expõe o id da tarefa; as demais não', () => {
    const a = andamentoDoFluxo({
      fluxo, instancia_id: 'i1', status_instancia: 'EM_ANDAMENTO', passos, agora,
      tarefas: [tarefa('a1', 'CONCLUIDA', '2026-10-01T10:00:00Z'), tarefa('a2', 'ABERTA', '2026-10-02T10:00:00Z')],
    });
    expect(a.atual?.tarefa_id).toBe('t-a2-ABERTA');
    expect(a.nos.map((n) => n.tarefa_id)).toEqual([null, 't-a2-ABERTA', null]);
  });

  it('indeferimento encerra a execução e a etapa indeferida conta como concluída na fila', () => {
    const a = andamentoDoFluxo({
      fluxo, instancia_id: 'i1', status_instancia: 'INDEFERIDA', passos,
      tarefas: [tarefa('a1', 'CONCLUIDA', '2026-10-01T10:00:00Z'), tarefa('a2', 'INDEFERIDA', '2026-10-02T10:00:00Z')],
      agora,
    });
    expect(a.encerrado).toBe(true);
    expect(a.atual).toBeNull();
    expect(a.nos.map((n) => n.situacao)).toEqual(['CONCLUIDA', 'CONCLUIDA', 'A_REALIZAR']);
  });
});

describe('andamentoLivre', () => {
  const abertura = { tipo: 'ABERTURA', created_at: '2026-10-06T13:00:00Z', para_setor_nome: 'Diretoria Administrativa', para_usuario_nome: null, recebida_em: '2026-10-06T13:00:00Z' };

  it('ofício enviado e recebido: o recebimento é a etapa em andamento', () => {
    const a = andamentoLivre({
      movimentacoes: [abertura, { tipo: 'ENVIO', created_at: '2026-10-06T13:41:00Z', para_setor_nome: 'Setor de Patrimônio', para_usuario_nome: null, recebida_em: '2026-10-08T12:14:00Z' }],
      pecas: [{ titulo: 'Ofício nº 014/2026', created_at: '2026-10-06T13:40:00Z', criado_por_nome: 'Diretoria Administrativa' }],
      encerramento: null,
    });
    expect(a.nos.map((n) => [n.titulo, n.situacao])).toEqual([
      ['Autuado', 'CONCLUIDA'],
      ['Ofício nº 014/2026', 'CONCLUIDA'],
      ['Enviado', 'CONCLUIDA'],
      ['Recebido', 'EM_ANDAMENTO'],
    ]);
    expect(a.atual?.responsavel).toBe('Setor de Patrimônio');
    expect(a.atual?.desde).toBe('2026-10-08T12:14:00.000Z');
    expect(a.modo).toBe('LIVRE');
  });

  it('ofício enviado: a resposta aparece como etapa a realizar, com quem recebeu', () => {
    const a = andamentoLivre({
      movimentacoes: [abertura, { tipo: 'ENVIO', created_at: '2026-10-06T13:41:00Z', para_setor_nome: 'Setor de Patrimônio', para_usuario_nome: null, recebida_em: '2026-10-08T12:14:00Z' }],
      pecas: [],
      encerramento: null,
      esperada: { titulo: 'Resposta' },
    });
    expect(a.nos.slice(-2).map((n) => [n.titulo, n.situacao, n.responsavel])).toEqual([
      ['Recebido', 'EM_ANDAMENTO', 'Setor de Patrimônio'],
      ['Resposta', 'A_REALIZAR', 'Setor de Patrimônio'],
    ]);
    const encerrado = andamentoLivre({ movimentacoes: [abertura], pecas: [], encerramento: { em: '2026-10-09T12:00:00Z' }, esperada: { titulo: 'Resposta' } });
    expect(encerrado.nos.some((n) => n.titulo === 'Resposta')).toBe(false);
  });

  it('enviado e ainda não recebido: aguardando recebimento desde o envio', () => {
    const a = andamentoLivre({
      movimentacoes: [abertura, { tipo: 'ENVIO', created_at: '2026-10-06T13:41:00Z', para_setor_nome: 'Setor de Patrimônio', para_usuario_nome: null, recebida_em: null }],
      pecas: [],
      encerramento: null,
    });
    expect(a.atual?.titulo).toBe('Aguardando recebimento');
    expect(a.atual?.desde).toBe('2026-10-06T13:41:00.000Z');
  });

  it('só autuado: fica com quem abriu', () => {
    const a = andamentoLivre({ movimentacoes: [abertura], pecas: [], encerramento: null });
    expect(a.nos.map((n) => n.titulo)).toEqual(['Autuado', 'Com Diretoria Administrativa']);
  });

  it('encerrado: último nó é o encerramento, sem etapa em andamento, e o último recebimento aparece como concluído', () => {
    const a = andamentoLivre({
      movimentacoes: [abertura, { tipo: 'ENVIO', created_at: '2026-10-06T13:41:00Z', para_setor_nome: 'Setor de Patrimônio', para_usuario_nome: null, recebida_em: '2026-10-07T12:00:00Z' }],
      pecas: [],
      encerramento: { em: '2026-10-09T12:00:00Z' },
    });
    expect(a.nos.map((n) => n.titulo)).toEqual(['Autuado', 'Enviado', 'Recebido', 'Encerrado']);
    expect(a.atual).toBeNull();
    expect(a.encerrado).toBe(true);
  });
});

describe('travasFaltando', () => {
  it('cobra as etapas obrigatórias por lei ausentes do desenho', () => {
    expect(travasFaltando(['DEMANDA', 'publicacao'], ['PARECER_JURIDICO', 'PUBLICACAO'])).toEqual(['Parecer jurídico é obrigatória (Lei 14.133, art. 53).']);
    expect(travasFaltando(['PARECER_JURIDICO', 'PUBLICACAO'], ['PARECER_JURIDICO', 'PUBLICACAO'])).toEqual([]);
  });

  it('ignora tipo exigido que não tem trava legal', () => {
    expect(travasFaltando([], ['DEMANDA'])).toEqual([]);
  });
});
