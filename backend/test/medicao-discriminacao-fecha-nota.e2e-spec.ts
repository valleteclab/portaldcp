/**
 * MEDIÇÃO — a discriminação das despesas tem que fechar com o valor da nota.
 * O fornecedor não consegue enviar a medição quando a soma das linhas da
 * discriminação é diferente do valor da nota fiscal (caso da Câmara, 11/2026:
 * só o ISS lançado, faltando o valor dos serviços).
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao } from './support';
import { Medicao, StatusMedicao } from '../src/contratos/entities/medicao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Medição: discriminação das despesas fecha com o valor da nota', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let F: FornecedorFixture;
  let contrato: string;
  let n = 0;
  const http = () => ctx.http();

  async function criarMedicao(valor: number): Promise<string> {
    n += 1;
    const repo = ctx.dataSource.getRepository(Medicao);
    const m: any = await repo.save(
      repo.create({
        contrato_id: contrato,
        numero_medicao: n,
        periodo_inicio: new Date(`2026-0${n}-01`),
        periodo_fim: new Date(`2026-0${n}-28`),
        valor_medido: valor,
        valor_acumulado_atual: valor,
        percentual_fisico_medido: 1,
        status: StatusMedicao.RASCUNHO,
      } as any),
    );
    return m.id;
  }
  const discriminar = (medicao: string, itens: Array<{ descricao: string; valor: number; percentual: number }>) =>
    http().post(`/api/fornecedor/contratos/medicoes/${medicao}/discriminacoes`).set(bearer(F.token)).send({ itens });
  const enviar = (medicao: string, corpo: Record<string, unknown> = {}) =>
    http().patch(`/api/fornecedor/contratos/medicoes/${medicao}/submeter`).set(bearer(F.token)).send(corpo);
  const statusDe = async (medicao: string) => (await ctx.dataSource.query(`SELECT status FROM medicoes WHERE id = $1`, [medicao]))[0].status;

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Câmara Discriminação' });
    F = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const c = await http()
      .post('/api/contratos')
      .set(bearer(A.token))
      .send({
        fornecedor_id: F.id,
        fornecedor_cnpj: F.cnpj,
        fornecedor_razao_social: F.razao_social,
        objeto: 'Manutenção de ar-condicionado — E2E',
        modalidade_execucao: 'CONTINUADO',
        valor_inicial: 250000,
        valor_global: 250000,
        data_assinatura: '2026-01-02',
        data_vigencia_inicio: '2026-01-02',
        data_vigencia_fim: '2026-12-31',
      });
    if (![200, 201].includes(c.status)) throw new Error(`[fixture] contrato → ${c.status} ${JSON.stringify(c.body)}`);
    contrato = c.body.id;
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  it('só o ISS numa nota de R$ 20.820,48: a medição não é enviada e a mensagem diz quanto falta', async () => {
    const m = await criarMedicao(20820.48);
    expect([200, 201]).toContain((await discriminar(m, [{ descricao: 'ISS', valor: 520.51, percentual: 2.5 }])).status);
    const r = await enviar(m, { nota_fiscal_numero: '408', nota_fiscal_valor: 20820.48 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/discriminação das despesas soma R\$\s520,51/);
    expect(r.body.message).toMatch(/Faltam R\$\s20\.299,97/);
    expect(await statusDe(m)).toBe(StatusMedicao.RASCUNHO);
  });

  it('com o valor dos serviços incluído, fechando a nota, a discriminação não barra o envio', async () => {
    const m = await criarMedicao(20820.48);
    await discriminar(m, [
      { descricao: 'ISS', valor: 520.51, percentual: 2.5 },
      { descricao: 'Servisos', valor: 20299.97, percentual: 97.5 }, // o nome da linha é livre
    ]);
    const r = await enviar(m, { nota_fiscal_numero: '408', nota_fiscal_valor: 20820.48 });
    expect(String(r.body?.message ?? '')).not.toMatch(/discriminação das despesas/i);
    expect({ status: r.status, msg: r.body?.message }).toEqual({ status: 200, msg: undefined });
    expect(await statusDe(m)).toBe(StatusMedicao.SUBMETIDA);
  });

  it('soma acima da nota também não passa', async () => {
    const m = await criarMedicao(1000);
    await discriminar(m, [
      { descricao: 'ISS', valor: 50, percentual: 5 },
      { descricao: 'Serviços', valor: 1000, percentual: 95 },
    ]);
    const r = await enviar(m, { nota_fiscal_valor: 1000 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Passou R\$\s50,00/);
    expect(await statusDe(m)).toBe(StatusMedicao.RASCUNHO);
  });

  it('sem valor de nota informado, a soma tem que dar o valor da medição', async () => {
    const m = await criarMedicao(1000);
    await discriminar(m, [{ descricao: 'ISS', valor: 50, percentual: 5 }]);
    const r = await enviar(m);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/valor da medição é R\$\s1\.000,00/);
  });

  it('medição sem discriminação nenhuma continua sendo enviada como antes', async () => {
    const m = await criarMedicao(1000);
    const r = await enviar(m, { nota_fiscal_valor: 1000 });
    expect(String(r.body?.message ?? '')).not.toMatch(/discriminação das despesas/i);
    expect(r.status).toBe(200);
  });
});
