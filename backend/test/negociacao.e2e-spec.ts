/**
 * ============================================================================
 * E3 — NEGOCIAÇÃO (Lei 14.133/2021 art. 61 e art. 59 III; IN SEGES 73/2022
 * art. 30), contra o banco real
 * ============================================================================
 *
 * Pregão por ITEM, 3 licitantes (base TOTAL_ITEM), 3 itens:
 *   Item 1: 10 un. × R$ 100 = máx. R$ 1.000 · propostas F1 1.100, F2 1.150, F3 1.200 (todas acima)
 *   Item 2:  5 un. × R$ 200 = máx. R$ 1.000 · propostas F1 950, F2 975, F3 995 (dentro)
 *   Item 3:  4 un. × R$ 100 = máx. R$ 400   · propostas F2 440, F1 460, F3 520 (todas acima)
 *
 *  - painel: item 1 e 3 "acima do preço máximo" (negociação obrigatória);
 *  - aceite acima do máximo sem negociação → 400;
 *  - isolamento: fornecedor e órgão B não abrem; órgão B não lê o painel;
 *  - negociação ACOMPANHADA pelos licitantes (IN 73 art. 30 §2º): órgão e
 *    todos os participantes leem (socket na sala da sessão, REST /eventos,
 *    painel em modo leitura); só o agente e o licitante na vez escrevem (outro
 *    licitante → 403); anônimo e órgão B não leem; a ata registra tudo;
 *  - preço máximo ao licitante só com orçamento público (sigilo_orcamento);
 *  - contraproposta ≥ atual → 400; recusa com motivo; contraproposta aceita →
 *    lance NEGOCIACAO no motor, ranking atualizado, resultado público (só o
 *    valor), convocação de aceitação readequada ao valor negociado;
 *  - item 3: desclassificar sem negociar → 409; recusa + acima do máximo →
 *    DESCLASSIFICADO, aceitação dele cancelada, próximo chamado à negociação
 *    sozinho; convocar aceitação durante a negociação → 409;
 *  - B8: as rotas antigas `/api/sessao/:id/negociacao...` não existem mais.
 */
import { Socket } from 'socket.io-client';
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao, fecharSockets } from './support';
import { desligarLimiteDeRequisicoes, entrarNaSala, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { convocarAceitacao, decidirAceitacao, enviarPropostaAdequada, painelAceitacao, valoresNoLimite } from './support/julgamento';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Coleta os eventos de um socket (para afirmar o que chegou e o que NÃO chegou). */
function coletor(s: Socket, evento: string) {
  const recebidos: any[] = [];
  s.on(evento, (p: any) => recebidos.push(p));
  return recebidos;
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ate(cond: () => boolean, ms = 4000) {
  const fim = Date.now() + ms;
  while (!cond() && Date.now() < fim) await esperar(50);
}

describe('E3 — negociação (art. 61; IN 73 art. 30)', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  let orgao: OrgaoFixture;
  let orgaoB: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  let sessaoId: string;
  let item1: string;
  let item2: string;
  let item3: string;
  let sOrgao: Socket;
  let sF1: Socket;
  let sF2: Socket;
  let negItem1: string;

  const base = () => `/api/julgamento/sessao/${sessaoId}/negociacao`;
  const painel = async (token = orgao.token) => (await http().get(base()).set(bearer(token)).expect(200)).body;
  const unidade = async (id: string) => (await painel()).unidades.find((u: any) => u.id === id);

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Negociação E3' });
    orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura Negociação' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const p = await prepararPregaoEmDisputa(
      ctx,
      orgao,
      [
        { fornecedor: F1, valores: [110, 190, 115] },
        { fornecedor: F2, valores: [115, 195, 110] },
        { fornecedor: F3, valores: [120, 199, 130] },
      ],
      {
        itens: [
          { descricao: 'Cadeira', quantidade: 10, valor_unitario_estimado: 100 },
          { descricao: 'Mesa', quantidade: 5, valor_unitario_estimado: 200 },
          { descricao: 'Armário', quantidade: 4, valor_unitario_estimado: 100 },
        ],
      },
    );
    sessaoId = p.sessaoId;
    [item1, item2, item3] = p.lic.itens.map((i) => i.id);
    for (const id of [item1, item2, item3]) {
      const r = await http().post(`/api/disputa/sessao/${sessaoId}/encerrar-item/${id}`).set(bearer(orgao.token));
      expect(r.status).toBe(201);
    }
    const entrar = async (quem: any, tipo: 'PREGOEIRO' | 'FORNECEDOR') => {
      const e = await entrarNaSala(ctx, sessaoId, { id: quem.id, nome: 'x', tipo, token: quem.token });
      expect(e.resposta.evento).toBe('dados_iniciais');
      return e.socket;
    };
    sOrgao = await entrar(orgao, 'PREGOEIRO');
    sF1 = await entrar(F1, 'FORNECEDOR');
    sF2 = await entrar(F2, 'FORNECEDOR');
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  test('painel do agente: acima do preço máximo = negociação obrigatória (item 1 e 3), item 2 dentro', async () => {
    const p = await painel();
    const u1 = p.unidades.find((u: any) => u.id === item1);
    const u2 = p.unidades.find((u: any) => u.id === item2);
    const u3 = p.unidades.find((u: any) => u.id === item3);
    expect(u1).toMatchObject({ precoMaximoTotal: 1000, acimaDoPrecoMaximo: true, negociacaoObrigatoria: true, podeAbrir: true });
    expect(u1.atual).toMatchObject({ fornecedorId: F1.id, posicao: 1, valorAtualTotal: 1100 });
    expect(u2).toMatchObject({ acimaDoPrecoMaximo: false, negociacaoObrigatoria: false });
    expect(u3.atual.fornecedorId).toBe(F2.id);
    expect(u3.negociacaoObrigatoria).toBe(true);
  });

  test('aceitação bloqueada acima do preço máximo sem negociação (art. 61; IN 73 art. 30)', async () => {
    const c = await convocarAceitacao(ctx, sessaoId, item1, orgao.token);
    expect(c.status).toBe(201);
    expect(c.body.fornecedorId).toBe(F1.id);
    expect((await enviarPropostaAdequada(ctx, sessaoId, c.body.id, F1.token, valoresNoLimite(c.body.limites))).status).toBe(201);
    const a = await decidirAceitacao(ctx, sessaoId, c.body.id, orgao.token, 'aceitar');
    expect(a.status).toBe(400);
    expect(a.body.message).toMatch(/preço máximo/);
    expect(a.body.message).toMatch(/negocie/);
  });

  test('isolamento: fornecedor e órgão B não abrem negociação nem leem o painel do agente', async () => {
    const abrirF = await http().post(`${base()}/unidade/${item1}/abrir`).set(bearer(F2.token)).send({});
    expect(abrirF.status).toBe(403);
    const abrirB = await http().post(`${base()}/unidade/${item1}/abrir`).set(bearer(orgaoB.token)).send({});
    expect([403, 404]).toContain(abrirB.status);
    // leitura por órgão alheio: 404 (não revela a sessão)
    expect([403, 404]).toContain((await http().get(base()).set(bearer(orgaoB.token))).status);
    // fornecedor lê só as próprias (nenhuma ainda) — sem preço máximo, sem ranking
    const minhas = await painel(F2.token);
    expect(minhas.negociacoes).toEqual([]);
    expect(minhas.unidades).toBeUndefined();
  });

  test('agente abre a negociação com o 1º do item 1; a segunda abertura é recusada', async () => {
    const recebidosF1 = coletor(sF1, 'negociacao_atualizada');
    const r = await http().post(`${base()}/unidade/${item1}/abrir`).set(bearer(orgao.token)).send({ mensagem: 'Bom dia. Podemos negociar o item 1?' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ fornecedorId: F1.id, status: 'EM_ANDAMENTO', obrigatoria: true, valorInicialTotal: 1100 });
    negItem1 = r.body.id;
    expect((await http().post(`${base()}/unidade/${item1}/abrir`).set(bearer(orgao.token)).send({})).status).toBe(409);
    await ate(() => recebidosF1.length > 0);
    expect(recebidosF1[0]).toMatchObject({ negociacaoId: negItem1 });
    const minhas = await painel(F1.token);
    expect(minhas.negociacoes).toHaveLength(1);
    expect(minhas.negociacoes[0]).toMatchObject({ minha: true, somenteLeitura: false, fornecedorId: F1.id });
    expect(minhas.negociacoes[0].mensagens.some((m: any) => /negociar o item 1/.test(m.texto))).toBe(true);
    // Preço máximo ao licitante: só com orçamento público (Lei 14.133 art. 24)
    expect(minhas.orcamentoPublico).toBe(true);
    expect(minhas.negociacoes[0].precoMaximoTotal).toBe(1000);
    const [{ licitacao_id }] = await q(`SELECT licitacao_id FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
    await q(`UPDATE licitacoes SET sigilo_orcamento = 'SIGILOSO' WHERE id = $1`, [licitacao_id]);
    try {
      const sigiloso = await painel(F1.token);
      expect(sigiloso.orcamentoPublico).toBe(false);
      expect(sigiloso.negociacoes[0].precoMaximoTotal).toBeUndefined();
      expect(sigiloso.negociacoes[0].obrigatoria).toBeUndefined();
    } finally {
      await q(`UPDATE licitacoes SET sigilo_orcamento = 'PUBLICO' WHERE id = $1`, [licitacao_id]);
    }
  });

  test('negociação ACOMPANHADA (IN 73 art. 30 §2º): órgão e todos os licitantes leem (socket e REST); só o licitante na vez escreve', async () => {
    const naSalaOrgao = coletor(sOrgao, 'negociacao_mensagem');
    const naSalaF1 = coletor(sF1, 'negociacao_mensagem');
    const naSalaF2 = coletor(sF2, 'negociacao_mensagem');
    const doAgente = await http().post(`${base()}/${negItem1}/mensagem`).set(bearer(orgao.token)).send({ texto: 'Consegue chegar a R$ 980,00?' });
    expect(doAgente.status).toBe(201);
    const doLicitante = await http().post(`${base()}/${negItem1}/mensagem`).set(bearer(F1.token)).send({ texto: 'Vamos analisar o custo do frete.' });
    expect(doLicitante.status).toBe(201);
    await ate(() => naSalaOrgao.length >= 2 && naSalaF1.length >= 2 && naSalaF2.length >= 2);
    const textos = ['Consegue chegar a R$ 980,00?', 'Vamos analisar o custo do frete.'];
    for (const recebidos of [naSalaOrgao, naSalaF1, naSalaF2]) {
      expect(recebidos.map((m) => m.texto)).toEqual(expect.arrayContaining(textos));
    }

    // Outro licitante acompanha, mas não escreve nem responde (403)
    expect((await http().post(`${base()}/${negItem1}/mensagem`).set(bearer(F2.token)).send({ texto: 'intromissão' })).status).toBe(403);
    expect((await http().post(`${base()}/${negItem1}/responder`).set(bearer(F2.token)).send({ aceitar: true })).status).toBe(403);
    const leituraF2 = await painel(F2.token);
    expect(leituraF2.negociacoes).toHaveLength(1);
    expect(leituraF2.negociacoes[0]).toMatchObject({
      id: negItem1,
      minha: false,
      somenteLeitura: true,
      podeResponder: false,
      podeEnviarMensagem: false,
      fornecedorId: null,
      posicao: 1,
    });
    expect(leituraF2.negociacoes[0].mensagens.map((m: any) => m.texto)).toEqual(expect.arrayContaining(textos));

    // REST /eventos: órgão e participantes leem; público anônimo e órgão B não
    const eventos = async (token?: string) => {
      const req = http().get(`/api/sessao/${sessaoId}/eventos`);
      const r = await (token ? req.set(bearer(token)) : req);
      expect(r.status).toBe(200);
      return r.body as any[];
    };
    const daNegociacao = (lista: any[]) => lista.filter((e) => /frete|980,00\?/.test(e.descricao));
    expect(daNegociacao(await eventos(orgao.token))).toHaveLength(2);
    expect(daNegociacao(await eventos(F1.token))).toHaveLength(2);
    expect(daNegociacao(await eventos(F2.token))).toHaveLength(2);
    expect(daNegociacao(await eventos())).toHaveLength(0);
    expect(daNegociacao(await eventos(orgaoB.token))).toHaveLength(0);
    // a abertura é pública (sem identidade)
    expect((await eventos()).some((e) => e.tipo === 'NEGOCIACAO_INICIADA')).toBe(true);
    // ata: a negociação entra inteira (registro público após a conclusão), com a marca de visibilidade
    const ata = (await http().get(`/api/sessao/${sessaoId}/ata`).set(bearer(orgao.token)).expect(200)).body;
    expect(daNegociacao(ata.eventos).every((e: any) => e.visibilidade === 'PARTICIPANTES')).toBe(true);
    expect(daNegociacao(ata.eventos)).toHaveLength(2);
  });

  test('contraproposta ≥ valor atual → 400; licitante recusa com motivo', async () => {
    expect((await http().post(`${base()}/${negItem1}/contraproposta`).set(bearer(orgao.token)).send({ valor: 1100 })).status).toBe(400);
    expect((await http().post(`${base()}/${negItem1}/contraproposta`).set(bearer(F1.token)).send({ valor: 900 })).status).toBe(403);
    const c = await http().post(`${base()}/${negItem1}/contraproposta`).set(bearer(orgao.token)).send({ valor: 950 });
    expect(c.status).toBe(201);
    expect(c.body.contraproposta).toMatchObject({ valor: 950, status: 'PENDENTE' });
    // outra contraproposta com uma pendente → 400
    expect((await http().post(`${base()}/${negItem1}/contraproposta`).set(bearer(orgao.token)).send({ valor: 940 })).status).toBe(400);
    expect((await http().post(`${base()}/${negItem1}/responder`).set(bearer(F1.token)).send({ aceitar: false })).status).toBe(400);
    const r = await http().post(`${base()}/${negItem1}/responder`).set(bearer(F1.token)).send({ aceitar: false, motivo: 'Abaixo do custo de produção' });
    expect(r.status).toBe(201);
    expect(r.body.contraproposta.status).toBe('RECUSADA');
    const lances = await q(`SELECT 1 FROM lances WHERE item_id = $1 AND origem = 'NEGOCIACAO'`, [item1]);
    expect(lances).toHaveLength(0);
  });

  test('contraproposta aceita → lance NEGOCIACAO, ranking e teto da proposta adequada atualizados, resultado público', async () => {
    const resultadoF2 = coletor(sF2, 'negociacao_resultado');
    await http().post(`${base()}/${negItem1}/contraproposta`).set(bearer(orgao.token)).send({ valor: 980, mensagem: 'Última proposta.' }).expect(201);
    const r = await http().post(`${base()}/${negItem1}/responder`).set(bearer(F1.token)).send({ aceitar: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'CONCLUIDA', resultado: 'REDUZIDO', valorFinal: 980, propostaAdequadaReaberta: true });

    const [lance] = await q(`SELECT fornecedor_id, valor::float AS valor, cancelado FROM lances WHERE item_id = $1 AND origem = 'NEGOCIACAO'`, [item1]);
    expect(lance).toEqual({ fornecedor_id: F1.id, valor: 980, cancelado: false });
    const ranking = (await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(orgao.token)).expect(200)).body;
    const r1 = ranking.unidades.find((u: any) => u.id === item1).ranking[0];
    expect(r1).toMatchObject({ fornecedorId: F1.id, melhorValor: 980 });

    // Resultado público (IN 73 art. 30 §3º): só o valor
    await ate(() => resultadoF2.some((x) => x.status === 'CONCLUIDA'));
    expect(resultadoF2.find((x) => x.status === 'CONCLUIDA')).toMatchObject({ unidadeId: item1, resultado: 'REDUZIDO', valorFinal: 980 });
    const eventosF2 = (await http().get(`/api/sessao/${sessaoId}/eventos`).set(bearer(F2.token)).expect(200)).body as any[];
    const encerrada = eventosF2.find((e) => e.tipo === 'NEGOCIACAO_ENCERRADA');
    expect(Number(encerrada.valor)).toBe(980);
    // participante acompanha a contraproposta e o aceite; o público só vê o resultado
    expect(eventosF2.some((e) => e.tipo === 'NEGOCIACAO_ACEITA')).toBe(true);
    const publico = (await http().get(`/api/sessao/${sessaoId}/eventos`).expect(200)).body as any[];
    expect(publico.some((e) => e.tipo === 'NEGOCIACAO_ACEITA' || e.tipo === 'NEGOCIACAO_PROPOSTA')).toBe(false);
    expect(Number(publico.find((e) => e.tipo === 'NEGOCIACAO_ENCERRADA').valor)).toBe(980);

    // A convocação de aceitação ativa passa a exigir a proposta adequada ao valor negociado
    const minhas = (await http().get(`/api/julgamento/sessao/${sessaoId}/aceitacao`).set(bearer(F1.token)).expect(200)).body;
    const conv = minhas.convocacoes.find((c: any) => c.unidadeId === item1 && ['AGUARDANDO_ENVIO', 'ENVIADA'].includes(c.status));
    expect(conv).toMatchObject({ status: 'AGUARDANDO_ENVIO', valorTotalReadequado: null });
    expect(conv.limites.valorFinalTotal).toBe(980);
    const acima = await enviarPropostaAdequada(ctx, sessaoId, conv.id, F1.token, [{ itemId: item1, valorUnitario: 100 }]);
    expect(acima.status).toBe(400);
    expect((await enviarPropostaAdequada(ctx, sessaoId, conv.id, F1.token, valoresNoLimite(conv.limites))).status).toBe(201);
    expect((await decidirAceitacao(ctx, sessaoId, conv.id, orgao.token, 'aceitar')).status).toBe(201);
    expect((await unidade(item1)).atual.situacao).toBe('ACEITO');
  });

  test('item 3: desclassificar sem negociar → 409; recusa + acima do máximo → DESCLASSIFICADO e o próximo é chamado', async () => {
    // F2 (1º) já convocado para a aceitação antes da negociação
    const conv = await convocarAceitacao(ctx, sessaoId, item3, orgao.token);
    expect(conv.status).toBe(201);
    expect(conv.body.fornecedorId).toBe(F2.id);
    const aberta = await http().post(`${base()}/unidade/${item3}/abrir`).set(bearer(orgao.token)).send({});
    expect(aberta.status).toBe(201);
    const neg = aberta.body.id;
    const cedo = await http().post(`${base()}/${neg}/desclassificar`).set(bearer(orgao.token)).send({});
    expect(cedo.status).toBe(409);
    expect(cedo.body.message).toMatch(/Negocie antes/);

    await http().post(`${base()}/${neg}/contraproposta`).set(bearer(orgao.token)).send({ valor: 400 }).expect(201);
    await http().post(`${base()}/${neg}/responder`).set(bearer(F2.token)).send({ aceitar: false, motivo: 'Não cobre o custo' }).expect(201);

    const convocadoF1 = coletor(sF1, 'negociacao_atualizada');
    const d = await http().post(`${base()}/${neg}/desclassificar`).set(bearer(orgao.token)).send({ motivo: 'Licitante manteve R$ 440,00' });
    expect(d.status).toBe(201);
    expect(d.body.desclassificada).toMatchObject({ resultado: 'DESCLASSIFICADO', status: 'CONCLUIDA' });
    expect(d.body.proximaNegociacao).toMatchObject({ fornecedorId: F1.id, status: 'EM_ANDAMENTO', origem: 'AUTOMATICA', posicao: 1 });
    // todos os participantes recebem as atualizações (a do desclassificado e a da nova negociação)
    await ate(() => convocadoF1.some((x) => x.negociacaoId === d.body.proximaNegociacao.id));
    expect(convocadoF1.map((x) => x.negociacaoId)).toEqual(expect.arrayContaining([neg, d.body.proximaNegociacao.id]));

    const [sit] = await q(`SELECT situacao, motivo FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [item3, F2.id]);
    expect(sit.situacao).toBe('DESCLASSIFICADO');
    expect(sit.motivo).toMatch(/preço máximo/);
    const [ac] = await q(`SELECT status FROM aceitacoes_proposta WHERE id = $1`, [conv.body.id]);
    expect(ac.status).toBe('CANCELADA');

    // Proposta adequada só depois da negociação em andamento (IN 73 art. 30 §4º)
    const durante = await convocarAceitacao(ctx, sessaoId, item3, orgao.token);
    expect(durante.status).toBe(409);
    expect(durante.body.message).toMatch(/negociação em andamento/);

    // F1 aceita 400 → dentro do máximo; convocação nasce com o valor negociado
    const u3 = await unidade(item3);
    expect(u3.ativa.fornecedorId).toBe(F1.id);
    await http().post(`${base()}/${u3.ativa.id}/contraproposta`).set(bearer(orgao.token)).send({ valor: 400 }).expect(201);
    const ok = await http().post(`${base()}/${u3.ativa.id}/responder`).set(bearer(F1.token)).send({ aceitar: true });
    expect(ok.status).toBe(201);
    expect(ok.body.propostaAdequadaReaberta).toBe(false);
    const nova = await convocarAceitacao(ctx, sessaoId, item3, orgao.token);
    expect(nova.status).toBe(201);
    expect(nova.body).toMatchObject({ fornecedorId: F1.id });
    expect(nova.body.limites.valorFinalTotal).toBe(400);
    const pa = await painelAceitacao(ctx, sessaoId, orgao.token);
    const r3 = pa.unidades.find((u: any) => u.id === item3).ranking;
    expect(r3.find((e: any) => e.fornecedorId === F2.id)).toMatchObject({ situacao: 'DESCLASSIFICADO', excluido: true });
  });

  test('isolamento: órgão B não pratica atos na negociação de outro órgão', async () => {
    const u3 = await unidade(item3);
    for (const [rota, corpo] of [
      ['contraproposta', { valor: 1 }],
      ['encerrar', {}],
      ['desclassificar', {}],
      ['mensagem', { texto: 'órgão alheio' }],
    ] as const) {
      expect([403, 404]).toContain((await http().post(`${base()}/${u3.ativa?.id ?? negItem1}/${rota}`).set(bearer(orgaoB.token)).send(corpo)).status);
    }
    // e fornecedor não pratica atos do agente
    expect((await http().post(`${base()}/${negItem1}/encerrar`).set(bearer(F1.token)).send({})).status).toBe(403);
  });

  test('B8: as rotas antigas de negociação em /api/sessao não existem mais', async () => {
    for (const rota of ['encerrar', F1.id]) {
      const r = await http().put(`/api/sessao/${sessaoId}/negociacao/${rota}`).set(bearer(orgao.token)).send({});
      expect(r.status).toBe(404);
    }
    expect((await http().get(`/api/sessao/${sessaoId}/negociacao`).set(bearer(orgao.token))).status).toBe(404);
  });
});
