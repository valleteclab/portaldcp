import {
  campoAN,
  campoD,
  campoN,
  campoV,
  headerSiga,
  montarArquivosSiga,
  numeroEmpenhoSiga,
  textoSiga,
  traillerSiga,
} from './siga-arquivo.util';

describe('siga-arquivo.util', () => {
  it('AN: à esquerda, brancos à direita, corta no tamanho', () => {
    expect(campoAN('Mesa', 6)).toBe('Mesa  ');
    expect(campoAN('Cadeira giratória', 7)).toBe('Cadeira');
    expect(campoAN(null, 3)).toBe('   ');
  });

  it('AN: remove caracteres e palavras proibidos pelo SIGA', () => {
    expect(textoSiga("Mesa d'água; 2 gavetas")).toBe('Mesa d água 2 gavetas');
    expect(textoSiga('Cabo -- rede')).toBe('Cabo - rede');
    expect(textoSiga('Update de firmware')).not.toMatch(/update/i);
    expect(textoSiga('linha1\nlinha2')).toBe('linha1 linha2');
  });

  it('N: à direita com brancos; vazio só brancos; rejeita texto e estouro', () => {
    expect(campoN(42, 5)).toBe('   42');
    expect(campoN('', 4)).toBe('    ');
    expect(() => campoN('12a', 4)).toThrow();
    expect(() => campoN(12345, 4)).toThrow();
  });

  it('V: zeros à esquerda, sem separador, 2 casas; negativo com sinal', () => {
    expect(campoV(1234.5, 16)).toBe('0000000000123450');
    expect(campoV(0, 6)).toBe('000000');
    expect(campoV(null, 4)).toBe('0000');
    expect(campoV(-10, 8)).toBe('-0001000');
  });

  it('V: litros com 3 casas', () => {
    expect(campoV(45.678, 7, 3)).toBe('0045678');
  });

  it('D: ddmmaaaa, vazio em brancos, rejeita ano < 2000', () => {
    expect(campoD('2026-09-19')).toBe('19092026');
    expect(campoD(new Date(2025, 0, 5))).toBe('05012025');
    expect(campoD(null)).toBe('        ');
    expect(() => campoD('1999-12-31')).toThrow();
  });

  it('empenho: só dígitos do número, sem zeros à esquerda', () => {
    expect(numeroEmpenhoSiga('577/2025')).toBe('577');
    expect(numeroEmpenhoSiga('0659')).toBe('659');
    expect(numeroEmpenhoSiga('265/24')).toBe('265');
    expect(numeroEmpenhoSiga('')).toBe('');
    expect(numeroEmpenhoSiga(null)).toBe('');
  });

  it('header tem 162 posições e trailler 11', () => {
    const h = headerSiga({
      identificacao: 'Patrimonio',
      codigoUnidade: '123',
      nomeUnidade: 'Câmara Municipal',
      geradoEm: new Date('2026-09-19T15:30:00Z'),
    });
    expect(h.length).toBe(162);
    expect(h.slice(0, 1)).toBe('0');
    expect(h.slice(1, 16)).toBe('Patrimonio     ');
    expect(h.slice(16, 26)).toBe('19/09/2026');
    expect(h.slice(26, 34)).toBe('12:30:00'); // horário de Brasília
    expect(h.slice(38, 48)).toBe('SIGA      ');
    expect(h.slice(48, 52)).toBe(' 123');
    expect(h.slice(152, 162)).toBe('         1');
    expect(traillerSiga(7)).toBe('9         7');
  });

  it('monta arquivo com header, detalhes sequenciais e trailler', () => {
    const [arq] = montarArquivosSiga(
      { identificacao: 'Teste', codigoUnidade: '1', nomeUnidade: 'X' },
      ['a', 'b'],
      (item, seq) => '1' + campoAN(item, 3) + campoN(seq, 10),
    );
    const linhas = arq.conteudo.split('\r\n').filter(Boolean);
    expect(linhas.length).toBe(4);
    expect(linhas[1]).toBe('1' + 'a  ' + '2'.padStart(10, ' '));
    expect(linhas[2]).toBe('1' + 'b  ' + '3'.padStart(10, ' '));
    expect(linhas[3]).toBe('9         4');
    expect(arq.registros).toBe(2);
    expect(arq.nome).toBe('Teste.txt');
  });

  it('divide em partes de até 5.000 linhas', () => {
    const itens = Array.from({ length: 5000 }, (_, i) => i);
    const arquivos = montarArquivosSiga(
      { identificacao: 'Patrimonio', codigoUnidade: '1', nomeUnidade: 'X' },
      itens,
      (i, seq) => '1' + campoN(seq, 10),
    );
    expect(arquivos.length).toBe(2);
    expect(arquivos[0].registros).toBe(4998);
    expect(arquivos[1].registros).toBe(2);
    expect(arquivos[0].nome).toBe('Patrimonio_parte1.txt');
  });

  it('gera bytes em Latin-1 (acentos com 1 byte)', () => {
    const [arq] = montarArquivosSiga(
      { identificacao: 'T', codigoUnidade: '1', nomeUnidade: 'Câmara' },
      [],
      () => '',
    );
    expect(arq.buffer.length).toBe(arq.conteudo.length);
  });
});
