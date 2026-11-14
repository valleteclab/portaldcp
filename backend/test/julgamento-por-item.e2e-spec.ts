/**
 * ============================================================================
 * JULGAMENTO ITEM A ITEM (decisão do dono, 13/11/2026)
 * ============================================================================
 *
 * O julgamento de um item começa assim que ELE encerra, com outros ainda em
 * disputa. Para isso não revelar quem é quem nos itens em disputa, cada
 * licitante tem um código sorteado POR ITEM.
 *
 *  - item 1 encerrado, item 2 em disputa: o órgão convoca, recebe e aceita a
 *    proposta do item 1; a licitação segue EM_DISPUTA e a sala na etapa de lances;
 *  - o órgão vê as identidades no item 1 e só códigos no item 2;
 *  - licitantes e público não veem identidade em nenhum item até o fim de todos;
 *  - a habilitação (que é do licitante) espera o fim da etapa de lances;
 *  - ao encerrar o último item, a licitação vai ao JULGAMENTO e a sala à aceitação.
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, buscarLicitacao, criarApp, criarFornecedor, criarOrgao } from './support';
import { bearer, prepararPregaoEmDisputa } from './support/isolamento';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { convocarAceitacao, decidirAceitacao, enviarPropostaAdequada, painelAceitacao, valoresNoLimite } from './support/julgamento';
import { FaseLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { EtapaSessao } from '../src/sessao/entities/sessao-disputa.entity';

describe('Julgamento item a item com código por item', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  let licId: string;
  let sessaoId: string;
  let item1: string;
  let item2: string;
  let aceitacaoId: string;

  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);
  const ids = () => [F1.id, F2.id, F3.id];
  const semIdentidade = (corpo: any) => {
    const texto = JSON.stringify(corpo);
    for (const f of [F1, F2, F3]) {
      expect(texto).not.toContain(f.id);
      expect(texto).not.toContain(f.razao_social);
    }
  };

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Julgamento por Item' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const p = await prepararPregaoEmDisputa(
      ctx,
      orgao,
      [
        { fornecedor: F1, valores: [95, 190] },
        { fornecedor: F2, valores: [96, 185] },
        { fornecedor: F3, valores: [98, 199] },
      ],
      {
        itens: [
          { descricao: 'Cadeira', quantidade: 10, valor_unitario_estimado: 100 },
          { descricao: 'Mesa', quantidade: 5, valor_unitario_estimado: 200 },
        ],
      },
    );
    licId = p.lic.id;
    sessaoId = p.sessaoId;
    [item1, item2] = p.lic.itens.map((i) => i.id);
    // Só o item 1 encerra; o item 2 segue em disputa
    const r = await http().post(`/api/disputa/sessao/${sessaoId}/encerrar-item/${item1}`).set(bearer(orgao.token));
    expect(r.status).toBe(201);
  }, 240_000);

  afterAll(async () => {
    await ctx?.fechar();
  });

  it('proposta enviada e não analisada impede abrir os lances', async () => {
    const outro = await criarOrgao(ctx, { nome: 'Prefeitura Proposta Pendente' });
    const G1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const G2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const p = await prepararPregaoEmDisputa(
      ctx,
      outro,
      [
        { fornecedor: G1, valores: [90, 45] },
        { fornecedor: G2, valores: [88, 44] },
      ],
      { iniciarItens: false },
    );
    await q(`UPDATE propostas SET status = 'ENVIADA' WHERE id = $1`, [p.propostas[G2.id]]);
    const iniciar = () =>
      http().post(`/api/disputa/sessao/${p.sessaoId}/iniciar-itens`).set(bearer(outro.token)).send({ itensIds: p.lic.itens.map((i) => i.id) });
    const recusado = await iniciar();
    expect(recusado.status).toBe(409);
    expect(recusado.body.message).toMatch(/1 proposta\(s\) aguardando análise/);
    await q(`UPDATE propostas SET status = 'CLASSIFICADA' WHERE id = $1`, [p.propostas[G2.id]]);
    expect((await iniciar()).status).toBe(201);
  });

  it('cada item tem o seu sorteio de códigos', async () => {
    const linhas = await q(`SELECT unidade_id::text AS u, fornecedor_id::text AS f, codigo_anonimo AS c FROM mapeamento_anonimo_unidade WHERE sessao_id = $1`, [sessaoId]);
    for (const item of [item1, item2]) {
      const doItem = linhas.filter((l: any) => l.u === item);
      expect(doItem.map((l: any) => l.f).sort()).toEqual(ids().sort());
      expect(new Set(doItem.map((l: any) => l.c)).size).toBe(3);
    }
  });

  it('com o item 2 em disputa, o órgão convoca a aceitação do item 1; a licitação segue EM_DISPUTA', async () => {
    const painel = await painelAceitacao(ctx, sessaoId, orgao.token);
    const u1 = painel.unidades.find((u: any) => u.id === item1);
    const u2 = painel.unidades.find((u: any) => u.id === item2);
    expect(u1.podeConvocar).toBe(true);
    expect(u2.podeConvocar).toBe(false);

    expect((await convocarAceitacao(ctx, sessaoId, item2, orgao.token, 3)).status).toBe(409);
    const c = await convocarAceitacao(ctx, sessaoId, item1, orgao.token, 3);
    expect(c.status).toBe(201);
    aceitacaoId = c.body.id;
    expect(c.body.fornecedorId ?? c.body.fornecedor_id).toBe(F1.id);

    const lic = await buscarLicitacao(ctx, { id: licId, orgao } as any);
    expect(lic.fase).toBe(FaseLicitacao.EM_DISPUTA);
    const [s] = await q(`SELECT etapa::text AS etapa FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
    expect(s.etapa).toBe(EtapaSessao.DISPUTA_LANCES);
  });

  it('o órgão vê quem é quem no item encerrado e só códigos no item em disputa', async () => {
    const m1 = await http().get(`/api/disputa/item/${item1}/melhores`).set(bearer(orgao.token)).expect(200);
    expect(m1.body.map((x: any) => x.fornecedorId).sort()).toEqual(ids().sort());
    const m2 = await http().get(`/api/disputa/item/${item2}/melhores`).set(bearer(orgao.token)).expect(200);
    expect(m2.body.length).toBe(3);
    semIdentidade(m2.body);
    expect(m2.body.every((x: any) => /^anonimo-/.test(x.fornecedorId))).toBe(true);

    const board = await http().get(`/api/disputa/sessao/${sessaoId}/board`).set(bearer(orgao.token)).expect(200);
    semIdentidade(board.body.colunas.emDisputa);
    expect(JSON.stringify(board.body.colunas.encerrados)).toContain(F1.id);

    // eventos: os do item 2 (lances) seguem sem identidade; a convocação do item 1 mostra o convocado
    const ev = await http().get(`/api/sessao/${sessaoId}/eventos`).set(bearer(orgao.token)).expect(200);
    semIdentidade(ev.body.filter((e: any) => e.item_id === item2));
    expect(JSON.stringify(ev.body.filter((e: any) => e.item_id === item1))).toContain(F1.razao_social);
  });

  it('licitantes e público não veem identidade em nenhum item enquanto houver disputa', async () => {
    for (const token of [F3.token, null]) {
      for (const rota of [`/api/disputa/item/${item1}/melhores`, `/api/disputa/item/${item2}/melhores`, `/api/sessao/${sessaoId}/eventos`]) {
        const r = token ? await http().get(rota).set(bearer(token)).expect(200) : await http().get(rota).expect(200);
        const texto = JSON.stringify(r.body);
        expect(texto).not.toContain(F1.id);
        expect(texto).not.toContain(F1.razao_social);
        expect(texto).not.toContain(F2.razao_social);
      }
    }
  });

  it('o convocado envia a proposta adequada e o órgão aceita, ainda com o item 2 em disputa', async () => {
    const painel = await painelAceitacao(ctx, sessaoId, orgao.token);
    const ativa = painel.unidades.find((u: any) => u.id === item1).aceitacaoAtiva ?? painel.unidades.find((u: any) => u.id === item1).ativa;
    const limites = ativa?.limites ?? (await http().get(`/api/julgamento/sessao/${sessaoId}/aceitacao`).set(bearer(F1.token)).expect(200)).body.convocacoes[0].limites;
    const e = await enviarPropostaAdequada(ctx, sessaoId, aceitacaoId, F1.token, valoresNoLimite(limites));
    expect([200, 201]).toContain(e.status);
    const a = await decidirAceitacao(ctx, sessaoId, aceitacaoId, orgao.token, 'aceitar');
    expect([200, 201]).toContain(a.status);
    const lic = await buscarLicitacao(ctx, { id: licId, orgao } as any);
    expect(lic.fase).toBe(FaseLicitacao.EM_DISPUTA);
    // um lance no item 2 continua valendo normalmente
    const l = await http().post(`/api/disputa/sessao/${sessaoId}/lance`).set(bearer(F3.token)).send({ itemId: item2, valor: 900 });
    expect(l.status).toBe(201);
  });

  it('encerrado o último item, a licitação vai ao JULGAMENTO e a sala à etapa de aceitação', async () => {
    const r = await http().post(`/api/disputa/sessao/${sessaoId}/encerrar-item/${item2}`).set(bearer(orgao.token));
    expect(r.status).toBe(201);
    const lic = await buscarLicitacao(ctx, { id: licId, orgao } as any);
    expect(lic.fase).toBe(FaseLicitacao.JULGAMENTO);
    const [s] = await q(`SELECT etapa::text AS etapa FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
    expect(s.etapa).toBe(EtapaSessao.ACEITACAO_PROPOSTA);
    // o item 1 segue aceito; o item 2 fica para convocar
    const painel = await painelAceitacao(ctx, sessaoId, orgao.token);
    expect(painel.unidades.find((u: any) => u.id === item1).resolvida).toBe(true);
    expect(painel.unidades.find((u: any) => u.id === item2).podeConvocar).toBe(true);
  });
});
