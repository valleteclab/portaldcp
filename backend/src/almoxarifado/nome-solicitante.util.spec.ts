import { nomeDoSolicitante } from './nome-solicitante.util';

const ID = '5fe7930a-1111-4222-8333-944455556666';

function managerCom(nome: string | null, falhar = false) {
  const findOne = jest.fn(async () => {
    if (falhar) throw new Error('banco fora');
    return nome === null ? null : { id: ID, nome };
  });
  return { manager: { getRepository: () => ({ findOne }) } as any, findOne };
}

describe('nomeDoSolicitante', () => {
  it('troca o e-mail gravado pelo nome do cadastro', async () => {
    const { manager } = managerCom('Gilberto Ferreira dos Santos');
    await expect(
      nomeDoSolicitante(manager, {
        usuario_solicitante_id: ID,
        usuario_solicitante_nome: 'gilberto.ferreira@cmlem.ba.gov.br',
      }),
    ).resolves.toBe('Gilberto Ferreira dos Santos');
  });

  it('mantém o nome gravado sem consultar o cadastro', async () => {
    const { manager, findOne } = managerCom('Outro Nome');
    await expect(
      nomeDoSolicitante(manager, {
        usuario_solicitante_id: ID,
        usuario_solicitante_nome: 'Maria das Graças',
      }),
    ).resolves.toBe('Maria das Graças');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('fica com o e-mail quando o usuário não existe ou a consulta falha', async () => {
    const dados = { usuario_solicitante_id: ID, usuario_solicitante_nome: 'x@y.gov.br' };
    await expect(nomeDoSolicitante(managerCom(null).manager, dados)).resolves.toBe('x@y.gov.br');
    await expect(nomeDoSolicitante(managerCom('', true).manager, dados)).resolves.toBe('x@y.gov.br');
  });

  it('não consulta com id que não é uuid', async () => {
    const { manager, findOne } = managerCom('Nome');
    await expect(
      nomeDoSolicitante(manager, { usuario_solicitante_id: 'sistema', usuario_solicitante_nome: '' }),
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });
});
