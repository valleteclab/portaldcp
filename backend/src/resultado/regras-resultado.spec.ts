import {
  motivoVencedorInvalido,
  valorAdjudicadoDoUnitario,
  valorHomologado,
  valoresAdjudicadosDaAceitacao,
} from './regras-resultado';

/**
 * Regras do resultado único (plano E6 — Lei 14.133/2021 art. 71; IN SEGES
 * 73/2022 art. 29): vencedor HABILITADO, valores da proposta adequada aceita
 * (não o lance) e valor homologado = soma dos adjudicados (inclusive no lote).
 */
describe('regras do resultado (E6)', () => {
  describe('vencedor da adjudicação', () => {
    test('só o HABILITADO (ou já VENCEDOR) recebe a adjudicação', () => {
      expect(motivoVencedorInvalido('Item 1', { fornecedorId: 'f', situacao: 'HABILITADO' })).toBeNull();
      expect(motivoVencedorInvalido('Item 1', { fornecedorId: 'f', situacao: 'VENCEDOR' })).toBeNull();
    });

    test.each(['ACEITO', 'CLASSIFICADO', 'CONVOCADO_ACEITACAO', 'INABILITADO', 'RECUSADO', 'DESCLASSIFICADO'])(
      'licitante %s não é adjudicado',
      (situacao) => {
        expect(motivoVencedorInvalido('Item 1', { fornecedorId: 'f', situacao })).toMatch(/só se adjudica ao HABILITADO/);
      },
    );

    test('unidade sem vencedor → pendência (aceitação/habilitação ou deserta/fracassada)', () => {
      expect(motivoVencedorInvalido('Lote 2', null)).toMatch(/Lote 2: não há licitante .* habilitado/);
    });
  });

  describe('valores adjudicados = proposta adequada aceita', () => {
    test('item: vale o valor readequado (lance 900 → proposta 890), não o lance', () => {
      const v = valoresAdjudicadosDaAceitacao('Item 1', [{ itemId: 'i1', numero: 1, quantidade: 10 }], [
        { itemId: 'i1', valorUnitario: 89, valorTotal: 890 },
      ]);
      expect(v).toEqual([{ itemId: 'i1', numero: 1, quantidade: 10, valorUnitario: 89, valorTotal: 890 }]);
    });

    test('lote: cada item do lote com o seu valor aceito (ordem do número)', () => {
      const v = valoresAdjudicadosDaAceitacao(
        'Lote 1',
        [
          { itemId: 'b', numero: 2, quantidade: 20 },
          { itemId: 'a', numero: 1, quantidade: 10 },
        ],
        [
          { itemId: 'a', valorUnitario: 45.5, valorTotal: 455 },
          { itemId: 'b', valorUnitario: 22.25, valorTotal: 445 },
        ],
      );
      expect(v.map((x) => [x.itemId, x.valorTotal])).toEqual([
        ['a', 455],
        ['b', 445],
      ]);
    });

    test('item do lote sem valor aceito → erro (nunca completa com o lance)', () => {
      expect(() =>
        valoresAdjudicadosDaAceitacao('Lote 1', [{ itemId: 'a', numero: 1, quantidade: 1 }, { itemId: 'b', numero: 2, quantidade: 1 }], [
          { itemId: 'a', valorUnitario: 10, valorTotal: 10 },
        ]),
      ).toThrow(/Lote 1: .*item\(ns\) 2/);
      expect(() => valoresAdjudicadosDaAceitacao('Item 3', [{ itemId: 'x', numero: 3, quantidade: 1 }], null)).toThrow(/item\(ns\) 3/);
    });

    test('dispensa/seleção externa: unitário × quantidade, total ao centavo', () => {
      expect(valorAdjudicadoDoUnitario({ itemId: 'i', numero: 1, quantidade: 3 }, 33.3333)).toEqual({
        itemId: 'i',
        numero: 1,
        quantidade: 3,
        valorUnitario: 33.3333,
        valorTotal: 100,
      });
      expect(() => valorAdjudicadoDoUnitario({ itemId: 'i', numero: 1, quantidade: 3 }, 0)).toThrow();
    });
  });

  describe('valor homologado = soma dos adjudicados', () => {
    test('soma só itens ADJUDICADO/HOMOLOGADO com vencedor (deserto/fracassado/sem vencedor fora)', () => {
      expect(
        valorHomologado([
          { status: 'ADJUDICADO', fornecedor_vencedor_id: 'd', valor_total_homologado: '890.00' },
          { status: 'HOMOLOGADO', fornecedor_vencedor_id: 'd', valor_total_homologado: 905.1 },
          { status: 'DESERTO', fornecedor_vencedor_id: null, valor_total_homologado: null },
          { status: 'FRACASSADO', fornecedor_vencedor_id: null, valor_total_homologado: 500 },
          { status: 'ATIVO', fornecedor_vencedor_id: 'x', valor_total_homologado: 999 },
        ]),
      ).toBe(1795.1);
    });

    test('lote: soma dos itens do lote readequados = total aceito do lote', () => {
      const lote = valoresAdjudicadosDaAceitacao(
        'Lote 1',
        [
          { itemId: 'a', numero: 1, quantidade: 10 },
          { itemId: 'b', numero: 2, quantidade: 20 },
        ],
        [
          { itemId: 'a', valorUnitario: 45.5, valorTotal: 455 },
          { itemId: 'b', valorUnitario: 22.255, valorTotal: 445.1 },
        ],
      );
      const itens = lote.map((v) => ({ status: 'ADJUDICADO', fornecedor_vencedor_id: 'v', valor_total_homologado: v.valorTotal }));
      expect(valorHomologado(itens)).toBe(900.1);
    });

    test('nada adjudicado → 0 (o ato recusa)', () => {
      expect(valorHomologado([])).toBe(0);
    });
  });
  // Operador × autoridade (quem registra × quem pratica o ato): formalizacao/regras-formalizacao.spec.ts
});
