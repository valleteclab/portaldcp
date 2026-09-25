import { Ator } from '../auth/acesso/ator';
import { DonosArquivo, decidirAcesso } from './acesso-arquivos.service';

const ORGAO_A = '00000000-0000-4000-8000-00000000000a';
const ORGAO_B = '00000000-0000-4000-8000-00000000000b';
const FORN_1 = '00000000-0000-4000-8000-000000000001';
const FORN_2 = '00000000-0000-4000-8000-000000000002';

const base = { id: 'x', orgaoId: null, fornecedorId: null, usuarioId: null, admin: false, role: null };
const orgaoA: Ator = { ...base, tipo: 'ORGAO', id: ORGAO_A, orgaoId: ORGAO_A };
const servidorB: Ator = { ...base, tipo: 'USUARIO', orgaoId: ORGAO_B, usuarioId: 'u' };
const forn1: Ator = { ...base, tipo: 'FORNECEDOR', fornecedorId: FORN_1 };
const forn2: Ator = { ...base, tipo: 'FORNECEDOR', fornecedorId: FORN_2 };
const admin: Ator = { ...base, tipo: 'ADMIN', admin: true };

const donos = (d: Partial<DonosArquivo>): DonosArquivo => ({
  publico: false,
  registroFornecedor: false,
  orgaoIds: [],
  fornecedorIds: [],
  ...d,
});

describe('decidirAcesso (arquivo sensível)', () => {
  it('documento público de licitação sai para qualquer um', () => {
    expect(decidirAcesso(null, donos({ publico: true, orgaoIds: [ORGAO_A] }))).toBe('PERMITIDO');
  });

  it('anônimo → SEM_LOGIN', () => {
    expect(decidirAcesso(null, donos({ fornecedorIds: [FORN_1] }))).toBe('SEM_LOGIN');
  });

  it('ADMIN da plataforma sempre', () => {
    expect(decidirAcesso(admin, donos({ registroFornecedor: true }))).toBe('PERMITIDO');
  });

  describe('registro cadastral do fornecedor', () => {
    const reg = donos({ registroFornecedor: true, fornecedorIds: [FORN_1] });
    it('o próprio fornecedor', () => expect(decidirAcesso(forn1, reg)).toBe('PERMITIDO'));
    it('outro fornecedor não', () => expect(decidirAcesso(forn2, reg)).toBe('NEGADO'));
    it('órgão com vínculo (proposta/contrato)', () => expect(decidirAcesso(orgaoA, reg, true)).toBe('PERMITIDO'));
    it('órgão sem vínculo não', () => expect(decidirAcesso(orgaoA, reg, false)).toBe('NEGADO'));
    it('sem dono identificável: só ADMIN', () => {
      const orfao = donos({ registroFornecedor: true });
      expect(decidirAcesso(orgaoA, orfao)).toBe('NEGADO');
      expect(decidirAcesso(forn1, orfao)).toBe('NEGADO');
    });
  });

  describe('arquivo de registro de um órgão (medição, contrato, NF)', () => {
    const med = donos({ orgaoIds: [ORGAO_A], fornecedorIds: [FORN_1] });
    it('órgão do contrato', () => expect(decidirAcesso(orgaoA, med)).toBe('PERMITIDO'));
    it('fornecedor do contrato', () => expect(decidirAcesso(forn1, med)).toBe('PERMITIDO'));
    it('outro órgão NÃO, mesmo com vínculo com o fornecedor', () => expect(decidirAcesso(servidorB, med, true)).toBe('NEGADO'));
    it('outro fornecedor não', () => expect(decidirAcesso(forn2, med)).toBe('NEGADO'));
  });

  it('legado sem dono identificável (fora do registro cadastral): órgão sim, fornecedor não', () => {
    const legado = donos({});
    expect(decidirAcesso(orgaoA, legado)).toBe('PERMITIDO');
    expect(decidirAcesso(forn1, legado)).toBe('NEGADO');
  });
});
