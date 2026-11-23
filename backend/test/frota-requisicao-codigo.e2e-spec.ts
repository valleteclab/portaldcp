/**
 * FROTA — o código da requisição de abastecimento (REQ-AAAA-NNNN) é numerado
 * por órgão. Dois órgãos têm, cada um, a sua REQ-AAAA-0001; antes a unicidade
 * era do sistema inteiro e o segundo órgão recebia erro 500 para sempre.
 */
import { AppE2E, OrgaoFixture, criarApp, criarOrgao } from './support';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const corpo = (placa: string) => ({
  solicitante_nome: 'Vereador Teste',
  solicitante_cargo: 'Vereador',
  veiculo_placa: placa,
  tipo_combustivel: 'GASOLINA',
  quantidade_autorizada: 30,
  finalidade: 'Fiscalização de obras',
});

describe('Frota: código da requisição de abastecimento por órgão', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  const criar = (o: OrgaoFixture, placa: string) => ctx.http().post('/api/frota/requisicoes').set(bearer(o.token)).send(corpo(placa));
  const ano = new Date().getFullYear();

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Frota A' });
    B = await criarOrgao(ctx, { nome: 'Câmara Frota B' });
  });
  afterAll(async () => {
    await ctx?.fechar();
  });

  it('cada órgão começa a sua própria numeração', async () => {
    const a1 = await criar(A, 'AAA1A11');
    const b1 = await criar(B, 'BBB1B11');
    expect([a1.status, b1.status]).toEqual([201, 201]);
    expect([a1.body.codigo, b1.body.codigo]).toEqual([`REQ-${ano}-0001`, `REQ-${ano}-0001`]);
    const a2 = await criar(A, 'AAA1A11');
    expect(a2.body.codigo).toBe(`REQ-${ano}-0002`);
  });

  it('requisição excluída não faz o número se repetir', async () => {
    const a3 = await criar(A, 'AAA1A11');
    expect(a3.body.codigo).toBe(`REQ-${ano}-0003`);
    // some a do meio: contar as linhas daria de novo 0003, que já existe
    await ctx.dataSource.query(`DELETE FROM frota_requisicoes_abastecimento WHERE orgao_id = $1 AND codigo = $2`, [A.id, `REQ-${ano}-0002`]);
    const a4 = await criar(A, 'AAA1A11');
    expect({ status: a4.status, codigo: a4.body.codigo }).toEqual({ status: 201, codigo: `REQ-${ano}-0004` });
  });

  it('dois pedidos ao mesmo tempo no mesmo órgão: os dois entram, com códigos diferentes', async () => {
    const [x, y] = await Promise.all([criar(B, 'BBB1B11'), criar(B, 'BBB1B11')]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(x.body.codigo).not.toBe(y.body.codigo);
  });

  it('um órgão não enxerga as requisições do outro', async () => {
    const r = await ctx.http().get('/api/frota/requisicoes').set(bearer(B.token));
    expect(r.status).toBe(200);
    expect((r.body as any[]).every((x) => x.veiculo_placa === 'BBB1B11')).toBe(true);
  });
});
