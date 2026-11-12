/**
 * ÁREA DE TRABALHO do agente/pregoeiro (GET /api/area-de-trabalho): cada
 * processo em fase externa com a próxima ação, na ordem de urgência.
 */
import { AppE2E, criarApp, criarFornecedor, criarOrgao } from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { convocarAceitacao, decidirAceitacao, enviarPropostaAdequada, valoresNoLimite } from './support/julgamento';
import { convocarHabilitacao } from './support/habilitacao';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Área de trabalho do agente de contratação', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
  });
  afterAll(async () => {
    await ctx?.fechar();
  });

  test('pregão por item: a próxima ação acompanha o andamento; órgão B não vê; anônimo recebe 401', async () => {
    const orgao = await criarOrgao(ctx, { nome: 'Órgão Área de Trabalho' });
    const orgaoB = await criarOrgao(ctx, { nome: 'Órgão B Área de Trabalho' });
    const F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const p = await prepararPregaoEmDisputa(
      ctx,
      orgao,
      [
        { fornecedor: F1, valores: [90, 90] },
        { fornecedor: F2, valores: [95, 95] },
      ],
      { itens: ['Mesa', 'Cadeira'].map((descricao) => ({ descricao, quantidade: 5, valor_unitario_estimado: 100 })) },
    );
    const area = async (token = orgao.token) => (await http().get('/api/area-de-trabalho').set(bearer(token)).expect(200)).body;
    const meu = async () => (await area()).processos.find((x: any) => x.id === p.lic.id);

    expect((await http().get('/api/area-de-trabalho')).status).toBe(401);
    expect((await area(orgaoB.token)).processos.some((x: any) => x.id === p.lic.id)).toBe(false);

    // em disputa
    expect((await meu()).acao).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Etapa de lances em andamento', destino: 'SALA' });
    const [itemA, itemB] = p.lic.itens.map((i: any) => i.id);
    for (const it of [itemA, itemB]) expect((await http().post(`/api/disputa/sessao/${p.sessaoId}/encerrar-item/${it}`).set(bearer(orgao.token))).status).toBe(201);

    // lances encerrados: convocar as duas propostas
    let a = await meu();
    expect(a.fase).toBe('JULGAMENTO');
    expect(a.unidades).toMatchObject({ tipo: 'ITEM', total: 2 });
    expect(a.acao).toMatchObject({ vez: 'VOCE', titulo: 'Convocar 2 propostas readequadas' });

    // uma convocada: ainda falta convocar a outra (o que é do agente vem antes)
    const ca = await convocarAceitacao(ctx, p.sessaoId, itemA, orgao.token);
    expect(ca.status).toBe(201);
    expect((await meu()).acao).toMatchObject({ vez: 'VOCE', titulo: 'Convocar 1 proposta readequada' });
    const cb = await convocarAceitacao(ctx, p.sessaoId, itemB, orgao.token);
    expect(cb.status).toBe(201);
    a = await meu();
    expect(a.acao).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Aguardando 2 propostas readequadas' });
    expect(a.acao.prazo).toBeTruthy();

    // propostas aceitas: convocar para a habilitação; convocada: aguardar os documentos
    // propostas enviadas: julgar
    for (const c of [ca, cb]) expect((await enviarPropostaAdequada(ctx, p.sessaoId, c.body.id, F1.token, valoresNoLimite(c.body.limites))).status).toBe(201);
    expect((await meu()).acao).toMatchObject({ vez: 'VOCE', titulo: 'Julgar 2 propostas readequadas' });
    for (const c of [ca, cb]) expect((await decidirAceitacao(ctx, p.sessaoId, c.body.id, orgao.token, 'aceitar')).status).toBe(201);
    expect((await meu()).acao).toMatchObject({ vez: 'VOCE', titulo: 'Convocar 1 empresa para a habilitação' });
    expect((await convocarHabilitacao(ctx, p.lic.id, F1.id, orgao.token)).status).toBe(201);
    expect((await meu()).acao).toMatchObject({ vez: 'AGUARDANDO', titulo: 'Aguardando documentos de 1 empresa' });

    const tudo = await area();
    expect(tudo).toMatchObject({ total: tudo.processos.length });
    expect(tudo.com_voce + tudo.aguardando).toBe(tudo.total);
  });
});
