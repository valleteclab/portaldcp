import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AcessoLicitacaoService, ehUuid } from './acesso-licitacao.service';
import { Ator } from './ator';

const LIC = '11111111-1111-1111-1111-111111111111';
const SESSAO = '22222222-2222-2222-2222-222222222222';
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const F1 = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
const F2 = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';

const ator = (p: Partial<Ator>): Ator => ({
  tipo: 'ORGAO',
  id: 'x',
  orgaoId: null,
  fornecedorId: null,
  usuarioId: null,
  admin: false,
  role: null,
  ...p,
});
const orgaoA = ator({ tipo: 'ORGAO', id: ORG_A, orgaoId: ORG_A });
const pregA = ator({ tipo: 'USUARIO', id: 'u', usuarioId: 'u', orgaoId: ORG_A });
const orgaoB = ator({ tipo: 'ORGAO', id: ORG_B, orgaoId: ORG_B });
const f1 = ator({ tipo: 'FORNECEDOR', id: F1, fornecedorId: F1 });
const f2 = ator({ tipo: 'FORNECEDOR', id: F2, fornecedorId: F2 });
const admin = ator({ tipo: 'ADMIN', id: 'super-admin', admin: true });

/** DataSource falso: licitação LIC do órgão A, sessão SESSAO de LIC, F1 com proposta. */
function servico() {
  const query = jest.fn(async (sql: string, params: any[]) => {
    if (sql.includes('FROM licitacoes WHERE id')) return params[0] === LIC ? [{ orgao_id: ORG_A }] : [];
    if (sql.includes('FROM sessoes_disputa')) return params[0] === SESSAO ? [{ licitacao_id: LIC, orgao_id: ORG_A }] : [];
    if (sql.includes('FROM propostas')) return params[0] === LIC && params[1] === F1 ? [{ '?column?': 1 }] : [];
    return [];
  });
  return { svc: new AcessoLicitacaoService({ query } as any), query };
}

describe('AcessoLicitacaoService', () => {
  describe('assertOrgaoDaLicitacao', () => {
    it('órgão dono, usuário do órgão e admin passam', async () => {
      const { svc } = servico();
      await expect(svc.assertOrgaoDaLicitacao(orgaoA, LIC)).resolves.toEqual({ licitacaoId: LIC, orgaoId: ORG_A });
      await expect(svc.assertOrgaoDaLicitacao(pregA, LIC)).resolves.toBeTruthy();
      await expect(svc.assertOrgaoDaLicitacao(admin, LIC)).resolves.toBeTruthy();
    });

    it('outro órgão: escrita → 403, leitura → 404', async () => {
      const { svc } = servico();
      await expect(svc.assertOrgaoDaLicitacao(orgaoB, LIC)).rejects.toThrow(ForbiddenException);
      await expect(svc.assertOrgaoDaLicitacao(orgaoB, LIC, 'leitura')).rejects.toThrow(NotFoundException);
    });

    it('fornecedor → 403; anônimo → 401; inexistente/malformado → 404 sem consultar o banco', async () => {
      const { svc, query } = servico();
      await expect(svc.assertOrgaoDaLicitacao(f1, LIC)).rejects.toThrow(ForbiddenException);
      await expect(svc.assertOrgaoDaLicitacao(null, LIC)).rejects.toThrow(UnauthorizedException);
      await expect(svc.assertOrgaoDaLicitacao(orgaoA, '99999999-9999-9999-9999-999999999999')).rejects.toThrow(NotFoundException);
      query.mockClear();
      await expect(svc.assertOrgaoDaLicitacao(orgaoA, 'nao-e-uuid')).rejects.toThrow(NotFoundException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  it('assertOrgaoDaSessao resolve a licitação da sessão', async () => {
    const { svc } = servico();
    await expect(svc.assertOrgaoDaSessao(pregA, SESSAO)).resolves.toEqual({ licitacaoId: LIC, orgaoId: ORG_A });
    await expect(svc.assertOrgaoDaSessao(orgaoB, SESSAO, 'leitura')).rejects.toThrow(NotFoundException);
  });

  it('assertProprioOrgao: só o próprio órgão (ou admin)', () => {
    const { svc } = servico();
    expect(() => svc.assertProprioOrgao(orgaoA, ORG_A)).not.toThrow();
    expect(() => svc.assertProprioOrgao(admin, ORG_A)).not.toThrow();
    expect(() => svc.assertProprioOrgao(orgaoB, ORG_A)).toThrow(ForbiddenException);
    expect(() => svc.assertProprioOrgao(f1, ORG_A)).toThrow(ForbiddenException);
  });

  describe('fornecedor', () => {
    it('assertFornecedorParticipa: só com proposta válida', async () => {
      const { svc } = servico();
      await expect(svc.assertFornecedorParticipa(f1, LIC)).resolves.toBe(F1);
      await expect(svc.assertFornecedorParticipa(f2, LIC)).rejects.toThrow(ForbiddenException);
      await expect(svc.assertFornecedorParticipa(orgaoA, LIC)).rejects.toThrow(ForbiddenException);
      await expect(svc.assertFornecedorParticipa(undefined, LIC)).rejects.toThrow(UnauthorizedException);
    });

    it('fornecedorDoToken: id do token; id divergente do cliente → 403', () => {
      const { svc } = servico();
      expect(svc.fornecedorDoToken(f2)).toBe(F2);
      expect(svc.fornecedorDoToken(f2, F2)).toBe(F2);
      expect(() => svc.fornecedorDoToken(f2, F1)).toThrow(ForbiddenException);
      expect(() => svc.fornecedorDoToken(orgaoA)).toThrow(ForbiddenException);
    });
  });

  it('relacaoComLicitacao', async () => {
    const { svc } = servico();
    expect(await svc.relacaoComLicitacao(orgaoA, LIC)).toBe('ORGAO_DONO');
    expect(await svc.relacaoComLicitacao(orgaoB, LIC)).toBeNull();
    expect(await svc.relacaoComLicitacao(f1, LIC)).toBe('FORNECEDOR_PARTICIPANTE');
    expect(await svc.relacaoComLicitacao(f2, LIC)).toBeNull();
    expect(await svc.relacaoComLicitacao(admin, LIC)).toBe('ADMIN');
    expect(await svc.relacaoComLicitacao(null, LIC)).toBeNull();
  });

  it('ehUuid', () => {
    expect(ehUuid(LIC)).toBe(true);
    expect(ehUuid('publicas')).toBe(false);
    expect(ehUuid(undefined)).toBe(false);
  });
});
