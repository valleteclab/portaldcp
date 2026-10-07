import { jaFoiAvisada, tarefaVenceNaVespera } from './vespera-prazo.scheduler';

describe('tarefaVenceNaVespera', () => {
  it('é verdadeiro quando o prazo cai no próximo dia útil', () => {
    const hoje = new Date(2026, 9, 8); // quinta
    const prazoNaSexta = new Date(2026, 9, 9);
    expect(tarefaVenceNaVespera(prazoNaSexta, hoje)).toBe(true);
  });

  it('pula o fim de semana: na sexta, a véspera aponta para a segunda', () => {
    const sexta = new Date(2026, 9, 9);
    const prazoNaSegunda = new Date(2026, 9, 12);
    expect(tarefaVenceNaVespera(prazoNaSegunda, sexta)).toBe(true);
    const prazoNoSabado = new Date(2026, 9, 10);
    expect(tarefaVenceNaVespera(prazoNoSabado, sexta)).toBe(false);
  });

  it('é falso quando o prazo não é o próximo dia útil', () => {
    const hoje = new Date(2026, 9, 8);
    const prazoDepoisDeAmanha = new Date(2026, 9, 10);
    expect(tarefaVenceNaVespera(prazoDepoisDeAmanha, hoje)).toBe(false);
  });
});

describe('jaFoiAvisada', () => {
  it('deduplica pelo id da tarefa dentro do histórico', () => {
    const historico = [
      { evento: 'TAREFA_CRIADA', detalhes: null },
      { evento: 'AVISO_VESPERA', detalhes: { tarefa_id: 'tarefa-1' } },
    ];
    expect(jaFoiAvisada(historico, 'tarefa-1')).toBe(true);
    expect(jaFoiAvisada(historico, 'tarefa-2')).toBe(false);
  });

  it('histórico vazio nunca está avisado', () => {
    expect(jaFoiAvisada([], 'tarefa-1')).toBe(false);
  });
});
