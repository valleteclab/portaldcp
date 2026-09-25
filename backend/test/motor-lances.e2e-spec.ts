/**
 * ============================================================================
 * E2 — MOTOR DE LANCES ÚNICO (disputa-v2), contra o banco real
 * ============================================================================
 *
 *  A. Regras do lance (IN SEGES 73/2022 arts. 21–22; Lei 14.133 art. 56 §3º):
 *     diferença mínima do edital no lance intermediário e no que cobre a melhor
 *     oferta; lances iguais (prevalece o registrado primeiro — sequencial e no
 *     mesmo instante); intervalo de tempo entre lances do mesmo fornecedor
 *     (parâmetro, padrão 0); desempate ME/EPP pelo motor (origem DESEMPATE_MPE);
 *     rota antiga de lance por lote removida (lote: disputa-lote.e2e-spec.ts).
 *  B. Chat único (eventos da sessão) respeitando `chat_desabilitado`;
 *     `mensagens` só com chat (sem lances).
 *  C. `item_encerrado` sem identidade do vencedor enquanto houver item da
 *     mesma sessão na etapa de lances; órgão dono vê tudo.
 *  D. Reinício sem DELETE: retrato congelado com SHA-256 + cancelamento lógico;
 *     reabrir os itens recria as propostas-lance (uma ativa por item+fornecedor).
 */
import { Socket } from 'socket.io-client';
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  aguardarEvento,
  criarApp,
  criarFornecedor,
  criarOrgao,
  fecharSockets,
} from './support';
import { aguardarUmDe, darLance, desligarLimiteDeRequisicoes, entrarNaSala, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { hashCanonico } from '../src/disputa-v2/disputa.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const UM = [{ descricao: 'Item único E2', quantidade: 1, valor_unitario_estimado: 100 }];
const DOIS = [
  { descricao: 'Item E2 1', quantidade: 1, valor_unitario_estimado: 100 },
  { descricao: 'Item E2 2', quantidade: 1, valor_unitario_estimado: 100 },
];

describe('E2 — motor de lances único', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  const http = () => ctx.http();

  const sala = async (sessaoId: string, quem: FornecedorFixture | OrgaoFixture, tipo: 'PREGOEIRO' | 'FORNECEDOR') => {
    const e = await entrarNaSala(ctx, sessaoId, {
      id: quem.id,
      nome: (quem as any).razao_social ?? 'Pregoeiro',
      tipo,
      token: quem.token,
    });
    expect(e.resposta.evento).toBe('dados_iniciais');
    return e.socket;
  };

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura do Motor E2' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'ME' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('A–C. regras do lance, chat e sigilo do item encerrado (diferença mínima R$ 2)', () => {
    let sessaoId: string;
    let item1: string;
    let item2: string;
    let s1: Socket;
    let s2: Socket;
    let s3: Socket;
    let sp: Socket;

    beforeAll(async () => {
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F1, valores: [99, 99] },
          { fornecedor: F2, valores: [98, 98] },
          { fornecedor: F3, valores: [97, 97] },
        ],
        { itens: DOIS, extras: { diferenca_minima_lances: 2 } },
      );
      sessaoId = p.sessaoId;
      [item1, item2] = p.lic.itens.map((i) => i.id);
      sp = await sala(sessaoId, orgao, 'PREGOEIRO');
      s1 = await sala(sessaoId, F1, 'FORNECEDOR');
      s2 = await sala(sessaoId, F2, 'FORNECEDOR');
      s3 = await sala(sessaoId, F3, 'FORNECEDOR');
    });

    test('proposta convertida é um lance PROPOSTA com unitário e total explícitos, um por fornecedor', async () => {
      const rows = await ctx.dataSource.query(
        `SELECT fornecedor_id, valor, valor_unitario, valor_total, origem, base_lance FROM lances WHERE item_id = $1 ORDER BY valor`,
        [item1],
      );
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.origem).toBe('PROPOSTA');
        expect(r.base_lance).toBe('TOTAL_ITEM');
        expect(Number(r.valor_total)).toBe(Number(r.valor));
        expect(Number(r.valor_unitario)).toBe(Number(r.valor));
      }
      const idx = await ctx.dataSource.query(`SELECT indexname FROM pg_indexes WHERE indexname = 'UQ_lances_proposta_ativa'`);
      expect(idx).toHaveLength(1);
    });

    test('diferença mínima no lance INTERMEDIÁRIO (sobre o próprio último): 99 → 98,50 recusado', async () => {
      const r = await darLance(s1, sessaoId, item1, 98.5);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/diferença mínima/i);
    });

    test('diferença mínima no lance que COBRE a melhor oferta (97): 96 recusado, 95 aceito', async () => {
      const r = await darLance(s1, sessaoId, item1, 96);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/cobrir o melhor lance/i);
      expect((await darLance(s1, sessaoId, item1, 95)).ok).toBe(true);
    });

    test('lance intermediário válido é aceito (IN 73 permite) — F2 98 → 96', async () => {
      expect((await darLance(s2, sessaoId, item1, 96)).ok).toBe(true);
    });

    test('LANCES IGUAIS: F3 tenta 96 (já registrado por F2) → recusado, prevalece o primeiro', async () => {
      const r = await darLance(s3, sessaoId, item1, 96);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/já registrado/i);
      const iguais = await ctx.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM lances WHERE item_id = $1 AND cancelado = false AND valor = 96`,
        [item1],
      );
      expect(iguais[0].n).toBe(1);
    });

    test('intervalo de TEMPO entre lances do próprio fornecedor: padrão 0; configurado 1 min recusa; 0 volta a aceitar', async () => {
      const cfg = await http().get(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`).expect(200);
      expect(cfg.body.cancelamento_direto_segundos).toBe(15);
      expect(cfg.body.diferenca_minima_lances).toEqual({ tipo: 'VALOR', valor: 2 });

      await http().put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`).set(bearer(orgao.token)).send({ intervalo_minimo_lances_minutos: 1 }).expect(200);
      const r = await darLance(s2, sessaoId, item1, 93);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/Intervalo mínimo entre seus lances/i);

      await http().put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`).set(bearer(orgao.token)).send({ intervalo_minimo_lances_minutos: 0 }).expect(200);
      expect((await darLance(s2, sessaoId, item1, 93)).ok).toBe(true);
    });

    test('lance aceito grava unitário/total e o melhor lance do item', async () => {
      const [l] = await ctx.dataSource.query(
        `SELECT valor, valor_unitario, valor_total, origem, fornecedor_id FROM lances WHERE item_id = $1 AND cancelado = false ORDER BY valor LIMIT 1`,
        [item1],
      );
      expect(l).toMatchObject({ origem: 'LANCE', fornecedor_id: F2.id });
      expect(Number(l.valor_total)).toBe(93);
      const [it] = await ctx.dataSource.query(`SELECT melhor_lance_valor FROM itens_licitacao WHERE id = $1`, [item1]);
      expect(Number(it.melhor_lance_valor)).toBe(93);
    });

    test('rota antiga de lance por lote (/sessao/:id/lance-lote) removida — lote é o lance do motor com o id do lote', async () => {
      // Disputa por lote: test/disputa-lote.e2e-spec.ts
      const r = await http().post(`/api/sessao/${sessaoId}/lance-lote`).set(bearer(F1.token)).send({ valor: 10 });
      expect(r.status).toBe(404);
    });

    test('CHAT único: mensagens do pregoeiro e do fornecedor no mesmo armazenamento; leitura só com chat', async () => {
      const chega = aguardarEvento<any>(s3, 'nova_mensagem');
      sp.emit('enviar_mensagem', { sessaoId, conteudo: 'Bom dia, licitantes' });
      expect((await chega).tipo).toBe('PREGOEIRO');

      const chegaF = aguardarEvento<any>(s3, 'nova_mensagem');
      s1.emit('enviar_mensagem', { sessaoId, conteudo: 'Dúvida do licitante' });
      const mf = await chegaF;
      expect(mf.tipo).toBe('FORNECEDOR');
      expect(JSON.stringify(mf)).not.toContain(F1.id);
      expect(JSON.stringify(mf)).not.toContain(F1.razao_social);

      const r = await http().get(`/api/disputa-v2/sessao/${sessaoId}/mensagens`).set(bearer(orgao.token)).expect(200);
      const tipos = new Set(r.body.map((m: any) => m.tipo));
      for (const t of tipos) expect(['PREGOEIRO', 'FORNECEDOR', 'SISTEMA']).toContain(t);
      expect(r.body.some((m: any) => /Lance de R\$/.test(m.conteudo))).toBe(false);
      expect(r.body.some((m: any) => m.conteudo === 'Dúvida do licitante' && m.tipo === 'FORNECEDOR')).toBe(true);
      const tabela = await ctx.dataSource.query(`SELECT to_regclass('chat_mensagens') AS t`);
      if (tabela[0].t) {
        const n = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM chat_mensagens WHERE conteudo = 'Dúvida do licitante'`).catch(() => [{ n: 0 }]);
        expect(n[0].n).toBe(0);
      }
    });

    test('CHAT desabilitado: fornecedor recebe erro; o pregoeiro continua falando', async () => {
      await http().put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`).set(bearer(orgao.token)).send({ chat_desabilitado: true }).expect(200);
      const r = aguardarUmDe(s1, ['erro', 'nova_mensagem']);
      s1.emit('enviar_mensagem', { sessaoId, conteudo: 'Tentativa com chat fechado' });
      const ev = await r;
      expect(ev.evento).toBe('erro');
      expect(ev.payload.mensagem).toMatch(/desabilitado/i);

      const ok = aguardarUmDe(sp, ['erro', 'nova_mensagem']);
      sp.emit('enviar_mensagem', { sessaoId, conteudo: 'Pregoeiro com chat fechado' });
      expect((await ok).evento).toBe('nova_mensagem');
      await http().put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`).set(bearer(orgao.token)).send({ chat_desabilitado: false }).expect(200);
    });

    test('item_encerrado com outro item em disputa: fornecedor recebe o vencedor ANÔNIMO; órgão recebe a identidade', async () => {
      const paraF1 = aguardarEvento<any>(s1, 'item_encerrado');
      const paraOrgao = aguardarEvento<any>(sp, 'item_encerrado');
      sp.emit('encerrar_item', { sessaoId, itemId: item1 });
      const [f, o] = await Promise.all([paraF1, paraOrgao]);

      expect(f.itemId).toBe(item1);
      expect(f.etapaDeLancesEncerrada).toBe(false);
      expect(f.vencedor.fornecedorId).toMatch(/^anonimo-/);
      expect(JSON.stringify(f)).not.toContain(F2.id);
      expect(JSON.stringify(f)).not.toContain(F2.razao_social);
      expect(o.vencedor.fornecedorId).toBe(F2.id);

      // leituras REST do item encerrado também seguem sem identidade para não-donos
      const m = await http().get(`/api/disputa-v2/item/${item1}/melhores`).set(bearer(F3.token)).expect(200);
      expect(JSON.stringify(m.body)).not.toContain(F2.id);
      const pub = await http().get(`/api/disputa-v2/item/${item1}/lances`).expect(200);
      expect(JSON.stringify(pub.body)).not.toContain(F2.id);
    });

    test('encerrado o ÚLTIMO item (fim da etapa de lances), as identidades aparecem', async () => {
      const paraF1 = aguardarEvento<any>(s1, 'item_encerrado');
      sp.emit('encerrar_item', { sessaoId, itemId: item2 });
      const f = await paraF1;
      expect(f.etapaDeLancesEncerrada).toBe(true);
      expect(f.vencedor.fornecedorId).toBe(F3.id);
      const m = await http().get(`/api/disputa-v2/item/${item1}/melhores`).set(bearer(F3.token)).expect(200);
      expect(m.body[0].fornecedorId).toBe(F2.id);
    });

    test('desempate ME/EPP passa pelo motor (origem DESEMPATE_MPE): igual ao melhor recusado, abaixo aceito', async () => {
      // E3: a ME/EPP (F2, 98 — dentro dos 5% de 97) é convocada sozinha no fim do item e responde pelo token
      const minhas = (await http().get(`/api/julgamento/sessao/${sessaoId}/me-epp`).set(bearer(F2.token)).expect(200)).body;
      const conv = minhas.convocacoes.find((c: any) => c.unidadeId === item2);
      expect(conv).toMatchObject({ status: 'AGUARDANDO', valorACobrir: 97 });
      const url = `/api/julgamento/sessao/${sessaoId}/me-epp/${conv.id}/exercer`;
      const igual = await http().post(url).set(bearer(F2.token)).send({ valor: 97 });
      expect(igual.status).toBe(400);
      await http().post(url).set(bearer(F2.token)).send({ valor: 96.9 }).expect(201);
      const [l] = await ctx.dataSource.query(
        `SELECT origem, fornecedor_id, valor_total FROM lances WHERE item_id = $1 AND cancelado = false ORDER BY valor LIMIT 1`,
        [item2],
      );
      expect(l).toMatchObject({ origem: 'DESEMPATE_MPE', fornecedor_id: F2.id });
      expect(Number(l.valor_total)).toBe(96.9);
    });
  });

  // --------------------------------------------------------------------------
  describe('D. lances simultâneos iguais e reinício sem DELETE', () => {
    let sessaoId: string;
    let itemId: string;
    let s1: Socket;
    let s2: Socket;

    beforeAll(async () => {
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F1, valores: [99] },
          { fornecedor: F2, valores: [98] },
          { fornecedor: F3, valores: [97] },
        ],
        { itens: UM },
      );
      sessaoId = p.sessaoId;
      itemId = p.lic.itens[0].id;
      s1 = await sala(sessaoId, F1, 'FORNECEDOR');
      s2 = await sala(sessaoId, F2, 'FORNECEDOR');
    });

    test('intermediário igual a lance já registrado (sequencial) → recusado', async () => {
      expect((await darLance(s1, sessaoId, itemId, 97.5)).ok).toBe(true);
      const r = await darLance(s2, sessaoId, itemId, 97.5);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/já registrado/i);
    });

    test('mesmo valor no mesmo instante por dois fornecedores → exatamente um aceito', async () => {
      const [a, b] = await Promise.all([darLance(s1, sessaoId, itemId, 96), darLance(s2, sessaoId, itemId, 96)]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      const n = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE item_id = $1 AND cancelado = false AND valor = 96`, [itemId]);
      expect(n[0].n).toBe(1);
    });

    test('reinício sem justificativa → 400; com justificativa: retrato congelado + cancelamento lógico (nenhuma linha apagada)', async () => {
      const antes = await ctx.dataSource.query(`SELECT id, cancelado FROM lances WHERE item_id = $1`, [itemId]);
      const ativosAntes = antes.filter((l: any) => !l.cancelado).length;
      expect(ativosAntes).toBeGreaterThanOrEqual(5);
      const codigosAntes = await ctx.dataSource.query(`SELECT fornecedor_id, codigo_anonimo FROM mapeamento_anonimo WHERE sessao_id = $1 ORDER BY indice`, [sessaoId]);

      await http().post(`/api/disputa-v2/sessao/${sessaoId}/reiniciar`).set(bearer(orgao.token)).send({ justificativa: '  ' }).expect(400);
      const r = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/reiniciar`)
        .set(bearer(orgao.token))
        .send({ justificativa: 'Falha de conexão generalizada comprovada' })
        .expect(201);
      expect(r.body.lancesCancelados).toBe(ativosAntes);

      const depois = await ctx.dataSource.query(`SELECT id, cancelado, cancelado_por, cancelado_motivo FROM lances WHERE item_id = $1`, [itemId]);
      expect(depois).toHaveLength(antes.length);
      expect(depois.every((l: any) => l.cancelado)).toBe(true);
      const doReinicio = depois.filter((l: any) => l.cancelado_por === 'REINICIO');
      expect(doReinicio).toHaveLength(ativosAntes);
      expect(doReinicio[0].cancelado_motivo).toMatch(/Falha de conexão/);

      const [snap] = await ctx.dataSource.query(`SELECT * FROM sessao_atas_snapshots WHERE id = $1`, [r.body.snapshotId]);
      expect(snap).toMatchObject({ sessao_id: sessaoId, motivo_ato: 'REINICIO_DISPUTA', hash_sha256: r.body.hash });
      expect(hashCanonico(snap.conteudo)).toBe(snap.hash_sha256);
      expect(snap.conteudo.lances.filter((l: any) => !l.cancelado)).toHaveLength(ativosAntes);

      const codigosDepois = await ctx.dataSource.query(`SELECT fornecedor_id, codigo_anonimo FROM mapeamento_anonimo WHERE sessao_id = $1 ORDER BY indice`, [sessaoId]);
      expect(codigosDepois).toEqual(codigosAntes);
    });

    test('reabrir o item recria uma proposta-lance ativa por fornecedor (índice único impede duplicata)', async () => {
      await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token));
      const ini = await http().post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`).set(bearer(orgao.token)).send({ itensIds: [itemId] });
      expect(ini.status).toBe(201);
      expect(ini.body.itensIniciados).toBe(1);
      const ativos = await ctx.dataSource.query(
        `SELECT fornecedor_id, origem FROM lances WHERE item_id = $1 AND cancelado = false`,
        [itemId],
      );
      expect(ativos).toHaveLength(3);
      expect(ativos.every((l: any) => l.origem === 'PROPOSTA')).toBe(true);
      await expect(
        ctx.dataSource.query(
          `INSERT INTO lances (valor, fornecedor_id, licitacao_id, item_id, origem, cancelado)
           SELECT valor, fornecedor_id, licitacao_id, item_id, 'PROPOSTA', false FROM lances
            WHERE item_id = $1 AND cancelado = false LIMIT 1`,
          [itemId],
        ),
      ).rejects.toThrow(/UQ_lances_proposta_ativa|duplicate key/);
    });

    // E2 item 8: a sala /sessao foi removida — o reinício pelo socket é o do canal único /disputa
    test('socket (canal único): reiniciar_sessao do pregoeiro também é lógico (sem DELETE)', async () => {
      const antes = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE item_id = $1`, [itemId]);
      const s = await sala(sessaoId, orgao, 'PREGOEIRO');
      const r = aguardarUmDe(s, ['sessao_reiniciada', 'erro'], 8000);
      s.emit('reiniciar_sessao', { sessaoId, justificativa: 'Reinício pelo socket do canal único' });
      expect((await r).evento).toBe('sessao_reiniciada');
      s.close();
      const depois = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE item_id = $1`, [itemId]);
      expect(depois[0].n).toBe(antes[0].n);
      const snaps = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM sessao_atas_snapshots WHERE sessao_id = $1`, [sessaoId]);
      expect(snaps[0].n).toBe(2);
    });
  });
});
