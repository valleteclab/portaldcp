/**
 * ============================================================================
 * E3 — JULGAMENTO: ranking único e ACEITAÇÃO DA PROPOSTA, contra o banco real
 * ============================================================================
 *
 * Base legal: IN SEGES 73/2022 art. 29 (proposta adequada ao último lance em
 * prazo ≥ 2 h, prorrogável; aceite/recusa com motivo; recusa chama o próximo);
 * Lei 14.133/2021 art. 59 §4º e IN 73 art. 34 (indício de inexequibilidade →
 * alerta que exige justificativa, nunca bloqueio automático).
 *
 *  A. Pregão por ITEM, 3 licitantes:
 *     - fim dos lances → sala em ACEITACAO_PROPOSTA; licitantes da unidade
 *       registrados pelo ranking de LANCES (não pela proposta);
 *     - convocar o 1º; isolamento (outro licitante não vê/envia, órgão B e
 *       fornecedor não praticam atos do agente);
 *     - valores acima do último lance / sem arquivo → 400; envio no limite;
 *     - recusa com motivo → RECUSADO e o 2º PELOS LANCES convocado sozinho;
 *     - aceite → ACEITO;
 *     - prazo: pedido de prorrogação, prorrogação única pelo mesmo período,
 *       envio após o prazo recusado, recusa por prazo vencido chama o próximo;
 *     - INICIAR_HABILITACAO só com todas as unidades com proposta aceita.
 *  B. Obra (tipo OBRA): proposta abaixo de 75% do orçado → alerta; aceite
 *     exige justificativa.
 *  C. LOTE: valores por item validados contra o rateio do último lance.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  levarAteFase,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import {
  PDF_PROPOSTA,
  convocarAceitacao,
  decidirAceitacao,
  enviarPropostaAdequada,
  painelAceitacao,
  valoresNoLimite,
} from './support/julgamento';
import { convocarHabilitacao } from './support/habilitacao';
import { FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';
import { EtapaSessao } from '../src/sessao/entities/sessao-disputa.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E3 — julgamento: ranking único e aceitação da proposta', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  const encerrar = async (orgao: OrgaoFixture, sessaoId: string, unidadeId: string) => {
    const r = await http().post(`/api/disputa/sessao/${sessaoId}/encerrar-item/${unidadeId}`).set(bearer(orgao.token));
    expect(r.status).toBe(201);
    return r.body;
  };

  // --------------------------------------------------------------------------
  describe('A. pregão por item — convocação, envio, recusa → próximo, aceite, prazos', () => {
    let orgao: OrgaoFixture;
    let orgaoB: OrgaoFixture;
    let F1: FornecedorFixture;
    let F2: FornecedorFixture;
    let F3: FornecedorFixture;
    let licId: string;
    let sessaoId: string;
    let item1: string;
    let item2: string;
    let convF3: any;

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura Aceitação E3' });
      orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura E3' });
      F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      // Propostas (unitário): item 1 (10 un.): F1 95, F2 96, F3 98 · item 2 (5 un.): F1 190, F2 185, F3 199
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
      // Lance: F3 (pior PROPOSTA no item 1) vira o 1º pelos LANCES
      const l = await http().post(`/api/disputa/sessao/${sessaoId}/lance`).set(bearer(F3.token)).send({ itemId: item1, valor: 945 });
      expect(l.status).toBe(201);
      await encerrar(orgao, sessaoId, item1);
      await encerrar(orgao, sessaoId, item2);
    });

    test('fim dos lances: sala na aceitação e licitantes da unidade pelo ranking de LANCES', async () => {
      const s = (await http().get(`/api/disputa/sessao/${sessaoId}`).expect(200)).body;
      expect(s.etapa).toBe(EtapaSessao.ACEITACAO_PROPOSTA);
      const l = await buscarLicitacao(ctx, { id: licId, orgao } as any);
      expect(l.fase).toBe(FaseLicitacao.JULGAMENTO);
      const linhas = await q(
        `SELECT fornecedor_id, situacao, posicao_final FROM licitantes_unidade WHERE unidade_id = $1 ORDER BY posicao_final`,
        [item1],
      );
      expect(linhas.map((x: any) => [x.fornecedor_id, x.situacao])).toEqual([
        [F3.id, 'CLASSIFICADO'],
        [F1.id, 'CLASSIFICADO'],
        [F2.id, 'CLASSIFICADO'],
      ]);
      const ranking = await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(orgao.token)).expect(200);
      const u2 = ranking.body.unidades.find((u: any) => u.id === item2);
      expect(u2.ranking.map((e: any) => e.fornecedorId)).toEqual([F2.id, F1.id, F3.id]);
    });

    test('isolamento: fornecedor e órgão B não convocam nem leem o painel do agente', async () => {
      expect((await convocarAceitacao(ctx, sessaoId, item1, F1.token)).status).toBe(403);
      expect([403, 404]).toContain((await convocarAceitacao(ctx, sessaoId, item1, orgaoB.token)).status);
      expect([403, 404]).toContain((await http().get(`/api/julgamento/sessao/${sessaoId}/aceitacao`).set(bearer(orgaoB.token))).status);
      expect([403, 404]).toContain((await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(orgaoB.token))).status);
      expect((await http().get(`/api/julgamento/sessao/${sessaoId}/ranking`).set(bearer(F1.token))).status).toBe(403);
      expect((await http().get(`/api/julgamento/sessao/${sessaoId}/aceitacao`)).status).toBe(401);
    });

    test('convoca o 1º pelos lances (F3); prazo < 2 h → 400; segunda convocação na unidade → 409', async () => {
      expect((await convocarAceitacao(ctx, sessaoId, item1, orgao.token, 1)).status).toBe(400);
      const c = await convocarAceitacao(ctx, sessaoId, item1, orgao.token, 3);
      expect(c.status).toBe(201);
      convF3 = c.body;
      expect(convF3).toMatchObject({ fornecedorId: F3.id, status: 'AGUARDANDO_ENVIO', prazoHoras: 3 });
      expect(convF3.limites.valorFinalTotal).toBe(945);
      const h = (new Date(convF3.prazoAte).getTime() - Date.now()) / 3_600_000;
      expect(h).toBeGreaterThan(2.9);
      expect((await convocarAceitacao(ctx, sessaoId, item1, orgao.token)).status).toBe(409);
    });

    test('isolamento: outro licitante não vê nem envia a proposta do convocado; órgão B não decide', async () => {
      const minhasF1 = await painelAceitacao(ctx, sessaoId, F1.token);
      expect(minhasF1.convocacoes).toEqual([]);
      expect(JSON.stringify(minhasF1)).not.toContain(F3.id);
      const outro = await enviarPropostaAdequada(ctx, sessaoId, convF3.id, F1.token, [{ itemId: item1, valorUnitario: 90 }]);
      expect(outro.status).toBe(404);
      expect([403, 404]).toContain((await decidirAceitacao(ctx, sessaoId, convF3.id, orgaoB.token, 'recusar', { motivo: 'x' })).status);
      expect([403, 404]).toContain((await decidirAceitacao(ctx, sessaoId, convF3.id, orgaoB.token, 'aceitar')).status);
      expect((await decidirAceitacao(ctx, sessaoId, convF3.id, F3.token, 'aceitar')).status).toBe(403);
    });

    test('F3 envia: acima do último lance → 400; sem arquivo → 400; no limite → 201 (arquivo só para dono e órgão)', async () => {
      const acima = await enviarPropostaAdequada(ctx, sessaoId, convF3.id, F3.token, [{ itemId: item1, valorUnitario: 94.6 }]);
      expect(acima.status).toBe(400);
      expect(acima.body.message).toMatch(/acima do limite|supera/);
      const semArquivo = await enviarPropostaAdequada(ctx, sessaoId, convF3.id, F3.token, [{ itemId: item1, valorUnitario: 94.5 }], null);
      expect(semArquivo.status).toBe(400);
      const ok = await enviarPropostaAdequada(ctx, sessaoId, convF3.id, F3.token, [{ itemId: item1, valorUnitario: 94.5 }]);
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ status: 'ENVIADA', valorTotalReadequado: 945, alertaExequibilidade: null });

      const arq = `/api/julgamento/sessao/${sessaoId}/aceitacao/${convF3.id}/arquivo`;
      const doOrgao = await http()
        .get(arq)
        .set(bearer(orgao.token))
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (c: Buffer) => partes.push(c));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      expect(doOrgao.status).toBe(200);
      expect(Buffer.from(doOrgao.body).equals(PDF_PROPOSTA)).toBe(true);
      expect((await http().get(arq).set(bearer(F3.token))).status).toBe(200);
      expect((await http().get(arq).set(bearer(F1.token))).status).toBe(404);
      expect([403, 404]).toContain((await http().get(arq).set(bearer(orgaoB.token))).status);
      expect((await http().get(arq)).status).toBe(401);
    });

    test('recusa exige motivo; recusado sai do ranking e o 2º PELOS LANCES (F1) é convocado sozinho', async () => {
      expect((await decidirAceitacao(ctx, sessaoId, convF3.id, orgao.token, 'recusar', {})).status).toBe(400);
      const r = await decidirAceitacao(ctx, sessaoId, convF3.id, orgao.token, 'recusar', {
        motivo: 'Marca ofertada diverge da exigida no termo de referência',
      });
      expect(r.status).toBe(201);
      expect(r.body.recusada.status).toBe('RECUSADA');
      expect(r.body.proximaConvocacao).toMatchObject({ fornecedorId: F1.id, status: 'AGUARDANDO_ENVIO', prazoHoras: 3 });
      const painel = await painelAceitacao(ctx, sessaoId, orgao.token);
      const u1 = painel.unidades.find((u: any) => u.id === item1);
      expect(u1.ranking.find((e: any) => e.fornecedorId === F3.id)).toMatchObject({ situacao: 'RECUSADO', excluido: true, posicao: null });
      expect(u1.ranking.filter((e: any) => !e.excluido).map((e: any) => [e.fornecedorId, e.posicao])).toEqual([
        [F1.id, 1],
        [F2.id, 2],
      ]);
      const eventos = (await http().get(`/api/sessao/${sessaoId}/eventos`).set(bearer(orgao.token)).expect(200)).body;
      expect(eventos.some((e: any) => e.tipo === 'PROPOSTA_RECUSADA' && /Marca ofertada/.test(e.descricao))).toBe(true);
    });

    test('aceitar antes do envio → 400; F1 envia e o agente aceita (ACEITO)', async () => {
      const painel = await painelAceitacao(ctx, sessaoId, orgao.token);
      const conv = painel.unidades.find((u: any) => u.id === item1).aceitacaoAtual;
      expect((await decidirAceitacao(ctx, sessaoId, conv.id, orgao.token, 'aceitar')).status).toBe(400);
      const minhas = await painelAceitacao(ctx, sessaoId, F1.token);
      const minha = minhas.convocacoes.find((c: any) => c.id === conv.id);
      expect(minha.podeEnviar).toBe(true);
      expect((await enviarPropostaAdequada(ctx, sessaoId, conv.id, F1.token, valoresNoLimite(minha.limites))).status).toBe(201);
      const a = await decidirAceitacao(ctx, sessaoId, conv.id, orgao.token, 'aceitar');
      expect(a.status).toBe(201);
      expect(a.body.status).toBe('ACEITA');
      const [lu] = await q(`SELECT situacao FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [item1, F1.id]);
      expect(lu.situacao).toBe('ACEITO');
      // unidade resolvida: nova convocação recusada
      expect((await convocarAceitacao(ctx, sessaoId, item1, orgao.token)).status).toBe(409);
    });

    test('habilitação antes de todas as unidades aceitas → 400 (item 2 pendente)', async () => {
      const r = await convocarHabilitacao(ctx, licId, F1.id, orgao.token);
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toMatch(/Item 2/);
      // licitante sem proposta aceita não é convocado para a habilitação
      const semAceite = await convocarHabilitacao(ctx, licId, F2.id, orgao.token);
      expect(semAceite.status).toBe(400);
    });

    test('prazo: pedido do licitante, prorrogação única pelo mesmo período, envio após o prazo recusado', async () => {
      const c = await convocarAceitacao(ctx, sessaoId, item2, orgao.token, 2);
      expect(c.status).toBe(201);
      expect(c.body.fornecedorId).toBe(F2.id);
      // ainda no prazo, sem envio: recusa não cabe
      expect((await decidirAceitacao(ctx, sessaoId, c.body.id, orgao.token, 'recusar', { motivo: 'sem envio' })).status).toBe(409);
      // pedido justificado do licitante (só o próprio)
      const url = `/api/julgamento/sessao/${sessaoId}/aceitacao/${c.body.id}/pedir-prorrogacao`;
      expect((await http().post(url).set(bearer(F1.token)).send({ motivo: 'Preciso de mais tempo para a planilha' })).status).toBe(404);
      expect((await http().post(url).set(bearer(F2.token)).send({ motivo: 'curto' })).status).toBe(400);
      expect((await http().post(url).set(bearer(F2.token)).send({ motivo: 'Aguardando carta do fabricante' })).status).toBe(201);
      // prorrogação pelo agente: mesmo período (2 h), a pedido
      const prorrogar = `/api/julgamento/sessao/${sessaoId}/aceitacao/${c.body.id}/prorrogar`;
      expect((await http().post(prorrogar).set(bearer(orgao.token)).send({})).status).toBe(400);
      const p = await http().post(prorrogar).set(bearer(orgao.token)).send({ motivo: 'Pedido justificado deferido' });
      expect(p.status).toBe(201);
      expect(p.body.prorrogacaoOrigem).toBe('PEDIDO');
      const ganho = (new Date(p.body.prazoAte).getTime() - new Date(c.body.prazoAte).getTime()) / 3_600_000;
      expect(ganho).toBeCloseTo(2, 5);
      expect((await http().post(prorrogar).set(bearer(orgao.token)).send({ motivo: 'de novo' })).status).toBe(409);

      // prazo vence sem envio
      // (Date do JS: mesma conversão de fuso que o app usa ao gravar a coluna timestamp)
      await q(`UPDATE aceitacoes_proposta SET prazo_ate = $2 WHERE id = $1`, [c.body.id, new Date(Date.now() - 60_000)]);
      const tarde = await enviarPropostaAdequada(ctx, sessaoId, c.body.id, F2.token, valoresNoLimite(c.body.limites));
      expect(tarde.status).toBe(409);
      // recusa por prazo vencido → próximo pelos lances no item 2 (F1)
      const r = await decidirAceitacao(ctx, sessaoId, c.body.id, orgao.token, 'recusar', {
        motivo: 'Prazo encerrado sem envio da proposta adequada',
      });
      expect(r.status).toBe(201);
      expect(r.body.proximaConvocacao.fornecedorId).toBe(F1.id);
    });

    test('com todas as unidades aceitas, a habilitação começa (INICIAR_HABILITACAO)', async () => {
      const painel = await painelAceitacao(ctx, sessaoId, orgao.token);
      const conv = painel.unidades.find((u: any) => u.id === item2).aceitacaoAtual;
      expect((await enviarPropostaAdequada(ctx, sessaoId, conv.id, F1.token, valoresNoLimite(conv.limites))).status).toBe(201);
      expect((await decidirAceitacao(ctx, sessaoId, conv.id, orgao.token, 'aceitar')).status).toBe(201);
      const depois = await painelAceitacao(ctx, sessaoId, orgao.token);
      expect(depois.todasResolvidas).toBe(true);
      expect(depois.etapa).toBe(EtapaSessao.CONVOCACAO_HABILITACAO);
      expect((await convocarHabilitacao(ctx, licId, F1.id, orgao.token)).status).toBe(201);
      const l = await buscarLicitacao(ctx, { id: licId, orgao } as any);
      expect(l.fase).toBe(FaseLicitacao.HABILITACAO);
      // fora do julgamento, a aceitação não aceita atos
      expect((await convocarAceitacao(ctx, sessaoId, item2, orgao.token)).status).toBe(409);
    });
  });

  // --------------------------------------------------------------------------
  describe('B. obra: indício de inexequibilidade (art. 59 §4º) — alerta com justificativa', () => {
    test('proposta abaixo de 75% do orçado → alerta; aceite só com justificativa', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Obra E3' });
      const F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F1, valores: [700] },
          { fornecedor: F2, valores: [950] },
        ],
        {
          itens: [{ descricao: 'Pavimentação (serviço comum de engenharia)', quantidade: 1, valor_unitario_estimado: 1000 }],
          extras: { tipo_contratacao: 'SERVICO_ENGENHARIA' },
        },
      );
      const item = p.lic.itens[0].id;
      await encerrar(orgao, p.sessaoId, item);
      const c = await convocarAceitacao(ctx, p.sessaoId, item, orgao.token);
      expect(c.status).toBe(201);
      const e = await enviarPropostaAdequada(ctx, p.sessaoId, c.body.id, F1.token, [{ itemId: item, valorUnitario: 700 }]);
      expect(e.status).toBe(201);
      expect(e.body.alertaExequibilidade).toMatchObject({ limitePercentual: 75, percentualDoOrcado: 70 });
      expect((await decidirAceitacao(ctx, p.sessaoId, c.body.id, orgao.token, 'aceitar')).status).toBe(400);
      const ok = await decidirAceitacao(ctx, p.sessaoId, c.body.id, orgao.token, 'aceitar', {
        justificativaExequibilidade: 'Licitante comprovou exequibilidade com planilha de custos e contratos similares (art. 59 §2º).',
      });
      expect(ok.status).toBe(201);
      expect(ok.body.justificativaExequibilidade).toMatch(/planilha de custos/);
    });
  });

  // --------------------------------------------------------------------------
  describe('C. lote: valores por item validados contra o rateio do último lance', () => {
    test('item acima do rateio → 400; soma no lance, cada item no rateio → 201', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Lote E3' });
      const F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: ModoDisputa.ABERTO,
        itens: [
          { descricao: 'Notebook', quantidade: 4, valor_unitario_estimado: 1000 },
          { descricao: 'Mouse', quantidade: 10, valor_unitario_estimado: 50 },
        ],
        extras: { base_lance: 'TOTAL_LOTE', usa_lotes: true },
      });
      const lote = await http().post('/api/lotes').set(bearer(orgao.token)).send({ numero: 1, descricao: 'Informática', licitacao_id: lic.id });
      expect(lote.status).toBe(201);
      for (const it of lic.itens) {
        expect((await http().post(`/api/lotes/${lote.body.id}/itens/${it.id}`).set(bearer(orgao.token))).status).toBe(201);
      }
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const propostas = [
        (await enviarProposta(ctx, F1, lic, [950, 45])).id, // 3800 + 450 = 4250
        (await enviarProposta(ctx, F2, lic, [980, 48])).id, // 3920 + 480 = 4400
      ];
      await abrirSessaoAgora(ctx, lic);
      expect((await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({})).status).toBe(200);
      for (const id of propostas) expect((await http().put(`/api/propostas/${id}/classificar`).set(bearer(orgao.token))).status).toBe(200);
      const s = await http().post(`/api/sessao/${lic.id}`).set(bearer(orgao.token)).send({ pregoeiroId: orgao.id, pregoeiroNome: 'Pregoeiro Lote E3' });
      expect(s.status).toBe(201);
      const sessaoId = s.body.id;
      expect((await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token))).status).toBe(200);
      expect(
        (await http().post(`/api/disputa/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [lote.body.id] })).status,
      ).toBe(201);
      const lance = await http().post(`/api/disputa/sessao/${sessaoId}/lance`).set(bearer(F1.token)).send({ loteId: lote.body.id, valor: 4000 });
      expect(lance.status).toBe(201);
      await encerrar(orgao, sessaoId, lote.body.id);

      const c = await convocarAceitacao(ctx, sessaoId, lote.body.id, orgao.token);
      expect(c.status).toBe(201);
      expect(c.body).toMatchObject({ fornecedorId: F1.id, tipoUnidade: 'LOTE' });
      expect(c.body.limites.valorFinalTotal).toBe(4000);
      const tetos = c.body.limites.itens.map((i: any) => i.valorMaximoTotal);
      expect(Math.round(tetos.reduce((a: number, b: number) => a + b, 0) * 100) / 100).toBe(4000);
      const [notebook, mouse] = c.body.limites.itens;
      // soma abaixo do lance, mas o notebook sobe acima do rateio → recusado
      const r = await enviarPropostaAdequada(ctx, sessaoId, c.body.id, F1.token, [
        { itemId: notebook.itemId, valorUnitario: notebook.valorMaximoTotal / notebook.quantidade + 10 },
        { itemId: mouse.itemId, valorUnitario: 1 },
      ]);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Item 1.*acima do limite/);
      // falta um item → 400
      expect(
        (await enviarPropostaAdequada(ctx, sessaoId, c.body.id, F1.token, [{ itemId: notebook.itemId, valorUnitario: 900 }])).status,
      ).toBe(400);
      const ok = await enviarPropostaAdequada(ctx, sessaoId, c.body.id, F1.token, valoresNoLimite(c.body.limites));
      expect(ok.status).toBe(201);
      expect(ok.body.valorTotalReadequado).toBeLessThanOrEqual(4000);
      expect(ok.body.valoresItens).toHaveLength(2);
      expect((await decidirAceitacao(ctx, sessaoId, c.body.id, orgao.token, 'aceitar')).status).toBe(201);
    });
  });
});
