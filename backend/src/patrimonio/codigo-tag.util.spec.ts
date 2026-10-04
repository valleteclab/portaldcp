import { ehTagDeTerceiro, pareceCodigoDoOrgao, plaquetaDeEpcAscii } from './codigo-tag.util';

/** Tags reais capturadas no teste do RFD8500 (03/10/2026, Câmara de LEM). */
const DE_TERCEIRO = [
  '303A059301EE93C000002CD9', // SGTIN-96: etiqueta de produto de varejo
  '10303284000970B22AE80606CFCB481D', // EPC de 128 bits
  '3BE1000000B5ED4F00001F8B',
  '3BE10000375F5A8D00000D9B',
  '3BE1000000A8EF7100000081', // termina em 0081: quase virou "tombo 81"
  '3BE1000023836A3900000098',
  'AAA1000022A82475000003DF',
  'AAA1000023A8E2BD0000013A',
  'AAA10000239E4E42000000D9',
  'AAA1000023DEE74A00000022',
];

/** EPC das 100 etiquetas da Câmara: tombo em decimal com zeros à esquerda. */
const DO_ORGAO = [
  '000000000000000000000087',
  '000000000000000000001661',
  '000000000000000000001678',
  '000000000000000000003252',
];

describe('triagem de código lido na conferência', () => {
  describe('pareceCodigoDoOrgao', () => {
    it('aceita o EPC das etiquetas do órgão', () => {
      for (const epc of DO_ORGAO) expect(pareceCodigoDoOrgao(epc)).toBe(true);
    });

    it('aceita o QR da plaqueta e o uuid solto', () => {
      expect(pareceCodigoDoOrgao('https://compras.cmlem.ba.gov.br/p/7da97e75-054f-4f5b-ab42-c53a30f929ce')).toBe(true);
      expect(pareceCodigoDoOrgao('7da97e75-054f-4f5b-ab42-c53a30f929ce')).toBe(true);
    });

    it('aceita a plaqueta digitada, com ou sem zeros', () => {
      expect(pareceCodigoDoOrgao('87')).toBe(true);
      expect(pareceCodigoDoOrgao('000087')).toBe(true);
      expect(pareceCodigoDoOrgao(' 1678 ')).toBe(true);
    });

    it('recusa toda tag de terceiro lida no teste real', () => {
      for (const epc of DE_TERCEIRO) expect(pareceCodigoDoOrgao(epc)).toBe(false);
    });

    it('recusa vazio e código só de zeros', () => {
      expect(pareceCodigoDoOrgao('')).toBe(false);
      expect(pareceCodigoDoOrgao('   ')).toBe(false);
      expect(pareceCodigoDoOrgao('000000000000000000000000')).toBe(false);
    });
  });

  describe('ehTagDeTerceiro', () => {
    it('descarta tag de varejo que não achou bem', () => {
      expect(ehTagDeTerceiro('303A059301EE93C000002CD9', false)).toBe(true);
    });

    it('NÃO descarta quando o código resolveu para um bem', () => {
      // EPC fora do padrão, mas que o resolvedor casou: a leitura vale.
      expect(ehTagDeTerceiro('434D4C454D30303034383200', true)).toBe(false);
    });

    it('NÃO descarta QR nem plaqueta sem bem — isso é DESCONHECIDO de verdade', () => {
      // bem físico sem cadastro: precisa aparecer no relatório da sala
      expect(ehTagDeTerceiro('https://compras.cmlem.ba.gov.br/p/7da97e75-054f-4f5b-ab42-c53a30f929ce', false)).toBe(false);
      expect(ehTagDeTerceiro('9999', false)).toBe(false);
    });
  });

  describe('plaquetaDeEpcAscii', () => {
    it('lê a plaqueta gravada em ASCII, com preenchimento de zeros', () => {
      // "CMLEM000482"
      expect(plaquetaDeEpcAscii('434D4C454D30303034383200')).toBe('482');
      // sem preenchimento
      expect(plaquetaDeEpcAscii('434D4C454D303030343832')).toBe('482');
    });

    it('rejeita EPC binário de terceiro, inclusive o que terminava em dígito válido', () => {
      for (const epc of DE_TERCEIRO) expect(plaquetaDeEpcAscii(epc)).toBeNull();
    });

    it('o caso que motivou o reforço: 3BE1…0081 não vira mais o tombo 81', () => {
      expect(plaquetaDeEpcAscii('3BE1000000A8EF7100000081')).toBeNull();
      expect(plaquetaDeEpcAscii('3BE1000023836A3900000098')).toBeNull();
    });

    it('exige ao menos dois dígitos seguidos — um dígito solto é coincidência', () => {
      // "ab9" -> um dígito só
      expect(plaquetaDeEpcAscii('6162390000000000')).toBeNull();
    });

    it('rejeita o que não é hex, tamanho ímpar ou zerado', () => {
      expect(plaquetaDeEpcAscii('ZZZZ')).toBeNull();
      expect(plaquetaDeEpcAscii('434D4C454D3030303438320')).toBeNull();
      expect(plaquetaDeEpcAscii('0000000000000000')).toBeNull();
    });
  });
});
