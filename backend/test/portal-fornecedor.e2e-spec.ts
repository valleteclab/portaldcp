/**
 * Plano E8 (salas, fornecedor e público): endpoints novos das telas.
 *  - GET /api/portal-fornecedor/licitacoes: filtro/paginação no servidor, só
 *    licitações divulgadas + as do fornecedor, identidade do token;
 *  - GET /api/portal-fornecedor/participacoes: só as propostas do token;
 *  - GET /api/resultado/publico/licitacao/:id: sem vencedores antes da
 *    homologação; 404 para licitação não divulgada;
 *  - GET /api/sessao/licitacao/:id/sessoes: só o órgão dono (seletor da sala).
 */
import {
  AppE2E,
  criarApp,
  criarOrgao,
  criarFornecedor,
  criarLicitacao,
  levarAteFase,
  enviarProposta,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
} from './support';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';

describe('Portal do fornecedor e resultado público (E8)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outroOrgao: OrgaoFixture;
  let publicada: LicitacaoFixture;
  let interna: LicitacaoFixture;
  let f1: FornecedorFixture;
  let f2: FornecedorFixture;

  const get = (url: string, token?: string) => {
    const r = ctx.http().get(url);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx);
    outroOrgao = await criarOrgao(ctx);
    publicada = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
    await levarAteFase(ctx, publicada, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    interna = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
    f1 = await criarFornecedor(ctx, { porte: 'ME' });
    f2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    await enviarProposta(ctx, f1, publicada, [95, 45]);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  it('lista do fornecedor: só divulgadas, com a proposta do próprio token', async () => {
    const r1 = await get('/api/portal-fornecedor/licitacoes?limite=100', f1.token).expect(200);
    const ids = r1.body.itens.map((l: any) => l.id);
    expect(ids).toContain(publicada.id);
    expect(ids).not.toContain(interna.id);
    const minha = r1.body.itens.find((l: any) => l.id === publicada.id);
    expect(minha.minha_proposta).toMatchObject({ status: 'ENVIADA' });

    // F2 vê a licitação, mas nunca a proposta de F1
    const r2 = await get('/api/portal-fornecedor/licitacoes?limite=100', f2.token).expect(200);
    expect(r2.body.itens.find((l: any) => l.id === publicada.id).minha_proposta).toBeNull();

    // "Só as que participo" e filtro por fase, no servidor
    const part = await get('/api/portal-fornecedor/licitacoes?participando=true', f2.token).expect(200);
    expect(part.body.itens.map((l: any) => l.id)).not.toContain(publicada.id);
    const porFase = await get('/api/portal-fornecedor/licitacoes?fase=HOMOLOGACAO&limite=100', f1.token).expect(200);
    expect(porFase.body.itens.map((l: any) => l.id)).not.toContain(publicada.id);
  });

  it('lista e participações: exclusivas de fornecedor', async () => {
    await get('/api/portal-fornecedor/licitacoes').expect(401);
    await get('/api/portal-fornecedor/licitacoes', orgao.token).expect(403);
    await get('/api/portal-fornecedor/participacoes', orgao.token).expect(403);
  });

  it('participações: só as propostas do token, com a próxima ação', async () => {
    const r1 = await get('/api/portal-fornecedor/participacoes', f1.token).expect(200);
    expect(r1.body).toHaveLength(1);
    expect(r1.body[0].licitacao.id).toBe(publicada.id);
    expect(r1.body[0].proximaAcao.codigo).toBe('AGUARDAR_SESSAO');
    expect(r1.body[0].resultado).toBeNull();

    const r2 = await get('/api/portal-fornecedor/participacoes', f2.token).expect(200);
    expect(r2.body).toEqual([]);
  });

  it('resultado público: sem vencedores antes da homologação; 404 para não divulgada', async () => {
    const r = await get(`/api/resultado/publico/licitacao/${publicada.id}`).expect(200);
    expect(r.body).toMatchObject({ homologada: false, itens: [], contratos: [], atas: [], termos: [] });
    await get(`/api/resultado/publico/licitacao/${interna.id}`).expect(404);
    await get('/api/resultado/publico/licitacao/nao-e-uuid').expect(404);
  });

  it('sessões da licitação (seletor da sala): só o órgão dono', async () => {
    const dono = await get(`/api/sessao/licitacao/${publicada.id}/sessoes`, orgao.token).expect(200);
    expect(Array.isArray(dono.body)).toBe(true);
    const outro = await get(`/api/sessao/licitacao/${publicada.id}/sessoes`, outroOrgao.token);
    expect([403, 404]).toContain(outro.status);
    await get(`/api/sessao/licitacao/${publicada.id}/sessoes`, f1.token).expect(403);
  });
});
