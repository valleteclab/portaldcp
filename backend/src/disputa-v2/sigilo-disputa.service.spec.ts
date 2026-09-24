import { anonimizarPayload, idAnonimo, semValorReferencia } from './sigilo-disputa.service';

describe('sigilo da disputa (E1a)', () => {
  const F1 = '11111111-1111-4111-8111-111111111111';
  const subs = [
    { de: 'ACME Comércio "Ltda"', para: 'Fornecedor A', dono: F1 },
    { de: '12.345.678/0001-90', para: 'Fornecedor A', dono: F1 },
    { de: F1, para: 'anonimo-a', dono: F1 },
  ];

  it('troca id, CNPJ e razão social em qualquer profundidade e dentro de textos', () => {
    const payload = {
      fornecedor_id: F1,
      eventos: [{ descricao: 'Fornecedor ACME Comércio "Ltda" convocado', dados: { cnpj: '12.345.678/0001-90' } }],
    };
    const r = anonimizarPayload(payload, subs);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(F1);
    expect(texto).not.toContain('ACME');
    expect(texto).not.toContain('12.345.678');
    expect(r.fornecedor_id).toBe('anonimo-a');
    expect(r.eventos[0].descricao).toBe('Fornecedor Fornecedor A convocado');
  });

  it('não altera o payload sem substituições nem valores nulos', () => {
    expect(anonimizarPayload(null, subs)).toBeNull();
    const p = { a: 1 };
    expect(anonimizarPayload(p, [])).toBe(p);
  });

  it('idAnonimo segue o formato da disputa-v2', () => {
    expect(idAnonimo('Fornecedor B')).toBe('anonimo-b');
  });

  it('semValorReferencia anula valores de referência/estimados em qualquer nível', () => {
    const r = semValorReferencia({
      itens: [{ id: 'x', valorReferencia: 10, meuMelhorLance: 9 }],
      licitacao: { valor_total_estimado: 100, itens: [{ valor_unitario_estimado: 5 }] },
    });
    expect(r.itens[0].valorReferencia).toBeNull();
    expect(r.itens[0].meuMelhorLance).toBe(9);
    expect(r.licitacao.valor_total_estimado).toBeNull();
    expect(r.licitacao.itens[0].valor_unitario_estimado).toBeNull();
  });
});
