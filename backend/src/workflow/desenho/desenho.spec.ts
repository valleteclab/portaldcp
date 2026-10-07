import { errosParaAtivar, normalizarEtapas, removidasComTrava } from './desenho';

const etapa = (chave: string, tipo: string, extra: Record<string, unknown> = {}) => ({ chave, tipo, responsavel_tipo: 'SETOR', responsaveis: ['s1'], ...extra });

describe('normalizarEtapas', () => {
  it('aceita a sequência e usa o rótulo do catálogo quando falta nome', () => {
    const r = normalizarEtapas({ etapas: [etapa('a', 'DEMANDA'), etapa('novo-1', 'parecer_juridico', { nome: '  Parecer da Procuradoria ', prazo_dias_uteis: '5' })] });
    expect(r.map((e) => [e.chave, e.tipo, e.nome, e.prazo_dias_uteis])).toEqual([
      ['a', 'DEMANDA', 'Demanda', null],
      ['novo-1', 'PARECER_JURIDICO', 'Parecer da Procuradoria', 5],
    ]);
  });

  it('recusa tipo indisponível, chave repetida e prazo inválido', () => {
    expect(() => normalizarEtapas({ etapas: [etapa('a', 'DECISAO')] })).toThrow('indisponível');
    expect(() => normalizarEtapas({ etapas: [etapa('a', 'DEMANDA'), etapa('a', 'DFD')] })).toThrow('repetida');
    expect(() => normalizarEtapas({ etapas: [etapa('a', 'DEMANDA', { prazo_dias_uteis: 2.5 })] })).toThrow('prazo');
    expect(() => normalizarEtapas({})).toThrow('lista');
  });

  it('solicitante não tem lista de responsáveis', () => {
    expect(normalizarEtapas({ etapas: [etapa('a', 'DEMANDA', { responsavel_tipo: 'SOLICITANTE', responsaveis: ['x'] })] })[0].responsaveis).toEqual([]);
  });

  it('devolver só para etapa anterior', () => {
    expect(normalizarEtapas({ etapas: [etapa('a', 'TR'), etapa('b', 'PARECER_JURIDICO', { devolver_para: 'a' })] })[1].devolver_para).toBe('a');
    expect(() => normalizarEtapas({ etapas: [etapa('a', 'TR', { devolver_para: 'b' }), etapa('b', 'PARECER_JURIDICO')] })).toThrow('anterior');
  });

  it('documento feito fora: padrão aceito nas etapas que produzem documento; nunca nas que não produzem', () => {
    const r = normalizarEtapas({ etapas: [etapa('a', 'ETP'), etapa('b', 'ETP', { aceita_documento_externo: false }), etapa('c', 'APROVACAO', { aceita_documento_externo: true })] });
    expect(r.map((e) => e.aceita_documento_externo)).toEqual([true, false, false]);
  });
});

describe('errosParaAtivar', () => {
  it('contratação sem parecer e publicação não ativa', () => {
    const e = errosParaAtivar('CONTRATACAO', normalizarEtapas({ etapas: [etapa('a', 'DEMANDA')] }));
    expect(e).toEqual(expect.arrayContaining([expect.stringContaining('Parecer jurídico'), expect.stringContaining('Publicação')]));
  });

  it('avulso não exige etapa legal; cobra responsável, exceto do nó automático', () => {
    const e = errosParaAtivar('AVULSO', normalizarEtapas({ etapas: [etapa('a', 'TAREFA', { responsaveis: [] }), etapa('b', 'NOTIFICAR', { responsaveis: [] })] }));
    expect(e).toEqual(['Defina o responsável da etapa "Tarefa livre".']);
  });

  it('fluxo completo ativa', () => {
    expect(errosParaAtivar('CONTRATACAO', normalizarEtapas({ etapas: [etapa('a', 'DEMANDA'), etapa('b', 'PARECER_JURIDICO'), etapa('c', 'PUBLICACAO')] }))).toEqual([]);
  });
});

describe('removidasComTrava', () => {
  it('não deixa tirar etapa obrigatória do desenho de contratação', () => {
    expect(removidasComTrava('CONTRATACAO', ['DEMANDA', 'PARECER_JURIDICO'], ['DEMANDA'])).toEqual(['Parecer jurídico é obrigatória por lei e não pode ser removida.']);
    expect(removidasComTrava('AVULSO', ['PARECER_JURIDICO'], [])).toEqual([]);
  });
});
