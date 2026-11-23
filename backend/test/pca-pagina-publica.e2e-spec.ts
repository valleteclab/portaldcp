/**
 * PCA — a página pública de transparência (`/api/pca/publico/*`) abre sem login.
 * A classe do controlador é restrita ao órgão; as rotas marcadas como públicas
 * pediam login por engano e a página mostrava "PCA não encontrado".
 */
import { AppE2E, OrgaoFixture, criarApp, criarOrgao } from './support';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('PCA: página pública sem login', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let pca: string;

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara PCA Público' });
    const r = await ctx.http().post('/api/pca').set(bearer(A.token)).send({ orgao_id: A.id, ano_exercicio: 2031 });
    if (r.status !== 201) throw new Error(`[fixture] pca → ${r.status} ${JSON.stringify(r.body)}`);
    pca = r.body.id;
  });
  afterAll(async () => {
    await ctx?.fechar();
  });

  it('plano em rascunho não aparece para o público (404, não 401)', async () => {
    const r = await ctx.http().get(`/api/pca/publico/${A.cnpj}/2031`);
    expect(r.status).toBe(404);
  });

  it('plano publicado abre sem login, com o nome do órgão', async () => {
    expect((await ctx.http().patch(`/api/pca/${pca}/aprovar`).set(bearer(A.token)).send({})).status).toBe(200);
    expect((await ctx.http().patch(`/api/pca/${pca}/publicar`).set(bearer(A.token)).send({})).status).toBe(200);
    const r = await ctx.http().get(`/api/pca/publico/${A.cnpj}/2031`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ano_exercicio: 2031, orgao: { nome: 'Câmara PCA Público' } });
    const anos = await ctx.http().get(`/api/pca/publico/${A.cnpj}`);
    expect(anos.status).toBe(200);
  });

  it('as rotas do órgão continuam pedindo login', async () => {
    expect((await ctx.http().get(`/api/pca/${pca}`)).status).toBe(401);
    expect((await ctx.http().patch(`/api/pca/${pca}/publicar`).send({})).status).toBe(401);
  });
});
