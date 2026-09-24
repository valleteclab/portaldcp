import { UserType } from '../auth.service';
import { atorDaRequisicao, atorDoPayload, ehAdmin, ehFornecedor, ehOrgao } from './ator';

describe('atorDoPayload', () => {
  it('ORGAO: orgaoId = sub', () => {
    const a = atorDoPayload({ sub: 'org-1', type: UserType.ORGAO });
    expect(a).toMatchObject({ tipo: 'ORGAO', id: 'org-1', orgaoId: 'org-1', fornecedorId: null, admin: false });
    expect(ehOrgao(a)).toBe(true);
    expect(ehFornecedor(a)).toBe(false);
  });

  it('USUARIO: orgaoId do token (camelCase ou snake_case legado)', () => {
    const a = atorDoPayload({ sub: 'u-1', type: UserType.USUARIO, orgaoId: 'org-1', role: 'PREGOEIRO' });
    expect(a).toMatchObject({ tipo: 'USUARIO', usuarioId: 'u-1', orgaoId: 'org-1', role: 'PREGOEIRO' });
    expect(ehOrgao(a)).toBe(true);
    const legado = atorDoPayload({ sub: 'u-2', type: UserType.USUARIO, orgao_id: 'org-2' } as any);
    expect(legado?.orgaoId).toBe('org-2');
  });

  it('USUARIO sem órgão não é "órgão"', () => {
    const a = atorDoPayload({ sub: 'u-1', type: UserType.USUARIO });
    expect(a?.orgaoId).toBeNull();
    expect(ehOrgao(a)).toBe(false);
  });

  it('FORNECEDOR: fornecedorId = sub, sem órgão', () => {
    const a = atorDoPayload({ sub: 'f-1', type: UserType.FORNECEDOR });
    expect(a).toMatchObject({ tipo: 'FORNECEDOR', fornecedorId: 'f-1', orgaoId: null });
    expect(ehFornecedor(a)).toBe(true);
    expect(ehOrgao(a)).toBe(false);
  });

  it('ADMIN: admin = true, sem órgão', () => {
    const a = atorDoPayload({ sub: 'super-admin', type: UserType.ADMIN });
    expect(ehAdmin(a)).toBe(true);
    expect(ehOrgao(a)).toBe(false);
  });

  it('ausente ou tipo desconhecido → null (ex.: tokens FROTA_*)', () => {
    expect(atorDoPayload(undefined)).toBeNull();
    expect(atorDoPayload({ sub: 'x', type: 'FROTA_POSTO' } as any)).toBeNull();
    expect(atorDaRequisicao({})).toBeNull();
  });
});
