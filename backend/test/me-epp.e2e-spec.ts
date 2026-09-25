/**
 * ============================================================================
 * E3 — BENEFÍCIO ME/EPP (LC 123/2006 arts. 44–48; Lei 14.133 art. 4º), contra
 * o banco real
 * ============================================================================
 *
 *  A. Pregão por ITEM (5% — art. 44 §2º), 4 itens, fim dos lances → BENEFICIO_MPE:
 *     - item 1: melhor = demais; ME/EPP no intervalo → a melhor ME é convocada
 *       sozinha (5 min); aceitação bloqueada; isolamento (outra ME, o
 *       pregoeiro e anônimo não respondem); oferta igual à melhor → 400;
 *       oferta inferior → a ME passa a 1ª (lance DESEMPATE_MPE) e a aceitação
 *       convoca a ME;
 *     - item 2: a 1ª ME declina → a 2ª é convocada; prazo da 2ª vence → sem
 *       exercício, mantida a melhor original;
 *     - item 3: nenhuma ME no intervalo → segue direto para a aceitação;
 *     - item 4: melhor oferta já é de ME → sem benefício (art. 45 §2º).
 *  B. Exclusivo (art. 48 I): proposta de não-ME/EPP recusada (licitação toda e
 *     por item); o motor também barra lance/proposta em item exclusivo.
 *  C. Cota reservada (art. 48 III): unidade-COTA gerada (quantidade da cota,
 *     principal reduzida), percentual acima do máximo recusado, cota disputada
 *     só por ME/EPP, geração idempotente e travada após as propostas.
 *  D. LOTE: empate ficto no valor global do lote; ME cobre e vira a 1ª (rateio).
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  levarAteFase,
  datasEditalPadrao,
  JUSTIFICATIVA_ART49_E2E,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { convocarAceitacao } from './support/julgamento';
import { FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';
import { EtapaSessao } from '../src/sessao/entities/sessao-disputa.entity';
import { TipoParticipacao } from '../src/itens/entities/item-licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E3 — benefício ME/EPP (LC 123/2006)', () => {
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
  const meEpp = async (sessaoId: string, token: string) => {
    const r = await http().get(`/api/julgamento/sessao/${sessaoId}/me-epp`).set(bearer(token));
    expect(r.status).toBe(200);
    return r.body;
  };
  const exercer = (sessaoId: string, convId: string, token: string | null, valor: number) => {
    const req = http().post(`/api/julgamento/sessao/${sessaoId}/me-epp/${convId}/exercer`);
    if (token) req.set(bearer(token));
    return req.send({ valor });
  };
  const declinar = (sessaoId: string, convId: string, token: string) =>
    http().post(`/api/julgamento/sessao/${sessaoId}/me-epp/${convId}/declinar`).set(bearer(token)).send({});
  const etapa = async (sessaoId: string) => (await http().get(`/api/disputa/sessao/${sessaoId}`).expect(200)).body.etapa;

  // --------------------------------------------------------------------------
  describe('A. pregão por item — empate ficto aceito, recusado, prazo, sem ME no intervalo, melhor já ME', () => {
    let orgao: OrgaoFixture;
    let G: FornecedorFixture;
    let M1: FornecedorFixture;
    let M2: FornecedorFixture;
    let M3: FornecedorFixture;
    let sessaoId: string;
    let itens: string[];

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura ME/EPP E3' });
      G = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      M1 = await criarFornecedor(ctx, { porte: 'ME' });
      M2 = await criarFornecedor(ctx, { porte: 'EPP' });
      M3 = await criarFornecedor(ctx, { porte: 'ME' });
      // qtd 1 → valor do lance (TOTAL_ITEM) = unitário. Limite 5% de 900 = 945.
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: G, valores: [900, 900, 900, 900] },
          { fornecedor: M1, valores: [930, 930, 950, 890] },
          { fornecedor: M2, valores: [940, 940, 999, 999] },
          { fornecedor: M3, valores: [960, 999, 999, 999] },
        ],
        {
          itens: [1, 2, 3, 4].map((n) => ({ descricao: `Item ME/EPP ${n}`, quantidade: 1, valor_unitario_estimado: 1000 })),
        },
      );
      sessaoId = p.sessaoId;
      itens = p.lic.itens.map((i) => i.id);
      for (const it of itens) await encerrar(orgao, sessaoId, it);
    });

    test('fim dos lances: sala em BENEFICIO_MPE; a melhor ME do intervalo convocada sozinha nos itens 1 e 2', async () => {
      expect(await etapa(sessaoId)).toBe(EtapaSessao.BENEFICIO_MPE);
      const painel = await meEpp(sessaoId, orgao.token);
      const [u1, u2, u3, u4] = itens.map((id) => painel.unidades.find((u: any) => u.id === id));
      expect(u1.desempate).toMatchObject({ status: 'EM_CURSO', percentual: 5, limite: 945, prazoMinutos: 5 });
      expect(u1.desempate.melhor).toMatchObject({ fornecedorId: G.id, valor: 900 });
      // M3 (960) fora dos 5%
      expect(u1.desempate.candidatos.map((c: any) => c.fornecedorId)).toEqual([M1.id, M2.id]);
      expect(u1.convocacaoAtual).toMatchObject({ fornecedorId: M1.id, status: 'AGUARDANDO', valorACobrir: 900 });
      expect(u1.convocacaoAtual.segundosRestantes).toBeGreaterThan(250);
      expect(u2.convocacaoAtual.fornecedorId).toBe(M1.id);
      expect(u3.desempate.status).toBe('NAO_APLICAVEL');
      expect(u3.desempate.motivo).toMatch(/Nenhuma ME\/EPP/);
      expect(u4.desempate.status).toBe('NAO_APLICAVEL');
      expect(u4.desempate.motivo).toMatch(/já é de ME\/EPP/);
      const [lu] = await q(`SELECT situacao FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [itens[0], M1.id]);
      expect(lu.situacao).toBe('CONVOCADO_DESEMPATE');
    });

    test('aceitação bloqueada enquanto o desempate está em curso; sem ME no intervalo e melhor já ME seguem direto', async () => {
      const bloqueada = await convocarAceitacao(ctx, sessaoId, itens[0], orgao.token);
      expect(bloqueada.status).toBe(409);
      expect(bloqueada.body.message).toMatch(/desempate ME\/EPP em curso/);
      const i3 = await convocarAceitacao(ctx, sessaoId, itens[2], orgao.token);
      expect(i3.status).toBe(201);
      expect(i3.body.fornecedorId).toBe(G.id);
      const i4 = await convocarAceitacao(ctx, sessaoId, itens[3], orgao.token);
      expect(i4.status).toBe(201);
      expect(i4.body.fornecedorId).toBe(M1.id);
    });

    test('isolamento: só a ME convocada vê e responde a convocação (outra ME, demais, pregoeiro e anônimo não)', async () => {
      const minhas = await meEpp(sessaoId, M1.token);
      const conv = minhas.convocacoes.find((c: any) => c.unidadeId === itens[0]);
      expect(conv).toMatchObject({ status: 'AGUARDANDO', podeResponder: true, valorACobrir: 900 });
      const deM2 = await meEpp(sessaoId, M2.token);
      expect(deM2.convocacoes).toEqual([]);
      expect(JSON.stringify(deM2)).not.toContain(M1.id);
      expect((await exercer(sessaoId, conv.id, M2.token, 800)).status).toBe(404);
      expect((await exercer(sessaoId, conv.id, G.token, 800)).status).toBe(404);
      expect((await exercer(sessaoId, conv.id, orgao.token, 800)).status).toBe(403);
      expect((await exercer(sessaoId, conv.id, null, 800)).status).toBe(401);
      expect((await declinar(sessaoId, conv.id, M2.token)).status).toBe(404);
      // as rotas antigas da sala /sessao (pregoeiro "aceitava" pela ME) não existem mais
      expect((await http().put(`/api/sessao/${sessaoId}/mpe/aceitar/${M1.id}`).set(bearer(M1.token)).send({ itemId: itens[0], valor: 800 })).status).toBe(404);
      // eventos públicos sem identidade na descrição
      const eventos = (await http().get(`/api/sessao/${sessaoId}/eventos`).set(bearer(G.token)).expect(200)).body;
      const mpe = eventos.filter((e: any) => ['EMPATE_FICTO_DETECTADO', 'LANCE_MPE_SOLICITADO'].includes(e.tipo));
      expect(mpe.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(mpe.map((e: any) => e.descricao))).not.toContain(M1.razao_social);
    });

    test('oferta igual à melhor → 400; estritamente inferior → a ME passa a 1ª (DESEMPATE_MPE) e a aceitação a convoca', async () => {
      const minhas = await meEpp(sessaoId, M1.token);
      const conv = minhas.convocacoes.find((c: any) => c.unidadeId === itens[0]);
      const igual = await exercer(sessaoId, conv.id, M1.token, 900);
      expect(igual.status).toBe(400);
      expect(igual.body.message).toMatch(/MENOR/);
      const ok = await exercer(sessaoId, conv.id, M1.token, 899.5);
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ status: 'EXERCIDA', valorOfertado: 899.5 });
      // segunda resposta na mesma convocação → 409
      expect((await exercer(sessaoId, conv.id, M1.token, 899)).status).toBe(409);
      const [l] = await q(
        `SELECT origem, fornecedor_id, valor FROM lances WHERE item_id = $1 AND cancelado = false ORDER BY valor ASC LIMIT 1`,
        [itens[0]],
      );
      expect(l).toMatchObject({ origem: 'DESEMPATE_MPE', fornecedor_id: M1.id });
      expect(Number(l.valor)).toBe(899.5);
      const painel = await meEpp(sessaoId, orgao.token);
      const u1 = painel.unidades.find((u: any) => u.id === itens[0]);
      expect(u1.desempate).toMatchObject({ status: 'EXERCIDO' });
      expect(u1.desempate.vencedor).toMatchObject({ fornecedorId: M1.id, valor: 899.5 });
      const c = await convocarAceitacao(ctx, sessaoId, itens[0], orgao.token);
      expect(c.status).toBe(201);
      expect(c.body.fornecedorId).toBe(M1.id);
      expect(c.body.limites.valorFinalTotal).toBe(899.5);
      // item 2 ainda em desempate: a aceitação dele continua bloqueada
      expect((await convocarAceitacao(ctx, sessaoId, itens[1], orgao.token)).status).toBe(409);
    });

    test('item 2: a 1ª ME declina → a 2ª do intervalo é convocada; prazo vencido → sem exercício, mantida a melhor original', async () => {
      const conv1 = (await meEpp(sessaoId, M1.token)).convocacoes.find((c: any) => c.unidadeId === itens[1]);
      const d = await declinar(sessaoId, conv1.id, M1.token);
      expect(d.status).toBe(201);
      expect(d.body.status).toBe('DECLINADA');
      const conv2 = (await meEpp(sessaoId, M2.token)).convocacoes.find((c: any) => c.unidadeId === itens[1]);
      expect(conv2).toMatchObject({ status: 'AGUARDANDO', ordem: 2, podeResponder: true });
      // prazo vence (Date do JS: mesma conversão de fuso usada ao gravar a coluna timestamp)
      await q(`UPDATE convocacoes_desempate_mpe SET prazo_ate = $2 WHERE id = $1`, [conv2.id, new Date(Date.now() - 1000)]);
      const tarde = await exercer(sessaoId, conv2.id, M2.token, 800);
      expect(tarde.status).toBe(409);
      expect(tarde.body.message).toMatch(/precluso/);
      const painel = await meEpp(sessaoId, orgao.token);
      const u2 = painel.unidades.find((u: any) => u.id === itens[1]);
      expect(u2.desempate.status).toBe('NAO_EXERCIDO');
      expect(u2.historico.map((h: any) => [h.fornecedorId, h.status])).toEqual([
        [M1.id, 'DECLINADA'],
        [M2.id, 'EXPIRADA'],
      ]);
      const [lu] = await q(`SELECT situacao FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [itens[1], M2.id]);
      expect(lu.situacao).toBe('CLASSIFICADO');
      // sem desempate pendente → a sala segue para a aceitação, que convoca o 1º original (G)
      expect(await etapa(sessaoId)).toBe(EtapaSessao.ACEITACAO_PROPOSTA);
      const c = await convocarAceitacao(ctx, sessaoId, itens[1], orgao.token);
      expect(c.status).toBe(201);
      expect(c.body.fornecedorId).toBe(G.id);
    });
  });

  // --------------------------------------------------------------------------
  describe('B. exclusivo ME/EPP (art. 48 I)', () => {
    test('licitação exclusiva: proposta de não-ME/EPP recusada; ME/EPP aceita', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Exclusiva E3' });
      const G = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const M = await criarFornecedor(ctx, { porte: 'ME' });
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: ModoDisputa.ABERTO,
        itens: [{ descricao: 'Papel A4', quantidade: 10, valor_unitario_estimado: 30 }],
        extras: { tipo_beneficio_mpe: 'EXCLUSIVO' },
      });
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      // aviso da tela da proposta: participação por item pelo token
      const part = (await http().get(`/api/julgamento/licitacao/${lic.id}/me-epp/participacao`).set(bearer(G.token)).expect(200)).body;
      expect(part).toMatchObject({ porteMpe: false });
      expect(part.itens[0]).toMatchObject({ itemId: lic.itens[0].id, somenteMpe: true, tipo: 'EXCLUSIVO' });
      const r = await http()
        .post('/api/propostas')
        .set(bearer(G.token))
        .send({
          licitacao_id: lic.id,
          declaracao_termos: true,
          declaracao_integridade: true,
          declaracao_inexistencia_fatos: true,
          declaracao_menor: true,
          declaracao_mpe: false,
          itens: [{ item_licitacao_id: lic.itens[0].id, valor_unitario: 28 }],
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/EXCLUSIVO para ME\/EPP.*art\. 48, I/);
      // não-ME declarando ser ME → recusado pelo cadastro
      const falsa = await http()
        .post('/api/propostas')
        .set(bearer(G.token))
        .send({
          licitacao_id: lic.id,
          declaracao_termos: true,
          declaracao_integridade: true,
          declaracao_inexistencia_fatos: true,
          declaracao_menor: true,
          declaracao_mpe: true,
          itens: [{ item_licitacao_id: lic.itens[0].id, valor_unitario: 28 }],
        });
      expect(falsa.status).toBe(400);
      expect(falsa.body.message).toMatch(/incompatível com o cadastro/);
      const ok = await enviarProposta(ctx, M, lic, [29]);
      const [p] = await q(`SELECT porte_fornecedor, enquadramento_mpe FROM propostas WHERE id = $1`, [ok.id]);
      expect(p).toMatchObject({ porte_fornecedor: 'ME', enquadramento_mpe: true });
    });

    test('por item: só o item exclusivo barra; o motor também recusa proposta/lance de não-ME/EPP em item exclusivo', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Exclusivo por Item E3' });
      const G = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const M = await criarFornecedor(ctx, { porte: 'EPP' });
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: G, valores: [90, 190] },
          { fornecedor: M, valores: [95, 195] },
        ],
        {
          itens: [
            { descricao: 'Toner', quantidade: 1, valor_unitario_estimado: 100, tipo_participacao: TipoParticipacao.AMPLA },
            { descricao: 'Cartucho', quantidade: 1, valor_unitario_estimado: 200, tipo_participacao: TipoParticipacao.AMPLA },
          ],
          extras: { modo_beneficio_mpe: 'POR_ITEM' },
          iniciarItens: false,
        },
      );
      const [i1, i2] = p.lic.itens.map((i) => i.id);
      // o item 1 passa a exclusivo depois das propostas (dado legado/edição): o motor barra
      await q(`UPDATE itens_licitacao SET tipo_participacao = 'EXCLUSIVO_MPE' WHERE id = $1`, [i1]);
      const it = await http().post(`/api/disputa/sessao/${p.sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [i1, i2] });
      expect(it.status).toBe(201);
      const l1 = await q(`SELECT fornecedor_id FROM lances WHERE item_id = $1 AND origem = 'PROPOSTA' AND cancelado = false`, [i1]);
      expect(l1.map((x: any) => x.fornecedor_id)).toEqual([M.id]);
      const l2 = await q(`SELECT fornecedor_id FROM lances WHERE item_id = $1 AND origem = 'PROPOSTA' AND cancelado = false`, [i2]);
      expect(l2).toHaveLength(2);
      const lanceG = await http().post(`/api/disputa/sessao/${p.sessaoId}/lance`).set(bearer(G.token)).send({ itemId: i1, valor: 80 });
      expect(lanceG.status).toBe(400);
      expect(lanceG.body.message).toMatch(/EXCLUSIVO para ME\/EPP/);
      const lanceM = await http().post(`/api/disputa/sessao/${p.sessaoId}/lance`).set(bearer(M.token)).send({ itemId: i1, valor: 94 });
      expect(lanceM.status).toBe(201);
      // item exclusivo: não há empate ficto (todas as participantes são ME/EPP)
      await encerrar(orgao, p.sessaoId, i1);
      const painel = await meEpp(p.sessaoId, orgao.token);
      expect(painel.unidades.find((u: any) => u.id === i1).desempate.status).toBe('NAO_APLICAVEL');
    });
  });

  // --------------------------------------------------------------------------
  describe('C. cota reservada (art. 48 III)', () => {
    test('gera a unidade-COTA; percentual acima do máximo recusado; cota só de ME/EPP; idempotente e travada após propostas', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Cota E3' });
      const G = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const M = await criarFornecedor(ctx, { porte: 'ME' });
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: ModoDisputa.ABERTO,
        itens: [{ descricao: 'Resma de papel', quantidade: 100, valor_unitario_estimado: 25 }],
        extras: { tipo_beneficio_mpe: 'COTA_RESERVADA', percentual_cota_reservada: 25 },
      });
      // acima de 25% → 400 (art. 48 III)
      const acima = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(orgao.token)).send({ percentual_cota_reservada: 30 });
      expect(acima.status).toBe(400);
      // conferência aponta a cota pendente
      const conf = await http().get(`/api/julgamento/licitacao/${lic.id}/me-epp/conferencia`).set(bearer(orgao.token)).expect(200);
      expect(conf.body.problemas.join(' ')).toMatch(/cota reservada a ME\/EPP ainda não gerada/);
      // só o órgão dono gera
      expect((await http().post(`/api/julgamento/licitacao/${lic.id}/me-epp/cotas`).set(bearer(G.token))).status).toBe(403);
      const g = await http().post(`/api/julgamento/licitacao/${lic.id}/me-epp/cotas`).set(bearer(orgao.token));
      expect(g.status).toBe(201);
      expect(g.body.criadas).toHaveLength(1);
      const itens = await q(
        `SELECT id, numero_item, quantidade, valor_total_estimado, tipo_participacao::text AS tipo, item_cota_origem_id
           FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
        [lic.id],
      );
      expect(itens.map((i: any) => [i.numero_item, Number(i.quantidade), Number(i.valor_total_estimado), i.tipo])).toEqual([
        [1, 75, 1875, 'AMPLA'],
        [2, 25, 625, 'EXCLUSIVO_MPE'],
      ]);
      expect(itens[1].item_cota_origem_id).toBe(itens[0].id);
      // idempotente
      const de_novo = await http().post(`/api/julgamento/licitacao/${lic.id}/me-epp/cotas`).set(bearer(orgao.token));
      expect(de_novo.status).toBe(201);
      expect(de_novo.body.criadas).toEqual([]);

      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const [principal, cota] = itens.map((i: any) => i.id);
      const licComCota = { ...lic, itens: [...lic.itens, { id: cota, numero_item: 2, quantidade: 25, valor_unitario_estimado: 25 }] };
      // não-ME/EPP na cota → 400; só na principal → ok
      const naCota = await http()
        .post('/api/propostas')
        .set(bearer(G.token))
        .send({
          licitacao_id: lic.id,
          declaracao_termos: true,
          declaracao_integridade: true,
          declaracao_inexistencia_fatos: true,
          declaracao_menor: true,
          itens: [
            { item_licitacao_id: principal, valor_unitario: 24 },
            { item_licitacao_id: cota, valor_unitario: 24 },
          ],
        });
      expect(naCota.status).toBe(400);
      expect(naCota.body.message).toMatch(/COTA RESERVADA a ME\/EPP/);
      await enviarProposta(ctx, G, licComCota, { [principal]: 24 });
      await enviarProposta(ctx, M, licComCota, { [principal]: 24.5, [cota]: 24.8 });
      // depois das propostas, a estrutura não muda
      expect((await http().post(`/api/julgamento/licitacao/${lic.id}/me-epp/cotas`).set(bearer(orgao.token))).status).toBe(409);

      // disputa: a cota é uma unidade própria, só com a ME
      await abrirSessaoAgora(ctx, lic);
      expect((await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({})).status).toBe(200);
      const props = await q(`SELECT id FROM propostas WHERE licitacao_id = $1`, [lic.id]);
      for (const pr of props) expect((await http().put(`/api/propostas/${pr.id}/classificar`).set(bearer(orgao.token))).status).toBe(200);
      const s = await http().post(`/api/sessao/${lic.id}`).set(bearer(orgao.token)).send({ pregoeiroId: orgao.id, pregoeiroNome: 'Pregoeiro Cota' });
      expect(s.status).toBe(201);
      expect((await http().put(`/api/sessao/${s.body.id}/iniciar`).set(bearer(orgao.token))).status).toBe(200);
      expect((await http().post(`/api/disputa/sessao/${s.body.id}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [principal, cota] })).status).toBe(201);
      const naCotaLances = await q(`SELECT DISTINCT fornecedor_id FROM lances WHERE item_id = $1 AND cancelado = false`, [cota]);
      expect(naCotaLances.map((x: any) => x.fornecedor_id)).toEqual([M.id]);
      const lanceG = await http().post(`/api/disputa/sessao/${s.body.id}/lance`).set(bearer(G.token)).send({ itemId: cota, valor: 500 });
      expect(lanceG.status).toBe(400);
      expect(lanceG.body.message).toMatch(/COTA RESERVADA/);
    });
  });

  // --------------------------------------------------------------------------
  describe('D. lote: empate ficto no valor global do lote', () => {
    test('ME no intervalo do lote convocada; oferta inferior ao global vira a 1ª (lance do lote com rateio)', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Lote ME/EPP E3' });
      const G = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const M = await criarFornecedor(ctx, { porte: 'ME' });
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
        (await enviarProposta(ctx, G, lic, [950, 45])).id, // 3800 + 450 = 4250
        (await enviarProposta(ctx, M, lic, [980, 48])).id, // 3920 + 480 = 4400 (3,5% acima)
      ];
      await abrirSessaoAgora(ctx, lic);
      expect((await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({})).status).toBe(200);
      for (const id of propostas) expect((await http().put(`/api/propostas/${id}/classificar`).set(bearer(orgao.token))).status).toBe(200);
      const s = await http().post(`/api/sessao/${lic.id}`).set(bearer(orgao.token)).send({ pregoeiroId: orgao.id, pregoeiroNome: 'Pregoeiro Lote' });
      expect(s.status).toBe(201);
      const sessaoId = s.body.id;
      expect((await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token))).status).toBe(200);
      expect((await http().post(`/api/disputa/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [lote.body.id] })).status).toBe(201);
      await encerrar(orgao, sessaoId, lote.body.id);

      expect(await etapa(sessaoId)).toBe(EtapaSessao.BENEFICIO_MPE);
      const painel = await meEpp(sessaoId, orgao.token);
      const u = painel.unidades.find((x: any) => x.id === lote.body.id);
      expect(u).toMatchObject({ tipo: 'LOTE' });
      expect(u.desempate).toMatchObject({ status: 'EM_CURSO', melhor: { fornecedorId: G.id, valor: 4250 } });
      expect(u.convocacaoAtual.fornecedorId).toBe(M.id);
      expect((await convocarAceitacao(ctx, sessaoId, lote.body.id, orgao.token)).status).toBe(409);

      const conv = (await meEpp(sessaoId, M.token)).convocacoes[0];
      expect(conv).toMatchObject({ tipoUnidade: 'LOTE', valorACobrir: 4250 });
      expect((await exercer(sessaoId, conv.id, G.token, 4000)).status).toBe(404);
      const ok = await exercer(sessaoId, conv.id, M.token, 4249);
      expect(ok.status).toBe(201);
      const [l] = await q(
        `SELECT id, origem, fornecedor_id, valor FROM lances WHERE lote_id = $1 AND item_id IS NULL AND cancelado = false ORDER BY valor ASC LIMIT 1`,
        [lote.body.id],
      );
      expect(l).toMatchObject({ origem: 'DESEMPATE_MPE', fornecedor_id: M.id });
      const rateio = await q(`SELECT valor_total FROM lances WHERE lance_lote_id = $1`, [l.id]);
      expect(Math.round(rateio.reduce((s: number, r: any) => s + Number(r.valor_total), 0) * 100) / 100).toBe(4249);
      expect(await etapa(sessaoId)).toBe(EtapaSessao.ACEITACAO_PROPOSTA);
      const c = await convocarAceitacao(ctx, sessaoId, lote.body.id, orgao.token);
      expect(c.status).toBe(201);
      expect(c.body).toMatchObject({ fornecedorId: M.id, tipoUnidade: 'LOTE' });
      expect(c.body.limites.valorFinalTotal).toBe(4249);
    });
  });
  // --------------------------------------------------------------------------
  describe('E. suspensão PAUSA o prazo do desempate (devido processo)', () => {
    test('suspensa: não expira nem aceita resposta; retomada: o restante volta a correr e a ME exerce', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Suspensão ME/EPP' });
      const G = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const M = await criarFornecedor(ctx, { porte: 'ME' });
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: G, valores: [900] },
          { fornecedor: M, valores: [930] },
        ],
        { itens: [{ descricao: 'Item suspensão', quantidade: 1, valor_unitario_estimado: 1000 }] },
      );
      const item = p.lic.itens[0].id;
      await encerrar(orgao, p.sessaoId, item);
      const conv = (await meEpp(p.sessaoId, M.token)).convocacoes[0];
      expect(conv).toMatchObject({ status: 'AGUARDANDO', prazoPausado: false });

      const s = await http()
        .post(`/api/disputa/sessao/${p.sessaoId}/suspender`)
        .set(bearer(orgao.token))
        .send({ motivo: 'ADMINISTRATIVO', justificativa: 'Diligência sobre as propostas' });
      expect(s.status).toBe(201);
      // simula 10 min de suspensão iniciada logo após a convocação (tudo recuado 10 min — relógio do banco
      // para os marcos, relógio do app para o prazo nominal): o prazo NOMINAL (5 min) já passou
      await q(`UPDATE eventos_sessao SET created_at = created_at - interval '10 minutes' WHERE sessao_id = $1 AND tipo::text = 'SESSAO_SUSPENSA'`, [p.sessaoId]);
      await q(
        `UPDATE convocacoes_desempate_mpe
            SET created_at = created_at - interval '10 minutes', convocada_em = $2, prazo_ate = $3 WHERE id = $1`,
        [conv.id, new Date(Date.now() - 10 * 60_000), new Date(Date.now() - 5 * 60_000)],
      );
      // leitura (e o cron) processa os prazos: suspensa, a convocação NÃO expira
      const painel = await meEpp(p.sessaoId, orgao.token);
      const atual = painel.unidades.find((u: any) => u.id === item).convocacaoAtual;
      expect(atual).toMatchObject({ status: 'AGUARDANDO', prazoPausado: true });
      expect(atual.segundosRestantes).toBeGreaterThan(280);
      expect(atual.segundosRestantes).toBeLessThanOrEqual(300);
      const minha = (await meEpp(p.sessaoId, M.token)).convocacoes[0];
      expect(minha).toMatchObject({ prazoPausado: true, podeResponder: false });
      const durante = await exercer(p.sessaoId, conv.id, M.token, 899);
      expect(durante.status).toBe(409);
      expect(durante.body.message).toMatch(/suspensa.*PAUSADO/);
      expect((await declinar(p.sessaoId, conv.id, M.token)).status).toBe(409);

      expect((await http().post(`/api/disputa/sessao/${p.sessaoId}/retomar`).set(bearer(orgao.token)).send({})).status).toBe(201);
      const depois = (await meEpp(p.sessaoId, M.token)).convocacoes[0];
      expect(depois).toMatchObject({ status: 'AGUARDANDO', prazoPausado: false, podeResponder: true });
      expect(depois.segundosRestantes).toBeGreaterThan(280);
      expect(new Date(depois.prazoAte).getTime()).toBeGreaterThan(Date.now() + 280_000);
      const ok = await exercer(p.sessaoId, conv.id, M.token, 899);
      expect(ok.status).toBe(201);
      expect(ok.body.status).toBe('EXERCIDA');
    });
  });

  // --------------------------------------------------------------------------
  describe('F. PUBLICAR × art. 48 I (LC 123/2006)', () => {
    const publicar = (orgao: OrgaoFixture, licId: string, extra: Record<string, unknown> = {}) => {
      const { justificativa_nao_exclusividade_mpe: _j, ...datas } = datasEditalPadrao();
      return http().put(`/api/licitacoes/${licId}/publicar-edital`).set(bearer(orgao.token)).send({ ...datas, ...extra });
    };

    test('exclusivo acima de R$ 80.000 BLOQUEIA a publicação, listando o item', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Art. 48 bloqueio' });
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: ModoDisputa.ABERTO,
        itens: [
          { descricao: 'Veículo', quantidade: 1, valor_unitario_estimado: 90000, tipo_participacao: TipoParticipacao.EXCLUSIVO_MPE },
          { descricao: 'Papel', quantidade: 10, valor_unitario_estimado: 30, tipo_participacao: TipoParticipacao.EXCLUSIVO_MPE },
        ],
        extras: { modo_beneficio_mpe: 'POR_ITEM' },
      });
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const r = await publicar(orgao, lic.id, { justificativa_nao_exclusividade_mpe: JUSTIFICATIVA_ART49_E2E });
      expect(r.status).toBe(400);
      const pend = (r.body.pendencias ?? []).join(' | ');
      expect(pend).toMatch(/EXCLUSIVA de ME\/EPP só é admitida.*Item 1 \(R\$ 90\.000,00\)/);
      expect(pend).not.toMatch(/Item 2/);
      // conferência do cockpit mostra o mesmo bloqueio
      const conf = (await http().get(`/api/julgamento/licitacao/${lic.id}/me-epp/conferencia`).set(bearer(orgao.token)).expect(200)).body;
      expect(conf.bloqueiosPublicacao.join(' ')).toMatch(/Item 1/);
      // retirado o exclusivo do item 1 (vira ampla) → publica, com a justificativa do art. 49? (item 1 > 80k: não exige)
      await q(`UPDATE itens_licitacao SET tipo_participacao = 'AMPLA' WHERE id = $1`, [lic.itens[0].id]);
      expect((await publicar(orgao, lic.id)).status).toBe(200);
    });

    test('itens até R$ 80.000 sem exclusividade: publicar exige a justificativa do art. 49, registrada na transição', async () => {
      const orgao = await criarOrgao(ctx, { nome: 'Prefeitura Art. 49' });
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: ModoDisputa.ABERTO,
        itens: [{ descricao: 'Cadeira', quantidade: 10, valor_unitario_estimado: 100 }],
      });
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const sem = await publicar(orgao, lic.id);
      expect(sem.status).toBe(400);
      expect((sem.body.pendencias ?? []).join(' ')).toMatch(/sem participação exclusiva de ME\/EPP.*Item 1.*art\. 49/);
      expect((await publicar(orgao, lic.id, { justificativa_nao_exclusividade_mpe: 'curta' })).status).toBe(400);
      const texto = 'Art. 49, II: não há 3 fornecedores ME/EPP competitivos sediados na região.';
      const ok = await publicar(orgao, lic.id, { justificativa_nao_exclusividade_mpe: texto });
      expect(ok.status).toBe(200);
      const [t] = await q(`SELECT dados FROM licitacao_transicoes WHERE licitacao_id = $1 AND ato = 'PUBLICAR' ORDER BY created_at DESC LIMIT 1`, [lic.id]);
      expect(JSON.stringify(t.dados)).toContain(texto);
      const [l] = await q(`SELECT justificativa_nao_exclusividade_mpe FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.justificativa_nao_exclusividade_mpe).toBe(texto);
    });
  });
});
