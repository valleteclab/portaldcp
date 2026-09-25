/**
 * ============================================================================
 * E7c — LEILÃO (Lei 14.133/2021 arts. 6º XL, 31, 55 III; Decreto 11.461/2023)
 * ============================================================================
 *
 *  A. Criação: leilão só por maior lance; maior lance só no leilão.
 *  B. Edital (art. 31 §2º): configuração do leiloeiro e bens (avaliação,
 *     preço mínimo, localização, fotos públicas); publicação exige o edital
 *     completo e 15 dias úteis (art. 55 III); isolamento da escrita.
 *  C. Propostas = lance inicial fechado ≥ preço mínimo (Dec. 11.461 art. 8º, 21);
 *     arrematante pessoa física (CPF).
 *  D. Disputa no motor único com direção MAIOR (item): lance acima do próprio,
 *     diferença mínima para cobrir o melhor, lances iguais recusados, ranking
 *     decrescente.
 *  E. Julgamento: arrematantes declarados (maior lance ≥ mínimo) → recurso
 *     (janela no JULGAMENTO) → convocação para pagamento.
 *  F. Pagamento (art. 31 §4º): comprovante do arrematante (sigilo),
 *     confirmação pelo órgão; inadimplência → lance subsequente (art. 26 §3º).
 *  G. Adjudicação (só arrematações pagas) → homologação → termo de
 *     arrematação (sem contrato) → concluir; PNCP (modalidade, critério 5,
 *     categoria do bem, resultado).
 *  H. LOTE na direção MAIOR: ranking/board decrescentes, rateio, arrematante = maior.
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  datasEditalPadrao,
  enviarProposta,
  fecharSockets,
  levarAteFase,
  pncpMock,
} from './support';
import { jsonDaParteMultipart, pararTodosOsCrons, vincularOrgaoAoPncp } from './support/pregao';
import { abrirJanelaIntencao, encerrarJanelaNoRelogio } from './support/recursos';
import { adjudicarResultado, homologarResultado } from './support/resultado';
import {
  JPG_E7C,
  PDF_E7C,
  abrirSalaEIniciar,
  board,
  criarPessoaFisica,
  encerrarUnidade,
  exigir,
  lanceRest,
} from './support/modalidades-especiais';
import { CriterioJulgamento, FaseLicitacao, ModalidadeLicitacao, ModoDisputa, TipoContratacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const BENS = [
  { descricao: 'Caminhonete 4x4 ano 2015', quantidade: 1, valor_unitario_estimado: 30000 },
  { descricao: 'Lote de 20 cadeiras', quantidade: 1, valor_unitario_estimado: 400 },
];

describe('E7c — Leilão (art. 31)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outro: OrgaoFixture;
  let A: FornecedorFixture;
  let B: FornecedorFixture; // pessoa física
  let C: FornecedorFixture;
  let lic: LicitacaoFixture;
  let sessaoId: string;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);
  const painel = (token?: string) => {
    const r = http().get(`/api/leilao/licitacao/${lic.id}`);
    return token ? r.set(bearer(token)) : r;
  };
  const arrematacoes = () => q(`SELECT * FROM leilao_arrematacoes WHERE licitacao_id = $1 ORDER BY numero_unidade, ordem`, [lic.id]);

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura do Leilão' });
    outro = await criarOrgao(ctx, { nome: 'Outra Prefeitura' });
    await vincularOrgaoAoPncp(ctx, orgao);
    A = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    B = await criarPessoaFisica(ctx, 'Maria Arrematante');
    C = await criarFornecedor(ctx, { porte: 'ME' });
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  describe('A. Modalidade × critério', () => {
    test('leilão só por maior lance; maior lance só no leilão (art. 33 V; art. 6º XL)', async () => {
      const base = { numero_processo: `LEI-X-${Date.now()}`, orgao_id: orgao.id, objeto: 'Alienação de bens inservíveis', valor_total_estimado: 1, tipo_contratacao: 'ALIENACAO' };
      const r1 = await http().post('/api/licitacoes').set(bearer(orgao.token)).send({ ...base, modalidade: 'LEILAO', criterio_julgamento: 'MENOR_PRECO' });
      expect(r1.status).toBe(400);
      expect(r1.body.message).toMatch(/MAIOR LANCE/);
      const r2 = await http().post('/api/licitacoes').set(bearer(orgao.token)).send({ ...base, numero_processo: `${base.numero_processo}b`, modalidade: 'PREGAO_ELETRONICO', criterio_julgamento: 'MAIOR_LANCE' });
      expect(r2.status).toBe(400);
      expect(r2.body.message).toMatch(/exclusivo do leilão/);
    });
  });

  describe('B. Edital do leilão (art. 31 §2º) e publicação (art. 55 III)', () => {
    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.LEILAO, {
        criterio: CriterioJulgamento.MAIOR_LANCE,
        modo_disputa: ModoDisputa.ABERTO,
        tipo_contratacao: TipoContratacao.ALIENACAO,
        itens: BENS,
        extras: { diferenca_minima_lances: 10, tratamento_diferenciado_mpe: false },
      });
    });

    test('configuração do leilão: servidor designado; validações; isolamento (outro órgão/fornecedor)', async () => {
      const ruim = await http().put(`/api/leilao/licitacao/${lic.id}/configuracao`).set(bearer(orgao.token)).send({ tipo_leiloeiro: 'OFICIAL', leiloeiro_nome: 'Fulano' });
      expect(ruim.status).toBe(400);
      expect(JSON.stringify(ruim.body)).toMatch(/credenciamento ou pregão/);
      expect((await http().put(`/api/leilao/licitacao/${lic.id}/configuracao`).set(bearer(outro.token)).send({ tipo_leiloeiro: 'SERVIDOR', servidor_nome: 'X' })).status).toBe(403);
      expect((await http().put(`/api/leilao/licitacao/${lic.id}/configuracao`).set(bearer(A.token)).send({ tipo_leiloeiro: 'SERVIDOR', servidor_nome: 'X' })).status).toBe(403);
      const ok = await http()
        .put(`/api/leilao/licitacao/${lic.id}/configuracao`)
        .set(bearer(orgao.token))
        .send({ tipo_leiloeiro: 'SERVIDOR', servidor_nome: 'Servidora Leiloeira', ato_designacao: 'Portaria 10/2026', forma_pagamento: 'A_VISTA', prazo_pagamento_dias_uteis: 2, local_visitacao: 'Pátio municipal', periodo_visitacao: 'Dias úteis, 8h–12h' });
      expect(ok.status).toBe(200);
      expect(ok.body.configuracao).toMatchObject({ tipo_leiloeiro: 'SERVIDOR', prazo_pagamento_dias_uteis: 2 });
    });

    test('bens: avaliação, preço mínimo (vira o valor de referência do item), localização; imóvel exige matrícula/lei (art. 76)', async () => {
      const [i1, i2] = lic.itens;
      const imovel = await http().put(`/api/leilao/licitacao/${lic.id}/bens/${i1.id}`).set(bearer(orgao.token)).send({ tipo_bem: 'IMOVEL', descricao: 'Terreno', valor_avaliacao: 1000, valor_minimo: 900 });
      expect(imovel.status).toBe(400);
      expect(JSON.stringify(imovel.body)).toMatch(/matrícula/);
      exigir(
        await http().put(`/api/leilao/licitacao/${lic.id}/bens/${i1.id}`).set(bearer(orgao.token)).send({ tipo_bem: 'VEICULO', descricao: 'Caminhonete 4x4, placa ABC1D23, funcionando', valor_avaliacao: 12000, valor_minimo: 10000, localizacao: 'Pátio municipal', onus_gravames: 'Nenhum' }),
        200,
        'bem 1',
      );
      exigir(
        await http().put(`/api/leilao/licitacao/${lic.id}/bens/${i2.id}`).set(bearer(orgao.token)).send({ tipo_bem: 'MOVEL', descricao: '20 cadeiras de escritório', valor_avaliacao: 700, valor_minimo: 500, localizacao: 'Almoxarifado' }),
        200,
        'bem 2',
      );
      const [it] = await q(`SELECT valor_unitario_estimado, valor_total_estimado, tipo_item FROM itens_licitacao WHERE id = $1`, [i1.id]);
      expect([Number(it.valor_unitario_estimado), Number(it.valor_total_estimado), it.tipo_item]).toEqual([10000, 10000, 'MATERIAL']);
    });

    test('foto do bem na pasta PÚBLICA (visível sem login)', async () => {
      const r = await http()
        .post(`/api/leilao/licitacao/${lic.id}/bens/${lic.itens[0].id}/fotos`)
        .set(bearer(orgao.token))
        .attach('arquivo', JPG_E7C, { filename: 'caminhonete.jpg', contentType: 'image/jpeg' });
      expect(r.status).toBe(201);
      const url: string = r.body.fotos[0].url;
      expect(url).toMatch(/^\/api\/uploads\/leilao-bens\//);
      const pub = await http().get(url);
      expect(pub.status).toBe(200);
    });

    test('publicar: 15 dias úteis (art. 55 III) — abertura cedo demais é recusada', async () => {
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const pz = await http().get(`/api/publicacao/licitacao/${lic.id}/prazos`).set(bearer(orgao.token));
      expect(pz.body.dias_uteis).toBe(15);
      const cedo = new Date(Date.now() + 5 * 86_400_000).toISOString();
      const r = await http()
        .put(`/api/licitacoes/${lic.id}/publicar-edital`)
        .set(bearer(orgao.token))
        .send({ ...datasEditalPadrao(), data_fim_acolhimento: cedo, data_abertura_sessao: cedo, data_limite_impugnacao: new Date(Date.now() + 86_400_000).toISOString() });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toMatch(/15 dias úteis/);
      expect(JSON.stringify(r.body)).toMatch(/art\. 55, III/);
    });

    test('publicado: edital congelado (retificação); painel público mostra bens sem dados pessoais do leiloeiro', async () => {
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const edit = await http().put(`/api/leilao/licitacao/${lic.id}/bens/${lic.itens[1].id}`).set(bearer(orgao.token)).send({ valor_minimo: 1 });
      expect(edit.status).toBe(409);
      const pub = await painel();
      expect(pub.status).toBe(200);
      expect(pub.body.bens.map((b: any) => [b.numero, b.bem.valor_minimo, b.bem.valor_avaliacao])).toEqual([
        [1, 10000, 12000],
        [2, 500, 700],
      ]);
      expect(pub.body.configuracao.leiloeiro_cpf).toBeUndefined();
      expect(pub.body.bens[0].bem.fotos).toHaveLength(1);
    });
  });

  describe('C. Propostas = lance inicial fechado ≥ preço mínimo', () => {
    test('abaixo do preço mínimo → 400; pessoa física (CPF) participa', async () => {
      const r = await http()
        .post('/api/propostas')
        .set(bearer(A.token))
        .send({ licitacao_id: lic.id, declaracao_termos: true, declaracao_integridade: true, declaracao_inexistencia_fatos: true, declaracao_menor: true, itens: [{ item_licitacao_id: lic.itens[0].id, valor_unitario: 9999 }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/preço mínimo/);
      await enviarProposta(ctx, A, lic, [11000, 600]);
      await enviarProposta(ctx, B, lic, [10500, 650]);
      await enviarProposta(ctx, C, lic, { [lic.itens[0].id]: 10000 });
    });
  });

  describe('D. Disputa no motor único — direção MAIOR (item)', () => {
    beforeAll(async () => {
      await abrirSessaoAgora(ctx, lic);
      exigir(await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({}), 200, 'encerrar acolhimento');
      const props: any[] = await q(`SELECT id FROM propostas WHERE licitacao_id = $1`, [lic.id]);
      for (const p of props) exigir(await http().put(`/api/propostas/${p.id}/classificar`).set(bearer(orgao.token)), 200, 'classificar');
      sessaoId = await abrirSalaEIniciar(ctx, lic, lic.itens.map((i) => i.id));
    });

    test('melhor oferta = MAIOR proposta; lance precisa SUBIR sobre o próprio e cobrir o melhor com a diferença mínima', async () => {
      const [i1] = lic.itens;
      const b1 = (await board(ctx, sessaoId, orgao.token)).find((u) => u.id === i1.id);
      expect(Number(b1.melhorLance.valor)).toBe(11000);
      expect((await lanceRest(ctx, sessaoId, B.token, { itemId: i1.id, valor: 10400 })).status).toBe(400); // abaixo da própria proposta
      const igual = await lanceRest(ctx, sessaoId, B.token, { itemId: i1.id, valor: 11000 });
      expect(igual.status).toBe(400);
      expect(igual.body.message).toMatch(/igual ao melhor/i);
      expect((await lanceRest(ctx, sessaoId, B.token, { itemId: i1.id, valor: 11500 })).status).toBe(201);
      const perto = await lanceRest(ctx, sessaoId, A.token, { itemId: i1.id, valor: 11505 });
      expect(perto.status).toBe(400);
      expect(perto.body.message).toMatch(/cobrir o melhor lance/);
      expect((await lanceRest(ctx, sessaoId, A.token, { itemId: i1.id, valor: 11600 })).status).toBe(201);
      const b2 = (await board(ctx, sessaoId, B.token)).find((u) => u.id === i1.id);
      expect(Number(b2.melhorLance.valor)).toBe(11600);
      expect(b2.minhaPosicao).toBe(2);
    });

    test('encerramento de todos os bens → JULGAMENTO; ranking decrescente', async () => {
      for (const it of lic.itens) exigir(await encerrarUnidade(ctx, sessaoId, it.id, orgao.token), 201, 'encerrar item');
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.JULGAMENTO);
    });
  });

  describe('E. Julgamento: arrematantes declarados; fase recursal', () => {
    test('só o órgão dono declara; maior lance ≥ mínimo → ACEITO + arrematação', async () => {
      expect((await http().post(`/api/leilao/licitacao/${lic.id}/arrematantes/declarar`).set(bearer(outro.token))).status).toBe(403);
      expect((await http().post(`/api/leilao/licitacao/${lic.id}/arrematantes/declarar`).set(bearer(A.token))).status).toBe(403);
      const r = await http().post(`/api/leilao/licitacao/${lic.id}/arrematantes/declarar`).set(bearer(orgao.token));
      expect(r.status).toBe(201);
      expect(r.body.declaradas).toEqual(['Item 1', 'Item 2']);
      const arr = await arrematacoes();
      expect(arr.map((a: any) => [a.numero_unidade, a.fornecedor_id, Number(a.valor), a.status])).toEqual([
        [1, A.id, 11600, 'DECLARADA'],
        [2, B.id, 650, 'DECLARADA'],
      ]);
      const lu = await q(`SELECT unidade_id::text AS u, fornecedor_id, situacao FROM licitantes_unidade WHERE licitacao_id = $1 AND situacao = 'ACEITO'`, [lic.id]);
      expect(lu).toHaveLength(2);
      // idempotente
      expect((await http().post(`/api/leilao/licitacao/${lic.id}/arrematantes/declarar`).set(bearer(orgao.token))).body.declaradas).toEqual([]);
    });

    test('sem habilitação (art. 31 §4º); pagamento e adjudicação só depois da fase recursal', async () => {
      const hab = await http().post(`/api/licitacoes/${lic.id}/atos/INICIAR_HABILITACAO`).set(bearer(orgao.token)).send({});
      expect([400, 409]).toContain(hab.status);
      expect(JSON.stringify(hab.body)).toMatch(/não se aplica/);
      const conv = await http().post(`/api/leilao/licitacao/${lic.id}/pagamento/convocar`).set(bearer(orgao.token));
      expect(conv.status).toBe(409);
      expect(conv.body.message).toMatch(/intenção de recurso/);
      const adj = await adjudicarResultado(ctx, lic.id, orgao.token);
      expect(adj.status).toBe(400);
      exigir(await abrirJanelaIntencao(ctx, sessaoId, orgao.token), 201, 'abrir janela no JULGAMENTO');
      await encerrarJanelaNoRelogio(ctx, sessaoId);
      const ok = await http().post(`/api/leilao/licitacao/${lic.id}/pagamento/convocar`).set(bearer(orgao.token));
      expect(ok.status).toBe(201);
      expect(ok.body.convocadas).toBe(2);
      expect((await arrematacoes()).every((a: any) => a.status === 'AGUARDANDO_PAGAMENTO' && a.prazo_pagamento)).toBe(true);
    });
  });

  describe('F. Pagamento (art. 31 §4º) e inadimplência (Dec. 11.461 art. 26 §3º)', () => {
    test('arrematante informa o pagamento; só ele; comprovante sigiloso', async () => {
      const [a1, a2] = await arrematacoes();
      const alheio = await http().post(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a1.id}/pagamento`).set(bearer(B.token)).attach('comprovante', PDF_E7C, { filename: 'c.pdf', contentType: 'application/pdf' });
      expect(alheio.status).toBe(404);
      const r = await http().post(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a1.id}/pagamento`).set(bearer(A.token)).attach('comprovante', PDF_E7C, { filename: 'comprovante.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      expect((await http().get(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a1.id}/comprovante`).set(bearer(A.token))).status).toBe(200);
      expect((await http().get(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a1.id}/comprovante`).set(bearer(B.token))).status).toBe(404);
      expect((await http().get(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a1.id}/comprovante`).set(bearer(orgao.token))).status).toBe(200);
      expect((await http().get(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a1.id}/comprovante`)).status).toBe(401);
      // fornecedor vê só as suas arrematações
      const pB = (await painel(B.token)).body;
      expect(pB.arrematacoes.map((a: any) => a.id)).toEqual([a2.id]);
      exigir(await http().post(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a1.id}/confirmar-pagamento`).set(bearer(orgao.token)), 201, 'confirmar pagamento');
    });

    test('inadimplência: só depois do prazo; o lance subsequente (A, R$ 600) é convocado', async () => {
      const [, a2] = await arrematacoes();
      const cedo = await http().post(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a2.id}/inadimplencia`).set(bearer(orgao.token)).send({ motivo: 'Não pagou no prazo do edital' });
      expect(cedo.status).toBe(409);
      await q(`UPDATE leilao_arrematacoes SET prazo_pagamento = now() - interval '1 day' WHERE id = $1`, [a2.id]);
      const r = await http().post(`/api/leilao/licitacao/${lic.id}/arrematacoes/${a2.id}/inadimplencia`).set(bearer(orgao.token)).send({ motivo: 'Não pagou no prazo do edital' });
      expect(r.status).toBe(201);
      expect(r.body.proximoConvocado).toBe(true);
      const arr = await arrematacoes();
      expect(arr.map((a: any) => [a.numero_unidade, a.ordem, a.fornecedor_id, Number(a.valor), a.status])).toEqual([
        [1, 1, A.id, 11600, 'PAGA'],
        [2, 1, B.id, 650, 'INADIMPLENTE'],
        [2, 2, A.id, 600, 'AGUARDANDO_PAGAMENTO'],
      ]);
      const [lu] = await q(`SELECT situacao FROM licitantes_unidade WHERE unidade_id = $1 AND fornecedor_id = $2`, [lic.itens[1].id, B.id]);
      expect(lu.situacao).toBe('DESCLASSIFICADO');
      exigir(
        await http().post(`/api/leilao/licitacao/${lic.id}/arrematacoes/${arr[2].id}/pagamento`).set(bearer(A.token)).attach('comprovante', PDF_E7C, { filename: 'c2.pdf', contentType: 'application/pdf' }),
        201,
        'pagamento item 2',
      );
      exigir(await http().post(`/api/leilao/licitacao/${lic.id}/arrematacoes/${arr[2].id}/confirmar-pagamento`).set(bearer(orgao.token)), 201, 'confirmar item 2');
    });
  });

  describe('G. Adjudicação → homologação → termo de arrematação → concluir; PNCP', () => {
    test('adjudica e homologa com os valores arrematados; termo em vez de contrato', async () => {
      exigir(await adjudicarResultado(ctx, lic.id, orgao.token), 200, 'adjudicar');
      const itens = await q(`SELECT numero_item, status::text AS s, fornecedor_vencedor_id, valor_total_homologado FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`, [lic.id]);
      expect(itens.map((i: any) => [i.numero_item, i.s, i.fornecedor_vencedor_id, Number(i.valor_total_homologado)])).toEqual([
        [1, 'ADJUDICADO', A.id, 11600],
        [2, 'ADJUDICADO', A.id, 600],
      ]);
      pncpMock.limpar();
      const h = await homologarResultado(ctx, lic.id, orgao.token);
      expect(h.status).toBe(200);
      expect(h.body.valorHomologado).toBe(12200);
      expect(h.body.instrumentos.tipo).toBe('TERMO');
      expect(h.body.instrumentos.termos).toHaveLength(2);
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM contratos WHERE licitacao_id = $1`, [lic.id]);
      expect(n).toBe(0);
      const arr = await arrematacoes();
      const paga = arr.find((a: any) => a.status === 'PAGA');
      expect((await http().get(`/api/leilao/licitacao/${lic.id}/arrematacoes/${paga.id}/termo`).set(bearer(A.token))).status).toBe(200);
      expect((await http().get(`/api/leilao/licitacao/${lic.id}/arrematacoes/${paga.id}/termo`).set(bearer(B.token))).status).toBe(404);
      const concluir = await http().post(`/api/licitacoes/${lic.id}/atos/CONCLUIR`).set(bearer(orgao.token)).send({});
      expect([200, 201]).toContain(concluir.status);
      expect((await buscarLicitacao(ctx, lic)).situacao).toBe('CONCLUIDA');
    });

    test('PNCP: compra do leilão (modalidade, critério maior lance, bens móveis) e resultado por item', async () => {
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const [compra] = pncpMock.filtrar('POST', /\/compras$/).filter((c) => JSON.stringify(c.corpo).includes(lic.numero_processo));
      expect(compra).toBeDefined();
      const dto = jsonDaParteMultipart(compra.corpo, 'compra');
      expect(dto).toMatchObject({ amparoLegalId: 4, tipoInstrumentoConvocatorioId: 1, modoDisputaId: 1 });
      expect(dto.itensCompra.map((i: any) => [i.criterioJulgamentoId, i.materialOuServico, i.itemCategoriaId, i.tipoBeneficioId, i.valorUnitarioEstimado])).toEqual([
        [5, 'M', 2, 5, 10000],
        [5, 'M', 2, 5, 500],
      ]);
      const fila = await q(`SELECT tipo::text AS tipo, status::text AS status FROM pncp_sync WHERE licitacao_id::text = $1 ORDER BY created_at`, [lic.id]);
      expect(fila.map((f: any) => f.tipo)).toEqual(expect.arrayContaining(['COMPRA', 'ITEM', 'RESULTADO']));
      expect(fila.filter((f: any) => f.tipo === 'RESULTADO').every((f: any) => f.status === 'ENVIADO')).toBe(true);
      const res = pncpMock.filtrar('POST', /\/itens\/1\/resultados$/).map((r) => r.corpo).find((c: any) => Number(c.valorTotalHomologado) === 11600);
      expect(res).toMatchObject({ niFornecedor: A.cnpj.replace(/\D/g, ''), valorTotalHomologado: 11600 });
    });
  });

  describe('H. LOTE na direção MAIOR (fim da lacuna do ranking crescente)', () => {
    let licL: LicitacaoFixture;
    let loteId: string;
    let sL: string;

    test('lote: proposta = soma; lances sobem; melhor = maior; arrematante = maior; rateio soma o lance', async () => {
      licL = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.LEILAO, {
        criterio: CriterioJulgamento.MAIOR_LANCE,
        tipo_contratacao: TipoContratacao.ALIENACAO,
        itens: [
          { descricao: 'Sucata A', quantidade: 1, valor_unitario_estimado: 100 },
          { descricao: 'Sucata B', quantidade: 1, valor_unitario_estimado: 100 },
        ],
        extras: { base_lance: 'TOTAL_LOTE', usa_lotes: true, diferenca_minima_lances: 1, tratamento_diferenciado_mpe: false },
      });
      exigir(await http().put(`/api/leilao/licitacao/${licL.id}/configuracao`).set(bearer(orgao.token)).send({ tipo_leiloeiro: 'SERVIDOR', servidor_nome: 'Servidora', forma_pagamento: 'A_VISTA', prazo_pagamento_dias_uteis: 1 }), 200, 'config');
      for (const it of licL.itens) {
        exigir(await http().put(`/api/leilao/licitacao/${licL.id}/bens/${it.id}`).set(bearer(orgao.token)).send({ tipo_bem: 'MOVEL', descricao: 'Sucata metálica', valor_avaliacao: 150, valor_minimo: 100, localizacao: 'Depósito' }), 200, 'bem');
      }
      const lote = await http().post('/api/lotes').set(bearer(orgao.token)).send({ numero: 1, descricao: 'Sucatas', licitacao_id: licL.id });
      exigir(lote, 201, 'lote');
      loteId = lote.body.id;
      for (const it of licL.itens) exigir(await http().post(`/api/lotes/${loteId}/itens/${it.id}`).set(bearer(orgao.token)), 201, 'item no lote');
      await levarAteFase(ctx, licL, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await enviarProposta(ctx, A, licL, [120, 130]); // 250
      await enviarProposta(ctx, B, licL, [150, 110]); // 260 ← maior proposta
      await enviarProposta(ctx, C, licL, [100, 100]); // 200
      await abrirSessaoAgora(ctx, licL);
      exigir(await http().put(`/api/licitacoes/${licL.id}/avancar-fase`).set(bearer(orgao.token)).send({}), 200, 'encerrar acolhimento');
      const props: any[] = await q(`SELECT id FROM propostas WHERE licitacao_id = $1`, [licL.id]);
      for (const p of props) exigir(await http().put(`/api/propostas/${p.id}/classificar`).set(bearer(orgao.token)), 200, 'classificar');
      sL = await abrirSalaEIniciar(ctx, licL, [loteId]);

      let u = (await board(ctx, sL, C.token)).find((x) => x.id === loteId);
      expect(Number(u.melhorLance.valor)).toBe(260);
      expect(u.minhaPosicao).toBe(3); // proposta de C (200) é a menor: 3º no ranking DECRESCENTE
      expect((await lanceRest(ctx, sL, A.token, { loteId, valor: 240 })).status).toBe(400); // abaixo da própria proposta
      expect((await lanceRest(ctx, sL, A.token, { loteId, valor: 270 })).status).toBe(201);
      expect((await lanceRest(ctx, sL, C.token, { loteId, valor: 270.5 })).status).toBe(400); // cobre o melhor com diferença < 1
      expect((await lanceRest(ctx, sL, C.token, { loteId, valor: 300 })).status).toBe(201);
      u = (await board(ctx, sL, A.token)).find((x) => x.id === loteId);
      expect(Number(u.melhorLance.valor)).toBe(300);
      expect(u.minhaPosicao).toBe(2);
      const ativos = await q(
        `SELECT fornecedor_id, valor FROM lances WHERE lote_id = $1 AND item_id IS NULL AND cancelado = false ORDER BY valor DESC`,
        [loteId],
      );
      expect(ativos.map((l: any) => Number(l.valor))[0]).toBe(300);
      const [melhorLote] = await q(`SELECT melhor_lance_valor, melhor_lance_fornecedor_id FROM lotes_licitacao WHERE id = $1`, [loteId]);
      expect([Number(melhorLote.melhor_lance_valor), melhorLote.melhor_lance_fornecedor_id]).toEqual([300, C.id]);

      exigir(await encerrarUnidade(ctx, sL, loteId, orgao.token), 201, 'encerrar lote');
      const d = await http().post(`/api/leilao/licitacao/${licL.id}/arrematantes/declarar`).set(bearer(orgao.token));
      exigir(d, 201, 'declarar lote');
      const [arr] = await q(`SELECT fornecedor_id, valor, tipo_unidade FROM leilao_arrematacoes WHERE licitacao_id = $1`, [licL.id]);
      expect([arr.fornecedor_id, Number(arr.valor), arr.tipo_unidade]).toEqual([C.id, 300, 'LOTE']);
      const [lanceC] = await q(`SELECT id FROM lances WHERE lote_id = $1 AND item_id IS NULL AND fornecedor_id = $2 AND valor = 300`, [loteId, C.id]);
      const [{ soma }] = await q(`SELECT SUM(valor_total) AS soma FROM lances WHERE lance_lote_id = $1`, [lanceC.id]);
      expect(Number(soma)).toBe(300);
    });
  });
});
