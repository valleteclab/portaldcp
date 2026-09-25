/**
 * ============================================================================
 * E2E — DISPENSA ELETRÔNICA NO MOTOR ÚNICO (plano E2 itens 7, 8 e 10)
 * ============================================================================
 *
 * docs/licitacao/PLANO-CONSOLIDACAO-LICITACAO.md — E2 item 7: a dispensa é um
 * procedimento do mesmo motor (modo JANELA, IN SEGES 67/2021). O que este
 * arquivo prova:
 *
 *  1. MIGRAÇÃO dos dados legados (`dispensa_lances` → `lances` origem
 *     JANELA_DISPENSA; `dispensa_mensagens` → chat da sala): linhas legadas
 *     inseridas direto no banco (como estão em produção), rotina de migração,
 *     equivalência de lances/chat/ATA e do JULGAMENTO com o cálculo antigo, e
 *     idempotência (2ª execução não copia nada).
 *  2. JANELA pelo motor: lance = registrarLance (origem JANELA_DISPENSA, base
 *     UNITARIO, "reduz o próprio valor"), prorrogação dentro da transação do
 *     lance e ENCERRAMENTO pelo relógio único (DisputaTimerService) — sem
 *     outro timer; julgamento igual ao cálculo de antes.
 *  3. CANAL ÚNICO: o feed da dispensa é a sala pública da licitação no
 *     `/disputa-v2` (`entrar_licitacao`): anônimo entra, órgão dono e
 *     fornecedor com proposta entram, outro órgão e fornecedor sem proposta
 *     não; os namespaces `/dispensa` e `/sessao` não existem mais.
 *  4. Nenhuma escrita nas tabelas legadas.
 */
import { Socket } from 'socket.io-client';
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  aguardarEvento,
  conectarSocket,
  criarApp,
  criarFornecedor,
  criarOrgao,
  fecharSockets,
} from './support';
import { aguardarUmDe, tiqueRelogioDisputa } from './support/pregao';
import { abrirJanelaLances, criarDispensaComPropostas, darLance, moverFimDaJanela, painelPublico } from './support/dispensa';
import { migrarDispensaParaMotor } from '../src/disputa-v2/migracao-dispensa';
import { LicitacoesService } from '../src/licitacoes/licitacoes.service';
import { conferirSorteio } from '../src/julgamento/sorteio';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const MIN = 60_000;

/** supertest: corpo binário (PDF) como Buffer. */
function lerBinario(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
}

/**
 * JULGAMENTO COMO ERA ANTES (licitacoes.service.ts, julgarDispensa, até a E2):
 * valor final de cada fornecedor no item = menor entre a proposta e os PRÓPRIOS
 * lances (só de quem tem proposta válida); vencedor = menor valor final
 * (empate: a proposta que veio primeiro na ordenação por valor/envio).
 */
function julgarComoAntes(
  propostas: Array<{ item: string; fornecedor: string; valor: number }>,
  lances: Array<{ item: string; fornecedor: string; valor: number }>,
): Map<string, { fornecedor: string; valor: number }> {
  const melhor = new Map<string, { item: string; fornecedor: string; valor: number }>();
  const k = (i: string, f: string) => `${i}|${f}`;
  for (const p of [...propostas].sort((a, b) => a.valor - b.valor)) {
    const atual = melhor.get(k(p.item, p.fornecedor));
    if (!atual || p.valor < atual.valor) melhor.set(k(p.item, p.fornecedor), p);
  }
  const comProposta = new Set(propostas.map((p) => p.fornecedor));
  for (const l of lances) {
    if (!comProposta.has(l.fornecedor)) continue;
    const atual = melhor.get(k(l.item, l.fornecedor));
    if (atual && l.valor < atual.valor) melhor.set(k(l.item, l.fornecedor), { ...l });
  }
  const vencedor = new Map<string, { fornecedor: string; valor: number }>();
  for (const c of melhor.values()) {
    const atual = vencedor.get(c.item);
    if (!atual || c.valor < atual.valor) vencedor.set(c.item, { fornecedor: c.fornecedor, valor: c.valor });
  }
  return vencedor;
}

async function contarLegado(ctx: AppE2E): Promise<{ lances: number; mensagens: number }> {
  const [l] = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM dispensa_lances`);
  const [m] = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM dispensa_mensagens`);
  return { lances: l.n, mensagens: m.n };
}

const iso = (d: any) => new Date(d).toISOString();

describe('Dispensa eletrônica no motor único (E2)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outroOrgao: OrgaoFixture;
  let f1: FornecedorFixture; // ME
  let f2: FornecedorFixture;
  let semProposta: FornecedorFixture;

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Dispensa Motor Único E2E' });
    outroOrgao = await criarOrgao(ctx, { nome: 'Outra Prefeitura (motor único) E2E' });
    f1 = await criarFornecedor(ctx, { porte: 'ME' });
    f2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    semProposta = await criarFornecedor(ctx, { porte: 'ME' });
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  // ==========================================================================
  // 1. MIGRAÇÃO DOS DADOS LEGADOS
  // ==========================================================================
  describe('1. migração: dispensa_lances / dispensa_mensagens → motor único', () => {
    let lic: LicitacaoFixture;
    let item1: string;
    let item2: string;
    const inicioJanela = new Date(Date.now() - 3 * 60 * MIN);
    const fimJanela = new Date(Date.now() - 2 * 60 * MIN);
    const t = (min: number) => new Date(inicioJanela.getTime() + min * MIN);
    // legado (como gravado em produção): valor UNITÁRIO com até 4 casas
    const lancesLegados = () => [
      { item: item1, fornecedor: f1.id, valor: 97, em: t(5) },
      { item: item1, fornecedor: f1.id, valor: 95.5, em: t(10) },
      { item: item2, fornecedor: f2.id, valor: 49.1234, em: t(15) },
      { item: item2, fornecedor: f1.id, valor: 49.5, em: t(20) },
      // fornecedor sem proposta válida: o julgamento antigo ignorava — o novo também
      { item: item1, fornecedor: semProposta.id, valor: 10, em: t(25) },
    ];
    let legadoAta: { lances: any[]; mensagens: any[] };

    beforeAll(async () => {
      lic = await criarDispensaComPropostas(ctx, orgao, [
        { fornecedor: f1, valores: [100, 50] },
        { fornecedor: f2, valores: [98, 52] },
      ]);
      [item1, item2] = lic.itens.map((i) => i.id);

      // Estado de produção ANTES da E2: janela já encerrada, registros só nas tabelas legadas
      await ctx.dataSource.query(
        `UPDATE licitacoes SET dispensa_lances_inicio = $2, dispensa_lances_fim = $3, dispensa_lances_prorrogacao_min = 2 WHERE id = $1`,
        [lic.id, inicioJanela, fimJanela],
      );
      for (const l of lancesLegados()) {
        await ctx.dataSource.query(
          `INSERT INTO dispensa_lances (licitacao_id, item_licitacao_id, fornecedor_id, valor_unitario, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [lic.id, l.item, l.fornecedor, l.valor, l.em],
        );
      }
      const msgs = [
        { tipo: 'ORGAO', forn: null, nome: 'Sistema', texto: 'Fase de lances aberta até ... (regra da sessão).', em: t(0) },
        { tipo: 'FORNECEDOR', forn: f1.id, nome: f1.razao_social, texto: 'O frete está incluso?', em: t(7) },
        { tipo: 'ORGAO', forn: null, nome: 'Agente de contratação', texto: 'Sim, CIF.', em: t(8) },
      ];
      for (const m of msgs) {
        await ctx.dataSource.query(
          `INSERT INTO dispensa_mensagens (licitacao_id, autor_tipo, fornecedor_id, autor_nome, mensagem, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [lic.id, m.tipo, m.forn, m.nome, m.texto, m.em],
        );
      }

      // Dados da ATA como a versão ANTIGA lia (mesmas consultas do gerarAtaDispensa de antes)
      legadoAta = {
        lances: await ctx.dataSource.query(
          `SELECT dl.created_at, il.numero_item, f.razao_social, dl.valor_unitario
             FROM dispensa_lances dl
             JOIN itens_licitacao il ON il.id = dl.item_licitacao_id
             JOIN fornecedores f ON f.id = dl.fornecedor_id
            WHERE dl.licitacao_id = $1
            ORDER BY dl.created_at ASC`,
          [lic.id],
        ),
        mensagens: await ctx.dataSource.query(
          `SELECT created_at, autor_tipo, autor_nome, mensagem
             FROM dispensa_mensagens WHERE licitacao_id = $1 ORDER BY created_at ASC`,
          [lic.id],
        ),
      };
    });

    it('migra lances e mensagens com contagens conferidas (legados × no motor)', async () => {
      const rel = await ctx.dataSource.transaction((m) => migrarDispensaParaMotor(m));
      expect(rel.lancesMigrados).toBeGreaterThanOrEqual(5);
      expect(rel.mensagensMigradas).toBeGreaterThanOrEqual(3);
      expect(rel.sessoesCriadas).toBeGreaterThanOrEqual(1);
      expect(rel.lancesOrfaos).toBe(0);
      expect(rel.mensagensOrfas).toBe(0);
      expect(rel.lancesNoMotor).toBe(rel.lancesLegados);
      expect(rel.mensagensNoChat).toBe(rel.mensagensLegadas);

      const lances = await ctx.dataSource.query(
        `SELECT l.id, l.item_id::text AS item_id, l.fornecedor_id, l.fornecedor_nome, l.valor, l.valor_unitario, l.valor_total,
                l.base_lance, l.origem, l.cancelado, l.created_at
           FROM lances l WHERE l.licitacao_id::text = $1 ORDER BY l.created_at`,
        [lic.id],
      );
      const legados = lancesLegados();
      expect(lances).toHaveLength(legados.length);
      lances.forEach((l: any, i: number) => {
        const e = legados[i];
        const qtd = e.item === item1 ? 10 : 20;
        expect(l).toMatchObject({ item_id: e.item, fornecedor_id: e.fornecedor, base_lance: 'UNITARIO', origem: 'JANELA_DISPENSA', cancelado: false });
        expect(Number(l.valor_unitario)).toBe(e.valor);
        expect(Number(l.valor_total)).toBe(Math.round(e.valor * qtd * 100) / 100);
        expect(iso(l.created_at)).toBe(iso(e.em));
      });
      // mesmo id da linha legada (idempotência)
      const ids = await ctx.dataSource.query(`SELECT id FROM dispensa_lances WHERE licitacao_id = $1`, [lic.id]);
      expect(new Set(lances.map((l: any) => l.id))).toEqual(new Set(ids.map((r: any) => r.id)));

      const [lic2] = await ctx.dataSource.query(`SELECT base_lance FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(lic2.base_lance).toBe('UNITARIO');

      const sala = await ctx.dataSource.query(`SELECT status::text, etapa::text FROM sessoes_disputa WHERE licitacao_id = $1`, [lic.id]);
      expect(sala).toEqual([{ status: 'EM_ANDAMENTO', etapa: 'NEGOCIACAO' }]);
    });

    it('é idempotente: a 2ª execução não copia nada', async () => {
      const antes = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE licitacao_id::text = $1`, [lic.id]);
      const rel = await ctx.dataSource.transaction((m) => migrarDispensaParaMotor(m));
      expect(rel).toMatchObject({ sessoesCriadas: 0, lancesMigrados: 0, mensagensMigradas: 0, itensAtualizados: 0 });
      const depois = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM lances WHERE licitacao_id::text = $1`, [lic.id]);
      expect(depois[0].n).toBe(antes[0].n);
      const sessoes = await ctx.dataSource.query(`SELECT COUNT(*)::int AS n FROM sessoes_disputa WHERE licitacao_id = $1`, [lic.id]);
      expect(sessoes[0].n).toBe(1);
    });

    it('chat migrado: mesma autoria, texto e horário (janela encerrada → autoria revelada)', async () => {
      const r = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200);
      expect(r.body.map((m: any) => [m.autor_tipo, m.autor_nome, m.mensagem, iso(m.created_at)])).toEqual(
        legadoAta.mensagens.map((m: any) => [m.autor_tipo, m.autor_nome, m.mensagem, iso(m.created_at)]),
      );
      expect(r.body.find((m: any) => m.autor_tipo === 'FORNECEDOR').fornecedor_id).toBe(f1.id);
    });

    it('julgamento sobre os dados migrados = julgamento de antes (menor entre proposta e os próprios lances)', async () => {
      const esperado = julgarComoAntes(
        [
          { item: item1, fornecedor: f1.id, valor: 100 },
          { item: item2, fornecedor: f1.id, valor: 50 },
          { item: item1, fornecedor: f2.id, valor: 98 },
          { item: item2, fornecedor: f2.id, valor: 52 },
        ],
        lancesLegados(),
      );
      const r = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(r.status).toBe(201);
      const adj = [...r.body.adjudicados].sort((a: any, b: any) => a.item - b.item);
      const nome = (id: string) => (id === f1.id ? f1.razao_social : f2.razao_social);
      expect(adj).toEqual([
        { item: 1, fornecedor: nome(esperado.get(item1)!.fornecedor), valor_unitario: esperado.get(item1)!.valor, valor_total: 955 },
        { item: 2, fornecedor: nome(esperado.get(item2)!.fornecedor), valor_unitario: esperado.get(item2)!.valor, valor_total: 982.47 },
      ]);
      // conferência explícita: f1 95,50 (lance) e f2 49,1234 (lance, 4 casas); o lance de quem não tem proposta não conta
      expect(esperado.get(item1)).toEqual({ fornecedor: f1.id, valor: 95.5 });
      expect(esperado.get(item2)).toEqual({ fornecedor: f2.id, valor: 49.1234 });
    });

    it('ATA: lê o armazenamento novo e produz o MESMO conteúdo do legado', async () => {
      const dados = await ctx.app.get(LicitacoesService).dadosAtaDispensa(lic.id);
      const normLance = (l: any) => [iso(l.created_at), Number(l.numero_item), l.razao_social, Number(l.valor_unitario)];
      const normMsg = (m: any) => [iso(m.created_at), m.autor_tipo, m.autor_nome, m.mensagem];
      expect(dados.lances.map(normLance)).toEqual(legadoAta.lances.map(normLance));
      expect(dados.mensagens.map(normMsg)).toEqual(legadoAta.mensagens.map(normMsg));

      const pdf = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/ata`).buffer(true).parse(lerBinario).expect(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });

  // ==========================================================================
  // 2. JANELA PELO MOTOR + 3. CANAL ÚNICO + 4. SEM ESCRITA NO LEGADO
  // ==========================================================================
  describe('2. janela de lances pelo motor, relógio único e canal único', () => {
    let lic: LicitacaoFixture;
    let item1: string;
    let item2: string;
    let sala: Socket;
    let legadoAntes: { lances: number; mensagens: number };
    const lancesDados: Array<{ item: string; fornecedor: string; valor: number }> = [];

    beforeAll(async () => {
      lic = await criarDispensaComPropostas(ctx, orgao, [
        { fornecedor: f1, valores: [100, 50] },
        { fornecedor: f2, valores: [98, 52] },
      ]);
      [item1, item2] = lic.itens.map((i) => i.id);
      legadoAntes = await contarLegado(ctx);
    });

    it('canal único: os namespaces /dispensa e /sessao não existem mais', async () => {
      await expect(conectarSocket(ctx, '/dispensa')).rejects.toThrow(/Invalid namespace/i);
      await expect(conectarSocket(ctx, '/sessao')).rejects.toThrow(/Invalid namespace/i);
    });

    it('canal único: feed da licitação — anônimo, órgão dono e fornecedor com proposta entram; outro órgão e fornecedor sem proposta não', async () => {
      const entrar = async (token?: string) => {
        const s = await conectarSocket(ctx, '/disputa-v2', { token });
        const r = aguardarUmDe(s, ['sala_ok', 'erro']);
        s.emit('entrar_licitacao', { licitacaoId: lic.id });
        const ev = await r;
        s.close();
        return ev.evento;
      };
      expect({
        anonimo: await entrar(),
        orgao: await entrar(orgao.token),
        f1: await entrar(f1.token),
        outroOrgao: await entrar(outroOrgao.token),
        semProposta: await entrar(semProposta.token),
      }).toEqual({ anonimo: 'sala_ok', orgao: 'sala_ok', f1: 'sala_ok', outroOrgao: 'erro', semProposta: 'erro' });

      // o painel público continua na sala anônima: o visitante acompanha a janela
      sala = await conectarSocket(ctx, '/disputa-v2');
      const ok = aguardarEvento(sala, 'sala_ok');
      sala.emit('entrar_licitacao', { licitacaoId: lic.id });
      await ok;
    });

    it('abre a janela: sala do motor em MODO_ABERTO, itens EM_DISPUTA, base UNITARIO, regra no chat único', async () => {
      const janela = aguardarEvento(sala, 'janela');
      const r = await abrirJanelaLances(ctx, lic, { duracao_minutos: 30, prorrogacao_minutos: 2 });
      expect(r.status).toBe(201);
      const ev = await janela;
      expect(ev.aberta).toBe(true);

      const [s] = await ctx.dataSource.query(`SELECT id, status::text, etapa::text FROM sessoes_disputa WHERE licitacao_id = $1`, [lic.id]);
      expect(s).toMatchObject({ status: 'MODO_ABERTO', etapa: 'DISPUTA_LANCES' });
      const itens = await ctx.dataSource.query(`SELECT status_disputa::text AS s FROM itens_licitacao WHERE licitacao_id = $1`, [lic.id]);
      expect(itens.every((i: any) => i.s === 'EM_DISPUTA')).toBe(true);
      const [l] = await ctx.dataSource.query(`SELECT base_lance FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.base_lance).toBe('UNITARIO');
      const chat = await ctx.dataSource.query(
        `SELECT tipo::text, usuario_nome FROM eventos_sessao WHERE sessao_id = $1 AND tipo::text = 'MENSAGEM_SISTEMA'`,
        [s.id],
      );
      expect(chat).toEqual([{ tipo: 'MENSAGEM_SISTEMA', usuario_nome: 'Sistema' }]);
    });

    it('lance = registrarLance do motor (origem JANELA_DISPENSA, unitário/total, trilha da sessão) + push anônimo', async () => {
      const push = aguardarEvento(sala, 'painel_atualizado');
      const r = await darLance(ctx, f1, lic, item1, 97.5);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ ok: true, valor_unitario: 97.5, seu_valor_anterior: 100 });
      lancesDados.push({ item: item1, fornecedor: f1.id, valor: 97.5 });
      const ev = await push;
      expect(ev).toMatchObject({ item_licitacao_id: item1, menor_valor: 97.5, total_lances: 1 });
      expect(JSON.stringify(ev)).not.toContain(f1.id);

      const [lance] = await ctx.dataSource.query(
        `SELECT fornecedor_id, valor, valor_unitario, valor_total, base_lance, origem FROM lances WHERE item_id::text = $1`,
        [item1],
      );
      expect(lance).toMatchObject({ fornecedor_id: f1.id, base_lance: 'UNITARIO', origem: 'JANELA_DISPENSA' });
      expect([Number(lance.valor), Number(lance.valor_unitario), Number(lance.valor_total)]).toEqual([97.5, 97.5, 975]);
      const trilha = await ctx.dataSource.query(
        `SELECT e.dados_adicionais->>'origem' AS origem FROM eventos_sessao e JOIN sessoes_disputa s ON s.id = e.sessao_id
          WHERE s.licitacao_id = $1 AND e.tipo::text = 'LANCE_REGISTRADO'`,
        [lic.id],
      );
      expect(trilha).toEqual([{ origem: 'JANELA_DISPENSA' }]);
    });

    it('regra da dispensa (IN 67): reduz só o PRÓPRIO valor — pode empatar/ficar acima do melhor de outro', async () => {
      // f2 (proposta 98) dá 97,5 = mesmo valor do f1: no pregão seria recusado (lances iguais); na dispensa vale
      const r = await darLance(ctx, f2, lic, item1, 97.5);
      expect(r.status).toBe(201);
      lancesDados.push({ item: item1, fornecedor: f2.id, valor: 97.5 });
      // igual/maior que o próprio valor atual → 400
      const igual = await darLance(ctx, f1, lic, item1, 97.5);
      expect(igual.status).toBe(400);
      expect(igual.body.message).toMatch(/menor que o seu valor atual/);
      // 4 casas no valor unitário
      const quatro = await darLance(ctx, f2, lic, item2, 51.1234);
      expect(quatro.status).toBe(201);
      lancesDados.push({ item: item2, fornecedor: f2.id, valor: 51.1234 });
      const menor = await darLance(ctx, f2, lic, item2, 51.1234);
      expect(menor.status).toBe(400);
      // sem proposta válida
      const sem = await darLance(ctx, semProposta, lic, item1, 10);
      expect(sem.status).toBe(400);
      expect(sem.body.message).toMatch(/Apenas fornecedores com proposta válida/);
    });

    it('chat pela sala única: anônimo durante a janela (código da sala), no REST e no socket', async () => {
      const push = aguardarEvento(sala, 'chat');
      await ctx.http().post(`/api/licitacoes/${lic.id}/dispensa/mensagens`).set(bearer(f2.token)).send({ mensagem: 'Prazo de entrega?' }).expect(201);
      const ev = await push;
      expect(ev.autor_nome).toMatch(/^Fornecedor [A-Z]+$/);
      expect(JSON.stringify(ev)).not.toContain(f2.razao_social);
      expect(JSON.stringify(ev)).not.toContain(f2.id);
      const lista = await ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/mensagens`).expect(200);
      const doF2 = lista.body.find((m: any) => m.mensagem === 'Prazo de entrega?');
      expect(doF2.autor_nome).toBe(ev.autor_nome);
      expect(doF2.fornecedor_id).toBeUndefined();
      // armazenamento único: eventos da sala (nome real registrado para a ata)
      const [reg] = await ctx.dataSource.query(
        `SELECT e.tipo::text, e.usuario_nome, e.fornecedor_id FROM eventos_sessao e JOIN sessoes_disputa s ON s.id = e.sessao_id
          WHERE s.licitacao_id = $1 AND e.descricao = 'Prazo de entrega?'`,
        [lic.id],
      );
      expect(reg).toEqual({ tipo: 'MENSAGEM_FORNECEDOR', usuario_nome: f2.razao_social, fornecedor_id: f2.id });
    });

    it('prorrogação na transação do lance: lance nos últimos 2 min empurra o fim (evento janela + mensagem de sistema)', async () => {
      await moverFimDaJanela(ctx, lic.id, new Date(Date.now() + 60_000));
      const janela = aguardarEvento(sala, 'janela');
      const chat = aguardarEvento(sala, 'chat');
      const antes = Date.now();
      const r = await darLance(ctx, f1, lic, item2, 49);
      expect(r.status).toBe(201);
      lancesDados.push({ item: item2, fornecedor: f1.id, valor: 49 });
      expect(r.body.prorrogada).toBe(true);
      const novoFim = new Date(r.body.dispensa_lances_fim).getTime();
      expect(novoFim).toBeGreaterThanOrEqual(antes + 2 * MIN - 1_000);
      expect(novoFim).toBeLessThanOrEqual(Date.now() + 2 * MIN + 1_000);
      const ev = await janela;
      expect(ev).toMatchObject({ aberta: true });
      expect(new Date(ev.dispensa_lances_fim).getTime()).toBe(novoFim);
      expect((await chat).mensagem).toMatch(/prorrogada automaticamente/);
      const [l] = await ctx.dataSource.query(`SELECT dispensa_lances_fim FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(Math.abs(new Date(l.dispensa_lances_fim).getTime() - novoFim)).toBeLessThan(1_000);
    });

    it('relógio ÚNICO encerra a janela: DisputaTimerService fecha itens e sala e avisa o painel', async () => {
      await moverFimDaJanela(ctx, lic.id, new Date(Date.now() - 1_000));
      const janela = aguardarEvento(sala, 'janela');
      await tiqueRelogioDisputa(ctx);
      const ev = await janela;
      expect(ev.aberta).toBe(false);

      const itens = await ctx.dataSource.query(`SELECT status_disputa::text AS s FROM itens_licitacao WHERE licitacao_id = $1`, [lic.id]);
      expect(itens.every((i: any) => i.s === 'ENCERRADO')).toBe(true);
      const [s] = await ctx.dataSource.query(`SELECT status::text, etapa::text FROM sessoes_disputa WHERE licitacao_id = $1`, [lic.id]);
      expect(s).toEqual({ status: 'EM_ANDAMENTO', etapa: 'NEGOCIACAO' });

      // idempotente: outro tique não repete o aviso
      const repetido = recebe(sala, 'janela', 800);
      await tiqueRelogioDisputa(ctx);
      expect(await repetido).toBeNull();

      const r = await darLance(ctx, f1, lic, item1, 80);
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/não está aberta/);
      const p = await painelPublico(ctx, lic).expect(200);
      expect(p.body.aberta).toBe(false);
    });

    it('julgamento = cálculo de antes sobre os lances do motor', async () => {
      const esperado = julgarComoAntes(
        [
          { item: item1, fornecedor: f1.id, valor: 100 },
          { item: item2, fornecedor: f1.id, valor: 50 },
          { item: item1, fornecedor: f2.id, valor: 98 },
          { item: item2, fornecedor: f2.id, valor: 52 },
        ],
        lancesDados,
      );
      const r = await ctx.http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(r.status).toBe(201);
      const adj = [...r.body.adjudicados].sort((a: any, b: any) => a.item - b.item);
      const nome = (id: string) => (id === f1.id ? f1.razao_social : f2.razao_social);
      // Item 1: empate 97,5 × 97,5 (f1 e f2). Desde a E3 o empate não é mais "a melhor
      // proposta inicial" do cálculo antigo: é o art. 60 (critérios e, persistindo,
      // SORTEIO AUDITÁVEL — IN 73 art. 28 §2º), cuja entrada inclui o instante do ato.
      // O vencedor esperado é o 1º da ordem REGISTRADA no desempate, e o sorteio é
      // conferido refazendo a conta (determinístico) — o teste não depende da sorte.
      expect(esperado.get(item1)!.valor).toBe(97.5);
      const [des] = await ctx.dataSource.query(
        `SELECT fornecedores, ordem_final, valor_empatado::float AS valor, sorteio FROM desempates
          WHERE unidade_id::text = $1 AND status = 'RESOLVIDO' ORDER BY resolvido_em DESC LIMIT 1`,
        [item1],
      );
      expect(des).toBeTruthy();
      expect([...des.fornecedores].sort()).toEqual([f1.id, f2.id].sort());
      expect(des.valor).toBe(97.5);
      for (const reg of des.sorteio ?? []) expect(conferirSorteio(reg)).toBe(true);
      const vencedorItem1: string = des.ordem_final[0];
      expect([f1.id, f2.id]).toContain(vencedorItem1);
      expect(adj.map((a: any) => [a.item, a.fornecedor, a.valor_unitario])).toEqual([
        [1, nome(vencedorItem1), esperado.get(item1)!.valor],
        [2, nome(esperado.get(item2)!.fornecedor), esperado.get(item2)!.valor],
      ]);
      expect(adj[0]).toMatchObject({ fornecedor: nome(vencedorItem1), valor_unitario: 97.5, valor_total: 975 });
      // Item 2 sem empate: igual ao cálculo de antes (f1 com o lance de 49)
      expect(adj[1]).toMatchObject({ fornecedor: f1.razao_social, valor_unitario: 49, valor_total: 980 });
    });

    it('nenhuma escrita nas tabelas legadas (dispensa_lances / dispensa_mensagens)', async () => {
      expect(await contarLegado(ctx)).toEqual(legadoAntes);
      const doLic = await ctx.dataSource.query(
        `SELECT (SELECT COUNT(*)::int FROM dispensa_lances WHERE licitacao_id = $1) AS l,
                (SELECT COUNT(*)::int FROM dispensa_mensagens WHERE licitacao_id = $1) AS m`,
        [lic.id],
      );
      expect(doLic[0]).toEqual({ l: 0, m: 0 });
    });
  });
});

/** Próximo `evento` em até `ms` (ou null). */
function recebe<T = any>(socket: Socket, evento: string, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(evento, h);
      resolve(null);
    }, ms);
    const h = (p: T) => {
      clearTimeout(timer);
      resolve(p);
    };
    socket.once(evento, h);
  });
}
