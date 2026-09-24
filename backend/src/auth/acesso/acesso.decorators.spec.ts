import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '../auth.service';
import { PapelGuard, PapelPermitido } from './acesso.decorators';

function contexto(user: any): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

function guardCom(papeis: PapelPermitido[] | undefined) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(papeis) } as unknown as Reflector;
  return new PapelGuard(reflector);
}

const ORGAO = { sub: 'o1', type: UserType.ORGAO };
const USUARIO = { sub: 'u1', type: UserType.USUARIO, orgaoId: 'o1' };
const FORNECEDOR = { sub: 'f1', type: UserType.FORNECEDOR };
const ADMIN = { sub: 'super-admin', type: UserType.ADMIN };

describe('PapelGuard', () => {
  it('sem metadado de papel, não interfere', () => {
    expect(guardCom(undefined).canActivate(contexto(undefined))).toBe(true);
  });

  describe('@SomenteOrgao (ORGAO, ADMIN)', () => {
    const g = guardCom(['ORGAO', 'ADMIN']);
    it('aceita órgão, usuário do órgão e admin', () => {
      expect(g.canActivate(contexto(ORGAO))).toBe(true);
      expect(g.canActivate(contexto(USUARIO))).toBe(true);
      expect(g.canActivate(contexto(ADMIN))).toBe(true);
    });
    it('recusa fornecedor com 403 e anônimo com 401', () => {
      expect(() => g.canActivate(contexto(FORNECEDOR))).toThrow(ForbiddenException);
      expect(() => g.canActivate(contexto(undefined))).toThrow(UnauthorizedException);
    });
    it('recusa usuário sem órgão', () => {
      expect(() => g.canActivate(contexto({ sub: 'u', type: UserType.USUARIO }))).toThrow(ForbiddenException);
    });
  });

  describe('@SomenteFornecedor (FORNECEDOR)', () => {
    const g = guardCom(['FORNECEDOR']);
    it('aceita só fornecedor — nem admin age como fornecedor', () => {
      expect(g.canActivate(contexto(FORNECEDOR))).toBe(true);
      expect(() => g.canActivate(contexto(ORGAO))).toThrow(ForbiddenException);
      expect(() => g.canActivate(contexto(ADMIN))).toThrow(ForbiddenException);
    });
  });

  describe('@OrgaoOuFornecedor', () => {
    const g = guardCom(['ORGAO', 'FORNECEDOR', 'ADMIN']);
    it('aceita os três perfis', () => {
      for (const u of [ORGAO, USUARIO, FORNECEDOR, ADMIN]) expect(g.canActivate(contexto(u))).toBe(true);
    });
  });
});
