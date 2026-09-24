import {
  BaseLance,
  ContextoValidacaoLance,
  LanceRecusado,
  OrigemLance,
  referenciaNaBase,
  reducaoMinima,
  validarLance,
  valoresDoLance,
  valoresGravados,
  valorPropostaNaBase,
} from './modelo-lance';

/**
 * Regras do lance do motor único (E2) — IN SEGES 73/2022 arts. 21–22,
 * Lei 14.133 art. 56 §3º, LC 123 art. 45.
 */
describe('modelo-lance', () => {
  const agora = new Date('2026-09-25T12:00:00Z');
  const base = (p: Partial<ContextoValidacaoLance> = {}): ContextoValidacaoLance => ({
    origem: OrigemLance.LANCE,
    valor: 900,
    statusItem: 'EM_DISPUTA',
    sessaoSuspensa: false,
    propostaNaBase: 1000,
    meuUltimo: { valor: 1000, origem: OrigemLance.PROPOSTA, criadoEm: new Date(agora.getTime() - 60_000) },
    melhor: { valor: 950, fornecedorId: 'outro' },
    valoresDeOutros: [950, 980],
    diferencaMinima: null,
    intervaloProprioSegundos: 0,
    agora,
    ...p,
  });
  const codigo = (c: ContextoValidacaoLance): string | null => {
    try {
      validarLance(c);
      return null;
    } catch (e) {
      expect(e).toBeInstanceOf(LanceRecusado);
      return (e as LanceRecusado).codigo;
    }
  };

  describe('valores unitário × total (fim do B2)', () => {
    it('TOTAL_ITEM: valor é o total; unitário = total ÷ quantidade', () => {
      expect(valoresDoLance(920, BaseLance.TOTAL_ITEM, 10)).toEqual({ valor_unitario: 92, valor_total: 920 });
      expect(valoresDoLance(910, BaseLance.TOTAL_ITEM, 20)).toEqual({ valor_unitario: 45.5, valor_total: 910 });
    });
    it('UNITARIO: valor é o unitário; total = unitário × quantidade (centavos)', () => {
      expect(valoresDoLance(1.235, BaseLance.UNITARIO, 3)).toEqual({ valor_unitario: 1.235, valor_total: 3.71 });
    });
    it('unitário com 4 casas quando a divisão não é exata', () => {
      expect(valoresDoLance(100, BaseLance.TOTAL_ITEM, 3).valor_unitario).toBe(33.3333);
    });
    it('proposta e referência na base do lance', () => {
      const pi = { valor_unitario: 95, valor_total: 950 };
      expect(valorPropostaNaBase(pi, BaseLance.TOTAL_ITEM, 10)).toBe(950);
      expect(valorPropostaNaBase(pi, BaseLance.UNITARIO, 10)).toBe(95);
      expect(referenciaNaBase({ valor_unitario_estimado: 100, valor_total_estimado: 1000, quantidade: 10 }, BaseLance.TOTAL_ITEM)).toBe(1000);
      expect(referenciaNaBase({ valor_unitario_estimado: 100, valor_total_estimado: 1000, quantidade: 10 }, BaseLance.UNITARIO)).toBe(100);
    });
    it('linha antiga sem colunas explícitas deriva pela base; linha nova usa as colunas', () => {
      expect(valoresGravados({ valor: 920 }, BaseLance.TOTAL_ITEM, 10)).toEqual({ valor_unitario: 92, valor_total: 920 });
      expect(valoresGravados({ valor: 920, valor_unitario: '92.0000', valor_total: '920.00' }, BaseLance.UNITARIO, 10)).toEqual({
        valor_unitario: 92,
        valor_total: 920,
      });
    });
  });

  describe('LANCE (etapa aberta)', () => {
    it('lance válido passa', () => expect(codigo(base())).toBeNull());
    it('valor inválido (zero, negativo, NaN, > 4 casas)', () => {
      expect(codigo(base({ valor: 0 }))).toBe('VALOR_INVALIDO');
      expect(codigo(base({ valor: -1 }))).toBe('VALOR_INVALIDO');
      expect(codigo(base({ valor: NaN }))).toBe('VALOR_INVALIDO');
      expect(codigo(base({ valor: 900.12345 }))).toBe('VALOR_INVALIDO');
    });
    it('item fora de disputa → 409 "não está em disputa"', () => {
      try {
        validarLance(base({ statusItem: 'ENCERRADO' }));
        fail('deveria recusar');
      } catch (e: any) {
        expect(e.codigo).toBe('ITEM_FORA_DE_DISPUTA');
        expect(e.estado).toBe(true);
        expect(e.message).toMatch(/não está em disputa/);
      }
    });
    it('sessão suspensa → 409', () => expect(codigo(base({ sessaoSuspensa: true }))).toBe('SESSAO_SUSPENSA'));
    it('sem proposta válida no item', () => expect(codigo(base({ propostaNaBase: null }))).toBe('SEM_PROPOSTA'));
    it('igual ou acima da própria proposta', () => {
      expect(codigo(base({ valor: 1000, meuUltimo: null }))).toBe('ACIMA_DA_PROPOSTA');
      expect(codigo(base({ valor: 1005 }))).toBe('ACIMA_DA_PROPOSTA');
    });
    it('não cobre o próprio lance anterior (IN 73 art. 21 §2º)', () => {
      const c = base({ valor: 935, meuUltimo: { valor: 930, origem: OrigemLance.LANCE, criadoEm: agora } });
      expect(codigo(c)).toBe('ACIMA_DO_PROPRIO');
    });
    it('igual ao melhor lance → recusado com "igual ao melhor"', () => {
      try {
        validarLance(base({ valor: 950 }));
        fail('deveria recusar');
      } catch (e: any) {
        expect(e.codigo).toBe('IGUAL_AO_MELHOR');
        expect(e.message).toMatch(/igual ao melhor/i);
      }
    });
    it('LANCES IGUAIS: intermediário igual a lance já registrado de outro → recusado (prevalece o primeiro)', () => {
      expect(codigo(base({ valor: 980 }))).toBe('IGUAL_A_LANCE_REGISTRADO');
    });
    it('intermediário diferente dos demais é aceito (IN 73 permite lance intermediário)', () => {
      expect(codigo(base({ valor: 970 }))).toBeNull();
    });

    describe('diferença mínima do edital (IN 73 art. 21 §2º, art. 22 §1º)', () => {
      const dif = { tipo: 'VALOR' as const, valor: 5 };
      it('intermediário: redução menor que a mínima sobre o PRÓPRIO último é recusada', () => {
        // proposta 990 → 989 (redução de R$ 1 < R$ 5) — caso do e2e do pregão
        const c = base({ valor: 989, propostaNaBase: 990, meuUltimo: { valor: 990, origem: OrigemLance.PROPOSTA, criadoEm: agora }, melhor: { valor: 900, fornecedorId: 'x' }, valoresDeOutros: [900], diferencaMinima: dif });
        expect(codigo(c)).toBe('DIFERENCA_MINIMA');
      });
      it('intermediário: redução exatamente igual à mínima é aceita', () => {
        const c = base({ valor: 985, propostaNaBase: 990, meuUltimo: { valor: 990, origem: OrigemLance.PROPOSTA, criadoEm: agora }, melhor: { valor: 900, fornecedorId: 'x' }, valoresDeOutros: [900], diferencaMinima: dif });
        expect(codigo(c)).toBeNull();
      });
      it('lance que cobre a melhor oferta: tem de ficar a pelo menos a mínima abaixo dela', () => {
        // próprio 1000 (redução grande), melhor 950: 948 fica só R$ 2 abaixo do melhor
        expect(codigo(base({ valor: 948, diferencaMinima: dif }))).toBe('DIFERENCA_MINIMA_MELHOR');
        expect(codigo(base({ valor: 945, diferencaMinima: dif }))).toBeNull();
      });
      it('percentual: 1% sobre a referência', () => {
        const pct = { tipo: 'PERCENTUAL' as const, valor: 1 };
        expect(reducaoMinima(pct, 1000)).toBe(10);
        expect(codigo(base({ valor: 991, diferencaMinima: pct, melhor: null, valoresDeOutros: [] }))).toBe('DIFERENCA_MINIMA');
        expect(codigo(base({ valor: 990, diferencaMinima: pct, melhor: null, valoresDeOutros: [] }))).toBeNull();
      });
      it('sem diferença no edital (null ou 0): só vale "abaixo do próprio"', () => {
        expect(codigo(base({ valor: 999.99, melhor: null, valoresDeOutros: [] }))).toBeNull();
        expect(codigo(base({ valor: 999.99, melhor: null, valoresDeOutros: [], diferencaMinima: { tipo: 'VALOR', valor: 0 } }))).toBeNull();
      });
    });

    describe('intervalo de tempo entre lances do próprio fornecedor (parâmetro, padrão 0)', () => {
      const ultimoLance = (msAtras: number) => ({ valor: 960, origem: OrigemLance.LANCE, criadoEm: new Date(agora.getTime() - msAtras) });
      it('0 = desligado', () => expect(codigo(base({ meuUltimo: ultimoLance(100) }))).toBeNull());
      it('configurado: recusa antes do intervalo, aceita depois', () => {
        expect(codigo(base({ intervaloProprioSegundos: 20, meuUltimo: ultimoLance(5_000) }))).toBe('INTERVALO_PROPRIO');
        expect(codigo(base({ intervaloProprioSegundos: 20, meuUltimo: ultimoLance(21_000) }))).toBeNull();
      });
      it('não conta a proposta convertida (o 1º lance não espera)', () => {
        expect(codigo(base({ intervaloProprioSegundos: 60 }))).toBeNull();
      });
    });
  });

  describe('DESEMPATE_MPE (LC 123 art. 45, I)', () => {
    const mpe = (p: Partial<ContextoValidacaoLance> = {}) =>
      base({ origem: OrigemLance.DESEMPATE_MPE, statusItem: 'ENCERRADO', diferencaMinima: { tipo: 'VALOR', valor: 50 }, ...p });
    it('só depois de encerrada a disputa do item', () => expect(codigo(mpe({ statusItem: 'EM_DISPUTA' }))).toBe('ITEM_NAO_ENCERRADO'));
    it('tem de ser ESTRITAMENTE menor que o melhor lance', () => {
      expect(codigo(mpe({ valor: 950 }))).toBe('DESEMPATE_NAO_COBRE');
      expect(codigo(mpe({ valor: 949.99 }))).toBeNull(); // sem diferença mínima no desempate
    });
  });

  describe('NEGOCIACAO (Lei 14.133 art. 61)', () => {
    it('após o encerramento e abaixo do próprio melhor', () => {
      const n = (p: Partial<ContextoValidacaoLance>) => base({ origem: OrigemLance.NEGOCIACAO, statusItem: 'ENCERRADO', ...p });
      expect(codigo(n({ valor: 1000 }))).toBe('NEGOCIACAO_NAO_REDUZ');
      expect(codigo(n({ valor: 940 }))).toBeNull();
    });
  });

  it('origens dos modos ainda não ligadas → recusa explícita (409)', () => {
    for (const origem of [OrigemLance.LANCE_FECHADO, OrigemLance.JANELA_DISPENSA, OrigemLance.PROPOSTA]) {
      expect(codigo(base({ origem }))).toBe('ORIGEM_NAO_SUPORTADA');
    }
  });
});
