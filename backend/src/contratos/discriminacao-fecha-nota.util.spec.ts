import { conferirDiscriminacaoFechaNota } from './discriminacao-fecha-nota.util';

describe('Discriminação das despesas fecha com o valor da nota', () => {
  it('caso real: só o ISS (R$ 520,51) numa nota de R$ 20.820,48 não passa', () => {
    const r = conferirDiscriminacaoFechaNota([{ valor: 520.51 }], 20820.48, 20820.48);
    expect(r.ok).toBe(false);
    expect(r.diferenca).toBe(20299.97);
    expect(r.mensagem).toMatch(/soma R\$\s520,51/);
    expect(r.mensagem).toMatch(/nota fiscal é R\$\s20\.820,48/);
    expect(r.mensagem).toMatch(/Faltam R\$\s20\.299,97/);
  });

  it('ISS + serviços fechando a nota passa, qualquer que seja o nome das linhas', () => {
    expect(conferirDiscriminacaoFechaNota([{ valor: 520.51 }, { valor: 20299.97 }], 20820.48, 20820.48).ok).toBe(true);
    expect(conferirDiscriminacaoFechaNota([{ valor: '520.51' }, { valor: '20299.97' }], '20820.48', null).ok).toBe(true);
  });

  it('diferença de centavos de arredondamento (até R$ 0,02) passa; R$ 0,03 não', () => {
    expect(conferirDiscriminacaoFechaNota([{ valor: 333.33 }, { valor: 333.33 }, { valor: 333.33 }], 1000, 1000).ok).toBe(true);
    expect(conferirDiscriminacaoFechaNota([{ valor: 999.98 }], 1000, 1000).ok).toBe(true);
    expect(conferirDiscriminacaoFechaNota([{ valor: 999.97 }], 1000, 1000).ok).toBe(false);
  });

  it('soma acima da nota também não passa', () => {
    const r = conferirDiscriminacaoFechaNota([{ valor: 800 }, { valor: 300 }], 1000, 1000);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/Passou R\$\s100,00/);
  });

  it('sem valor de nota informado, a referência é o valor da medição', () => {
    const r = conferirDiscriminacaoFechaNota([{ valor: 100 }], 0, 500);
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/valor da medição é R\$\s500,00/);
    expect(conferirDiscriminacaoFechaNota([{ valor: 500 }], null, 500).ok).toBe(true);
  });

  it('nota e medição com valores diferentes: vale o da nota', () => {
    expect(conferirDiscriminacaoFechaNota([{ valor: 480 }], 480, 500).ok).toBe(true);
    expect(conferirDiscriminacaoFechaNota([{ valor: 500 }], 480, 500).ok).toBe(false);
  });

  it('sem linha nenhuma, ou sem valor de referência, não há o que conferir', () => {
    expect(conferirDiscriminacaoFechaNota([], 1000, 1000).ok).toBe(true);
    expect(conferirDiscriminacaoFechaNota([{ valor: 10 }], 0, 0).ok).toBe(true);
  });
});
