import { codigoDeVerificacao, jsonCanonico, numeroDoComprovante, RetratoComprovante } from './comprovantes.regras';

const retrato = (valor: number): RetratoComprovante => ({
  licitacao: { id: 'l1', processo: '2026/00073', edital: null, objeto: 'Mobiliário', orgao: 'Câmara' },
  fornecedor: { id: 'f1', razaoSocial: 'Alfa', cpfCnpj: '98765401000137' },
  proposta: { id: 'p1', status: 'ENVIADA', enviadaEm: '2026-11-10T00:00:00.000Z', valorTotal: valor, itens: [] },
  anexos: [],
});

describe('comprovantes do fornecedor', () => {
  test('número: CP-ano-sequência, no ano de Brasília', () => {
    expect(numeroDoComprovante(7, new Date('2026-11-10T12:00:00Z'))).toBe('CP-2026-000007');
    // 01/01 01:00 UTC ainda é 31/12 em Brasília
    expect(numeroDoComprovante(123456, new Date('2027-01-01T01:00:00Z'))).toBe('CP-2026-123456');
  });

  test('JSON canônico não depende da ordem das chaves', () => {
    expect(jsonCanonico({ b: 1, a: [{ d: 2, c: null }] })).toBe(jsonCanonico({ a: [{ c: null, d: 2 }], b: 1 }));
  });

  test('código de verificação: estável para o mesmo conteúdo e diferente se algo mudar', () => {
    const base = { tipo: 'PROPOSTA_ENVIADA', descricao: 'Proposta enviada', emitidoEm: '2026-11-10T00:00:00.000Z', retrato: retrato(100) };
    const c = codigoDeVerificacao(base);
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(codigoDeVerificacao({ ...base })).toBe(c);
    expect(codigoDeVerificacao({ ...base, retrato: retrato(100.01) })).not.toBe(c);
    expect(codigoDeVerificacao({ ...base, emitidoEm: '2026-11-10T00:00:01.000Z' })).not.toBe(c);
  });
});
