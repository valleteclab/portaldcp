/**
 * "Excluir processo" de uma contratação que já tramitou (11/2026).
 *
 * Todo processo conduzido pelo fluxo tramita ("Encaminhado pelo fluxo"). A FK
 * de `tramitacoes_processo` para a licitação não tem cascade: a exclusão dava
 * 500. Agora a tramitação sai junto, como as peças e os itens.
 */
import { AppE2E, OrgaoFixture, criarApp, criarLicitacao, criarOrgao } from './support';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Excluir contratação que já tramitou', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Órgão da exclusão com tramitação' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  test('a tramitação sai junto e a exclusão responde 200', async () => {
    const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    const [{ id: setor }] = await sql(`INSERT INTO setores (orgao_id, codigo, nome) VALUES ($1, $2, $3) RETURNING id::text AS id`, [
      A.id,
      `EXC-${Date.now()}`,
      'Contabilidade (exclusão)',
    ]);
    await ctx.http().post(`/api/fase-interna/${lic.id}/tramitar`).set(bearer(A.token)).send({ para_setor_id: setor, despacho: 'Para a dotação.' }).expect(201);
    const [{ n: antes }] = await sql(`SELECT count(*)::int AS n FROM tramitacoes_processo WHERE licitacao_id = $1`, [lic.id]);
    expect(antes).toBeGreaterThan(0);

    const r = await ctx.http().delete(`/api/licitacoes/${lic.id}`).set(bearer(A.token));
    expect(r.status).toBe(200);
    const [{ n: depois }] = await sql(`SELECT count(*)::int AS n FROM tramitacoes_processo WHERE licitacao_id = $1`, [lic.id]);
    expect(depois).toBe(0);
    expect(await sql(`SELECT 1 FROM licitacoes WHERE id = $1`, [lic.id])).toEqual([]);
  });
});
