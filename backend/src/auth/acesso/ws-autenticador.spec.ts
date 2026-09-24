import { UserType } from '../auth.service';
import { WsAutenticador, atorDoSocket } from './ws-autenticador';

function socket(handshake: any): any {
  return { handshake, data: {}, nsp: { name: '/teste' } };
}

function autenticador(opts: { verifyFalha?: boolean } = {}) {
  const jwtService = {
    verify: jest.fn((token: string) => {
      if (opts.verifyFalha || token === 'ruim') throw new Error('jwt malformed');
      if (token === 'forn') return { sub: 'f1', type: UserType.FORNECEDOR };
      if (token === 'frota') return { sub: 'p1', type: 'FROTA_POSTO' };
      return { sub: 'o1', type: UserType.ORGAO };
    }),
  };
  const authService = { validateToken: jest.fn(async (p: any) => p) };
  return new WsAutenticador(jwtService as any, authService as any);
}

describe('WsAutenticador', () => {
  it('lê o token de auth.token ou do header Authorization (nunca do payload)', () => {
    expect(WsAutenticador.tokenDoHandshake(socket({ auth: { token: 'abc' } }))).toBe('abc');
    expect(WsAutenticador.tokenDoHandshake(socket({ auth: { token: 'Bearer abc' } }))).toBe('abc');
    expect(WsAutenticador.tokenDoHandshake(socket({ headers: { authorization: 'Bearer xyz' } }))).toBe('xyz');
    expect(WsAutenticador.tokenDoHandshake(socket({ headers: {} }))).toBeNull();
  });

  it('token válido → ator em client.data', async () => {
    const s = socket({ auth: { token: 'forn' } });
    const ator = await autenticador().autenticar(s);
    expect(ator).toMatchObject({ tipo: 'FORNECEDOR', fornecedorId: 'f1' });
    expect(atorDoSocket(s)).toBe(ator);
  });

  it('sem token → anônimo (null); com exigirLogin → recusa', async () => {
    const s = socket({ headers: {} });
    await expect(autenticador().autenticar(s)).resolves.toBeNull();
    expect(atorDoSocket(s)).toBeNull();
    await expect(autenticador().autenticar(socket({}), { exigirLogin: true })).rejects.toThrow('Autenticação necessária');
  });

  it('token inválido ou de outra área → recusa (não vira anônimo)', async () => {
    await expect(autenticador().autenticar(socket({ auth: { token: 'ruim' } }))).rejects.toThrow('Token inválido ou expirado');
    await expect(autenticador().autenticar(socket({ auth: { token: 'frota' } }))).rejects.toThrow('Token inválido ou expirado');
  });

  it('instalar: middleware chama next() ou next(erro)', async () => {
    let middleware: any;
    const ns = { use: (fn: any) => (middleware = fn) };
    autenticador().instalar(ns as any);
    const ok = await new Promise((r) => middleware(socket({ auth: { token: 'org' } }), r));
    expect(ok).toBeUndefined();
    const erro: any = await new Promise((r) => middleware(socket({ auth: { token: 'ruim' } }), r));
    expect(erro).toBeInstanceOf(Error);
  });
});
