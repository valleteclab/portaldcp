import { coerenciaEntreSecoes, detectarIndicacaoMarca, incisosObrigatoriosVazios, situacaoDosIncisos, termosRelevantes } from './etp-analise';

/** Trecho real do ETP da Dispensa 029/2025 (PA 139/2025), item 8.5. */
const ITEM_8_5 =
  '<p>8.5. A solução tecnológica deverá ser similar ou superior ao software ARION (SNEWS), atendendo a padrões equivalentes de desempenho, estabilidade, funcionalidades e integração com o ambiente de broadcast.</p>';

describe('ETP — incisos obrigatórios (art. 18, §2º)', () => {
  it('aponta os obrigatórios vazios: I, IV, VI, VIII e XIII', () => {
    expect(incisosObrigatoriosVazios({}).map((i) => i.inciso)).toEqual(['I', 'IV', 'VI', 'VIII', 'XIII']);
    const quase = {
      necessidade: '<p>As rotinas editoriais usam ferramentas fragmentadas.</p>',
      estimativa: '<p>1 implantação e 12 meses de licença.</p>',
      estimativa_valor: '<p>R$ 61.753,44 conforme pesquisa.</p>',
      parcelamento: '<p>Não parcelado: solução integrada.</p>',
      viabilidade: '<p></p>',
    };
    expect(incisosObrigatoriosVazios(quase).map((i) => i.inciso)).toEqual(['XIII']);
  });

  it('texto curto (até 10 caracteres) conta como vazio; 13 incisos', () => {
    const s = situacaoDosIncisos({ necessidade: '<p>ok</p>', solucao: '<p>Solução integrada de gestão.</p>' });
    expect(s).toHaveLength(13);
    expect(s.find((i) => i.inciso === 'I')!.preenchido).toBe(false);
    expect(s.find((i) => i.inciso === 'VII')!.preenchido).toBe(true);
  });
});

describe('ETP — indicação de marca (art. 41, I)', () => {
  it('caso ARION: "similar ou superior ao software ARION (SNEWS)" → ATENÇÃO (citada como referência, falta justificativa)', () => {
    const a = detectarIndicacaoMarca({ solucao: ITEM_8_5 });
    expect(a.map((x) => x.marca)).toEqual(expect.arrayContaining(['ARION', 'SNEWS']));
    expect(a.every((x) => x.severidade === 'ATENCAO' && x.como_referencia && x.secao_id === 'solucao')).toBe(true);
    expect(a[0].trecho).toMatch(/ARION/);
  });

  it('marca exigida sem "ou similar" → BLOQUEIO', () => {
    const a = detectarIndicacaoMarca({ requisitos: '<p>Os notebooks deverão ser da marca Dell, modelo Latitude 5440.</p>' });
    expect(a.map((x) => [x.marca, x.severidade])).toEqual(
      expect.arrayContaining([
        ['Dell', 'BLOQUEIO'],
        ['Latitude 5440', 'BLOQUEIO'],
      ]),
    );
  });

  it('com a justificativa do art. 41, I registrada → JUSTIFICADO', () => {
    const a = detectarIndicacaoMarca({ solucao: ITEM_8_5 }, { justificativa: 'Padronização: compatibilidade com o acervo e os equipamentos de broadcast já instalados.' });
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.severidade === 'JUSTIFICADO')).toBe(true);
  });

  it('marca do cadastro do órgão é encontrada por palavra inteira', () => {
    const a = detectarIndicacaoMarca({ solucao: '<p>Licença do Microsoft Office ou equivalente.</p>' }, { marcas: ['Microsoft', 'Soft'] });
    expect(a.map((x) => x.marca)).toEqual(['Microsoft']);
    expect(a[0].severidade).toBe('ATENCAO');
  });

  it('texto pela função, sem marca, não gera achado', () => {
    expect(
      detectarIndicacaoMarca({
        solucao: '<p>Sistema integrado de gestão de pautas, com teleprompter e integração com redes sociais, conforme a Lei nº 14.133/2021 e o ETP.</p>',
        necessidade: '<p>A Câmara Municipal precisa padronizar o fluxo de produção da TV Câmara.</p>',
      }),
    ).toEqual([]);
  });

  it('ignora chaves internas (_edicoes, _marca)', () => {
    expect(detectarIndicacaoMarca({ _marca: 'marca Dell' as any, _edicoes: {} as any })).toEqual([]);
  });
});

describe('ETP — coerência entre seções', () => {
  it('requisito da necessidade que não aparece na solução nem no TR', () => {
    const r = coerenciaEntreSecoes({
      necessidade: '<p>2.2. O sistema deve oferecer Closed Caption e NDI para a transmissão.</p>',
      solucao: '<p>Software com NDI nativo.</p>',
      tr: '<p>Objeto: software de gestão de conteúdo.</p>',
    });
    expect(r.map((x) => [x.termo, x.ausente_em])).toEqual([
      ['NDI', ['termo de referência']],
      ['Closed Caption', ['solução (inciso VII)', 'termo de referência']],
    ]);
  });

  it('sem TR ainda, só confere a solução; termos jurídicos ignorados', () => {
    expect(termosRelevantes('<p>Conforme o PCA e o ETP, a Lei exige NDI.</p>')).toEqual(['NDI']);
    expect(coerenciaEntreSecoes({ necessidade: '<p>Exige NDI.</p>', solucao: '<p>Com NDI.</p>' })).toEqual([]);
  });
});
