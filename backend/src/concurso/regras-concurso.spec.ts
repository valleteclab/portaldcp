import {
  gerarCodigoTrabalho,
  motivoArquivoTrabalhoInvalido,
  motivoTrabalhoIdentificado,
  pendenciasEditalConcurso,
  pendenciasPremiacao,
  validarRegulamento,
} from './regras-concurso';

describe('Concurso — regras puras (Lei 14.133 art. 30)', () => {
  const reg = {
    natureza_trabalho: 'ARTISTICO',
    qualificacao_exigida: 'Artista com portfólio',
    diretrizes_trabalho: 'Mural sobre a história da cidade',
    forma_apresentacao: 'Prancha A1 em PDF',
    condicoes_realizacao: 'Execução em 60 dias',
    tipo_retribuicao: 'PREMIO',
    valor_premio: 20000,
    exige_cessao_direitos: true,
  };

  test('regulamento: art. 30 I (qualificação), II (diretrizes/forma), III (condições e prêmio)', () => {
    expect(validarRegulamento(reg)).toEqual([]);
    const e = validarRegulamento({ ...reg, qualificacao_exigida: '', forma_apresentacao: '', valor_premio: 0 }).join('|');
    expect(e).toMatch(/art. 30, I\)/);
    expect(e).toMatch(/art. 30, II/);
    expect(e).toMatch(/art. 30, III/);
    expect(validarRegulamento({ ...reg, elaboracao_projeto: true, exige_cessao_direitos: false }).join()).toMatch(/art. 93/);
  });

  test('edital: melhor técnica, um item com o valor do prêmio, quesitos da banca', () => {
    expect(pendenciasEditalConcurso({ criterio: 'MELHOR_TECNICA', regulamento: reg, itens: [{ numero_item: 1, valor_total: 20000 }], quesitos: 2 })).toEqual([]);
    const p = pendenciasEditalConcurso({ criterio: 'MENOR_PRECO', regulamento: reg, itens: [{ numero_item: 1, valor_total: 1 }], quesitos: 0 }).join('|');
    expect(p).toMatch(/melhor técnica/);
    expect(p).toMatch(/valor do item/);
    expect(p).toMatch(/quesitos/);
    expect(pendenciasEditalConcurso({ criterio: 'MELHOR_TECNICA', regulamento: reg, itens: [], quesitos: 1 }).join()).toMatch(/único item/);
  });

  test('código anônimo do trabalho: sem caracteres ambíguos, formato T-XXXXX', () => {
    let i = 0;
    const seq = [0, 1, 2, 3, 4];
    expect(gerarCodigoTrabalho(() => seq[i++ % 5])).toBe('T-ABCDE');
    for (let k = 0; k < 50; k++) expect(gerarCodigoTrabalho()).toMatch(/^T-[A-HJ-NP-Z2-9]{5}$/);
  });

  test('sigilo de autoria: nome do arquivo não pode identificar o autor', () => {
    expect(motivoTrabalhoIdentificado('mural-joaquina-silveira.pdf', { nome: 'Joaquina Silveira', documento: '123' })).toMatch(/identifica o autor/);
    expect(motivoTrabalhoIdentificado('proposta 12345678901.pdf', { nome: 'X', documento: '123.456.789-01' })).toMatch(/CPF\/CNPJ/);
    expect(motivoTrabalhoIdentificado('trabalho.pdf', { nome: 'Joaquina Silveira', documento: '12345678901' })).toBeNull();
  });

  test('arquivos do trabalho e da identificação', () => {
    expect(motivoArquivoTrabalhoInvalido(null, 20)).toMatch(/Anexe o arquivo/);
    expect(motivoArquivoTrabalhoInvalido({ mimetype: 'application/zip', size: 10 }, 20)).toBeNull();
    expect(motivoArquivoTrabalhoInvalido({ mimetype: 'application/zip', size: 10 }, 20, true)).toMatch(/PDF, JPG ou PNG/);
    expect(motivoArquivoTrabalhoInvalido({ mimetype: 'application/pdf', size: 21 * 1024 * 1024 }, 20)).toMatch(/20 MB/);
  });

  test('conclusão: premiação com termo e cessão aceita quando exigida', () => {
    expect(pendenciasPremiacao([]).join()).toMatch(/não registrada/);
    expect(pendenciasPremiacao([{ status: 'AGUARDANDO_CESSAO', exige_cessao: true, termo_gerado_em: new Date() }]).join()).toMatch(/art. 93/);
    expect(pendenciasPremiacao([{ status: 'CESSAO_ACEITA', exige_cessao: true, termo_gerado_em: new Date() }])).toEqual([]);
  });
});
