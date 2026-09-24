import { aplicarVisao, visaoDaManifestacao, LicitacaoResumo } from './manifestacao-acesso.util';
import { Ator } from '../auth/acesso/ator';

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const F1 = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
const F2 = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';

const ator = (p: Partial<Ator>): Ator => ({
  tipo: 'ORGAO', id: 'x', orgaoId: null, fornecedorId: null, usuarioId: null, admin: false, role: null, ...p,
});
const orgaoA = ator({ id: ORG_A, orgaoId: ORG_A });
const orgaoB = ator({ id: ORG_B, orgaoId: ORG_B });
const f1 = ator({ tipo: 'FORNECEDOR', id: F1, fornecedorId: F1 });
const f2 = ator({ tipo: 'FORNECEDOR', id: F2, fornecedorId: F2 });

const publicada: LicitacaoResumo = { id: 'l', orgao_id: ORG_A, fase: 'PUBLICADO', data_publicacao_edital: new Date() };
const interna: LicitacaoResumo = { ...publicada, fase: 'PREPARATORIA', data_publicacao_edital: null };

const pendente = { fornecedor_id: F1, resposta: null, data_resposta: null };
const respondida = { fornecedor_id: F1, resposta: 'ok', data_resposta: new Date() };

describe('visaoDaManifestacao', () => {
  it('órgão dono vê tudo; outro órgão só o que é público', () => {
    expect(visaoDaManifestacao(orgaoA, publicada, pendente)).toBe('DONO');
    expect(visaoDaManifestacao(orgaoB, publicada, pendente)).toBeNull();
    expect(visaoDaManifestacao(orgaoB, publicada, respondida)).toBe('PUBLICO');
  });

  it('fornecedor vê as próprias e as respondidas dos outros', () => {
    expect(visaoDaManifestacao(f1, publicada, pendente)).toBe('AUTOR');
    expect(visaoDaManifestacao(f2, publicada, pendente)).toBeNull();
    expect(visaoDaManifestacao(f2, publicada, respondida)).toBe('PUBLICO');
    expect(visaoDaManifestacao(null, publicada, respondida)).toBe('PUBLICO');
  });

  it('licitação não divulgada: nada público', () => {
    expect(visaoDaManifestacao(f2, interna, respondida)).toBeNull();
    expect(visaoDaManifestacao(null, null, respondida)).toBeNull();
  });
});

describe('aplicarVisao', () => {
  const m = {
    id: 'i', fornecedor_id: F1, nome_impugnante: 'Fulano', email_impugnante: 'x@y', documento_caminho: 'uploads/a.pdf',
    documento_nome: 'a.pdf', fornecedor: { id: F1, razao_social: 'F1 LTDA', senha: 'hash' }, licitacao: { id: 'l' }, resposta: 'ok',
  };
  const ident = ['nome_impugnante', 'email_impugnante'];

  it('nunca devolve a senha do fornecedor', () => {
    expect((aplicarVisao(m, 'DONO', ident) as any).fornecedor.senha).toBeUndefined();
  });

  it('pública: sem identidade, sem arquivo', () => {
    const p: any = aplicarVisao(m, 'PUBLICO', ident);
    expect(p.fornecedor_id).toBeNull();
    expect(p.fornecedor).toBeUndefined();
    expect(p.nome_impugnante).toBeUndefined();
    expect(p.documento_caminho).toBeUndefined();
    expect(p.documento_nome).toBeUndefined();
    expect(p.resposta).toBe('ok');
  });

  it('autor: mantém a própria identidade, sem caminho do arquivo no servidor', () => {
    const a: any = aplicarVisao(m, 'AUTOR', ident);
    expect(a.fornecedor_id).toBe(F1);
    expect(a.documento_nome).toBe('a.pdf');
    expect(a.documento_caminho).toBeUndefined();
  });
});
