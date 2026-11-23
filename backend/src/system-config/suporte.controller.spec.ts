import { SuporteController, SUPORTE_WHATSAPP_PADRAO } from './suporte.controller';

describe('SuporteController — contato do suporte no portal do fornecedor', () => {
  const comValor = (valor: string | null) =>
    new SuporteController({ getValue: jest.fn(async () => valor) } as any);

  it('sem configuração, usa o número padrão', async () => {
    expect(await comValor(null).contato()).toEqual({ whatsapp: SUPORTE_WHATSAPP_PADRAO });
  });

  it('número sem DDI ganha o 55 do Brasil', async () => {
    expect(await comValor('(77) 98125-1987').contato()).toEqual({ whatsapp: '5577981251987' });
  });

  it('número já com DDI fica como está', async () => {
    expect(await comValor('+55 77 98125-1987').contato()).toEqual({ whatsapp: '5577981251987' });
  });

  it('valor vazio desliga o botão', async () => {
    expect(await comValor('').contato()).toEqual({ whatsapp: null });
  });
});
