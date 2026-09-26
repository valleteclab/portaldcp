/**
 * ============================================================================
 * E7c — CONCURSO (Lei 14.133/2021 arts. 6º XXXIX, 30, 33 III, 37, 55 IV, 93)
 * ============================================================================
 *
 *  A. Criação: concurso só por melhor técnica/conteúdo artístico.
 *  B. Edital: regulamento (art. 30 I a III), prêmio = item único, quesitos e
 *     banca (≥ 3 — art. 37 §1º); 35 dias úteis (art. 55 IV).
 *  C. Inscrição com trabalho sob CÓDIGO + envelope de identificação; a rota de
 *     propostas não inscreve; arquivo que identifica o autor é recusado.
 *  D. SIGILO DE AUTORIA até o julgamento: painel do órgão/banca só com
 *     códigos; rotas genéricas do julgamento técnico recusam; identificação
 *     fechada; outro participante não vê trabalho alheio.
 *  E. Banca: só membros; notas por código; julgamento publicado (JULGAR_CONCURSO)
 *     revela a autoria e a classificação.
 *  F. Qualificação do vencedor (art. 30 I): não qualificado → próximo.
 *  G. Recurso (janela no JULGAMENTO), adjudicação, homologação, premiação e
 *     cessão de direitos (art. 30 parágrafo único; art. 93), pagamento, concluir.
 *  H. PNCP: modalidade concurso, critério conteúdo artístico, modo fechado,
 *     resultado do vencedor pessoa física.
 */
import {
  AppE2E,
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  fecharSockets,
  levarAteFase,
  pncpMock,
} from './support';
import { jsonDaParteMultipart, pararTodosOsCrons, vincularOrgaoAoPncp } from './support/pregao';
import { precluirIntencaoDeRecurso } from './support/recursos';
import { adjudicarResultado, homologarResultado } from './support/resultado';
import { PDF_E7C, criarPessoaFisica, exigir } from './support/modalidades-especiais';
import { CriterioJulgamento, FaseLicitacao, ModalidadeLicitacao, ModoDisputa, TipoContratacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E7c — Concurso (art. 30)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outro: OrgaoFixture;
  let P1: FornecedorFixture; // pessoa física
  let P2: FornecedorFixture;
  let P3: FornecedorFixture; // pessoa física
  let banca: UsuarioOrgaoFixture[];
  let intruso: UsuarioOrgaoFixture;
  let lic: LicitacaoFixture;
  let quesitos: Array<{ id: string }>;
  const trabalhos: Record<string, { id: string; codigo: string }> = {};
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);
  const base = () => `/api/concurso/licitacao/${lic.id}`;
  const inscrever = (f: FornecedorFixture, titulo: string, nomeArquivo = 'trabalho.pdf') =>
    http()
      .post(`${base()}/trabalho`)
      .set(bearer(f.token))
      .field('titulo', titulo)
      .field('resumo', 'Proposta de mural')
      .field('declaracao_autoria', 'true')
      .field('declaracao_cessao', 'true')
      .attach('trabalho', PDF_E7C, { filename: nomeArquivo, contentType: 'application/pdf' })
      .attach('identificacao', PDF_E7C, { filename: 'identificacao.pdf', contentType: 'application/pdf' });

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura do Concurso' });
    outro = await criarOrgao(ctx, { nome: 'Outra Prefeitura' });
    await vincularOrgaoAoPncp(ctx, orgao);
    P1 = await criarPessoaFisica(ctx, 'Joaquina Silveira Artista');
    P2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    P3 = await criarPessoaFisica(ctx, 'Benedito Pintor');
    banca = [await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao)];
    intruso = await criarUsuarioOrgao(ctx, orgao);
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  test('A. concurso só por melhor técnica ou conteúdo artístico (art. 33 III)', async () => {
    const r = await http()
      .post('/api/licitacoes')
      .set(bearer(orgao.token))
      .send({ numero_processo: `CONC-X-${Date.now()}`, orgao_id: orgao.id, objeto: 'Concurso de mural', modalidade: 'CONCURSO', criterio_julgamento: 'MENOR_PRECO', tipo_contratacao: 'SERVICO', valor_total_estimado: 1 });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/conteúdo artístico/);
  });

  describe('B. Edital: regulamento, quesitos, banca e publicação', () => {
    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.CONCURSO, {
        criterio: CriterioJulgamento.MELHOR_TECNICA,
        modo_disputa: ModoDisputa.FECHADO,
        tipo_contratacao: TipoContratacao.SERVICO,
        itens: [{ descricao: 'Prêmio ao vencedor do concurso', quantidade: 1, valor_unitario_estimado: 1 }],
        extras: { tratamento_diferenciado_mpe: false },
      });
    });

    test('publicação sem regulamento é recusada; regulamento valida o art. 30; prêmio vira o valor do item', async () => {
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const semReg = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(orgao.token)).send({});
      expect(semReg.status).toBe(400);
      const ruim = await http().put(`${base()}/regulamento`).set(bearer(orgao.token)).send({ natureza_trabalho: 'ARTISTICO', valor_premio: 20000 });
      expect(ruim.status).toBe(400);
      expect(JSON.stringify(ruim.body)).toMatch(/art\. 30, I/);
      expect((await http().put(`${base()}/regulamento`).set(bearer(outro.token)).send({})).status).toBe(403);
      const ok = await http()
        .put(`${base()}/regulamento`)
        .set(bearer(orgao.token))
        .send({
          natureza_trabalho: 'ARTISTICO',
          qualificacao_exigida: 'Artista plástico com portfólio',
          diretrizes_trabalho: 'Mural sobre a história do município',
          forma_apresentacao: 'Prancha A1 em PDF, sem identificação do autor',
          condicoes_realizacao: 'Execução em 60 dias após a premiação',
          tipo_retribuicao: 'PREMIO',
          valor_premio: 20000,
          elaboracao_projeto: true,
          exige_cessao_direitos: true,
        });
      expect(ok.status).toBe(200);
      const [it] = await q(`SELECT valor_total_estimado FROM itens_licitacao WHERE licitacao_id = $1`, [lic.id]);
      expect(Number(it.valor_total_estimado)).toBe(20000);
      const cfg = await http()
        .put(`/api/julgamento/licitacao/${lic.id}/tecnica/configuracao`)
        .set(bearer(orgao.token))
        .send({ quesitos: [{ descricao: 'Conceito artístico', peso: 2, notaMaxima: 10 }, { descricao: 'Exequibilidade', peso: 1, notaMaxima: 10 }] });
      exigir(cfg, 200, 'quesitos');
      quesitos = cfg.body.quesitos;
      exigir(await http().put(`/api/julgamento/licitacao/${lic.id}/tecnica/comissao`).set(bearer(orgao.token)).send({ usuarioIds: banca.map((b) => b.id) }), 200, 'banca');
    });

    test('publicado com 35 dias úteis (art. 55 IV); inscrições abertas', async () => {
      const pz = await http().get(`/api/publicacao/licitacao/${lic.id}/prazos`).set(bearer(orgao.token));
      expect(pz.status).toBe(200);
      expect(pz.body.dias_uteis).toBe(35);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const pub = await http().get(base());
      expect(pub.status).toBe(200);
      expect(pub.body.regulamento.natureza_trabalho).toBe('ARTISTICO');
      expect(pub.body.inscricaoAberta).toBe(true);
      const [tr] = await q(`SELECT dados FROM licitacao_transicoes WHERE licitacao_id = $1 AND ato = 'PUBLICAR'`, [lic.id]);
      expect(tr).toBeDefined();
    });
  });

  describe('C. Inscrição com trabalho sob código', () => {
    test('rota de propostas não inscreve no concurso; arquivo que identifica o autor é recusado', async () => {
      const prop = await http()
        .post('/api/propostas')
        .set(bearer(P1.token))
        .send({ licitacao_id: lic.id, declaracao_termos: true, declaracao_integridade: true, declaracao_inexistencia_fatos: true, declaracao_menor: true, itens: [{ item_licitacao_id: lic.itens[0].id, valor_unitario: 20000 }] });
      expect(prop.status).toBe(400);
      expect(prop.body.message).toMatch(/painel do concurso/);
      const ident = await inscrever(P1, 'Raízes', 'mural-joaquina-silveira.pdf');
      expect(ident.status).toBe(400);
      expect(ident.body.message).toMatch(/identifica o autor/);
    });

    test('três inscrições; código anônimo; segunda inscrição do mesmo participante → 409', async () => {
      for (const [f, t] of [
        [P1, 'Raízes'],
        [P2, 'Maré'],
        [P3, 'Horizonte'],
      ] as Array<[FornecedorFixture, string]>) {
        const r = await inscrever(f, t);
        expect(r.status).toBe(201);
        expect(r.body.codigo).toMatch(/^T-[A-Z2-9]{5}$/);
        trabalhos[f.id] = { id: r.body.id, codigo: r.body.codigo };
      }
      expect((await inscrever(P1, 'Outro')).status).toBe(409);
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM propostas WHERE licitacao_id = $1 AND status = 'ENVIADA'`, [lic.id]);
      expect(n).toBe(3);
    });
  });

  describe('D. Sigilo de autoria até o julgamento', () => {
    beforeAll(async () => {
      await abrirSessaoAgora(ctx, lic);
      exigir(await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({}), 200, 'encerrar inscrições');
    });

    test('painel do órgão e da banca só com códigos — nenhum id/nome de autor', async () => {
      const p = await http().get(base()).set(bearer(orgao.token));
      expect(p.status).toBe(200);
      expect(p.body.autoriaRevelada).toBe(false);
      expect(p.body.trabalhos).toHaveLength(3);
      expect(p.body.trabalhos.every((t: any) => t.autor === null && t.fornecedorId === null)).toBe(true);
      const b = await http().get(`${base()}/banca`).set(bearer(banca[0].token));
      expect(b.status).toBe(200);
      const txt = JSON.stringify(b.body) + JSON.stringify(p.body);
      for (const f of [P1, P2, P3]) {
        expect(txt).not.toContain(f.id);
        expect(txt).not.toContain(f.razao_social);
      }
    });

    test('rotas genéricas do julgamento técnico recusam o concurso; identificação fechada; trabalho alheio invisível', async () => {
      expect((await http().get(`/api/julgamento/licitacao/${lic.id}/tecnica/notas`).set(bearer(orgao.token))).status).toBe(409);
      expect(
        (await http().put(`/api/julgamento/licitacao/${lic.id}/tecnica/notas`).set(bearer(banca[0].token)).send({ notas: [{ quesitoId: quesitos[0].id, fornecedorId: P1.id, nota: 1 }] })).status,
      ).toBe(409);
      const t1 = trabalhos[P1.id].id;
      expect((await http().get(`${base()}/trabalhos/${t1}/arquivo`).set(bearer(orgao.token))).status).toBe(200);
      expect((await http().get(`${base()}/trabalhos/${t1}/identificacao`).set(bearer(orgao.token))).status).toBe(404);
      expect((await http().get(`${base()}/trabalhos/${t1}/identificacao`).set(bearer(P1.token))).status).toBe(200);
      expect((await http().get(`${base()}/trabalhos/${t1}/arquivo`).set(bearer(P2.token))).status).toBe(404);
      expect((await http().get(`${base()}/trabalhos/${t1}/arquivo`).set(bearer(outro.token))).status).toBe(404);
      const meu = await http().get(base()).set(bearer(P2.token));
      expect(meu.body.trabalhos.map((t: any) => t.id)).toEqual([trabalhos[P2.id].id]);
      expect(meu.body.classificacao).toBeNull();
    });
  });

  describe('E. Banca e julgamento (JULGAR_CONCURSO)', () => {
    const notasDe: Record<string, number> = {};
    beforeAll(() => {
      notasDe[P2.id] = 9;
      notasDe[P1.id] = 8;
      notasDe[P3.id] = 7;
    });

    test('só membro da banca atribui nota; julgar antes de todas as notas → 400', async () => {
      const nota = (f: FornecedorFixture, v: number) => quesitos.map((qq) => ({ trabalhoId: trabalhos[f.id].id, quesitoId: qq.id, nota: v }));
      expect((await http().put(`${base()}/banca/notas`).set(bearer(intruso.token)).send({ notas: nota(P1, 5) })).status).toBe(403);
      expect((await http().put(`${base()}/banca/notas`).set(bearer(banca[0].token)).send({ notas: nota(P1, 11) })).status).toBe(400); // acima da nota máxima
      exigir(await http().put(`${base()}/banca/notas`).set(bearer(banca[0].token)).send({ notas: [...nota(P1, 8), ...nota(P2, 9), ...nota(P3, 7)] }), 200, 'notas membro 1');
      const cedo = await http().post(`${base()}/julgar`).set(bearer(orgao.token));
      expect(cedo.status).toBe(400);
      expect(JSON.stringify(cedo.body)).toMatch(/faltam/);
      for (const m of banca.slice(1)) {
        exigir(await http().put(`${base()}/banca/notas`).set(bearer(m.token)).send({ notas: [P1, P2, P3].flatMap((f) => nota(f, notasDe[f.id])) }), 200, 'notas');
      }
    });

    test('julgamento publicado: autoria revelada e classificação por nota técnica', async () => {
      expect((await http().post(`${base()}/julgar`).set(bearer(outro.token))).status).toBe(403);
      const r = await http().post(`${base()}/julgar`).set(bearer(orgao.token));
      expect(r.status).toBe(201);
      expect(r.body.autoriaRevelada).toBe(true);
      expect(r.body.classificacao.map((c: any) => c.codigo)).toEqual([trabalhos[P2.id].codigo, trabalhos[P1.id].codigo, trabalhos[P3.id].codigo]);
      expect(r.body.classificacao[1].autor).toBe(P1.razao_social);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.JULGAMENTO);
      expect((await http().get(`${base()}/trabalhos/${trabalhos[P1.id].id}/identificacao`).set(bearer(orgao.token))).status).toBe(200);
      // público vê a classificação depois do julgamento
      expect((await http().get(base())).body.classificacao).toHaveLength(3);
    });
  });

  describe('F. Qualificação do vencedor (art. 30 I)', () => {
    test('só o trabalho na vez; não qualificado → próximo; qualificado → resultado declarado', async () => {
      expect((await http().post(`${base()}/trabalhos/${trabalhos[P1.id].id}/qualificacao`).set(bearer(orgao.token)).send({ qualificado: true })).status).toBe(409);
      const semMotivo = await http().post(`${base()}/trabalhos/${trabalhos[P2.id].id}/qualificacao`).set(bearer(orgao.token)).send({ qualificado: false });
      expect(semMotivo.status).toBe(400);
      exigir(
        await http().post(`${base()}/trabalhos/${trabalhos[P2.id].id}/qualificacao`).set(bearer(orgao.token)).send({ qualificado: false, motivo: 'Sem portfólio exigido no regulamento' }),
        201,
        'não qualificar P2',
      );
      exigir(await http().post(`${base()}/trabalhos/${trabalhos[P1.id].id}/qualificacao`).set(bearer(orgao.token)).send({ qualificado: true }), 201, 'qualificar P1');
      const lu = await q(`SELECT fornecedor_id, situacao FROM licitantes_unidade WHERE licitacao_id = $1 ORDER BY situacao`, [lic.id]);
      expect(lu.find((x: any) => x.fornecedor_id === P1.id).situacao).toBe('ACEITO');
      expect(lu.find((x: any) => x.fornecedor_id === P2.id).situacao).toBe('DESCLASSIFICADO');
    });
  });

  describe('G. Recurso, adjudicação, homologação, premiação e cessão de direitos', () => {
    test('adjudicação só depois da janela de recurso; prêmio adjudicado ao vencedor; sem contrato', async () => {
      expect((await adjudicarResultado(ctx, lic.id, orgao.token)).status).toBe(400);
      const p = await http().get(base()).set(bearer(orgao.token));
      await precluirIntencaoDeRecurso(ctx, p.body.sessaoId, orgao.token);
      exigir(await adjudicarResultado(ctx, lic.id, orgao.token), 200, 'adjudicar');
      const [it] = await q(`SELECT status::text AS s, fornecedor_vencedor_id, valor_total_homologado FROM itens_licitacao WHERE licitacao_id = $1`, [lic.id]);
      expect([it.s, it.fornecedor_vencedor_id, Number(it.valor_total_homologado)]).toEqual(['ADJUDICADO', P1.id, 20000]);
      pncpMock.limpar();
      const h = await homologarResultado(ctx, lic.id, orgao.token);
      expect(h.status).toBe(200);
      expect(h.body.instrumentos.tipo).toBe('TERMO');
      expect(h.body.instrumentos.termos).toHaveLength(1);
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM contratos WHERE licitacao_id = $1`, [lic.id]);
      expect(n).toBe(0);
    });

    test('cessão de direitos (art. 93): pendente bloqueia concluir e pagamento; só o vencedor aceita', async () => {
      const concluir = await http().post(`/api/licitacoes/${lic.id}/atos/CONCLUIR`).set(bearer(orgao.token)).send({});
      expect(concluir.status).toBe(400);
      expect(JSON.stringify(concluir.body)).toMatch(/art\. 93/);
      const [pr] = await q(`SELECT id FROM concurso_premiacoes WHERE licitacao_id = $1`, [lic.id]);
      expect((await http().post(`${base()}/premiacao/${pr.id}/pagamento`).set(bearer(orgao.token)).send({})).status).toBe(409);
      expect((await http().post(`${base()}/premiacao/cessao`).set(bearer(P3.token))).status).toBe(404);
      expect((await http().get(`${base()}/premiacao/${pr.id}/termo`).set(bearer(P1.token))).status).toBe(200);
      expect((await http().get(`${base()}/premiacao/${pr.id}/termo`).set(bearer(P3.token))).status).toBe(404);
      exigir(await http().post(`${base()}/premiacao/cessao`).set(bearer(P1.token)), 201, 'cessão');
      exigir(await http().post(`${base()}/premiacao/${pr.id}/pagamento`).set(bearer(orgao.token)).send({ observacao: 'OB 123' }), 201, 'pagamento');
      const ok = await http().post(`/api/licitacoes/${lic.id}/atos/CONCLUIR`).set(bearer(orgao.token)).send({});
      expect([200, 201]).toContain(ok.status);
      expect((await buscarLicitacao(ctx, lic)).situacao).toBe('CONCLUIDA');
    });

    test('H. PNCP: concurso, conteúdo artístico, modo fechado; resultado do vencedor pessoa física', async () => {
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      // A compra vai ao PNCP já na publicação (a divulgação oficial é confirmada
      // por ela — arts. 54 e 174); o payload enviado fica na linha da fila.
      const [linha] = await q(
        `SELECT payload_enviado FROM pncp_sync WHERE licitacao_id = $1 AND tipo::text = 'COMPRA' AND status::text = 'ENVIADO'`,
        [lic.id],
      );
      expect(linha?.payload_enviado).toBeDefined();
      const dto = linha.payload_enviado;
      expect(dto).toMatchObject({ amparoLegalId: 3, modoDisputaId: 2, tipoInstrumentoConvocatorioId: 1 });
      expect(dto.itensCompra.map((i: any) => [i.criterioJulgamentoId, i.materialOuServico])).toEqual([[9, 'S']]);
      const res = pncpMock.filtrar('POST', /\/itens\/1\/resultados$/).map((r) => r.corpo).find((c: any) => c.niFornecedor === P1.cnpj);
      expect(res).toMatchObject({ tipoPessoaId: 'PF', valorTotalHomologado: 20000 });
    });
  });
});
