/**
 * Travas do "Reiniciar" da sala (regras-reinicio): simples durante os lances;
 * depois do fim dos lances, só como anulação da etapa por vício; bloqueado da
 * fase recursal em diante. Antes, o ato passava em qualquer fase — inclusive
 * com a licitação homologada (sondagem de 10/11/2026).
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao } from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { aceitarPropostaDaUnidade } from './support/julgamento';
import { habilitarLicitante } from './support/habilitacao';
import { abrirJanelaIntencao, precluirIntencaoDeRecurso } from './support/recursos';
import { adjudicarResultado, homologarResultado } from './support/resultado';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const VICIO = 'Queda do sistema impediu o registro de lances de dois licitantes nos minutos finais.';

describe('Reinício da etapa de lances — travas por fase (e2e)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let A: FornecedorFixture;
  let B: FornecedorFixture;

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Câmara do Reinício' });
    A = await criarFornecedor(ctx, { porte: 'ME' });
    B = await criarFornecedor(ctx, { porte: 'ME' });
  });
  afterAll(async () => ctx?.fechar());

  const novo = () =>
    prepararPregaoEmDisputa(ctx, orgao, [{ fornecedor: A, valores: [90] }, { fornecedor: B, valores: [95] }], {
      itens: [{ descricao: 'Item do reinício', quantidade: 1, valor_unitario_estimado: 100 }],
    });
  const fase = async (id: string) => (await ctx.dataSource.query(`SELECT fase::text AS f FROM licitacoes WHERE id = $1`, [id]))[0].f;
  const situacao = async (s: string) => (await ctx.http().get(`/api/disputa/sessao/${s}/reinicio`).set(bearer(orgao.token))).body;
  const reiniciar = (s: string, corpo: Record<string, unknown>) =>
    ctx.http().post(`/api/disputa/sessao/${s}/reiniciar`).set(bearer(orgao.token)).send(corpo);
  const encerrar = (s: string, item: string) => ctx.http().post(`/api/disputa/sessao/${s}/encerrar-item/${item}`).set(bearer(orgao.token));
  const lancesValidos = async (lic: string) =>
    Number((await ctx.dataSource.query(`SELECT count(*)::int AS n FROM lances WHERE licitacao_id = $1 AND cancelado = false`, [lic]))[0].n);

  test('durante os lances: basta a justificativa', async () => {
    const p = await novo();
    expect((await situacao(p.sessaoId)).modo).toBe('SIMPLES');
    const r = await reiniciar(p.sessaoId, { justificativa: 'Instabilidade na sala' });
    expect(r.status).toBe(201);
    expect(r.body.anulacao).toBe(false);
  });

  test('depois do fim dos lances: exige a confirmação do vício e a descrição; a ata registra a anulação', async () => {
    const p = await novo();
    const item = p.lic.itens[0].id;
    await encerrar(p.sessaoId, item);
    expect(await fase(p.lic.id)).toBe('JULGAMENTO');
    expect((await situacao(p.sessaoId)).modo).toBe('REFORCADO');

    const semConfirmar = await reiniciar(p.sessaoId, { justificativa: VICIO });
    expect(semConfirmar.status).toBe(400);
    expect(semConfirmar.body.message).toMatch(/vício/);
    const curta = await reiniciar(p.sessaoId, { justificativa: 'erro', confirmaVicio: true });
    expect(curta.status).toBe(400);
    expect(await lancesValidos(p.lic.id)).toBeGreaterThan(0);

    const ok = await reiniciar(p.sessaoId, { justificativa: VICIO, confirmaVicio: true });
    expect(ok.status).toBe(201);
    expect(ok.body.anulacao).toBe(true);
    expect(await lancesValidos(p.lic.id)).toBe(0);
    const [ev] = await ctx.dataSource.query(
      `SELECT descricao, dados_adicionais FROM eventos_sessao WHERE sessao_id = $1 AND tipo = 'SESSAO_RETOMADA' ORDER BY created_at DESC LIMIT 1`,
      [p.sessaoId],
    );
    expect(ev.descricao).toMatch(/^ANULAÇÃO DA ETAPA DE LANCES POR VÍCIO/);
    expect(ev.dados_adicionais.anulacao_por_vicio).toBe(true);
  });

  test('depois de iniciada a habilitação: a licitação volta ao julgamento e o rito segue de novo', async () => {
    const p = await novo();
    const item = p.lic.itens[0].id;
    await encerrar(p.sessaoId, item);
    await aceitarPropostaDaUnidade(ctx, p.sessaoId, item, orgao.token, A.token);
    await habilitarLicitante(ctx, p.lic.id, A, orgao.token);
    expect(await fase(p.lic.id)).toBe('HABILITACAO');

    const ok = await reiniciar(p.sessaoId, { justificativa: VICIO, confirmaVicio: true });
    expect(ok.status).toBe(201);
    expect(await fase(p.lic.id)).toBe('JULGAMENTO');

    // A etapa de lances recomeça e a aceitação volta a funcionar
    const ini = await ctx.http().post(`/api/disputa/sessao/${p.sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [item] });
    expect(ini.body.itensIniciados).toBe(1);
    await encerrar(p.sessaoId, item);
    await aceitarPropostaDaUnidade(ctx, p.sessaoId, item, orgao.token, A.token);
  });

  test('aberto o prazo final de intenção de recurso: bloqueado', async () => {
    const p = await novo();
    const item = p.lic.itens[0].id;
    await encerrar(p.sessaoId, item);
    await aceitarPropostaDaUnidade(ctx, p.sessaoId, item, orgao.token, A.token);
    await habilitarLicitante(ctx, p.lic.id, A, orgao.token);
    expect((await abrirJanelaIntencao(ctx, p.sessaoId, orgao.token)).status).toBe(201);

    const s = await situacao(p.sessaoId);
    expect(s.modo).toBe('BLOQUEADO');
    expect(s.motivo).toMatch(/fase recursal/);
    const r = await reiniciar(p.sessaoId, { justificativa: VICIO, confirmaVicio: true });
    expect(r.status).toBe(409);
    expect(await lancesValidos(p.lic.id)).toBeGreaterThan(0);
  });

  test('adjudicada e homologada: bloqueado, nada é desfeito', async () => {
    const p = await novo();
    const item = p.lic.itens[0].id;
    await encerrar(p.sessaoId, item);
    await aceitarPropostaDaUnidade(ctx, p.sessaoId, item, orgao.token, A.token);
    await habilitarLicitante(ctx, p.lic.id, A, orgao.token);
    await precluirIntencaoDeRecurso(ctx, p.sessaoId, orgao.token);
    expect((await adjudicarResultado(ctx, p.lic.id, orgao.token)).status).toBe(200);

    const adj = await reiniciar(p.sessaoId, { justificativa: VICIO, confirmaVicio: true });
    expect(adj.status).toBe(409);
    expect(adj.body.message).toMatch(/adjudicada/);

    expect((await homologarResultado(ctx, p.lic.id, orgao.token)).status).toBe(200);
    const hom = await reiniciar(p.sessaoId, { justificativa: VICIO, confirmaVicio: true });
    expect(hom.status).toBe(409);
    expect(await lancesValidos(p.lic.id)).toBeGreaterThan(0);
    expect((await situacao(p.sessaoId)).modo).toBe('BLOQUEADO');
  });
});
