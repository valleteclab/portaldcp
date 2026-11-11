import {
  motivoAnexoInvalido,
  motivoNaoAbre,
  motivoNaoEncerra,
  motivoNaoProrroga,
  motivoNaoResponde,
  prazoProrrogado,
  statusEfetivo,
} from './regras-diligencia';

const PEDIDO = 'Envie a planilha de custos que demonstre a exequibilidade do preço.';
const daqui = (h: number) => new Date(Date.now() + h * 3_600_000);

describe('diligência geral — regras', () => {
  it('só abre depois dos lances e antes da homologação', () => {
    const base = { modalidade: 'PREGAO_ELETRONICO', pedido: PEDIDO, prazoHoras: 2 };
    expect(motivoNaoAbre({ ...base, fase: 'EM_DISPUTA' })).toMatch(/depois da etapa de lances/);
    expect(motivoNaoAbre({ ...base, fase: 'ANALISE_PROPOSTAS' })).toMatch(/depois da etapa de lances/);
    expect(motivoNaoAbre({ ...base, fase: 'JULGAMENTO' })).toBeNull();
    expect(motivoNaoAbre({ ...base, fase: 'HABILITACAO' })).toBeNull();
    expect(motivoNaoAbre({ ...base, fase: 'ADJUDICACAO' })).toBeNull();
    expect(motivoNaoAbre({ ...base, fase: 'HOMOLOGACAO' })).toMatch(/homologada/);
  });

  it('na dispensa abre a partir da análise das propostas', () => {
    expect(motivoNaoAbre({ modalidade: 'DISPENSA_ELETRONICA', fase: 'ADJUDICACAO', pedido: PEDIDO, prazoHoras: 2 })).toBeNull();
    expect(motivoNaoAbre({ modalidade: 'DISPENSA_ELETRONICA', fase: 'ACOLHIMENTO_PROPOSTAS', pedido: PEDIDO, prazoHoras: 2 })).toMatch(/depois da etapa/);
  });

  it('exige pedido descrito e prazo dentro dos limites', () => {
    const base = { modalidade: 'PREGAO_ELETRONICO', fase: 'JULGAMENTO' };
    expect(motivoNaoAbre({ ...base, pedido: 'curto', prazoHoras: 2 })).toMatch(/Descreva/);
    expect(motivoNaoAbre({ ...base, pedido: PEDIDO, prazoHoras: 1 })).toMatch(/prazo mínimo/);
    expect(motivoNaoAbre({ ...base, pedido: PEDIDO, prazoHoras: 24 * 31 })).toMatch(/30 dias/);
    expect(motivoNaoAbre({ ...base, pedido: PEDIDO, prazoHoras: 0.1, minimoHoras: 0.05 })).toBeNull();
  });

  it('prazo vencido vira EXPIRADA e o licitante não responde mais', () => {
    const vencida = { status: 'ABERTA', prazo_ate: daqui(-1) };
    expect(statusEfetivo(vencida)).toBe('EXPIRADA');
    expect(motivoNaoResponde(vencida)).toMatch(/prazo desta diligência terminou/);
    expect(motivoNaoResponde({ status: 'ABERTA', prazo_ate: daqui(1) })).toBeNull();
    // responder não trava: dentro do prazo ele ainda corrige e complementa
    expect(motivoNaoResponde({ status: 'RESPONDIDA', prazo_ate: daqui(1) })).toBeNull();
    expect(motivoNaoResponde({ status: 'RESPONDIDA', prazo_ate: daqui(-1) })).toMatch(/prazo desta diligência terminou/);
    expect(motivoNaoResponde({ status: 'ENCERRADA', prazo_ate: daqui(1) })).toMatch(/encerrada/);
  });

  it('prorrogação: com motivo, conta do prazo atual ou de agora se já venceu', () => {
    const aberta = { status: 'ABERTA', prazo_ate: daqui(1) };
    expect(motivoNaoProrroga(aberta, 2, 'curto')).toMatch(/Justifique/);
    expect(motivoNaoProrroga(aberta, 0, 'Pedido do licitante pelo chat')).toMatch(/quantas horas/);
    expect(motivoNaoProrroga(aberta, 2, 'Pedido do licitante pelo chat')).toBeNull();
    expect(motivoNaoProrroga({ ...aberta, status: 'RESPONDIDA' }, 2, 'Pedido do licitante')).toBeNull();
    expect(motivoNaoProrroga({ ...aberta, status: 'ENCERRADA' }, 2, 'Pedido do licitante')).toMatch(/encerrada/);
    const agora = new Date('2026-11-11T12:00:00Z');
    expect(prazoProrrogado('2026-11-11T14:00:00Z', 2, agora).toISOString()).toBe('2026-11-11T16:00:00.000Z');
    expect(prazoProrrogado('2026-11-11T10:00:00Z', 2, agora).toISOString()).toBe('2026-11-11T14:00:00.000Z');
  });

  it('encerramento exige resultado e conclusão', () => {
    const d = { status: 'RESPONDIDA', prazo_ate: daqui(1) };
    expect(motivoNaoEncerra(d, 'TALVEZ', 'Documento confere com o edital')).toMatch(/resultado/);
    expect(motivoNaoEncerra(d, 'ATENDIDA', 'ok')).toMatch(/conclusão/);
    expect(motivoNaoEncerra(d, 'NAO_ATENDIDA', 'A planilha não demonstra os custos')).toBeNull();
    expect(motivoNaoEncerra({ ...d, status: 'ENCERRADA' }, 'ATENDIDA', 'Documento confere')).toMatch(/já foi encerrada/);
  });

  it('anexo: tipo, tamanho e limite', () => {
    expect(motivoAnexoInvalido(null, 0)).toMatch(/Selecione/);
    expect(motivoAnexoInvalido({ nome: 'virus.exe', tamanho: 10 }, 0)).toMatch(/Tipo de arquivo/);
    expect(motivoAnexoInvalido({ nome: 'Planilha.XLSX', tamanho: 10 }, 0)).toBeNull();
    expect(motivoAnexoInvalido({ nome: 'a.pdf', tamanho: 11 * 1024 * 1024 }, 0)).toMatch(/10 MB/);
    expect(motivoAnexoInvalido({ nome: 'a.pdf', tamanho: 10 }, 15)).toMatch(/Limite/);
  });
});
