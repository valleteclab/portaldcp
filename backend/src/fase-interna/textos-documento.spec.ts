import {
  formatarQuantidade,
  localDoOrgao,
  localEData,
  quantidadeComUnidade,
  rotuloCriterio,
  rotuloModalidade,
  rotuloModoDisputa,
  semVariaveisCruas,
  substituirVariaveis,
  valorCadastral,
  variaveisDoTexto,
} from './textos-documento';

describe('textos das peças (homologação 26/09/2026)', () => {
  it('rótulos legíveis — nunca o código interno', () => {
    expect(rotuloModalidade('DISPENSA_ELETRONICA')).toBe('Dispensa eletrônica');
    expect(rotuloModalidade('PREGAO_ELETRONICO')).toBe('Pregão eletrônico');
    expect(rotuloModalidade('NOVA_MODALIDADE')).toBe('Nova modalidade');
    expect(rotuloCriterio('MENOR_PRECO')).toBe('menor preço');
    expect(rotuloModoDisputa('ABERTO_FECHADO')).toBe('aberto e fechado');
  });

  it('quantidade no padrão brasileiro, sem zeros inúteis, com a unidade no singular/plural', () => {
    expect(formatarQuantidade('12.0000')).toBe('12');
    expect(formatarQuantidade('1.5000')).toBe('1,5');
    expect(formatarQuantidade(1200)).toBe('1.200');
    expect(quantidadeComUnidade('12.0000', 'MES')).toBe('12 meses');
    expect(quantidadeComUnidade('1.0000', 'SERVICO')).toBe('1 serviço');
    expect(quantidadeComUnidade('2.5', 'QUILOGRAMA')).toBe('2,5 kg');
    expect(quantidadeComUnidade(3, 'FARDO')).toBe('3 FARDO');
  });

  it('cadastro com "A definir" é tratado como ausente; local e data', () => {
    expect(valorCadastral('A definir')).toBe('');
    expect(valorCadastral('00000-000')).toBe('');
    expect(valorCadastral(' Barreiras ')).toBe('Barreiras');
    expect(localDoOrgao({ cidade: 'A definir', uf: 'BA' })).toBe('');
    expect(localDoOrgao({ cidade: 'Barreiras', uf: 'ba' })).toBe('Barreiras/BA');
    expect(localEData('', '26 de setembro de 2026')).toBe('26 de setembro de 2026');
    expect(localEData('Barreiras/BA', '26 de setembro de 2026')).toBe('Barreiras/BA, 26 de setembro de 2026');
  });

  it('variáveis: conhecidas trocadas, sem valor ou desconhecidas viram "—"; nada cru', () => {
    expect(substituirVariaveis('{{a.b}} {{ c }} {{d}}', { 'a.b': 'X', c: '', d: 'Y' })).toBe('X — Y');
    expect(variaveisDoTexto('<p>{{orgao.nome}} e {{ licitacao.objeto }}</p>')).toEqual(['orgao.nome', 'licitacao.objeto']);
    expect(semVariaveisCruas('CNPJ: {{orgao.cnpj}}')).toBe('CNPJ: —');
  });
});
