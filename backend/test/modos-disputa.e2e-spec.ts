/**
 * ============================================================================
 * E2.4 — MODOS DE DISPUTA como estratégias do motor único (contra o banco real)
 * ============================================================================
 *
 * Lei 14.133/2021 art. 56; IN SEGES/ME 73/2022 arts. 23–25 e 27.
 *
 *  A. Modo × critério (art. 56 §§1º-2º): criação, edição, início da sessão.
 *  B. ABERTO_FECHADO (art. 24): etapa aberta fixa → aviso de fechamento
 *     iminente → tempo aleatório SIGILOSO (lances continuam) → etapa fechada
 *     só para a melhor + até 10% (mín. 3) → UM lance final fechado, sigiloso
 *     até o fim do prazo (nem o pregoeiro vê o valor) → ranking final.
 *  C. FECHADO_ABERTO (art. 25): classificação automática; não classificado
 *     não dá lance mas fica no ranking.
 *  D. FECHADO: sem lances; ranking pelas propostas.
 *  E. Reinício para as demais colocações (art. 56 §4º, ≥ 5%).
 *  F. Desconexão do agente > 10 min (IN 73 art. 27): suspende; retomada só
 *     24 h após a comunicação.
 *
 * Robôs: `SalaModos` (test/support/simulador-disputa.ts) — um socket e um
 * token por fornecedor, registrando tudo o que recebem.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  abrirSessaoAgora,
  enviarProposta,
  levarAteFase,
  fecharSockets,
} from './support';
import { pararTodosOsCrons, tiqueRelogioDisputa, entrarNaSala } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { julgamentoTecnicoSimples } from './support/julgamento-tecnico';
import { SalaModos } from './support/simulador-disputa';
import { CriterioJulgamento, FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';
import { DesconexaoPregoeiroService } from '../src/disputa-v2/desconexao-pregoeiro.service';
import { ItemLicitacao } from '../src/itens/entities/item-licitacao.entity';
import { DisputaService } from '../src/disputa-v2/disputa.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const UM = [{ descricao: 'Item modos E2.4', quantidade: 1, valor_unitario_estimado: 200 }];
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('E2.4 — modos de disputa', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  const F: FornecedorFixture[] = [];
  const http = () => ctx.http();

  const board = (sessaoId: string, token: string) =>
    http().get(`/api/disputa-v3/sessao/${sessaoId}/board`).set(bearer(token));
  const itemDoBoard = (b: any, itemId: string) =>
    [...b.colunas.aguardando, ...b.colunas.emDisputa, ...b.colunas.encerrados].find((i: any) => i.id === itemId);
  /** Ranking do motor (identidades reais — as rotas anonimizam conforme a visão). */
  const ranking = (itemId: string) => ctx.app.get(DisputaService, { strict: false }).rankingDoItem(itemId);
  const lanceRest = (sessaoId: string, f: FornecedorFixture, itemId: string, valor: number) =>
    http().post(`/api/disputa-v2/sessao/${sessaoId}/lance`).set(bearer(f.token)).send({ itemId, valor });

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura dos Modos de Disputa' });
    for (let i = 0; i < 5; i++) F.push(await criarFornecedor(ctx, { porte: i === 1 ? 'ME' : 'DEMAIS' }));
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('A. modo × critério (Lei 14.133 art. 56 §§1º e 2º)', () => {
    test('criação: FECHADO + menor preço → 400 (§1º); ABERTO + técnica e preço → 400 (§2º)', async () => {
      const base = {
        numero_processo: `MODO-${Date.now()}`,
        orgao_id: orgao.id,
        objeto: 'Teste de vedação de modo',
        modalidade: ModalidadeLicitacao.PREGAO_ELETRONICO,
        tipo_contratacao: 'COMPRA',
        valor_total_estimado: 100,
      };
      const r1 = await http()
        .post('/api/licitacoes')
        .set(bearer(orgao.token))
        .send({ ...base, criterio_julgamento: 'MENOR_PRECO', modo_disputa: 'FECHADO' });
      expect(r1.status).toBe(400);
      expect(r1.body.message).toMatch(/art\. 56 §1º/);
      const r2 = await http()
        .post('/api/licitacoes')
        .set(bearer(orgao.token))
        .send({ ...base, numero_processo: `${base.numero_processo}-2`, criterio_julgamento: 'TECNICA_E_PRECO', modo_disputa: 'ABERTO' });
      expect(r2.status).toBe(400);
      expect(r2.body.message).toMatch(/art\. 56 §2º/);
      const r3 = await http()
        .post('/api/licitacoes')
        .set(bearer(orgao.token))
        .send({ ...base, numero_processo: `${base.numero_processo}-3`, criterio_julgamento: 'MAIOR_DESCONTO', modo_disputa: 'FECHADO' });
      expect(r3.status).toBe(400);
    });

    test('edição: trocar para FECHADO com menor preço → 400; a consulta pública devolve a regra', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, { itens: UM });
      const r = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(orgao.token)).send({ modo_disputa: 'FECHADO' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/§1º/);
      const ok = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(orgao.token)).send({ modo_disputa: 'ABERTO_FECHADO' });
      expect(ok.status).toBe(200);
      const v = await http().get('/api/disputa-v2/modos/validar?modo=ABERTO&criterio=TECNICA_E_PRECO');
      expect(v.body).toEqual({ valido: false, motivo: expect.stringMatching(/§2º/) });
    });

    test('início da sessão e dos itens: combinação vedada gravada por fora → 400', async () => {
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F[0], valores: [100] },
          { fornecedor: F[1], valores: [110] },
        ],
        { itens: UM, iniciarSessao: false },
      );
      await ctx.dataSource.query(`UPDATE licitacoes SET modo_disputa = 'FECHADO' WHERE id = $1`, [p.lic.id]);
      const ini = await http().put(`/api/sessao/${p.sessaoId}/iniciar`).set(bearer(orgao.token));
      expect(ini.status).toBe(400);
      expect(ini.body.message).toMatch(/art\. 56 §1º/);
    });
  });

  // --------------------------------------------------------------------------
  describe('B. ABERTO_FECHADO (IN 73 art. 24)', () => {
    let sessaoId: string;
    let itemId: string;
    let sala: SalaModos;
    let t0: number;

    beforeAll(async () => {
      // Propostas: F0 100 · F1 104 · F2 108 · F3 115 · F4 130
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [100, 104, 108, 115, 130].map((v, i) => ({ fornecedor: F[i], valores: [v] })),
        { itens: UM, extras: { modo_disputa: ModoDisputa.ABERTO_FECHADO } },
      );
      sessaoId = p.sessaoId;
      itemId = p.lic.itens[0].id;
      sala = new SalaModos(ctx, sessaoId);
      await sala.conectarPregoeiro(orgao);
      for (let i = 0; i < 5; i++) await sala.conectarRobo(`F${i}`, F[i]);
    });
    afterAll(() => sala?.fechar());

    test('etapa aberta: fase ABERTA, duração fixa de 15 min (sem prorrogação)', async () => {
      const [est] = await ctx.dataSource.query(`SELECT modo, fase FROM disputa_estado_modo_item WHERE item_id = $1`, [itemId]);
      expect(est).toEqual({ modo: 'ABERTO_FECHADO', fase: 'ABERTA' });
      expect((await sala.lance('F1', itemId, 99)).ok).toBe(true);
      const b = await board(sessaoId, F[1].token);
      const it = itemDoBoard(b.body, itemId);
      expect(it.faseModo).toBe('ABERTA');
      expect(it.cronometro.fase).toBe('ETAPA_ABERTA');
      expect(it.cronometro.tempoRestanteSegundos).toBeGreaterThan(14 * 60 - 30);
      expect(it.cronometro.tempoRestanteSegundos).toBeLessThanOrEqual(15 * 60);
      expect(b.body.contexto.modo).toBe('ABERTO_FECHADO');
      expect(b.body.contexto.cronometria.observacao).not.toMatch(/V2/);
    });

    test('pregoeiro NÃO encerra o item manualmente no aberto-fechado (encerramento automático)', async () => {
      const r = await http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${itemId}`).set(bearer(orgao.token));
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/art\. 24/);
    });

    test('fim da etapa aberta → aviso de fechamento iminente + tempo aleatório SIGILOSO (≤ 10 min)', async () => {
      await sala.expirarFase(itemId);
      await dormir(300);
      const [it] = await ctx.dataSource.query(
        `SELECT status_disputa::text AS st, tempo_aleatorio_sorteado FROM itens_licitacao WHERE id = $1`,
        [itemId],
      );
      expect(it.st).toBe('TEMPO_ALEATORIO');
      // A duração sorteada NÃO fica na tabela de itens (as rotas de item a exporiam)
      expect(it.tempo_aleatorio_sorteado).toBeNull();
      const [est] = await ctx.dataSource.query(
        `SELECT fase, aleatorio_sorteado_segundos AS s FROM disputa_estado_modo_item WHERE item_id = $1`,
        [itemId],
      );
      expect(est.fase).toBe('ALEATORIO');
      expect(Number(est.s)).toBeGreaterThan(0);
      expect(Number(est.s)).toBeLessThanOrEqual(600);
      for (const r of sala.robos.values()) expect(r.eventos.some((e) => e.evento === 'fechamento_iminente')).toBe(true);
      const msgs = await http().get(`/api/disputa-v2/sessao/${sessaoId}/mensagens`).set(bearer(F[0].token));
      expect(JSON.stringify(msgs.body)).toMatch(/FECHAMENTO IMINENTE/);

      // Ninguém recebe o restante: board e tique trazem 0 e 'oculto'
      for (const token of [F[0].token, orgao.token]) {
        const b = itemDoBoard((await board(sessaoId, token)).body, itemId);
        expect(b.cronometro).toEqual({ tempoRestanteSegundos: 0, fase: 'TEMPO_ALEATORIO', oculto: true });
      }
      const desde = Date.now();
      await tiqueRelogioDisputa(ctx);
      await dormir(200);
      const tempos = sala.robos.get('F0')!.eventos.filter((e) => e.evento === 'tempo_atualizado' && e.recebidoEm >= desde);
      expect(tempos.length).toBeGreaterThan(0);
      const doItem = tempos.at(-1)!.payload.itens.find((i: any) => i.id === itemId);
      expect(doItem).toMatchObject({ tempoRestante: 0, oculto: true, fase: 'TEMPO_ALEATORIO' });
      expect(JSON.stringify(tempos.map((t) => t.payload))).not.toContain(`"tempoRestante":${est.s}`);
    });

    test('lances abertos continuam no tempo aleatório (art. 24 §1º)', async () => {
      expect((await sala.lance('F0', itemId, 98)).ok).toBe(true);
    });

    test('fim do aleatório → etapa fechada: melhor (98) + até 10% (≤ 107,80) = 2 → completa até 3 (F2 108); F3/F4 fora', async () => {
      t0 = Date.now();
      await sala.expirarFase(itemId);
      await dormir(300);
      const [est] = await ctx.dataSource.query(
        `SELECT fase, participantes, faixa_percentual, fase_termina_em FROM disputa_estado_modo_item WHERE item_id = $1`,
        [itemId],
      );
      expect(est.fase).toBe('FECHADA');
      expect(new Set(est.participantes)).toEqual(new Set([F[0].id, F[1].id, F[2].id]));
      expect(Number(est.faixa_percentual)).toBe(10);
      const restante = new Date(est.fase_termina_em).getTime() - Date.now();
      expect(restante).toBeGreaterThan(4 * 60_000);
      expect(restante).toBeLessThanOrEqual(5 * 60_000 + 5_000);
      for (const r of sala.robos.values()) expect(r.eventos.some((e) => e.evento === 'etapa_fechada_iniciada')).toBe(true);

      const b3 = itemDoBoard((await board(sessaoId, F[3].token)).body, itemId);
      expect(b3.faseModo).toBe('FECHADA');
      expect(b3.cronometro.fase).toBe('LANCE_FECHADO');
      expect(b3.possoDarLance).toBe(false);
      expect(itemDoBoard((await board(sessaoId, F[2].token)).body, itemId).possoDarLance).toBe(true);
    });

    test('não classificado não envia lance final fechado', async () => {
      const r = await sala.lance('F3', itemId, 90);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/convocados para o lance final fechado/);
      const rest = await sala.lanceFechadoRest('F4', itemId, 90);
      expect(rest.status).toBe(409);
    });

    test('lance fechado: um só por licitante, melhor que o próprio último; quem não envia mantém o aberto', async () => {
      const r1 = await sala.lanceFechadoRest('F2', itemId, 97.37);
      expect(r1.status).toBe(201);
      expect(r1.body.origem).toBe('LANCE_FECHADO');
      const r2 = await sala.lanceFechadoRest('F2', itemId, 96);
      expect(r2.status).toBe(409);
      expect(r2.body.message).toMatch(/único/);
      // pelo socket comum: o motor registra como LANCE_FECHADO
      expect((await sala.lance('F1', itemId, 96.53)).ok).toBe(true);
      // F0 (98) tenta "piorar" → recusado; mantém o 98
      const r3 = await sala.lanceFechadoRest('F0', itemId, 98.5);
      expect(r3.status).toBe(400);
      expect(r3.body.message).toMatch(/MENOR que o seu último valor/);
      const [{ n }] = await ctx.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM lances WHERE item_id = $1 AND origem = 'LANCE_FECHADO' AND cancelado = false`,
        [itemId],
      );
      expect(n).toBe(2);
    });

    test('SIGILO: valores fechados não chegam a ninguém antes do fim — nem ao pregoeiro (só a contagem)', async () => {
      await dormir(300);
      expect(sala.quemRecebeu('97.37', t0).filter((q) => q !== 'F2')).toEqual([]);
      expect(sala.quemRecebeu('96.53', t0).filter((q) => q !== 'F1')).toEqual([]);
      const contagens = sala.pregoeiro!.eventos.filter((e) => e.evento === 'lance_fechado_recebido');
      expect(contagens.at(-1)!.payload).toEqual({ itemId, total: 2 });

      // Leituras REST: órgão, fornecedor e público
      for (const token of [orgao.token, F[0].token, F[3].token]) {
        const lances = await http().get(`/api/disputa-v2/item/${itemId}/lances`).set(bearer(token));
        expect(JSON.stringify(lances.body)).not.toMatch(/97\.37|96\.53/);
        const melhores = await http().get(`/api/disputa-v2/item/${itemId}/melhores`).set(bearer(token));
        expect(JSON.stringify(melhores.body)).not.toMatch(/97\.37|96\.53/);
        const b = await board(sessaoId, token);
        expect(JSON.stringify(b.body).replace(/"meuLanceFechado":9[67]\.[35]7/, '')).not.toMatch(/97\.37|96\.53/);
      }
      const bo = itemDoBoard((await board(sessaoId, orgao.token)).body, itemId);
      expect(bo.lancesFechadosRecebidos).toBe(2);
      expect(bo.melhorLance.valor).toBe(98);
      expect(itemDoBoard((await board(sessaoId, F[2].token)).body, itemId).meuLanceFechado).toBe(97.37);
      expect(itemDoBoard((await board(sessaoId, F[0].token)).body, itemId).meuLanceFechado).toBeNull();
      // Trilha de eventos e coluna do item também não guardam o valor
      const ev = await ctx.dataSource.query(
        `SELECT valor, descricao FROM eventos_sessao WHERE sessao_id = $1 AND descricao LIKE 'Lance final fechado%'`,
        [sessaoId],
      );
      expect(ev).toHaveLength(2);
      for (const e of ev) expect(e.valor).toBeNull();
      const [it] = await ctx.dataSource.query(`SELECT melhor_lance_valor FROM itens_licitacao WHERE id = $1`, [itemId]);
      expect(Number(it.melhor_lance_valor)).toBe(98);
    });

    test('fim do prazo → encerra; ranking final pelo melhor de cada um (aberto + fechado); valores revelados', async () => {
      await sala.expirarFase(itemId);
      await dormir(300);
      const [it] = await ctx.dataSource.query(`SELECT status_disputa::text AS st, melhor_lance_valor FROM itens_licitacao WHERE id = $1`, [itemId]);
      expect(it.st).toBe('ENCERRADO');
      expect(Number(it.melhor_lance_valor)).toBe(96.53);
      const r = await ranking(itemId);
      expect(r.map((l) => [l.fornecedorId, l.melhorValor])).toEqual([
        [F[1].id, 96.53],
        [F[2].id, 97.37],
        [F[0].id, 98],
        [F[3].id, 115],
        [F[4].id, 130],
      ]);
      const lances = await http().get(`/api/disputa-v2/item/${itemId}/lances`).set(bearer(orgao.token));
      expect(JSON.stringify(lances.body)).toMatch(/97\.37/);
    });
  });

  // --------------------------------------------------------------------------
  describe('C. FECHADO_ABERTO (IN 73 art. 25)', () => {
    let sessaoId: string;
    let itemId: string;

    beforeAll(async () => {
      // 100 · 105 · 112 · 125 · 140 → faixa ≤ 110: 2 → completa com 112
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [100, 105, 112, 125, 140].map((v, i) => ({ fornecedor: F[i], valores: [v] })),
        { itens: UM, extras: { modo_disputa: ModoDisputa.FECHADO_ABERTO } },
      );
      sessaoId = p.sessaoId;
      itemId = p.lic.itens[0].id;
    });

    test('classificação automática: melhor + até 10% (mín. 3) vão para a etapa aberta', async () => {
      const [est] = await ctx.dataSource.query(`SELECT fase, participantes FROM disputa_estado_modo_item WHERE item_id = $1`, [itemId]);
      expect(est.fase).toBe('ABERTA');
      expect(est.participantes).toEqual([F[0].id, F[1].id, F[2].id]);
      const b = itemDoBoard((await board(sessaoId, F[3].token)).body, itemId);
      expect(b.participacaoRestrita).toBe(true);
      expect(b.classificadosFase).toBe(3);
      expect(b.possoDarLance).toBe(false);
    });

    test('não classificado não dá lance; classificado segue o art. 23', async () => {
      const r = await lanceRest(sessaoId, F[3], itemId, 99);
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/não foi classificada para a etapa de lances/);
      expect((await lanceRest(sessaoId, F[2], itemId, 99)).status).toBe(201);
      const b = itemDoBoard((await board(sessaoId, F[2].token)).body, itemId);
      expect(b.cronometro.fase).toBe('ETAPA_ABERTA');
      expect(b.cronometro.tempoRestanteSegundos).toBeGreaterThan(9 * 60 - 30);
    });

    test('encerrado pelo relógio: os não classificados continuam no ranking pela proposta', async () => {
      const s = new SalaModos(ctx, sessaoId);
      await s.expirarFase(itemId);
      const r = await ranking(itemId);
      expect(r.map((l) => l.melhorValor)).toEqual([99, 100, 105, 125, 140]);
      expect(r[3].fornecedorId).toBe(F[3].id);
    });
  });

  // --------------------------------------------------------------------------
  describe('D. FECHADO (Lei 14.133 art. 56 I)', () => {
    test('sem lances: o item encerra na abertura com o ranking das propostas', async () => {
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [120, 100, 110].map((v, i) => ({ fornecedor: F[i], valores: [v] })),
        {
          itens: UM,
          iniciarItens: false,
          extras: { modo_disputa: ModoDisputa.FECHADO, criterio_julgamento: CriterioJulgamento.MELHOR_TECNICA },
        },
      );
      const itemId = p.lic.itens[0].id;
      // Melhor técnica: a etapa de preços só abre com as notas técnicas publicadas (Lei 14.133 art. 36 §2º / 37)
      const antes = await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [itemId] });
      expect(antes.status).toBe(409);
      await julgamentoTecnicoSimples(ctx, orgao, p.lic.id, { [F[0].id]: 80, [F[1].id]: 70, [F[2].id]: 90 });
      await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [itemId] }).expect(201);
      const [it] = await ctx.dataSource.query(`SELECT status_disputa::text AS st FROM itens_licitacao WHERE id = $1`, [itemId]);
      expect(it.st).toBe('ENCERRADO');
      const r = await lanceRest(p.sessaoId, F[0], itemId, 90);
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/modo de disputa fechado/);
      const [{ n }] = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE item_id = $1 AND origem <> 'PROPOSTA'`, [itemId]);
      expect(n).toBe(0);
      expect((await ranking(itemId)).map((l) => [l.fornecedorId, l.melhorValor])).toEqual([
        [F[1].id, 100],
        [F[2].id, 110],
        [F[0].id, 120],
      ]);
    });
  });

  // --------------------------------------------------------------------------
  describe('E. reinício para as demais colocações (Lei 14.133 art. 56 §4º)', () => {
    test('diferença < 5% entre 1º e 2º → reinício não admitido', async () => {
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [100, 103].map((v, i) => ({ fornecedor: F[i], valores: [v] })),
        { itens: UM },
      );
      const itemId = p.lic.itens[0].id;
      await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/encerrar-item/${itemId}`).set(bearer(orgao.token)).expect(201);
      const r = await http()
        .post(`/api/disputa-v2/sessao/${p.sessaoId}/item/${itemId}/reiniciar-demais`)
        .set(bearer(orgao.token))
        .send({ justificativa: 'teste' });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/menor que o percentual/);
    });

    test('≥ 5%: reabre só para as demais; ninguém alcança o 1º; ranking das demais redefinido', async () => {
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [100, 110, 115].map((v, i) => ({ fornecedor: F[i], valores: [v] })),
        { itens: UM },
      );
      const { sessaoId } = p;
      const itemId = p.lic.itens[0].id;
      await http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${itemId}`).set(bearer(orgao.token)).expect(201);

      const semJust = await http().post(`/api/disputa-v2/sessao/${sessaoId}/item/${itemId}/reiniciar-demais`).set(bearer(orgao.token)).send({});
      expect(semJust.status).toBe(400);
      const fornecedorNao = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/item/${itemId}/reiniciar-demais`)
        .set(bearer(F[1].token))
        .send({ justificativa: 'x' });
      expect(fornecedorNao.status).toBe(403);

      const r = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/item/${itemId}/reiniciar-demais`)
        .set(bearer(orgao.token))
        .send({ justificativa: 'Diferença de 10% para a 2ª colocação — definir as demais colocações' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ success: true, participantes: 2, diferencaPercentual: 10 });

      const [st] = await ctx.dataSource.query(`SELECT status::text AS s FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
      expect(st.s).toBe('MODO_ABERTO');
      const b = itemDoBoard((await board(sessaoId, F[2].token)).body, itemId);
      expect(b.faseModo).toBe('REINICIO_DEMAIS');
      expect(b.valorPrimeiraColocacao).toBe(100);

      const primeiro = await lanceRest(sessaoId, F[0], itemId, 95);
      expect(primeiro.status).toBe(409);
      expect(primeiro.body.message).toMatch(/demais colocações/);
      const alcanca = await lanceRest(sessaoId, F[1], itemId, 99);
      expect(alcanca.status).toBe(400);
      expect(alcanca.body.message).toMatch(/1ª colocação/);
      expect((await lanceRest(sessaoId, F[1], itemId, 105)).status).toBe(201);
      expect((await lanceRest(sessaoId, F[2], itemId, 104)).status).toBe(201);

      const s = new SalaModos(ctx, sessaoId);
      await s.expirarFase(itemId);
      expect((await ranking(itemId)).map((l) => [l.fornecedorId, l.melhorValor])).toEqual([
        [F[0].id, 100],
        [F[2].id, 104],
        [F[1].id, 105],
      ]);
      const [st2] = await ctx.dataSource.query(`SELECT status::text AS s FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
      expect(st2.s).toBe('EM_ANDAMENTO');

      const denovo = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/item/${itemId}/reiniciar-demais`)
        .set(bearer(orgao.token))
        .send({ justificativa: 'de novo' });
      expect(denovo.status).toBe(409);
    });
  });

  // --------------------------------------------------------------------------
  describe('F. desconexão do agente de contratação (IN 73 art. 27)', () => {
    test('> 10 min desconectado na etapa de lances → suspende; retomada só 24 h após a comunicação', async () => {
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [100, 110].map((v, i) => ({ fornecedor: F[i], valores: [v] })),
        { itens: UM },
      );
      const { sessaoId } = p;
      const itemId = p.lic.itens[0].id;
      const svc = ctx.app.get(DesconexaoPregoeiroService, { strict: false });

      const pg = await entrarNaSala(ctx, sessaoId, { id: orgao.id, nome: 'Pregoeiro', tipo: 'PREGOEIRO', token: orgao.token });
      expect(svc.estado(sessaoId)).toMatchObject({ conectados: 1, desconectadoEm: null });
      pg.socket.disconnect();
      await dormir(400);
      expect(svc.estado(sessaoId)?.desconectadoEm).toBeInstanceOf(Date);

      // Até 10 min: lances continuam (art. 27 caput)
      expect(await svc.verificarDesconexoes(Date.now() + 9 * 60_000)).not.toContain(sessaoId);
      expect((await lanceRest(sessaoId, F[1], itemId, 99)).status).toBe(201);

      expect(await svc.verificarDesconexoes(Date.now() + 10 * 60_000 + 5_000)).toContain(sessaoId);
      const [s] = await ctx.dataSource.query(`SELECT status::text AS st, motivo_suspensao FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
      expect(s.st).toBe('SUSPENSA');
      expect(s.motivo_suspensao).toMatch(/DESCONEXAO_AGENTE/);
      expect((await lanceRest(sessaoId, F[0], itemId, 95)).status).toBe(409);

      // Sem comunicação → 409; comunicação com menos de 24 h → 400
      const sem = await http().post(`/api/disputa-v2/sessao/${sessaoId}/retomar`).set(bearer(orgao.token));
      expect(sem.status).toBe(409);
      expect(sem.body.message).toMatch(/comunique aos participantes/);
      const cedo = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/agendar-retomada`)
        .set(bearer(orgao.token))
        .send({ retomadaEm: new Date(Date.now() + 3_600_000).toISOString() });
      expect(cedo.status).toBe(400);
      const ag = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/agendar-retomada`)
        .set(bearer(orgao.token))
        .send({ retomadaEm: new Date(Date.now() + 25 * 3_600_000).toISOString() });
      expect(ag.status).toBe(201);
      const msgs = await http().get(`/api/disputa-v2/sessao/${sessaoId}/mensagens`).set(bearer(F[0].token));
      expect(JSON.stringify(msgs.body)).toMatch(/COMUNICADO: a sessão pública suspensa/);

      // Antes da data → 409
      const antes = await http().post(`/api/disputa-v2/sessao/${sessaoId}/retomar`).set(bearer(orgao.token));
      expect(antes.status).toBe(409);
      expect(antes.body.message).toMatch(/só pode ser reiniciada a partir de/);

      // Passadas as 24 h (comunicação e data deslocadas para o passado) → retoma e o relógio recomeça
      const [evAg] = await ctx.dataSource.query(
        `SELECT id, dados_adicionais FROM eventos_sessao WHERE sessao_id = $1 AND dados_adicionais->>'ato' = 'AGENDAMENTO_RETOMADA'`,
        [sessaoId],
      );
      await ctx.dataSource.query(`UPDATE eventos_sessao SET dados_adicionais = $2 WHERE id = $1`, [
        evAg.id,
        JSON.stringify({
          ...evAg.dados_adicionais,
          comunicado_em: new Date(Date.now() - 26 * 3_600_000).toISOString(),
          retomada_em: new Date(Date.now() - 3_600_000).toISOString(),
        }),
      ]);
      await ctx.dataSource.query(`UPDATE itens_licitacao SET disputa_iniciada_em = $2 WHERE id = $1`, [itemId, new Date(Date.now() - 86_400_000)]);
      const ok = await http().post(`/api/disputa-v2/sessao/${sessaoId}/retomar`).set(bearer(orgao.token));
      expect(ok.status).toBe(201);
      const [s2] = await ctx.dataSource.query(`SELECT status::text AS st FROM sessoes_disputa WHERE id = $1`, [sessaoId]);
      expect(s2.st).toBe('MODO_ABERTO');
      const it = await ctx.dataSource.getRepository(ItemLicitacao).findOneByOrFail({ id: itemId });
      expect(Math.abs(Date.now() - new Date(it.disputa_iniciada_em).getTime())).toBeLessThan(60_000);
    });
  });

  // --------------------------------------------------------------------------
  describe('G. modos na disputa por LOTE (unidade = lote; lance = valor global rateado)', () => {
    // Lote com 2 itens (1 un × R$ 100 cada). Cotação por item = metade do total do lote.
    const ITENS_LOTE = [
      { descricao: 'Item A do lote', quantidade: 1, valor_unitario_estimado: 100 },
      { descricao: 'Item B do lote', quantidade: 1, valor_unitario_estimado: 100 },
    ];

    /** Pregão por lote em disputa (1 lote com os 2 itens), no modo dado. */
    const pregaoPorLote = async (modo: ModoDisputa, totais: number[], criterio?: CriterioJulgamento) => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: modo,
        criterio,
        itens: ITENS_LOTE,
        extras: { base_lance: 'TOTAL_LOTE', usa_lotes: true },
      });
      const lote = await http().post('/api/lotes').set(bearer(orgao.token)).send({ numero: 1, descricao: 'Lote único', licitacao_id: lic.id });
      expect(lote.status).toBe(201);
      for (const it of lic.itens) {
        expect((await http().post(`/api/lotes/${lote.body.id}/itens/${it.id}`).set(bearer(orgao.token))).status).toBe(201);
      }
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const propostas: string[] = [];
      for (let i = 0; i < totais.length; i++) propostas.push((await enviarProposta(ctx, F[i], lic, [totais[i] / 2, totais[i] / 2])).id);
      await abrirSessaoAgora(ctx, lic);
      expect((await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({})).status).toBe(200);
      for (const id of propostas) expect((await http().put(`/api/propostas/${id}/classificar`).set(bearer(orgao.token))).status).toBe(200);
      const s = await http().post(`/api/sessao/${lic.id}`).set(bearer(orgao.token)).send({ pregoeiroId: orgao.id, pregoeiroNome: 'Pregoeiro Lote' });
      expect(s.status).toBe(201);
      const sessaoId: string = s.body.id;
      await http()
        .put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`)
        .set(bearer(orgao.token))
        .send({ tempo_inatividade_minutos: 10, tempo_prorrogacao_minutos: 2, intervalo_minimo_lances_minutos: 0 })
        .expect(200);
      expect((await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token))).status).toBe(200);
      // Critério técnico: etapa de preços só depois das notas técnicas publicadas (Lei 14.133 arts. 36 §2º/37)
      if (criterio === CriterioJulgamento.MELHOR_TECNICA || criterio === CriterioJulgamento.TECNICA_E_PRECO) {
        await julgamentoTecnicoSimples(ctx, orgao, lic.id, Object.fromEntries(totais.map((_, i) => [F[i].id, 80 + i])), {
          pesoTecnica: criterio === CriterioJulgamento.TECNICA_E_PRECO ? 70 : null,
        });
      }
      const ini = await http().post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [lote.body.id] });
      expect(ini.status).toBe(201);
      expect(ini.body).toMatchObject({ lotesIniciados: 1 });
      return { lic, sessaoId, loteId: lote.body.id as string };
    };
    const statusLote = async (loteId: string) =>
      (await ctx.dataSource.query(`SELECT status_disputa::text AS st FROM lotes_licitacao WHERE id = $1`, [loteId]))[0].st;
    const boardLote = async (sessaoId: string, token: string, loteId: string) => itemDoBoard((await board(sessaoId, token)).body, loteId);

    test('desconexão: retomada após 24 h reinicia o relógio do LOTE e dos itens do lote', async () => {
      const p = await pregaoPorLote(ModoDisputa.ABERTO, [200, 220]);
      const svc = ctx.app.get(DesconexaoPregoeiroService, { strict: false });
      const pg = await entrarNaSala(ctx, p.sessaoId, { id: orgao.id, nome: 'Pregoeiro', tipo: 'PREGOEIRO', token: orgao.token });
      pg.socket.disconnect();
      await dormir(400);
      expect(await svc.verificarDesconexoes(Date.now() + 10 * 60_000 + 5_000)).toContain(p.sessaoId);
      await http()
        .post(`/api/disputa-v2/sessao/${p.sessaoId}/agendar-retomada`)
        .set(bearer(orgao.token))
        .send({ retomadaEm: new Date(Date.now() + 25 * 3_600_000).toISOString() })
        .expect(201);
      const [evAg] = await ctx.dataSource.query(
        `SELECT id, dados_adicionais FROM eventos_sessao WHERE sessao_id = $1 AND dados_adicionais->>'ato' = 'AGENDAMENTO_RETOMADA'`,
        [p.sessaoId],
      );
      await ctx.dataSource.query(`UPDATE eventos_sessao SET dados_adicionais = $2 WHERE id = $1`, [
        evAg.id,
        JSON.stringify({
          ...evAg.dados_adicionais,
          comunicado_em: new Date(Date.now() - 26 * 3_600_000).toISOString(),
          retomada_em: new Date(Date.now() - 3_600_000).toISOString(),
        }),
      ]);
      const ontem = new Date(Date.now() - 86_400_000);
      await ctx.dataSource.query(`UPDATE lotes_licitacao SET disputa_iniciada_em = $2, ultimo_lance_em = $2 WHERE id = $1`, [p.loteId, ontem]);
      await ctx.dataSource.query(`UPDATE itens_licitacao SET disputa_iniciada_em = $2, ultimo_lance_em = $2 WHERE lote_id = $1`, [p.loteId, ontem]);
      expect((await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/retomar`).set(bearer(orgao.token))).status).toBe(201);
      const [lote] = await ctx.dataSource.query(`SELECT disputa_iniciada_em FROM lotes_licitacao WHERE id = $1`, [p.loteId]);
      expect(Math.abs(Date.now() - new Date(lote.disputa_iniciada_em).getTime())).toBeLessThan(60_000);
      const itens = await ctx.dataSource.query(`SELECT disputa_iniciada_em FROM itens_licitacao WHERE lote_id = $1`, [p.loteId]);
      for (const i of itens) expect(Math.abs(Date.now() - new Date(i.disputa_iniciada_em).getTime())).toBeLessThan(60_000);
    });

    test('suspensão comum: ao retomar, o relógio do lote é DESLOCADO pela pausa (não vence na retomada)', async () => {
      const p = await pregaoPorLote(ModoDisputa.ABERTO, [200, 220]);
      await http()
        .post(`/api/disputa-v2/sessao/${p.sessaoId}/suspender`)
        .set(bearer(orgao.token))
        .send({ motivo: 'ADMINISTRATIVO', justificativa: 'Pausa técnica' })
        .expect(201);
      // Simula 1 h de pausa: suspensão e relógio 1 h no passado
      const umaHora = new Date(Date.now() - 3_600_000);
      await ctx.dataSource.query(`UPDATE eventos_sessao SET created_at = $2 WHERE sessao_id = $1 AND tipo::text = 'SESSAO_SUSPENSA'`, [p.sessaoId, umaHora]);
      await ctx.dataSource.query(`UPDATE lotes_licitacao SET disputa_iniciada_em = $2, ultimo_lance_em = $2 WHERE id = $1`, [p.loteId, umaHora]);
      expect((await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/retomar`).set(bearer(orgao.token))).status).toBe(201);
      await tiqueRelogioDisputa(ctx);
      expect(await statusLote(p.loteId)).toBe('EM_DISPUTA');
      const b = await boardLote(p.sessaoId, orgao.token, p.loteId);
      expect(b.cronometro.tempoRestanteSegundos).toBeGreaterThan(9 * 60);
    });

    test('ABERTO_FECHADO no lote: aleatório oculto → lance final fechado (valor global rateado, sigiloso) → ranking final', async () => {
      // Lotes: F0 200 · F1 208 · F2 216 · F3 230 · F4 260
      const p = await pregaoPorLote(ModoDisputa.ABERTO_FECHADO, [200, 208, 216, 230, 260]);
      const sala = new SalaModos(ctx, p.sessaoId);
      await sala.conectarPregoeiro(orgao);
      for (let i = 0; i < 5; i++) await sala.conectarRobo(`F${i}`, F[i]);
      try {
        const [est] = await ctx.dataSource.query(`SELECT fase, tipo_unidade FROM disputa_estado_modo_item WHERE item_id = $1`, [p.loteId]);
        expect(est).toEqual({ fase: 'ABERTA', tipo_unidade: 'LOTE' });
        expect((await sala.lance('F1', p.loteId, 198)).ok).toBe(true);

        await sala.expirarFase(p.loteId); // → tempo aleatório
        expect(await statusLote(p.loteId)).toBe('TEMPO_ALEATORIO');
        const itensSt = await ctx.dataSource.query(`SELECT DISTINCT status_disputa::text AS s FROM itens_licitacao WHERE lote_id = $1`, [p.loteId]);
        expect(itensSt).toEqual([{ s: 'TEMPO_ALEATORIO' }]);
        expect((await boardLote(p.sessaoId, F[0].token, p.loteId)).cronometro).toEqual({ tempoRestanteSegundos: 0, fase: 'TEMPO_ALEATORIO', oculto: true });
        expect((await sala.lance('F0', p.loteId, 196)).ok).toBe(true);

        await sala.expirarFase(p.loteId); // → etapa fechada: 196 · 198 (≤ 215,60) → +F2 (216) pelo mínimo
        const [fechada] = await ctx.dataSource.query(`SELECT fase, participantes FROM disputa_estado_modo_item WHERE item_id = $1`, [p.loteId]);
        expect(fechada.fase).toBe('FECHADA');
        expect(new Set(fechada.participantes)).toEqual(new Set([F[0].id, F[1].id, F[2].id]));
        expect((await boardLote(p.sessaoId, F[3].token, p.loteId)).possoDarLance).toBe(false);
        expect((await sala.lanceFechadoRest('F3', p.loteId, 150)).status).toBe(409);

        const t0 = Date.now();
        const r = await sala.lanceFechadoRest('F2', p.loteId, 193.46);
        expect(r.status).toBe(201);
        expect(r.body.origem).toBe('LANCE_FECHADO');
        // rateio do lance fechado por item (soma = valor global) — também sigiloso
        const rateio = await ctx.dataSource.query(`SELECT valor_total FROM lances WHERE lance_lote_id = $1`, [r.body.id]);
        expect(rateio.reduce((s: number, x: any) => s + Number(x.valor_total), 0)).toBeCloseTo(193.46, 2);
        expect((await sala.lanceFechadoRest('F2', p.loteId, 190)).status).toBe(409);
        await dormir(300);
        expect(sala.quemRecebeu('193.46', t0).filter((q) => q !== 'F2')).toEqual([]);
        for (const token of [orgao.token, F[0].token]) {
          const l = await http().get(`/api/disputa-v2/item/${p.loteId}/lances`).set(bearer(token));
          expect(JSON.stringify(l.body)).not.toMatch(/193\.46|96\.73/);
          const mb = await http().get(`/api/disputa-v2/item/${p.loteId}/melhores`).set(bearer(token));
          expect(JSON.stringify(mb.body)).not.toMatch(/193\.46/);
          for (const it of p.lic.itens) {
            const li = await http().get(`/api/disputa-v2/item/${it.id}/lances`).set(bearer(token));
            expect(JSON.stringify(li.body)).not.toMatch(/193\.46|96\.73/);
          }
        }
        const bo = await boardLote(p.sessaoId, orgao.token, p.loteId);
        expect(bo.lancesFechadosRecebidos).toBe(1);
        expect(bo.melhorLance.valor).toBe(196);
        expect((await boardLote(p.sessaoId, F[2].token, p.loteId)).meuLanceFechado).toBe(193.46);
        const [lt] = await ctx.dataSource.query(`SELECT melhor_lance_valor FROM lotes_licitacao WHERE id = $1`, [p.loteId]);
        expect(Number(lt.melhor_lance_valor)).toBe(196);
        expect((await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/encerrar-item/${p.loteId}`).set(bearer(orgao.token))).status).toBe(409);

        await sala.expirarFase(p.loteId); // fim do prazo
        expect(await statusLote(p.loteId)).toBe('ENCERRADO');
        expect((await ranking(p.loteId)).map((l) => [l.fornecedorId, l.melhorValor])).toEqual([
          [F[2].id, 193.46],
          [F[0].id, 196],
          [F[1].id, 198],
          [F[3].id, 230],
          [F[4].id, 260],
        ]);
      } finally {
        sala.fechar();
      }
    });

    test('FECHADO_ABERTO no lote: classificação automática; não classificado fica fora dos lances e no ranking', async () => {
      // 200 · 210 · 224 · 250 · 280 → faixa ≤ 220: 2 → completa com 224
      const p = await pregaoPorLote(ModoDisputa.FECHADO_ABERTO, [200, 210, 224, 250, 280]);
      const [est] = await ctx.dataSource.query(`SELECT fase, participantes, tipo_unidade FROM disputa_estado_modo_item WHERE item_id = $1`, [p.loteId]);
      expect(est).toMatchObject({ fase: 'ABERTA', tipo_unidade: 'LOTE' });
      expect(est.participantes).toEqual([F[0].id, F[1].id, F[2].id]);
      const r = await lanceRest(p.sessaoId, F[3], p.loteId, 190);
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/não foi classificada/);
      expect((await lanceRest(p.sessaoId, F[2], p.loteId, 199)).status).toBe(201);
      await new SalaModos(ctx, p.sessaoId).expirarFase(p.loteId);
      expect(await statusLote(p.loteId)).toBe('ENCERRADO');
      expect((await ranking(p.loteId)).map((l) => l.melhorValor)).toEqual([199, 200, 210, 250, 280]);
    });

    test('FECHADO no lote: encerra na abertura, sem lances; ranking pelas propostas do lote', async () => {
      const p = await pregaoPorLote(ModoDisputa.FECHADO, [220, 200, 210], CriterioJulgamento.MELHOR_TECNICA);
      expect(await statusLote(p.loteId)).toBe('ENCERRADO');
      const r = await lanceRest(p.sessaoId, F[0], p.loteId, 150);
      expect(r.status).toBe(409);
      expect((await ranking(p.loteId)).map((l) => [l.fornecedorId, l.melhorValor])).toEqual([
        [F[1].id, 200],
        [F[2].id, 210],
        [F[0].id, 220],
      ]);
    });

    test('reinício para as demais colocações no lote (≥ 5%)', async () => {
      const p = await pregaoPorLote(ModoDisputa.ABERTO, [200, 220, 230]);
      await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/encerrar-item/${p.loteId}`).set(bearer(orgao.token)).expect(201);
      const r = await http()
        .post(`/api/disputa-v2/sessao/${p.sessaoId}/item/${p.loteId}/reiniciar-demais`)
        .set(bearer(orgao.token))
        .send({ justificativa: 'Definir as demais colocações do lote' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ participantes: 2, diferencaPercentual: 10 });
      expect(await statusLote(p.loteId)).toBe('EM_DISPUTA');
      expect((await lanceRest(p.sessaoId, F[0], p.loteId, 190)).status).toBe(409);
      expect((await lanceRest(p.sessaoId, F[1], p.loteId, 199)).status).toBe(400);
      expect((await lanceRest(p.sessaoId, F[2], p.loteId, 210)).status).toBe(201);
      await new SalaModos(ctx, p.sessaoId).expirarFase(p.loteId);
      expect((await ranking(p.loteId)).map((l) => [l.fornecedorId, l.melhorValor])).toEqual([
        [F[0].id, 200],
        [F[2].id, 210],
        [F[1].id, 220],
      ]);
    });
  });
});
