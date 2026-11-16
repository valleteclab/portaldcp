import { aplicarLeituraDaIa, checklistDoDocumento, marcarItem, pendenciasDoChecklist, resumoDoChecklist } from './checklist-documento';

const itens = checklistDoDocumento('ETP');

describe('checklist do ETP (art. 18, § 1º)', () => {
  it('tem os 13 incisos, com I, IV, VI, VIII e XIII obrigatórios (§ 2º)', () => {
    expect(itens).toHaveLength(13);
    expect(itens.filter((i) => i.obrigatorio).map((i) => i.fundamento)).toEqual(['Art. 18, §1º, I', 'Art. 18, §1º, IV', 'Art. 18, §1º, VI', 'Art. 18, §1º, VIII', 'Art. 18, §1º, XIII']);
    expect(itens[0].rotulo).toBe('Descrição da necessidade');
  });

  it('outros documentos ainda não têm checklist', () => {
    expect(checklistDoDocumento('TR')).toEqual([]);
    expect(checklistDoDocumento(null)).toEqual([]);
  });

  it('sem nada marcado: 13 pendências; obrigatório não aceita "não se aplica"', () => {
    expect(pendenciasDoChecklist(itens, {})).toHaveLength(13);
    expect(() => marcarItem(itens, {}, 'necessidade', 'NAO_SE_APLICA', 'não precisa disso aqui', 'Ana')).toThrow('obrigatório');
  });

  it('opcional justificado conta; justificativa curta é recusada', () => {
    expect(() => marcarItem(itens, {}, 'previsao_pca', 'NAO_SE_APLICA', 'curta', 'Ana')).toThrow('10 caracteres');
    let e = {};
    for (const i of itens) e = i.obrigatorio ? marcarItem(itens, e, i.codigo, 'ATENDIDO', null, 'Ana') : marcarItem(itens, e, i.codigo, 'NAO_SE_APLICA', 'Contratação de baixa complexidade.', 'Ana');
    expect(pendenciasDoChecklist(itens, e)).toEqual([]);
    expect(resumoDoChecklist(itens, e)).toMatchObject({ total: 13, atendidos: 5, justificados: 8 });
  });

  it('leitura da IA marca o que encontrou, sem desfazer a marcação manual', () => {
    const manual = marcarItem(itens, {}, 'requisitos', 'NAO_SE_APLICA', 'Requisitos definidos no TR padrão.', 'Ana');
    const e = aplicarLeituraDaIa(itens, manual, [
      { codigo: 'necessidade', presente: true, trecho: 'A Câmara necessita…' },
      { codigo: 'requisitos', presente: true },
      { codigo: 'parcelamento', presente: false },
      { codigo: 'inexistente', presente: true },
    ]);
    expect(e.necessidade).toMatchObject({ status: 'ATENDIDO', origem: 'IA' });
    expect(e.requisitos).toMatchObject({ status: 'NAO_SE_APLICA', origem: 'MANUAL' });
    expect(e.parcelamento).toBeUndefined();
    expect(Object.keys(e)).not.toContain('inexistente');
  });
});
