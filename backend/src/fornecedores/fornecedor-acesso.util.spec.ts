import { UserType } from '../auth/auth.service';
import {
  camposNaoPermitidosParaOrgao,
  emailCorrespondeAoProprio,
  isAdmin,
  isOrgaoOuAdmin,
  isUuid,
  orgaoIdDoUsuario,
  podeAcessarFornecedor,
  regraPrecisaVinculo,
} from './fornecedor-acesso.util';

const FORN = '11111111-1111-4111-8111-111111111111';
const OUTRO_FORN = '22222222-2222-4222-8222-222222222222';
const ORGAO = '33333333-3333-4333-8333-333333333333';

const admin = { sub: 'super-admin', type: UserType.ADMIN };
const fornProprio = { sub: FORN, type: UserType.FORNECEDOR };
const fornOutro = { sub: OUTRO_FORN, type: UserType.FORNECEDOR };
const orgao = { sub: ORGAO, type: UserType.ORGAO };
const usuario = { sub: 'u1', type: UserType.USUARIO, orgaoId: ORGAO };
const usuarioSemOrgao = { sub: 'u2', type: UserType.USUARIO };
// Token com role "admin" mas tipo diferente de ADMIN não é admin
const falsoAdmin = { sub: 'u3', type: UserType.USUARIO, orgaoId: ORGAO, role: 'admin' };
const fornFalsoAdmin = { sub: OUTRO_FORN, type: UserType.FORNECEDOR, role: 'admin' };

describe('fornecedor-acesso.util', () => {
  describe('isAdmin', () => {
    it('só aceita type ADMIN', () => {
      expect(isAdmin(admin)).toBe(true);
      expect(isAdmin(falsoAdmin)).toBe(false);
      expect(isAdmin(fornFalsoAdmin)).toBe(false);
      expect(isAdmin(orgao)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
    });
  });

  describe('orgaoIdDoUsuario', () => {
    it('ORGAO usa sub; USUARIO usa orgaoId/orgao_id; demais null', () => {
      expect(orgaoIdDoUsuario(orgao)).toBe(ORGAO);
      expect(orgaoIdDoUsuario(usuario)).toBe(ORGAO);
      expect(orgaoIdDoUsuario({ sub: 'x', type: UserType.USUARIO, orgao_id: ORGAO } as any)).toBe(ORGAO);
      expect(orgaoIdDoUsuario(usuarioSemOrgao)).toBeNull();
      expect(orgaoIdDoUsuario(fornProprio)).toBeNull();
      expect(orgaoIdDoUsuario(admin)).toBeNull();
    });
  });

  describe('regra ADMIN (aprovar/suspender/reativar/analisar/admin/*)', () => {
    it('permite só ADMIN', () => {
      expect(podeAcessarFornecedor(admin, FORN, 'ADMIN')).toBe(true);
      expect(podeAcessarFornecedor(fornProprio, FORN, 'ADMIN')).toBe(false);
      expect(podeAcessarFornecedor(orgao, FORN, 'ADMIN', true)).toBe(false);
      expect(podeAcessarFornecedor(falsoAdmin, FORN, 'ADMIN', true)).toBe(false);
    });
  });

  describe('regra PROPRIO_OU_ADMIN (definir-senha, atualizar-cnpj)', () => {
    it('permite o próprio fornecedor e ADMIN', () => {
      expect(podeAcessarFornecedor(fornProprio, FORN, 'PROPRIO_OU_ADMIN')).toBe(true);
      expect(podeAcessarFornecedor(admin, FORN, 'PROPRIO_OU_ADMIN')).toBe(true);
    });
    it('nega outro fornecedor, órgão (mesmo com vínculo) e usuário', () => {
      expect(podeAcessarFornecedor(fornOutro, FORN, 'PROPRIO_OU_ADMIN')).toBe(false);
      expect(podeAcessarFornecedor(fornFalsoAdmin, FORN, 'PROPRIO_OU_ADMIN')).toBe(false);
      expect(podeAcessarFornecedor(orgao, FORN, 'PROPRIO_OU_ADMIN', true)).toBe(false);
      expect(podeAcessarFornecedor(usuario, FORN, 'PROPRIO_OU_ADMIN', true)).toBe(false);
    });
    it('não confunde sub de órgão igual ao id do fornecedor', () => {
      expect(podeAcessarFornecedor({ sub: FORN, type: UserType.ORGAO }, FORN, 'PROPRIO_OU_ADMIN')).toBe(false);
    });
  });

  describe('regra ORGAO_VINCULADO_OU_ADMIN (orgao/contato, orgao/solicitar-reset)', () => {
    it('permite órgão/usuário com vínculo e ADMIN', () => {
      expect(podeAcessarFornecedor(orgao, FORN, 'ORGAO_VINCULADO_OU_ADMIN', true)).toBe(true);
      expect(podeAcessarFornecedor(usuario, FORN, 'ORGAO_VINCULADO_OU_ADMIN', true)).toBe(true);
      expect(podeAcessarFornecedor(admin, FORN, 'ORGAO_VINCULADO_OU_ADMIN')).toBe(true);
    });
    it('nega órgão sem vínculo, usuário sem órgão e fornecedores', () => {
      expect(podeAcessarFornecedor(orgao, FORN, 'ORGAO_VINCULADO_OU_ADMIN', false)).toBe(false);
      expect(podeAcessarFornecedor(usuarioSemOrgao, FORN, 'ORGAO_VINCULADO_OU_ADMIN', true)).toBe(false);
      expect(podeAcessarFornecedor(fornProprio, FORN, 'ORGAO_VINCULADO_OU_ADMIN', true)).toBe(false);
      expect(podeAcessarFornecedor(fornOutro, FORN, 'ORGAO_VINCULADO_OU_ADMIN', true)).toBe(false);
    });
  });

  describe('regra PROPRIO_ORGAO_VINCULADO_OU_ADMIN (documentos, completo)', () => {
    it('permite próprio, órgão com vínculo e ADMIN', () => {
      expect(podeAcessarFornecedor(fornProprio, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN')).toBe(true);
      expect(podeAcessarFornecedor(orgao, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN', true)).toBe(true);
      expect(podeAcessarFornecedor(usuario, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN', true)).toBe(true);
      expect(podeAcessarFornecedor(admin, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN')).toBe(true);
    });
    it('nega outro fornecedor e órgão sem vínculo', () => {
      expect(podeAcessarFornecedor(fornOutro, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN', true)).toBe(false);
      expect(podeAcessarFornecedor(orgao, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN', false)).toBe(false);
    });
  });

  it('nega sem usuário ou sem id', () => {
    expect(podeAcessarFornecedor(undefined, FORN, 'PROPRIO_OU_ADMIN')).toBe(false);
    expect(podeAcessarFornecedor(admin, '', 'ADMIN')).toBe(false);
  });

  describe('regraPrecisaVinculo', () => {
    it('só consulta vínculo para tokens de órgão em regras com órgão', () => {
      expect(regraPrecisaVinculo(orgao, 'ORGAO_VINCULADO_OU_ADMIN')).toBe(true);
      expect(regraPrecisaVinculo(usuario, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN')).toBe(true);
      expect(regraPrecisaVinculo(orgao, 'PROPRIO_OU_ADMIN')).toBe(false);
      expect(regraPrecisaVinculo(orgao, 'ADMIN')).toBe(false);
      expect(regraPrecisaVinculo(fornProprio, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN')).toBe(false);
      expect(regraPrecisaVinculo(admin, 'ORGAO_VINCULADO_OU_ADMIN')).toBe(false);
      expect(regraPrecisaVinculo(usuarioSemOrgao, 'ORGAO_VINCULADO_OU_ADMIN')).toBe(false);
    });
  });

  describe('camposNaoPermitidosParaOrgao (PUT :id por órgão)', () => {
    it('aceita apenas razao_social e nome_fantasia', () => {
      expect(camposNaoPermitidosParaOrgao({ razao_social: 'X' })).toEqual([]);
      expect(camposNaoPermitidosParaOrgao({ razao_social: 'X', nome_fantasia: 'Y' })).toEqual([]);
      expect(camposNaoPermitidosParaOrgao({ razao_social: 'X', email: 'a@b.c' })).toEqual(['email']);
      expect(camposNaoPermitidosParaOrgao({ senha: '123', status: 'APROVADO' })).toEqual(['senha', 'status']);
    });
    it('ignora campos undefined e corpo vazio', () => {
      expect(camposNaoPermitidosParaOrgao({ razao_social: 'X', email: undefined })).toEqual([]);
      expect(camposNaoPermitidosParaOrgao(undefined)).toEqual([]);
    });
  });

  describe('emailCorrespondeAoProprio (completar-credenciamento)', () => {
    it('compara sem caixa/espaços e exige e-mail', () => {
      expect(emailCorrespondeAoProprio('a@b.com', ' A@B.com ')).toBe(true);
      expect(emailCorrespondeAoProprio('a@b.com', 'outro@b.com')).toBe(false);
      expect(emailCorrespondeAoProprio('', '')).toBe(false);
      expect(emailCorrespondeAoProprio(null, 'a@b.com')).toBe(false);
    });
  });

  describe('isOrgaoOuAdmin (cadastro-rapido, cadastrar-cnpj)', () => {
    it('permite ORGAO, USUARIO com órgão e ADMIN; nega FORNECEDOR', () => {
      expect(isOrgaoOuAdmin(orgao)).toBe(true);
      expect(isOrgaoOuAdmin(usuario)).toBe(true);
      expect(isOrgaoOuAdmin(admin)).toBe(true);
      expect(isOrgaoOuAdmin(fornProprio)).toBe(false);
      expect(isOrgaoOuAdmin(fornFalsoAdmin)).toBe(false);
      expect(isOrgaoOuAdmin(usuarioSemOrgao)).toBe(false);
      expect(isOrgaoOuAdmin(undefined)).toBe(false);
    });
  });

  describe('POST :id/documentos (PROPRIO_OU_ADMIN) e GET :id/habilitacao (PROPRIO_ORGAO_VINCULADO_OU_ADMIN)', () => {
    it('documentos: só o próprio ou ADMIN', () => {
      expect(podeAcessarFornecedor(fornProprio, FORN, 'PROPRIO_OU_ADMIN')).toBe(true);
      expect(podeAcessarFornecedor(fornOutro, FORN, 'PROPRIO_OU_ADMIN')).toBe(false);
      expect(podeAcessarFornecedor(orgao, FORN, 'PROPRIO_OU_ADMIN', true)).toBe(false);
    });
    it('habilitacao: órgão só com vínculo', () => {
      expect(podeAcessarFornecedor(usuario, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN', true)).toBe(true);
      expect(podeAcessarFornecedor(usuario, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN', false)).toBe(false);
      expect(podeAcessarFornecedor(fornOutro, FORN, 'PROPRIO_ORGAO_VINCULADO_OU_ADMIN')).toBe(false);
    });
  });

  describe('isUuid', () => {
    it('valida formato', () => {
      expect(isUuid(FORN)).toBe(true);
      expect(isUuid('abc')).toBe(false);
      expect(isUuid(undefined)).toBe(false);
    });
  });
});
