/**
 * ============================================================================
 * E2 item 5 — DISPUTA POR LOTE no motor único (disputa-v2), contra o banco real
 * ============================================================================
 *
 * Pregão aberto com base_lance TOTAL_LOTE: 2 lotes × 3 itens, 3 fornecedores.
 * F3 não cota o item 3 → não disputa o Lote 1 (cota o Lote 2 inteiro).
 *
 *  A. Lotes: rota /api/lotes (antes /api/api/lotes), só o órgão dono escreve,
 *     um item em no máximo um lote, benefício ME/EPP normalizado.
 *  B. Proposta → lance PROPOSTA do lote (soma dos totais) só para quem cotou
 *     todos os itens; rateio por item somando exatamente o valor do lote.
 *  C. Lances no lote: diferença mínima, lances iguais, 2 casas, rateio com
 *     resíduo no último item; isolamento (F3 no Lote 1, lance por item, REST).
 *  D. Sigilo na sala (código anônimo), prorrogação e encerramento pelo relógio
 *     único, encerramento pelo pregoeiro, ranking por lote.
 *  E. Exclusão do próprio lance de lote (art. 21 §3º) cancela o rateio junto.
 *  F. Habilitação → adjudicação → homologação: valor homologado de cada item
 *     = parcela rateada do lance vencedor do lote (soma = lance do lote).
 */
import { Socket } from 'socket.io-client';
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  fecharSockets,
  levarAteFase,
} from './support';
import { darLance, entrarNaSala, pararTodosOsCrons, tiqueRelogioDisputa } from './support/pregao';
import { FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';
import { ratearLanceLote } from '../src/disputa-v2/rateio-lote';
import {
  aceitarPropostaDaUnidade,
  convocarAceitacao,
  decidirAceitacao,
  enviarPropostaAdequada,
  valoresNoLimite,
} from './support/julgamento';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Lote 1: itens 1–3 · Lote 2: itens 4–6
const ITENS = [
  { descricao: 'Notebook', quantidade: 10, valor_unitario_estimado: 100 },
  { descricao: 'Mouse', quantidade: 3, valor_unitario_estimado: 50 },
  { descricao: 'Teclado', quantidade: 7, valor_unitario_estimado: 30 },
  { descricao: 'Arroz', quantidade: 1, valor_unitario_estimado: 500 },
  { descricao: 'Feijão', quantidade: 2, valor_unitario_estimado: 200 },
  { descricao: 'Óleo', quantidade: 5, valor_unitario_estimado: 40 },
];
// Unitários cotados (ordem dos itens). F3 não cota o item 3.
const COTACAO = {
  F1: [95, 48, 29, 480, 190, 38], // L1 = 950+144+203 = 1297     · L2 = 480+380+190 = 1050
  F2: [96, 47, 28.5, 470, 195, 39], // L1 = 960+141+199,50 = 1300,50 · L2 = 470+390+195 = 1055
  F3: [94, 45, undefined, 490, 180, 37], // L1 inelegível          · L2 = 490+360+185 = 1035
};

describe('E2 — disputa por LOTE no motor único', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outroOrgao: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  let lic: LicitacaoFixture;
  let lote1: string;
  let lote2: string;
  let sessaoId: string;
  let s1: Socket;
  let s2: Socket;
  let s3: Socket;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);
  const itens = () => lic.itens.map((i) => i.id);

  const sala = async (f: FornecedorFixture) => {
    const e = await entrarNaSala(ctx, sessaoId, { id: f.id, nome: f.razao_social, tipo: 'FORNECEDOR', token: f.token });
    expect(e.resposta.evento).toBe('dados_iniciais');
    return e.socket;
  };
  const board = async (token: string) =>
    (await http().get(`/api/disputa-v2/sessao/${sessaoId}/itens`).set(bearer(token)).expect(200)).body;
  const unidade = (b: any, id: string) => [...b.aguardando, ...b.emDisputa, ...b.encerrados].find((u: any) => u.id === id);
  const lancesAtivosDoLote = (loteId: string) =>
    q(
      `SELECT id, fornecedor_id, valor, valor_total, origem FROM lances
        WHERE lote_id = $1 AND item_id IS NULL AND cancelado = false ORDER BY valor, created_at`,
      [loteId],
    );

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura do Lote E2' });
    outroOrgao = await criarOrgao(ctx, { nome: 'Outra Prefeitura' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'ME' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
      modo_disputa: ModoDisputa.ABERTO,
      itens: ITENS,
      extras: { base_lance: 'TOTAL_LOTE', usa_lotes: true, diferenca_minima_lances: 1 },
    });
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('A. Lotes (rota, dono, item em um só lote, ME/EPP)', () => {
    test('rota corrigida: POST /api/lotes (a antiga /api/api/lotes não existe mais)', async () => {
      const antiga = await http()
        .post('/api/api/lotes')
        .set(bearer(orgao.token))
        .send({ numero: 1, descricao: 'Informática', licitacao_id: lic.id });
      expect(antiga.status).toBe(404);

      const r1 = await http()
        .post('/api/lotes')
        .set(bearer(orgao.token))
        .send({ numero: 1, descricao: 'Equipamentos de informática', licitacao_id: lic.id, exclusivo_mpe: true });
      expect(r1.status).toBe(201);
      lote1 = r1.body.id;
      // legado exclusivo_mpe → tipo_beneficio_mpe coerente
      expect(r1.body.tipo_beneficio_mpe).toBe('EXCLUSIVO');

      const r2 = await http()
        .post('/api/lotes')
        .set(bearer(orgao.token))
        .send({ numero: 2, descricao: 'Gêneros alimentícios', licitacao_id: lic.id, tipo_beneficio_mpe: 'COTA_RESERVADA', percentual_cota_reservada: 25 });
      expect(r2.status).toBe(201);
      lote2 = r2.body.id;
      expect(r2.body).toMatchObject({ tipo_beneficio_mpe: 'COTA_RESERVADA', exclusivo_mpe: false });
    });

    test('ME/EPP do lote validado; outro órgão e fornecedor não escrevem', async () => {
      const cota = await http().put(`/api/lotes/${lote2}`).set(bearer(orgao.token)).send({ tipo_beneficio_mpe: 'COTA_RESERVADA', percentual_cota_reservada: 40 });
      expect(cota.status).toBe(400);
      const volta = await http().put(`/api/lotes/${lote1}`).set(bearer(orgao.token)).send({ tipo_beneficio_mpe: 'NENHUM' });
      expect(volta.status).toBe(200);
      expect(volta.body).toMatchObject({ tipo_beneficio_mpe: 'NENHUM', exclusivo_mpe: false });

      const alheio = await http()
        .post('/api/lotes')
        .set(bearer(outroOrgao.token))
        .send({ numero: 3, descricao: 'Lote intruso', licitacao_id: lic.id });
      expect(alheio.status).toBe(403);
      expect((await http().put(`/api/lotes/${lote1}`).set(bearer(outroOrgao.token)).send({ descricao: 'x' })).status).toBe(403);
      expect((await http().post(`/api/lotes/${lote1}/itens/${itens()[0]}`).set(bearer(F1.token))).status).toBe(403);
      expect((await http().post(`/api/lotes/${lote1}/itens/${itens()[0]}`)).status).toBe(401);
    });

    test('itens nos lotes; um item pertence a no máximo um lote', async () => {
      for (const id of itens().slice(0, 3)) {
        expect((await http().post(`/api/lotes/${lote1}/itens/${id}`).set(bearer(orgao.token))).status).toBe(201);
      }
      for (const id of itens().slice(3)) {
        expect((await http().post(`/api/lotes/${lote2}/itens/${id}`).set(bearer(orgao.token))).status).toBe(201);
      }
      const dupla = await http().post(`/api/lotes/${lote2}/itens/${itens()[0]}`).set(bearer(orgao.token));
      expect(dupla.status).toBe(400);
      expect(dupla.body.message).toMatch(/já pertence ao Lote 1/);

      const lista = await http().get(`/api/lotes/licitacao/${lic.id}`).set(bearer(orgao.token)).expect(200);
      expect(lista.body.map((l: any) => [l.numero, l.itens.length, Number(l.valor_total_estimado)])).toEqual([
        [1, 3, 1360],
        [2, 3, 1100],
      ]);
    });
  });

  // --------------------------------------------------------------------------
  describe('B. Propostas e abertura da disputa por lote', () => {
    beforeAll(async () => {
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const propostas: string[] = [];
      for (const [f, v] of [
        [F1, COTACAO.F1],
        [F2, COTACAO.F2],
        [F3, COTACAO.F3],
      ] as Array<[FornecedorFixture, Array<number | undefined>]>) {
        const valores: Record<string, number> = {};
        v.forEach((x, i) => {
          if (x !== undefined) valores[itens()[i]] = x;
        });
        propostas.push((await enviarProposta(ctx, f, lic, valores)).id);
      }
      await abrirSessaoAgora(ctx, lic);
      expect((await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({})).status).toBe(200);
      for (const id of propostas) {
        expect((await http().put(`/api/propostas/${id}/classificar`).set(bearer(orgao.token))).status).toBe(200);
      }
      const s = await http().post(`/api/sessao/${lic.id}`).set(bearer(orgao.token)).send({ pregoeiroId: orgao.id, pregoeiroNome: 'Pregoeiro Lote' });
      expect(s.status).toBe(201);
      sessaoId = s.body.id;
      await http()
        .put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`)
        .set(bearer(orgao.token))
        .send({ tempo_inatividade_minutos: 10, tempo_prorrogacao_minutos: 2, intervalo_minimo_lances_minutos: 0 })
        .expect(200);
      expect((await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token))).status).toBe(200);
    });

    test('lotes com a estrutura congelada depois da abertura da disputa', async () => {
      const ini = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`)
        .set(bearer(orgao.token))
        .send({ itensIds: [lote1, lote2] });
      expect(ini.status).toBe(201);
      expect(ini.body).toMatchObject({ itensIniciados: 6, lotesIniciados: 2 });

      const mover = await http().delete(`/api/lotes/${lote1}/itens/${itens()[0]}`).set(bearer(orgao.token));
      expect(mover.status).toBe(409);
    });

    test('proposta vira lance PROPOSTA do lote (soma dos totais) só para quem cotou TODOS os itens', async () => {
      const l1 = await lancesAtivosDoLote(lote1);
      expect(l1.map((l: any) => [l.fornecedor_id, Number(l.valor), l.origem])).toEqual([
        [F1.id, 1297, 'PROPOSTA'],
        [F2.id, 1300.5, 'PROPOSTA'],
      ]);
      const l2 = await lancesAtivosDoLote(lote2);
      expect(l2.map((l: any) => [l.fornecedor_id, Number(l.valor)])).toEqual([
        [F3.id, 1035],
        [F1.id, 1050],
        [F2.id, 1055],
      ]);
      // rateio da proposta = a própria cotação por item
      const r = await q(
        `SELECT i.numero_item, l.valor_total, l.valor_unitario, l.valor FROM lances l JOIN itens_licitacao i ON i.id::text = l.item_id::text
          WHERE l.lance_lote_id = $1 ORDER BY i.numero_item`,
        [l1[1].id],
      );
      expect(r.map((x: any) => [x.numero_item, Number(x.valor_total), Number(x.valor_unitario), Number(x.valor)])).toEqual([
        [1, 960, 96, 1300.5],
        [2, 141, 47, 1300.5],
        [3, 199.5, 28.5, 1300.5],
      ]);
      const ev = await q(`SELECT descricao FROM eventos_sessao WHERE sessao_id = $1 AND descricao LIKE 'Lote 1:%'`, [sessaoId]);
      expect(ev[0]?.descricao).toMatch(/1 proposta\(s\) não cotou/);
    });

    test('a sala mostra LOTES como unidades de disputa (itens dentro, total); F3 inelegível no Lote 1', async () => {
      const b = await board(F3.token);
      expect(b.emDisputa).toHaveLength(2);
      const u1 = unidade(b, lote1);
      expect(u1).toMatchObject({ tipoUnidade: 'LOTE', numero: 1, valorReferencia: 1360, elegivel: false, itensNaoCotados: [3], totalPropostas: 2 });
      expect(u1.itensDoLote.map((i: any) => i.numero)).toEqual([1, 2, 3]);
      const u2 = unidade(b, lote2);
      expect(u2).toMatchObject({ elegivel: true, minhaPropostaInicial: 1035, totalPropostas: 3 });
      // item em lote: status espelhado
      const st = await q(`SELECT DISTINCT status_disputa::text AS s FROM itens_licitacao WHERE licitacao_id = $1`, [lic.id]);
      expect(st.map((x: any) => x.s)).toEqual(['EM_DISPUTA']);
    });
  });

  // --------------------------------------------------------------------------
  describe('C. Lances no lote (regras do item sobre o valor global) e isolamento', () => {
    beforeAll(async () => {
      s1 = await sala(F1);
      s2 = await sala(F2);
      s3 = await sala(F3);
    });

    test('ISOLAMENTO: F3 não cotou todos os itens do Lote 1 → não dá lance nele (socket e REST)', async () => {
      const r = await darLance(s3, sessaoId, lote1, 1200);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/não cotou todos os itens do lote/);
      const rest = await http().post(`/api/disputa-v2/sessao/${sessaoId}/lance`).set(bearer(F3.token)).send({ loteId: lote1, valor: 1200 });
      expect(rest.status).toBe(400);
      expect((await lancesAtivosDoLote(lote1)).some((l: any) => l.fornecedor_id === F3.id)).toBe(false);
    });

    test('lance por ITEM numa licitação por lote → 409', async () => {
      const r = await darLance(s1, sessaoId, itens()[0], 90);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/disputada por LOTE/);
    });

    test('diferença mínima (R$ 1) e lances iguais valem sobre o valor do lote', async () => {
      expect((await darLance(s2, sessaoId, lote1, 1296)).ok).toBe(true);
      const igual = await darLance(s1, sessaoId, lote1, 1296);
      expect(igual.ok).toBe(false);
      expect(igual.mensagem).toMatch(/igual ao melhor lance/i);
      expect((await darLance(s1, sessaoId, lote1, 1290)).ok).toBe(true);
      const perto = await darLance(s2, sessaoId, lote1, 1289.5);
      expect(perto.ok).toBe(false);
      expect(perto.mensagem).toMatch(/cobrir o melhor lance/i);
      const casas = await darLance(s2, sessaoId, lote1, 1288.555);
      expect(casas.ok).toBe(false);
      expect(casas.mensagem).toMatch(/2 casas/);
      expect((await darLance(s2, sessaoId, lote1, 1289)).ok).toBe(true);
    });

    test('rateio do lance: proporcional à proposta do licitante, resíduo no último item, soma exata', async () => {
      const [melhor] = await lancesAtivosDoLote(lote1);
      expect([melhor.fornecedor_id, Number(melhor.valor)]).toEqual([F2.id, 1289]);
      const partes = await q(
        `SELECT i.numero_item, l.valor_total, l.valor_unitario FROM lances l JOIN itens_licitacao i ON i.id::text = l.item_id::text
          WHERE l.lance_lote_id = $1 ORDER BY i.numero_item`,
        [melhor.id],
      );
      // 960 × 1289/1300,50 = 951,511… → 951,51 · 141 × … = 139,753… → 139,75 · último = 1289 − 951,51 − 139,75
      expect(partes.map((p: any) => Number(p.valor_total))).toEqual([951.51, 139.75, 197.74]);
      const esperado = ratearLanceLote(
        [
          { itemId: 'a', numero: 1, quantidade: 10, valorTotalProposta: 960 },
          { itemId: 'b', numero: 2, quantidade: 3, valorTotalProposta: 141 },
          { itemId: 'c', numero: 3, quantidade: 7, valorTotalProposta: 199.5 },
        ],
        1289,
      );
      expect(partes.map((p: any) => Number(p.valor_unitario))).toEqual(esperado.map((e) => e.valor_unitario));
      const [soma] = await q(
        `SELECT COUNT(*)::int AS divergentes FROM lances p
          WHERE p.lote_id IS NOT NULL AND p.item_id IS NULL AND p.licitacao_id = $1
            AND p.valor_total <> (SELECT SUM(c.valor_total) FROM lances c WHERE c.lance_lote_id = p.id)`,
        [lic.id],
      );
      expect(soma.divergentes).toBe(0);
    });

    test('sigilo: na sala o melhor lance do lote aparece com código anônimo', async () => {
      const b = await board(F1.token);
      const u = unidade(b, lote1);
      expect(u.melhorLance.valor).toBe(1289);
      expect(u.melhorLance.fornecedorNome).toMatch(/^Fornecedor [A-Z]/);
      expect(JSON.stringify(b)).not.toContain(F2.razao_social);
      expect(JSON.stringify(b)).not.toContain(F2.id);
      expect(u).toMatchObject({ meuMelhorLance: 1290, minhaPosicao: 2 });
    });
  });

  // --------------------------------------------------------------------------
  describe('D. Relógio (prorrogação e encerramento), encerramento manual e ranking', () => {
    test('prorrogação: lance na janela final do lote prorroga 2 min; tempo esgotado encerra o lote', async () => {
      const agora = Date.now();
      await q(`UPDATE lotes_licitacao SET disputa_iniciada_em = $2, ultimo_lance_em = $2 WHERE id = $1`, [lote1, new Date(agora - 9.5 * 60_000)]);
      const antes = unidade(await board(orgao.token), lote1);
      expect(antes.tempoRestante).toBeLessThanOrEqual(31);

      expect((await darLance(s1, sessaoId, lote1, 1285)).ok).toBe(true);
      const depois = unidade(await board(orgao.token), lote1);
      expect(depois.tempoRestante).toBeGreaterThan(100);
      expect(depois.emProrrogacao).toBe(true);

      await tiqueRelogioDisputa(ctx);
      expect((await q(`SELECT status_disputa FROM lotes_licitacao WHERE id = $1`, [lote1]))[0].status_disputa).toBe('EM_DISPUTA');

      await q(`UPDATE lotes_licitacao SET disputa_iniciada_em = $2, ultimo_lance_em = $3 WHERE id = $1`, [
        lote1,
        new Date(Date.now() - 15 * 60_000),
        new Date(Date.now() - 3 * 60_000),
      ]);
      await tiqueRelogioDisputa(ctx);
      const [l] = await q(`SELECT status_disputa, melhor_lance_valor, melhor_lance_fornecedor_id FROM lotes_licitacao WHERE id = $1`, [lote1]);
      expect(l).toMatchObject({ status_disputa: 'ENCERRADO', melhor_lance_fornecedor_id: F1.id });
      expect(Number(l.melhor_lance_valor)).toBe(1285);
      const its = await q(`SELECT status_disputa::text AS s, melhor_lance_fornecedor_id FROM itens_licitacao WHERE lote_id = $1`, [lote1]);
      for (const it of its) expect(it).toMatchObject({ s: 'ENCERRADO', melhor_lance_fornecedor_id: F1.id });
      // lote encerrado não recebe lance
      const tarde = await darLance(s2, sessaoId, lote1, 1280);
      expect(tarde.ok).toBe(false);
      expect(tarde.mensagem).toMatch(/Lote não está em disputa/);
    });

    test('E. exclusão do próprio último lance do lote (art. 21 §3º) cancela o rateio junto', async () => {
      expect((await darLance(s3, sessaoId, lote2, 1030)).ok).toBe(true);
      expect((await darLance(s1, sessaoId, lote2, 1025)).ok).toBe(true);
      const [meu] = await q(
        `SELECT id FROM lances WHERE lote_id = $1 AND item_id IS NULL AND fornecedor_id = $2 AND origem = 'LANCE' AND cancelado = false`,
        [lote2, F1.id],
      );
      const lista = await http().get(`/api/disputa-v3/sessao/${sessaoId}/item/${lote2}/lances-meus`).set(bearer(F1.token));
      expect(lista.status).toBe(200);
      expect(lista.body[0]).toMatchObject({ id: meu.id, podeCancelarDireto: true });
      const c = await http()
        .post(`/api/disputa-v3/sessao/${sessaoId}/item/${lote2}/lance/${meu.id}/cancelar-fornecedor`)
        .set(bearer(F1.token));
      expect(c.status).toBe(201);
      const linhas = await q(`SELECT cancelado FROM lances WHERE id = $1 OR lance_lote_id = $1`, [meu.id]);
      expect(linhas).toHaveLength(4);
      expect(linhas.every((x: any) => x.cancelado)).toBe(true);
      const [melhor] = await lancesAtivosDoLote(lote2);
      expect([melhor.fornecedor_id, Number(melhor.valor)]).toEqual([F3.id, 1030]);
    });

    test('pregoeiro encerra o Lote 2 → fim da etapa de lances da licitação (julgamento)', async () => {
      expect((await darLance(s3, sessaoId, lote2, 1020)).ok).toBe(true);
      const r = await http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${lote2}`).set(bearer(orgao.token));
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ etapaDeLancesEncerrada: true, itemNumero: 2, vencedor: { fornecedorId: F3.id, valor: 1020 } });
      const [l] = await q(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.fase).toBe(FaseLicitacao.JULGAMENTO);
    });

    test('ranking por lote (melhor valor de cada licitante)', async () => {
      // Leitura do órgão segue o interruptor de anonimização da sessão (como no item):
      // o licitante vem pelo código anônimo da sessão
      const codigo = new Map<string, string>(
        (await q(`SELECT fornecedor_id, codigo_anonimo FROM mapeamento_anonimo WHERE sessao_id = $1`, [sessaoId])).map((m: any) => [
          String(m.fornecedor_id),
          m.codigo_anonimo,
        ]),
      );
      const r1 = await http().get(`/api/disputa-v2/item/${lote1}/melhores`).set(bearer(orgao.token)).expect(200);
      expect(r1.body.map((x: any) => [x.fornecedorNome, x.melhorValor])).toEqual([
        [codigo.get(F1.id), 1285],
        [codigo.get(F2.id), 1289],
      ]);
      const r2 = await http().get(`/api/disputa-v2/item/${lote2}/melhores`).set(bearer(orgao.token)).expect(200);
      expect(r2.body.map((x: any) => [x.fornecedorNome, x.melhorValor])).toEqual([
        [codigo.get(F3.id), 1020],
        [codigo.get(F1.id), 1050],
        [codigo.get(F2.id), 1055],
      ]);
      const lances = await http().get(`/api/disputa-v2/item/${lote1}/lances`).set(bearer(orgao.token)).expect(200);
      const topo = lances.body.find((l: any) => l.valor === 1285);
      expect(topo.rateio.map((p: any) => p.numero)).toEqual([1, 2, 3]);
      expect(Math.round(topo.rateio.reduce((s: number, p: any) => s + p.valorTotal, 0) * 100) / 100).toBe(1285);
    });
  });

  // --------------------------------------------------------------------------
  describe('G. Edição da licitação com lotes (wizard: PUT /licitacoes/:id com lotes e itens)', () => {
    test('lotes pelo número, itens ligados pelo numero_lote; salvar de novo mantém os ids', async () => {
      const outra = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: ModoDisputa.ABERTO,
        itens: ITENS.slice(0, 3),
        extras: { base_lance: 'TOTAL_LOTE', usa_lotes: true },
      });
      const corpo = {
        usa_lotes: true,
        lotes: [
          { id: 'temp-1', numero: 1, descricao: 'Informática', tipo_beneficio_mpe: 'EXCLUSIVO' },
          { id: 'temp-2', numero: 2, descricao: 'Periféricos' },
        ],
        itens: ITENS.slice(0, 3).map((i, idx) => ({
          numero: idx + 1,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario_estimado,
          unidade: 'UNIDADE',
          lote_numero: idx === 0 ? 1 : 2,
          lote_id: idx === 0 ? 'temp-1' : 'temp-2',
        })),
      };
      expect((await http().put(`/api/licitacoes/${outra.id}`).set(bearer(orgao.token)).send(corpo)).status).toBe(200);
      const l1 = (await http().get(`/api/lotes/licitacao/${outra.id}`).set(bearer(orgao.token)).expect(200)).body;
      expect(l1.map((l: any) => [l.numero, l.itens.length, l.tipo_beneficio_mpe, l.exclusivo_mpe])).toEqual([
        [1, 1, 'EXCLUSIVO', true],
        [2, 2, 'NENHUM', false],
      ]);

      // Segunda edição (ids reais agora): mesmos lotes, item 3 muda de lote
      const corpo2 = {
        lotes: l1.map((l: any) => ({ id: l.id, numero: l.numero, descricao: l.descricao })),
        itens: corpo.itens.map((i) => ({ ...i, lote_numero: i.numero === 3 ? 1 : i.lote_numero, lote_id: undefined })),
      };
      expect((await http().put(`/api/licitacoes/${outra.id}`).set(bearer(orgao.token)).send(corpo2)).status).toBe(200);
      const l2 = (await http().get(`/api/lotes/licitacao/${outra.id}`).set(bearer(orgao.token)).expect(200)).body;
      expect(l2.map((l: any) => l.id)).toEqual(l1.map((l: any) => l.id));
      expect(l2.map((l: any) => l.itens.map((i: any) => i.numero_item).sort())).toEqual([[1, 3], [2]]);
    });
  });

  // --------------------------------------------------------------------------
  describe('F. Homologação: valores por item = rateio do lance vencedor do lote', () => {
    test('desempate ME/EPP por LOTE (LC 123 art. 45): F2 (ME) no intervalo de 5% nos dois lotes é convocada e declina', async () => {
      // a aceitação espera o desempate
      expect((await convocarAceitacao(ctx, sessaoId, lote1, orgao.token)).status).toBe(409);
      const minhas = (await http().get(`/api/julgamento/sessao/${sessaoId}/me-epp`).set(bearer(F2.token)).expect(200)).body;
      expect(minhas.convocacoes.map((c: any) => c.unidadeId).sort()).toEqual([lote1, lote2].sort());
      for (const c of minhas.convocacoes) {
        await http().post(`/api/julgamento/sessao/${sessaoId}/me-epp/${c.id}/declinar`).set(bearer(F2.token)).send({}).expect(201);
      }
    });

    test('aceitação da proposta por LOTE: valores por item validados contra o rateio (E3)', async () => {
      // F1 (Lote 1): convocado; subir um item acima do rateio é recusado; no limite é aceito
      const c = await convocarAceitacao(ctx, sessaoId, lote1, orgao.token);
      expect(c.status).toBe(201);
      expect(c.body).toMatchObject({ fornecedorId: F1.id, tipoUnidade: 'LOTE' });
      expect(c.body.limites.valorFinalTotal).toBe(1285);
      expect(c.body.limites.itens).toHaveLength(3);
      const limite = valoresNoLimite(c.body.limites);
      const acima = limite.map((v, i) => (i === 0 ? { ...v, valorUnitario: v.valorUnitario + 1 } : { ...v, valorUnitario: v.valorUnitario - 5 }));
      const r = await enviarPropostaAdequada(ctx, sessaoId, c.body.id, F1.token, acima);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Item 1.*acima do limite/);
      expect((await enviarPropostaAdequada(ctx, sessaoId, c.body.id, F1.token, limite)).status).toBe(201);
      expect((await decidirAceitacao(ctx, sessaoId, c.body.id, orgao.token, 'aceitar')).status).toBe(201);
      // F3 (Lote 2)
      await aceitarPropostaDaUnidade(ctx, sessaoId, lote2, orgao.token, F3.token);
    });

    test('habilitação → adjudicação → homologação pela sala', async () => {
      for (const f of [F1, F3]) {
        await http().put(`/api/sessao/${sessaoId}/habilitacao/convocar/${f.id}`).set(bearer(orgao.token)).send({}).expect(200);
        await http().put(`/api/sessao/${sessaoId}/habilitacao/aprovar/${f.id}`).set(bearer(orgao.token)).send({}).expect(200);
      }
      await http().put(`/api/sessao/${sessaoId}/recursos/encerrar-prazo`).set(bearer(orgao.token)).send({}).expect(200);
      await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(orgao.token)).send({}).expect(200);
      const h = await http().put(`/api/sessao/${sessaoId}/homologar`).set(bearer(orgao.token)).send({ nome: 'Prefeito', cargo: 'Autoridade' });
      expect(h.status).toBe(200);
      expect(h.body.totalHomologado).toBe(6);
      expect(h.body.valorTotal).toBe(1285 + 1020);
    });

    test('cada item homologado com a parcela do vencedor do seu lote; soma por lote = lance', async () => {
      const its = await q(
        `SELECT numero_item, lote_id, fornecedor_vencedor_id, valor_unitario_homologado, valor_total_homologado
           FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
        [lic.id],
      );
      const e1 = ratearLanceLote(
        [
          { itemId: '1', numero: 1, quantidade: 10, valorTotalProposta: 950 },
          { itemId: '2', numero: 2, quantidade: 3, valorTotalProposta: 144 },
          { itemId: '3', numero: 3, quantidade: 7, valorTotalProposta: 203 },
        ],
        1285,
      );
      const e2 = ratearLanceLote(
        [
          { itemId: '4', numero: 4, quantidade: 1, valorTotalProposta: 490 },
          { itemId: '5', numero: 5, quantidade: 2, valorTotalProposta: 360 },
          { itemId: '6', numero: 6, quantidade: 5, valorTotalProposta: 185 },
        ],
        1020,
      );
      const esperado = [...e1.map((e) => ({ ...e, f: F1.id })), ...e2.map((e) => ({ ...e, f: F3.id }))];
      expect(
        its.map((i: any) => [i.numero_item, i.fornecedor_vencedor_id, Number(i.valor_total_homologado), Number(i.valor_unitario_homologado)]),
      ).toEqual(esperado.map((e) => [e.numero, e.f, e.valor_total, e.valor_unitario]));
      const soma = (lote: string) =>
        Math.round(its.filter((i: any) => i.lote_id === lote).reduce((s: number, i: any) => s + Number(i.valor_total_homologado), 0) * 100) / 100;
      expect(soma(lote1)).toBe(1285);
      expect(soma(lote2)).toBe(1020);
    });
  });
});
