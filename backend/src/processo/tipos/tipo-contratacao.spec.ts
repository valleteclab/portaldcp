import { camposCondicaoContratacao, catalogoDocumentosContratacao, definicaoContratacao } from './tipo-contratacao';

describe('tipo CONTRATACAO (delegação ao catálogo da fase interna)', () => {
  it('catálogo de documentos: peças do catálogo de etapas, sem repetição, com título e etapa', () => {
    const c = catalogoDocumentosContratacao();
    const codigos = c.map((d) => d.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const esperado of ['DFD', 'ETP', 'TR', 'PP', 'MCP', 'DO', 'AA', 'RAG', 'PJ', 'MCI']) expect(codigos).toContain(esperado);
    const dfd = c.find((d) => d.codigo === 'DFD')!;
    expect(dfd.etapa).toBe('DFD');
    expect(dfd.titulo).not.toBe('DFD');
    expect(dfd.fundamento).toMatch(/art\. 72/);
  });

  it('campos de condição: os do construtor de fluxo', () => {
    const campos = camposCondicaoContratacao().map((c) => c.campo);
    expect(campos).toEqual(expect.arrayContaining(['manual', 'valor_total_estimado', 'tipo_contratacao', 'modalidade', 'fundamento_legal']));
    expect(camposCondicaoContratacao().find((c) => c.campo === 'tipo_contratacao')?.opcoes).toContain('SERVICO');
  });

  it('definição: implementada, referência LICITACAO, sem abertura direta, requisitos pela fonte injetada', async () => {
    const d = definicaoContratacao({ requisitos: async () => [{ codigo: 'X', tipo: 'ETAPA_OBRIGATORIA', etapa: 'DFD', outra_etapa: null, fundamento: 'art. 72, I', mensagem: 'm', ativo: true }] });
    expect(d).toMatchObject({ tipo: 'CONTRATACAO', implementado: true, abertura_direta: false, tem_fluxo: true, referencia_tipo: 'LICITACAO' });
    expect((await d.requisitosLegais()).map((r) => r.codigo)).toEqual(['X']);
  });
});
