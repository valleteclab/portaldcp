/**
 * FILA AUTOMÁTICA (dono, 09/11/2026 — como Compras.gov.br e BLL): até N
 * unidades em disputa ao mesmo tempo, aviso prévio anunciado na sala e
 * abertura da próxima quando uma encerra. O relógio (cron) é parado nos e2e:
 * o tique da fila é chamado à mão.
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao } from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { FilaDisputaService } from '../src/disputa/fila-disputa.service';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Fila automática de itens/lotes', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let A: FornecedorFixture;
  let B: FornecedorFixture;
  const http = () => ctx.http();
  const tique = () => ctx.app.get(FilaDisputaService, { strict: false }).processarSessoesComFila();
  const status = async (licId: string) =>
    (await ctx.dataSource.query(`SELECT numero_item AS n, status_disputa::text AS st FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`, [licId])).map(
      (r: any) => `${r.n}:${r.st ?? 'AGUARDANDO'}`,
    );

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Câmara da Fila Automática' });
    A = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    B = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });
  afterAll(async () => ctx?.fechar());

  const pregao = () =>
    prepararPregaoEmDisputa(
      ctx,
      orgao,
      [
        { fornecedor: A, valores: [90, 90, 90] },
        { fornecedor: B, valores: [95, 95, 95] },
      ],
      {
        iniciarItens: false,
        itens: [1, 2, 3].map((n) => ({ descricao: `Item da fila ${n}`, quantidade: 1, valor_unitario_estimado: 100 })),
      },
    );

  test('configuração inválida → 400; sem aviso: abre até o máximo e a próxima quando uma encerra; conclui', async () => {
    const p = await pregao();
    expect((await http().post(`/api/disputa/sessao/${p.sessaoId}/fila`).set(bearer(orgao.token)).send({ maxSimultaneos: 0 })).status).toBe(400);
    expect((await http().post(`/api/disputa/sessao/${p.sessaoId}/fila`).set(bearer(orgao.token)).send({ maxSimultaneos: 2, avisoMinutos: 11 })).status).toBe(400);
    expect((await http().post(`/api/disputa/sessao/${p.sessaoId}/fila`).set(bearer(A.token)).send({ maxSimultaneos: 2 })).status).toBe(403);

    const r = await http().post(`/api/disputa/sessao/${p.sessaoId}/fila`).set(bearer(orgao.token)).send({ maxSimultaneos: 2, avisoMinutos: 0 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ativa: true, maxSimultaneos: 2, emDisputa: 2, aguardando: 1 });
    expect(await status(p.lic.id)).toEqual(['1:EM_DISPUTA', '2:EM_DISPUTA', '3:AGUARDANDO']);

    expect((await http().post(`/api/disputa/sessao/${p.sessaoId}/encerrar-item/${p.lic.itens[0].id}`).set(bearer(orgao.token))).status).toBe(201);
    await tique();
    expect((await status(p.lic.id))[2]).toBe('3:EM_DISPUTA');

    for (const it of p.lic.itens.slice(1)) await http().post(`/api/disputa/sessao/${p.sessaoId}/encerrar-item/${it.id}`).set(bearer(orgao.token));
    await tique();
    const e = (await http().get(`/api/disputa/sessao/${p.sessaoId}/fila`).set(bearer(orgao.token)).expect(200)).body;
    expect(e.ativa).toBe(false);
    const msgs = await ctx.dataSource.query(`SELECT descricao FROM eventos_sessao WHERE sessao_id = $1 AND descricao LIKE 'Fila automática%'`, [p.sessaoId]);
    expect(msgs.map((m: any) => m.descricao).join(' | ')).toMatch(/ligada.*concluída/s);
  });

  test('com aviso prévio: anuncia na sala, espera o prazo e abre', async () => {
    const p = await pregao();
    const r = await http().post(`/api/disputa/sessao/${p.sessaoId}/fila`).set(bearer(orgao.token)).send({ maxSimultaneos: 1, avisoMinutos: 1 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ativa: true, emDisputa: 0, proximaUnidadeId: p.lic.itens[0].id });
    const [aviso] = await ctx.dataSource.query(`SELECT descricao FROM eventos_sessao WHERE sessao_id = $1 AND descricao LIKE 'Aviso:%'`, [p.sessaoId]);
    expect(aviso.descricao).toMatch(/Item 1 abre para lances às \d\d:\d\d \(em 1 min\)/);
    await tique();
    expect((await status(p.lic.id))[0]).toBe('1:AGUARDANDO');
    // o prazo do aviso venceu
    await ctx.dataSource.query(`UPDATE sessoes_disputa SET fila_proxima_abertura_em = now() - interval '1 second' WHERE id = $1`, [p.sessaoId]);
    await tique();
    expect(await status(p.lic.id)).toEqual(['1:EM_DISPUTA', '2:AGUARDANDO', '3:AGUARDANDO']);
    // desligar
    const d = await http().post(`/api/disputa/sessao/${p.sessaoId}/fila/desligar`).set(bearer(orgao.token));
    expect(d.body).toMatchObject({ ativa: false });
  });
});
