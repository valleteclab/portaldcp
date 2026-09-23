import { entradaHistoricoCancelamento, nomeDoAutor } from './cancelamento-requisicao.util';

describe('rastro do cancelamento de requisição/OS', () => {
  it('registra quem cancelou, o motivo e o status anterior (caso OS-0257/2026)', () => {
    const e = entradaHistoricoCancelamento(
      { id: 'u1', nome: 'Ednardo Silva De Souza', email: 'diretoria@cmlem.ba.gov.br' },
      'nao',
      'AUTORIZADA',
    );
    expect(e).toEqual({
      tipo_acao: 'CANCELADA',
      descricao: 'Cancelada por: Ednardo Silva De Souza',
      detalhes: 'Motivo: nao. Status anterior: AUTORIZADA.',
      usuario_id: 'u1',
      usuario_nome: 'Ednardo Silva De Souza',
    });
  });

  it('sem nome usa o e-mail; sem nada, deixa explícito que não identificou', () => {
    expect(nomeDoAutor({ email: 'x@y.gov.br' })).toBe('x@y.gov.br');
    expect(nomeDoAutor(null)).toBe('usuário não identificado');
    expect(entradaHistoricoCancelamento(null, '', null).detalhes).toBe(
      'Motivo: não informado. Status anterior: -.',
    );
  });
});
