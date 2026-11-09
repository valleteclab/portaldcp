/**
 * SALA POR FASES (dono, 09/11/2026 — organização de referência: BLL): lotes por
 * fase, posição do licitante (Vencendo/Perdendo) e a classificação com os
 * anexos — os documentos de cada licitante ficam visíveis a todos depois da
 * decisão (proposta: aceitação decidida; habilitação: resultado da habilitação).
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao } from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { aceitarPropostaDaUnidade } from './support/julgamento';
import { habilitarLicitante } from './support/habilitacao';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Sala por fases', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let A: FornecedorFixture;
  let B: FornecedorFixture;
  let sessaoId: string;
  let licId: string;
  let item: string;
  const http = () => ctx.http();
  const lotes = (token: string) => http().get(`/api/julgamento/sessao/${sessaoId}/lotes`).set(bearer(token));
  const classif = (token: string) => http().get(`/api/julgamento/sessao/${sessaoId}/lotes/${item}/classificacao`).set(bearer(token));

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Câmara da Sala por Fases' });
    A = await criarFornecedor(ctx, { porte: 'ME' });
    B = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const p = await prepararPregaoEmDisputa(ctx, orgao, [{ fornecedor: A, valores: [90] }, { fornecedor: B, valores: [95] }], {
      itens: [{ descricao: 'Cadeira da sala por fases', quantidade: 1, valor_unitario_estimado: 100 }],
    });
    sessaoId = p.sessaoId;
    licId = p.lic.id;
    item = p.lic.itens[0].id;
  });
  afterAll(async () => ctx?.fechar());

  test('em disputa: fase DISPUTA; licitante vê a própria posição e só códigos dos outros', async () => {
    const o = (await lotes(orgao.token).expect(200)).body;
    expect(o.lotes[0]).toMatchObject({ id: item, fase: 'DISPUTA', melhorLance: 90 });
    const b = (await lotes(B.token).expect(200)).body;
    expect(b.lotes[0]).toMatchObject({ fase: 'DISPUTA', minhaPosicao: 2, vencendo: false });
    expect(b.identidades).toBe(false);
    expect(b.lotes[0].primeiro.nome).not.toMatch(new RegExp(A.razao_social));
    const a = (await lotes(A.token).expect(200)).body;
    expect(a.lotes[0]).toMatchObject({ minhaPosicao: 1, vencendo: true });
  });

  test('encerrado: aceitação → habilitação; anexos de A só para os outros depois da decisão', async () => {
    expect((await http().post(`/api/disputa/sessao/${sessaoId}/encerrar-item/${item}`).set(bearer(orgao.token))).status).toBe(201);
    expect((await lotes(orgao.token).expect(200)).body.lotes[0].fase).toBe('JULGAMENTO');
    await aceitarPropostaDaUnidade(ctx, sessaoId, item, orgao.token, A.token);
    expect((await lotes(orgao.token).expect(200)).body.lotes[0].fase).toBe('HABILITACAO');

    // proposta adequada aceita: visível a B
    let c = (await classif(B.token).expect(200)).body;
    const pa = c.classificados.find((x: any) => x.posicao === 1);
    expect(pa).toMatchObject({ me: true, nome: A.razao_social });
    expect(pa.propostaAdequada).toBeTruthy();
    const arq = await http().get(`/api/julgamento/sessao/${sessaoId}/aceitacao/${pa.propostaAdequada.aceitacaoId}/arquivo`).set(bearer(B.token));
    expect(arq.status).toBe(200);

    await habilitarLicitante(ctx, licId, A, orgao.token);
    c = (await classif(B.token).expect(200)).body;
    const docs = c.classificados.find((x: any) => x.posicao === 1).documentos;
    expect(docs.length).toBeGreaterThan(0);
    expect((await http().get(`/api/habilitacao/documentos/${docs[0].id}/arquivo`).set(bearer(B.token))).status).toBe(200);
    // fase do lote: recursos (janela ainda não aberta → em adjudicação)
    expect(['RECURSOS', 'EM_ADJUDICACAO']).toContain((await lotes(orgao.token).expect(200)).body.lotes[0].fase);
  });

  test('quem não participa não vê a sala por fases', async () => {
    const X = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    expect((await lotes(X.token)).status).toBe(403);
  });
});
