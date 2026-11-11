/**
 * Diligência geral (art. 64): pedido livre do pregoeiro a um licitante depois dos
 * lances, com prazo; resposta com texto e anexos; prorrogação; anexo do órgão;
 * encerramento como atendida / não atendida; registro na ata; isolamento.
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao } from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const PEDIDO = 'Envie a planilha de custos que demonstre a exequibilidade do preço ofertado no item 1.';
const PDF = Buffer.from('%PDF-1.4\n% diligencia e2e\n');

describe('Diligência geral ao licitante (e2e)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outroOrgao: OrgaoFixture;
  let A: FornecedorFixture;
  let B: FornecedorFixture;
  let p: Awaited<ReturnType<typeof prepararPregaoEmDisputa>>;
  let item: string;
  let dil: string;

  const http = () => ctx.http();
  const abrir = (corpo: Record<string, unknown>, token = orgao.token) => http().post(`/api/diligencias/licitacao/${p.lic.id}`).set(bearer(token)).send(corpo);
  const listar = (token: string) => http().get(`/api/diligencias/licitacao/${p.lic.id}`).set(bearer(token));

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Câmara da Diligência' });
    outroOrgao = await criarOrgao(ctx, { nome: 'Outro órgão' });
    A = await criarFornecedor(ctx, { porte: 'ME' });
    B = await criarFornecedor(ctx, { porte: 'ME' });
    p = await prepararPregaoEmDisputa(ctx, orgao, [{ fornecedor: A, valores: [90] }, { fornecedor: B, valores: [95] }], {
      itens: [{ descricao: 'Item da diligência', quantidade: 1, valor_unitario_estimado: 100 }],
    });
    item = p.lic.itens[0].id;
  });
  afterAll(async () => ctx?.fechar());

  test('durante os lances não abre: os licitantes ainda não são identificados', async () => {
    const r = await abrir({ fornecedorId: A.id, unidadeId: item, pedido: PEDIDO, prazoHoras: 2 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/depois da etapa de lances/);
    expect((await listar(orgao.token)).body.licitantes).toEqual([]);
  });

  test('depois dos lances: validações, abertura, aviso na ata e isolamento', async () => {
    await http().post(`/api/disputa/sessao/${p.sessaoId}/encerrar-item/${item}`).set(bearer(orgao.token)).expect(201);

    expect((await abrir({ fornecedorId: A.id, pedido: 'curto', prazoHoras: 2 })).status).toBe(400);
    expect((await abrir({ fornecedorId: A.id, pedido: PEDIDO, prazoHoras: 1 })).body.message).toMatch(/prazo mínimo/);
    expect((await abrir({ fornecedorId: A.id, pedido: PEDIDO, prazoHoras: 2 }, A.token)).status).toBe(403);
    expect((await abrir({ fornecedorId: A.id, pedido: PEDIDO, prazoHoras: 2 }, outroOrgao.token)).status).toBeGreaterThanOrEqual(403);

    const r = await abrir({ fornecedorId: A.id, unidadeId: item, pedido: PEDIDO, prazoHoras: 2, fase: 'ACEITACAO' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'ABERTA', unidadeRotulo: 'Item 1', fase: 'ACEITACAO', fornecedorId: A.id });
    dil = r.body.id;

    const doOrgao = (await listar(orgao.token).expect(200)).body;
    expect(doOrgao.papel).toBe('ORGAO');
    expect(doOrgao.diligencias).toHaveLength(1);
    expect(doOrgao.licitantes.map((l: any) => l.id).sort()).toEqual([A.id, B.id].sort());
    expect((await listar(A.token).expect(200)).body.diligencias).toHaveLength(1);
    // o outro licitante não vê a diligência alheia, nem responde por ela
    expect((await listar(B.token).expect(200)).body.diligencias).toHaveLength(0);
    expect((await http().post(`/api/diligencias/${dil}/responder`).set(bearer(B.token)).send({ resposta: 'intruso' })).status).toBe(404);

    const [ev] = await ctx.dataSource.query(
      `SELECT descricao FROM eventos_sessao WHERE sessao_id = $1 AND dados_adicionais->>'diligencia_id' = $2 ORDER BY created_at LIMIT 1`,
      [p.sessaoId, dil],
    );
    expect(ev.descricao).toMatch(/Diligência aberta para .* \(Item 1\)/);
  });

  test('licitante anexa, remove, responde; depois não envia mais', async () => {
    expect((await http().post(`/api/diligencias/${dil}/responder`).set(bearer(A.token)).send({ resposta: '' })).status).toBe(400);
    const exe = await http().post(`/api/diligencias/${dil}/anexos`).set(bearer(A.token)).attach('arquivo', PDF, 'programa.exe');
    expect(exe.status).toBe(400);
    const a1 = await http().post(`/api/diligencias/${dil}/anexos`).set(bearer(A.token)).attach('arquivo', PDF, 'planilha-custos.pdf').field('descricao', 'Planilha de custos');
    expect(a1.status).toBe(201);
    const a2 = await http().post(`/api/diligencias/${dil}/anexos`).set(bearer(A.token)).attach('arquivo', PDF, 'errado.pdf');
    expect((await http().delete(`/api/diligencias/anexos/${a2.body.id}`).set(bearer(A.token))).status).toBe(200);
    // outro licitante não baixa o anexo; o dono e o órgão baixam
    expect((await http().get(`/api/diligencias/anexos/${a1.body.id}/arquivo`).set(bearer(B.token))).status).toBe(404);
    expect((await http().get(`/api/diligencias/anexos/${a1.body.id}/arquivo`).set(bearer(A.token))).status).toBe(200);
    expect((await http().get(`/api/diligencias/anexos/${a1.body.id}/arquivo`).set(bearer(orgao.token))).status).toBe(200);

    const r = await http().post(`/api/diligencias/${dil}/responder`).set(bearer(A.token)).send({ resposta: 'Segue a planilha com a composição dos custos.' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'RESPONDIDA' });
    expect(r.body.anexos).toHaveLength(1);
    expect((await http().post(`/api/diligencias/${dil}/anexos`).set(bearer(A.token)).attach('arquivo', PDF, 'tarde.pdf')).status).toBe(409);
    expect((await http().delete(`/api/diligencias/anexos/${a1.body.id}`).set(bearer(A.token))).status).toBe(409);
  });

  test('órgão junta o parecer e encerra como atendida, com a conclusão na ata', async () => {
    const parecer = await http().post(`/api/diligencias/${dil}/anexos`).set(bearer(orgao.token)).attach('arquivo', PDF, 'parecer-area-tecnica.pdf');
    expect(parecer.status).toBe(201);
    expect(parecer.body.autor).toBe('ORGAO');
    expect((await http().post(`/api/diligencias/${dil}/encerrar`).set(bearer(orgao.token)).send({ resultado: 'ATENDIDA', motivo: 'ok' })).status).toBe(400);
    expect((await http().post(`/api/diligencias/${dil}/encerrar`).set(bearer(A.token)).send({ resultado: 'ATENDIDA', motivo: 'Planilha confere' })).status).toBe(403);
    const r = await http().post(`/api/diligencias/${dil}/encerrar`).set(bearer(orgao.token)).send({ resultado: 'ATENDIDA', motivo: 'A planilha demonstra a exequibilidade do preço.' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'ENCERRADA', resultado: 'ATENDIDA' });
    expect(r.body.anexos).toHaveLength(2);
    const evs = await ctx.dataSource.query(`SELECT descricao FROM eventos_sessao WHERE sessao_id = $1 AND dados_adicionais->>'diligencia_id' = $2 ORDER BY created_at`, [p.sessaoId, dil]);
    expect(evs.some((e: any) => /respondeu a diligência/.test(e.descricao))).toBe(true);
    expect(evs.some((e: any) => /encerrada: ATENDIDA/.test(e.descricao))).toBe(true);
    expect((await http().post(`/api/diligencias/${dil}/encerrar`).set(bearer(orgao.token)).send({ resultado: 'NAO_ATENDIDA', motivo: 'Tentativa de reabrir' })).status).toBe(400);
  });

  test('prazo vencido: licitante não responde; órgão prorroga e ele volta a poder', async () => {
    const r = await abrir({ fornecedorId: B.id, pedido: PEDIDO, prazoHoras: 2 });
    const id = r.body.id;
    await ctx.dataSource.query(`UPDATE diligencias_licitante SET prazo_ate = now() - interval '1 minute' WHERE id = $1`, [id]);
    expect((await listar(B.token)).body.diligencias[0].status).toBe('EXPIRADA');
    expect((await http().post(`/api/diligencias/${id}/responder`).set(bearer(B.token)).send({ resposta: 'atrasado' })).status).toBe(409);
    expect((await http().post(`/api/diligencias/${id}/prorrogar`).set(bearer(orgao.token)).send({ horas: 2, motivo: 'x' })).status).toBe(400);
    const pr = await http().post(`/api/diligencias/${id}/prorrogar`).set(bearer(orgao.token)).send({ horas: 2, motivo: 'Pedido do licitante pelo chat da sala.' });
    expect(pr.status).toBe(201);
    expect(pr.body.status).toBe('ABERTA');
    expect(pr.body.prorrogacoes).toHaveLength(1);
    expect((await http().post(`/api/diligencias/${id}/responder`).set(bearer(B.token)).send({ resposta: 'Segue o esclarecimento pedido.' })).status).toBe(201);
    const fim = await http().post(`/api/diligencias/${id}/encerrar`).set(bearer(orgao.token)).send({ resultado: 'NAO_ATENDIDA', motivo: 'O esclarecimento não demonstra a exequibilidade.' });
    expect(fim.body).toMatchObject({ status: 'ENCERRADA', resultado: 'NAO_ATENDIDA' });
  });
});
