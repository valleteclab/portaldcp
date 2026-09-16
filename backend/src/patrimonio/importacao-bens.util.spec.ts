import {
  lerLinhasPlanilha,
  parseValorPlanilha,
  vidaUtilPorTaxa,
  situacaoPorSetor,
  juntarObservacoes,
} from './importacao-bens.util';
import { EstadoConservacao } from './entities/enums';

describe('importacao-bens.util', () => {
  describe('lerLinhasPlanilha (CSV do sistema anterior)', () => {
    const csv =
      '﻿numero_patrimonio;descricao;setor;empenho;nota_fiscal;data_aquisicao;valor_nota\r\n' +
      '1315;"MESA TIPO ""L"" CURVA";RECEPÇÃO BLOCO A PISO II;106/2020;000.001.657;2020-10-16;3631.27\r\n' +
      '0042;CADEIRA;GABINETE 1;;000101225;2012-02-01;260.00\r\n';

    it('mantém tudo como texto: zeros à esquerda, barras, aspas e acentos', () => {
      const [a, b] = lerLinhasPlanilha(Buffer.from(csv, 'utf8'));
      expect(a.numero_patrimonio).toBe('1315');
      expect(a.descricao).toBe('MESA TIPO "L" CURVA');
      expect(a.setor).toBe('RECEPÇÃO BLOCO A PISO II');
      expect(a.empenho).toBe('106/2020');
      expect(a.nota_fiscal).toBe('000.001.657');
      expect(a.data_aquisicao).toBe('2020-10-16');
      expect(b.numero_patrimonio).toBe('0042');
      expect(b.nota_fiscal).toBe('000101225');
    });

    it('lê CSV em Latin-1 quando não é UTF-8 válido', () => {
      const [a] = lerLinhasPlanilha(Buffer.from('descricao;setor\nCADEIRA;PATRIMÔNIO\n', 'latin1'));
      expect(a.setor).toBe('PATRIMÔNIO');
    });
  });

  describe('parseValorPlanilha', () => {
    it('ponto decimal de exportação', () => {
      expect(parseValorPlanilha('3631.27')).toBe(3631.27);
      expect(parseValorPlanilha('5939119.13')).toBe(5939119.13);
    });
    it('formato brasileiro', () => {
      expect(parseValorPlanilha('R$ 1.234,56')).toBe(1234.56);
      expect(parseValorPlanilha('260,00')).toBe(260);
    });
    it('ponto como milhar quando só há grupos de 3 dígitos', () => {
      expect(parseValorPlanilha('1.500')).toBe(1500);
    });
    it('vazio e lixo viram null', () => {
      expect(parseValorPlanilha('')).toBeNull();
      expect(parseValorPlanilha('abc')).toBeNull();
    });
  });

  describe('vidaUtilPorTaxa', () => {
    it('taxa anual vira vida útil', () => {
      expect(vidaUtilPorTaxa('10.00')).toEqual({ vida_util_anos: 10 });
      expect(vidaUtilPorTaxa('20.00')).toEqual({ vida_util_anos: 5 });
      expect(vidaUtilPorTaxa('6.67')).toEqual({ vida_util_anos: 15 });
    });
    it('taxa zero não deprecia e deixa observação', () => {
      const r = vidaUtilPorTaxa('0.00');
      expect(r.vida_util_anos).toBeUndefined();
      expect(r.observacao).toContain('0%');
    });
    it('sem taxa não mexe', () => {
      expect(vidaUtilPorTaxa('')).toEqual({});
    });
  });

  describe('situacaoPorSetor', () => {
    it('inservíveis', () => {
      expect(situacaoPorSetor('BENS EM PROCESSO DEVOLUÇÃO/INSERVIVEIS').estado).toBe(EstadoConservacao.INSERVIVEL);
    });
    it('em localização e cedidos viram observação', () => {
      expect(situacaoPorSetor('BENS EM PROCESSO DE LOCALIZAÇÃO').observacao).toContain('localização');
      expect(situacaoPorSetor('BENS CEDIDOS').observacao).toContain('cedido');
    });
    it('imóveis viram categoria', () => {
      expect(situacaoPorSetor('BENS IMÓVEIS').categoria).toBe('Bens imóveis');
    });
    it('sala comum não tem situação', () => {
      expect(situacaoPorSetor('GABINETE 10')).toEqual({});
    });
  });

  it('juntarObservacoes ignora vazios e repetições', () => {
    expect(juntarObservacoes('', 'A.', undefined, 'A.', 'B.')).toBe('A. B.');
    expect(juntarObservacoes('', null)).toBeUndefined();
  });
});
