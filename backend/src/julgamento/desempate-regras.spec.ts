import {
  CRITERIOS_ART60,
  CRITERIOS_AUTOMATICOS,
  CriterioDesempate,
  DadosLicitanteDesempate,
  aplicarCriteriosAutomaticos,
  blocosPorChave,
  empateResolvido,
  motivoOfertaDisputaFinalInvalida,
  motivoPrazoDisputaFinalInvalido,
} from './desempate-regras';

const CNPJ = '11222333000181';
const dado = (id: string, over: Partial<DadosLicitanteDesempate> = {}): DadosLicitanteDesempate => ({
  fornecedorId: id,
  uf: 'BA',
  cpfCnpj: CNPJ,
  declaracaoIntegridade: false,
  ...over,
});

describe('desempate — Lei 14.133/2021 art. 60 (ordem dos critérios)', () => {
  test('ordem legal: I disputa final, II desempenho, III equidade, IV integridade, §1º I–IV, sorteio', () => {
    expect(CRITERIOS_ART60.map((c) => c.criterio)).toEqual([
      CriterioDesempate.DISPUTA_FINAL,
      CriterioDesempate.DESEMPENHO_CONTRATUAL,
      CriterioDesempate.EQUIDADE_GENERO,
      CriterioDesempate.PROGRAMA_INTEGRIDADE,
      CriterioDesempate.EMPRESA_DO_ESTADO,
      CriterioDesempate.EMPRESA_BRASILEIRA,
      CriterioDesempate.PESQUISA_TECNOLOGIA_PAIS,
      CriterioDesempate.MITIGACAO_EMISSOES,
      CriterioDesempate.SORTEIO,
    ]);
    expect(CRITERIOS_AUTOMATICOS).not.toContain(CriterioDesempate.DISPUTA_FINAL);
    expect(CRITERIOS_AUTOMATICOS).not.toContain(CriterioDesempate.SORTEIO);
  });

  test('sem dado no sistema: II, III, §1º III e IV registrados como NÃO APLICÁVEIS e pulados', () => {
    const r = aplicarCriteriosAutomaticos([['a', 'b']], [dado('a'), dado('b')], { ufOrgao: 'BA' });
    const porCriterio = new Map(r.trilha.map((p) => [p.criterio, p]));
    for (const c of [
      CriterioDesempate.DESEMPENHO_CONTRATUAL,
      CriterioDesempate.EQUIDADE_GENERO,
      CriterioDesempate.PESQUISA_TECNOLOGIA_PAIS,
      CriterioDesempate.MITIGACAO_EMISSOES,
    ]) {
      expect(porCriterio.get(c)?.aplicavel).toBe(false);
      expect(porCriterio.get(c)?.motivo).toMatch(/Não aplicável/);
    }
    expect(r.blocos).toEqual([['a', 'b']]);
    expect(empateResolvido(r.blocos)).toBe(false);
  });

  test('IV (integridade) vem ANTES do §1º I (empresa do Estado)', () => {
    // a: integridade, de SP; b: sem integridade, da BA (órgão BA) → IV decide a favor de a
    const r = aplicarCriteriosAutomaticos(
      [['b', 'a']],
      [dado('a', { declaracaoIntegridade: true, uf: 'SP' }), dado('b', { uf: 'BA' })],
      { ufOrgao: 'BA' },
    );
    expect(r.blocos).toEqual([['a'], ['b']]);
    const decisivo = r.trilha.find((p) => p.desempatou);
    expect(decisivo?.criterio).toBe(CriterioDesempate.PROGRAMA_INTEGRIDADE);
    // parou depois de resolver: §1º não aparece
    expect(r.trilha.map((p) => p.criterio)).not.toContain(CriterioDesempate.EMPRESA_DO_ESTADO);
  });

  test('§1º I: empresa estabelecida no Estado do órgão tem preferência', () => {
    const r = aplicarCriteriosAutomaticos([['a', 'b', 'c']], [dado('a', { uf: 'SP' }), dado('b', { uf: 'BA' }), dado('c', { uf: 'PE' })], {
      ufOrgao: 'BA',
    });
    expect(r.blocos).toEqual([['b'], ['a', 'c']]);
    expect(r.trilha.find((p) => p.criterio === CriterioDesempate.EMPRESA_DO_ESTADO)?.desempatou).toBe(true);
  });

  test('§1º II: empresa brasileira (CNPJ + UF do país) antes de CPF/sem cadastro', () => {
    const r = aplicarCriteriosAutomaticos([['a', 'b']], [dado('a', { cpfCnpj: '12345678901', uf: 'SP' }), dado('b', { uf: 'SP' })], {
      ufOrgao: 'BA',
    });
    expect(r.blocos).toEqual([['b'], ['a']]);
  });

  test('critérios dividem cada bloco sem alterar a ordem entre blocos', () => {
    const r = aplicarCriteriosAutomaticos(
      [['x'], ['a', 'b'], ['c', 'd']],
      [dado('a', { uf: 'SP' }), dado('b'), dado('c'), dado('d', { declaracaoIntegridade: true })],
      { ufOrgao: 'BA' },
    );
    expect(r.blocos).toEqual([['x'], ['b'], ['a'], ['d'], ['c']]);
  });

  test('UF do órgão desconhecida: §1º I não aplicável', () => {
    const r = aplicarCriteriosAutomaticos([['a', 'b']], [dado('a', { uf: 'SP' }), dado('b')], { ufOrgao: null });
    expect(r.trilha.find((p) => p.criterio === CriterioDesempate.EMPRESA_DO_ESTADO)?.aplicavel).toBe(false);
  });

  test('disputa final: blocos pela nova chave (menor preço crescente, maior lance decrescente)', () => {
    const m = [
      { fornecedorId: 'a', chave: 90, registradoEm: 1 },
      { fornecedorId: 'b', chave: 100, registradoEm: 2 },
      { fornecedorId: 'c', chave: 90, registradoEm: 3 },
    ];
    expect(blocosPorChave(m, 'MENOR')).toEqual([['a', 'c'], ['b']]);
    expect(blocosPorChave(m, 'MAIOR')).toEqual([['b'], ['a', 'c']]);
    expect(blocosPorChave([{ fornecedorId: 'a', chave: 0.81234 }, { fornecedorId: 'b', chave: 0.81231 }], 'MAIOR', 4)).toEqual([['a', 'b']]);
  });

  test('nova proposta da disputa final: estritamente melhor que o valor atual; prazo 1–60 min', () => {
    expect(motivoOfertaDisputaFinalInvalida(99.99, 100, 'MENOR')).toBeNull();
    expect(motivoOfertaDisputaFinalInvalida(100, 100, 'MENOR')).toMatch(/MENOR/);
    expect(motivoOfertaDisputaFinalInvalida(100.5, 100, 'MAIOR')).toBeNull();
    expect(motivoOfertaDisputaFinalInvalida(99.999, 100, 'MENOR')).toMatch(/2 casas/);
    expect(motivoPrazoDisputaFinalInvalido(5)).toBeNull();
    expect(motivoPrazoDisputaFinalInvalido(0)).toMatch(/1 a 60/);
    expect(motivoPrazoDisputaFinalInvalido(61)).toMatch(/1 a 60/);
  });
});
