/**
 * ============================================================================
 * E7c — DIÁLOGO COMPETITIVO (Lei 14.133/2021 arts. 6º XLII e 32)
 * ============================================================================
 *
 *  A. Edital (§1º I e II): hipótese do art. 32, necessidades, exigências,
 *     critérios de pré-seleção; 25 dias úteis para manifestação de interesse.
 *  B. Manifestação de interesse (só no prazo; sem proposta nesta etapa).
 *  C. Pré-seleção objetiva (§1º II) e comissão com ≥ 3 servidores efetivos e
 *     assessor com termo de confidencialidade (§1º XI e §2º).
 *  D. Fase de diálogo: reuniões com UM licitante, registradas em ata e
 *     gravadas (§1º VI); soluções sigilosas entre licitantes (§1º IV).
 *  E. Conclusão motivada (§1º V e VIII) → edital da fase competitiva com
 *     ≥ 60 dias úteis e critério objetivo (§1º VIII); PNCP (edital + retificação).
 *  F. Fase competitiva só com os pré-selecionados → disputa, aceitação,
 *     habilitação, recurso, adjudicação, homologação e CONTRATO.
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
  enviarProposta,
  fecharSockets,
  levarAteFase,
  pdfDeTeste,
  pncpMock,
} from './support';
import { pararTodosOsCrons, vincularOrgaoAoPncp } from './support/pregao';
import { precluirIntencaoDeRecurso } from './support/recursos';
import { adjudicarResultado, homologarResultado } from './support/resultado';
import { aceitarPropostaDaUnidade } from './support/julgamento';
import { habilitarLicitante } from './support/habilitacao';
import { PDF_E7C, abrirSalaEIniciar, encerrarUnidade, exigir, lanceRest } from './support/modalidades-especiais';
import { CriterioJulgamento, FaseLicitacao, ModalidadeLicitacao, ModoDisputa, TipoContratacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const VIDEO = Buffer.from('00000018667479706d703432000000006d703432', 'hex');

describe('E7c — Diálogo competitivo (art. 32)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outro: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture;
  let F4: FornecedorFixture; // nunca manifestou interesse
  let comissao: UsuarioOrgaoFixture[];
  let lic: LicitacaoFixture;
  const part: Record<string, string> = {};
  const reunioes: Record<string, string> = {};
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);
  const base = () => `/api/dialogo-competitivo/licitacao/${lic.id}`;
  const painel = (token?: string) => (token ? http().get(base()).set(bearer(token)) : http().get(base()));

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura do Diálogo' });
    outro = await criarOrgao(ctx, { nome: 'Outra Prefeitura' });
    await vincularOrgaoAoPncp(ctx, orgao);
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F4 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    comissao = [await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao)];
    lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DIALOGO_COMPETITIVO, {
      criterio: CriterioJulgamento.MENOR_PRECO,
      modo_disputa: ModoDisputa.ABERTO,
      tipo_contratacao: TipoContratacao.SERVICO,
      itens: [{ descricao: 'Solução de mobilidade urbana inteligente', quantidade: 1, valor_unitario_estimado: 100000 }],
      extras: { natureza_objeto: 'ESPECIAL', tratamento_diferenciado_mpe: false },
    });
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  describe('A. Edital do diálogo (§1º I e II) e publicação (25 dias úteis)', () => {
    test('sem configuração não publica; hipótese do inciso I exige a, b e c; isolamento', async () => {
      await levarAteFase(ctx, lic, FaseLicitacao.APROVACAO_INTERNA);
      const sem = await http().put(`/api/licitacoes/${lic.id}/publicar-edital`).set(bearer(orgao.token)).send({});
      expect(sem.status).toBe(400);
      const cfg = {
        hipoteses: ['I_A'],
        justificativa_hipotese: 'Inovação tecnológica sem solução pronta no mercado',
        necessidades: 'Reduzir em 20% o tempo médio de deslocamento no transporte coletivo',
        exigencias_definidas: 'Integração com a bilhetagem eletrônica existente',
        criterios_preselecao: [{ id: 'C1', descricao: 'Atestado de solução similar' }, { id: 'C2', descricao: 'Equipe técnica mínima' }],
      };
      const ruim = await http().put(`${base()}/configuracao`).set(bearer(orgao.token)).send(cfg);
      expect(ruim.status).toBe(400);
      expect(JSON.stringify(ruim.body)).toMatch(/TRÊS condições/);
      expect((await http().put(`${base()}/configuracao`).set(bearer(outro.token)).send(cfg)).status).toBe(403);
      exigir(await http().put(`${base()}/configuracao`).set(bearer(orgao.token)).send({ ...cfg, hipoteses: ['I_A', 'I_B', 'I_C'] }), 200, 'configuração');
      const pz = await http().get(`/api/publicacao/licitacao/${lic.id}/prazos`).set(bearer(orgao.token));
      expect(pz.body.dias_uteis).toBe(25);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const pub = await painel();
      expect(pub.status).toBe(200);
      expect(pub.body.etapa).toBe('MANIFESTACAO');
      expect(pub.body.configuracao.criterios_preselecao).toHaveLength(2);
    });
  });

  describe('B. Manifestação de interesse', () => {
    test('proposta não cabe nesta etapa; manifestação curta recusada; três interessados', async () => {
      const prop = await http()
        .post('/api/propostas')
        .set(bearer(F1.token))
        .send({ licitacao_id: lic.id, declaracao_termos: true, declaracao_integridade: true, declaracao_inexistencia_fatos: true, declaracao_menor: true, itens: [{ item_licitacao_id: lic.itens[0].id, valor_unitario: 1 }] });
      expect(prop.status).toBe(400);
      expect(prop.body.message).toMatch(/fase competitiva/);
      expect((await http().post(`${base()}/manifestacao`).set(bearer(F1.token)).field('manifestacao', 'curta')).status).toBe(400);
      for (const f of [F1, F2, F3]) {
        const r = await http()
          .post(`${base()}/manifestacao`)
          .set(bearer(f.token))
          .field('manifestacao', 'Temos solução similar implantada e equipe técnica dedicada.')
          .attach('documento', PDF_E7C, { filename: 'atestado.pdf', contentType: 'application/pdf' });
        expect(r.status).toBe(201);
        part[f.id] = r.body.participantes[0].id;
      }
      const meu = (await painel(F2.token)).body;
      expect(meu.participantes).toHaveLength(1);
      expect(meu.participantes[0].razaoSocial).toBeUndefined();
      expect((await painel()).body.participantes).toHaveLength(0);
    });
  });

  describe('C. Pré-seleção (§1º II) e comissão (§1º XI; §2º)', () => {
    beforeAll(async () => {
      await abrirSessaoAgora(ctx, lic);
      exigir(await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({}), 200, 'encerrar manifestações');
    });

    test('manifestação depois do prazo → 409; etapa de pré-seleção', async () => {
      expect((await http().post(`${base()}/manifestacao`).set(bearer(F1.token)).field('manifestacao', 'Nova manifestação depois do prazo final.')).status).toBe(409);
      expect((await painel(orgao.token)).body.etapa).toBe('PRE_SELECAO');
    });

    test('critérios objetivos: admite todos que atendem; não selecionado só com critério não atendido e motivo', async () => {
      const dec = (f: FornecedorFixture, corpo: any) => http().post(`${base()}/participantes/${part[f.id]}/pre-selecao`).set(bearer(orgao.token)).send(corpo);
      expect((await dec(F3, { decisao: 'PRE_SELECIONADO', criterios_atendidos: ['C1'] })).status).toBe(400);
      expect((await dec(F3, { decisao: 'NAO_SELECIONADO', criterios_atendidos: ['C1', 'C2'], motivo: 'Motivo qualquer longo' })).status).toBe(400);
      exigir(await dec(F1, { decisao: 'PRE_SELECIONADO', criterios_atendidos: ['C1', 'C2'] }), 201, 'F1');
      exigir(await dec(F2, { decisao: 'PRE_SELECIONADO', criterios_atendidos: ['C1', 'C2'] }), 201, 'F2');
      exigir(await dec(F3, { decisao: 'NAO_SELECIONADO', criterios_atendidos: ['C1'], motivo: 'Não comprovou a equipe técnica mínima (C2)' }), 201, 'F3');
      expect((await http().post(`${base()}/participantes/${part[F1.id]}/pre-selecao`).set(bearer(outro.token)).send({ decisao: 'PRE_SELECIONADO' })).status).toBe(403);
    });

    test('comissão: 3 servidores efetivos; assessor contratado só com termo de confidencialidade', async () => {
      const inicio = () => http().post(`${base()}/iniciar-dialogo`).set(bearer(orgao.token));
      const r0 = await inicio();
      expect(r0.status).toBe(400);
      expect(JSON.stringify(r0.body)).toMatch(/§1º, XI/);
      const membros = comissao.map((u, i) => ({ usuario_id: u.id, vinculo: 'EFETIVO', papel: i === 0 ? 'PRESIDENTE' : 'MEMBRO' }));
      exigir(await http().put(`${base()}/comissao`).set(bearer(orgao.token)).send({ membros: [...membros, { nome: 'Consultor Externo', vinculo: 'ASSESSOR_CONTRATADO' }] }), 200, 'comissão');
      const r1 = await inicio();
      expect(r1.status).toBe(400);
      expect(JSON.stringify(r1.body)).toMatch(/§2º/);
      exigir(
        await http().put(`${base()}/comissao`).set(bearer(orgao.token)).send({ membros: [...membros, { nome: 'Consultor Externo', vinculo: 'ASSESSOR_CONTRATADO', termo_confidencialidade: true }] }),
        200,
        'comissão com termo',
      );
      exigir(await inicio(), 201, 'iniciar diálogo');
      expect((await painel(orgao.token)).body.etapa).toBe('DIALOGO');
    });
  });

  describe('D. Fase de diálogo: reuniões (§1º VI) e sigilo das soluções (§1º IV)', () => {
    test('reunião só com pré-selecionado; registro exige ata e gravação', async () => {
      const agendar = (f: FornecedorFixture) =>
        http().post(`${base()}/reunioes`).set(bearer(orgao.token)).send({ participanteId: part[f.id], agendada_para: new Date().toISOString(), pauta: 'Apresentação da solução', local_ou_link: 'https://reuniao.gov/abc' });
      expect((await agendar(F3)).status).toBe(400);
      const r1 = await agendar(F1);
      expect(r1.status).toBe(201);
      reunioes[F1.id] = r1.body.id;
      const r2 = await agendar(F2);
      reunioes[F2.id] = r2.body.id;
      const r3 = await agendar(F2);
      reunioes.extra = r3.body.id;
      const semGravacao = await http().post(`${base()}/reunioes/${reunioes[F1.id]}/registro`).set(bearer(orgao.token)).field('ata_texto', 'Ata da reunião com F1');
      expect(semGravacao.status).toBe(400);
      expect(semGravacao.body.message).toMatch(/áudio e vídeo/);
      exigir(
        await http()
          .post(`${base()}/reunioes/${reunioes[F1.id]}/registro`)
          .set(bearer(orgao.token))
          .field('ata_texto', 'Ata da reunião com F1: apresentada solução baseada em sensores.')
          .attach('gravacao', VIDEO, { filename: 'reuniao-f1.mp4', contentType: 'video/mp4' }),
        201,
        'registro F1',
      );
      exigir(
        await http()
          .post(`${base()}/reunioes/${reunioes[F2.id]}/registro`)
          .set(bearer(orgao.token))
          .field('gravacao_link', 'https://videos.prefeitura.gov/reuniao-f2')
          .attach('ata', PDF_E7C, { filename: 'ata-f2.pdf', contentType: 'application/pdf' }),
        201,
        'registro F2',
      );
    });

    test('pedido de reconsideração da não seleção (art. 165, II): só o interessado, com prazo; sigilo; provido → admitido ao diálogo', async () => {
      const pedir = (f: FornecedorFixture, razoes: string, arquivo = false) => {
        const r = http().post(`${base()}/reconsideracao`).set(bearer(f.token)).field('razoes', razoes);
        return arquivo ? r.attach('arquivo', PDF_E7C, { filename: 'razoes.pdf', contentType: 'application/pdf' }) : r;
      };
      expect((await pedir(F1, 'Pedido de quem já foi pré-selecionado no diálogo')).status).toBe(409);
      expect((await http().post(`${base()}/reconsideracao`).set(bearer(orgao.token)).send({ razoes: 'x'.repeat(30) })).status).toBe(403);
      expect((await pedir(F3, 'curta')).status).toBe(400);
      exigir(await pedir(F3, 'Comprovo a equipe técnica mínima (C2) com o atestado anexo, não analisado na pré-seleção.', true), 201, 'pedido F3');
      expect((await pedir(F3, 'Segundo pedido de reconsideração do mesmo interessado')).status).toBe(409);
      // sigilo: outro licitante não vê o pedido nem o arquivo; o órgão vê
      const p2 = (await painel(F2.token)).body;
      expect(JSON.stringify(p2)).not.toContain('equipe técnica mínima (C2)');
      expect((await http().get(`${base()}/arquivos/reconsideracao/${part[F3.id]}`).set(bearer(F2.token))).status).toBe(404);
      expect((await http().get(`${base()}/arquivos/reconsideracao/${part[F3.id]}`).set(bearer(F3.token))).status).toBe(200);
      const org = (await painel(orgao.token)).body.participantes.find((x: any) => x.id === part[F3.id]);
      expect(org.reconsideracao).toMatchObject({ status: 'PENDENTE', temArquivo: true });
      expect(org.reconsideracao.prazoDecisao).toBeTruthy();
      // pendente: a conclusão do diálogo espera a decisão
      const concl = await http().post(`${base()}/concluir-dialogo`).set(bearer(orgao.token)).send({ motivacao: 'Tentativa de concluir com pedido pendente de decisão.', solucao_identificada: 'x' });
      expect(concl.status).toBe(400);
      expect(JSON.stringify(concl.body)).toMatch(/art\. 165, II/);
      // decisão: só o órgão dono, com fundamentação
      const decidir = (token: string, corpo: any) => http().post(`${base()}/participantes/${part[F3.id]}/reconsideracao/decisao`).set(bearer(token)).send(corpo);
      expect((await decidir(F3.token, { provido: true, fundamentacao: 'x'.repeat(30) })).status).toBe(403);
      expect((await decidir(outro.token, { provido: true, fundamentacao: 'x'.repeat(30) })).status).toBe(403);
      expect((await decidir(orgao.token, { provido: true, fundamentacao: 'curta' })).status).toBe(400);
      exigir(await decidir(orgao.token, { provido: true, fundamentacao: 'O atestado anexo comprova o critério C2; o interessado é admitido ao diálogo.' }), 201, 'decisão');
      expect((await decidir(orgao.token, { provido: false, fundamentacao: 'x'.repeat(30) })).status).toBe(409);
      const eu = (await painel(F3.token)).body.participantes[0];
      expect(eu.situacao).toBe('PRE_SELECIONADO');
      expect(eu.reconsideracao).toMatchObject({ status: 'PROVIDA' });
      expect(eu.historico.map((h: any) => h.ato)).toEqual(['NAO_SELECIONADO', 'PEDIDO_RECONSIDERACAO', 'RECONSIDERACAO_PROVIDA']);
      // admitido: as reuniões com ele começam
      const r = await http().post(`${base()}/reunioes`).set(bearer(orgao.token)).send({ participanteId: part[F3.id], agendada_para: new Date().toISOString(), pauta: 'Apresentação da solução de F3' });
      expect(r.status).toBe(201);
      exigir(
        await http().post(`${base()}/reunioes/${r.body.id}/registro`).set(bearer(orgao.token)).field('ata_texto', 'Ata da reunião com F3').field('gravacao_link', 'https://videos.prefeitura.gov/reuniao-f3'),
        201,
        'registro F3',
      );
    });

    test('soluções e registros sigilosos: cada licitante vê só os seus; público nada', async () => {
      exigir(
        await http().post(`${base()}/documentos`).set(bearer(F1.token)).field('titulo', 'Solução F1 — sensores').attach('arquivo', PDF_E7C, { filename: 'solucao.pdf', contentType: 'application/pdf' }),
        201,
        'solução F1',
      );
      expect((await http().post(`${base()}/documentos`).set(bearer(F4.token)).field('titulo', 'Intrusa')).status).toBe(404);
      const p2 = (await painel(F2.token)).body;
      expect(p2.reunioes.map((r: any) => r.id).sort()).toEqual([reunioes[F2.id], reunioes.extra].sort());
      expect(p2.documentos).toHaveLength(0);
      expect(JSON.stringify(p2)).not.toContain('sensores');
      const pub = (await painel()).body;
      expect(pub.reunioes).toHaveLength(0);
      expect(pub.documentos).toHaveLength(0);
      const grav = `${base()}/arquivos/gravacao/${reunioes[F1.id]}`;
      expect((await http().get(grav).set(bearer(F1.token))).status).toBe(200);
      expect((await http().get(grav).set(bearer(F2.token))).status).toBe(404);
      expect((await http().get(grav).set(bearer(orgao.token))).status).toBe(200);
      expect((await http().get(grav).set(bearer(outro.token))).status).toBe(404);
      expect((await http().get(grav)).status).toBe(401);
      const [doc] = (await painel(orgao.token)).body.documentos;
      expect((await http().get(`${base()}/arquivos/documento/${doc.id}`).set(bearer(F2.token))).status).toBe(404);
      expect((await http().get(`${base()}/arquivos/manifestacao/${part[F1.id]}`).set(bearer(F2.token))).status).toBe(404);
    });
  });

  describe('E. Conclusão motivada e fase competitiva (§1º V e VIII)', () => {
    test('conclusão: pela rota própria, sem reunião pendente e com decisão fundamentada', async () => {
      const generico = await http().post(`/api/licitacoes/${lic.id}/atos/CONCLUIR_DIALOGO`).set(bearer(orgao.token)).send({ motivo: 'x' });
      expect(generico.status).toBe(400);
      const pend = await http().post(`${base()}/concluir-dialogo`).set(bearer(orgao.token)).send({ motivacao: 'Solução identificada com base nas reuniões realizadas.', solucao_identificada: 'Plataforma com sensores' });
      expect(pend.status).toBe(400);
      expect(JSON.stringify(pend.body)).toMatch(/sem registro/);
      exigir(await http().post(`${base()}/reunioes/${reunioes.extra}/cancelar`).set(bearer(orgao.token)).send({ motivo: 'Licitante desistiu da 2ª rodada' }), 201, 'cancelar');
      expect((await http().post(`${base()}/concluir-dialogo`).set(bearer(orgao.token)).send({ motivacao: 'curta' })).status).toBe(400);
      exigir(
        await http().post(`${base()}/concluir-dialogo`).set(bearer(orgao.token)).send({ motivacao: 'As reuniões demonstraram que a solução com sensores atende às necessidades.', solucao_identificada: 'Plataforma com sensores e integração à bilhetagem' }),
        201,
        'concluir diálogo',
      );
      const p = (await painel(orgao.token)).body;
      expect(p.etapa).toBe('CONCLUIDO');
      expect(p.licitacao.fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);
      const disputa = await http().post(`/api/licitacoes/${lic.id}/atos/INICIAR_DISPUTA`).set(bearer(orgao.token)).send({});
      expect(disputa.status).toBe(400);
      expect(JSON.stringify(disputa.body)).toMatch(/fase competitiva/);
    });

    test('fase competitiva: ≥ 60 dias úteis, critério válido e edital — publica e reabre o recebimento', async () => {
      const agora = Date.now();
      const dia = 86_400_000;
      const corpo = (dias: number, extra: Record<string, string> = {}) => ({
        especificacao_solucao: 'Plataforma de mobilidade com sensores e integração à bilhetagem',
        criterios_selecao: 'Menor preço global, atendida a especificação',
        criterio_julgamento: 'MENOR_PRECO',
        modo_disputa: 'ABERTO',
        data_inicio_acolhimento: new Date(agora - 60_000).toISOString(),
        data_fim_acolhimento: new Date(agora + dias * dia).toISOString(),
        data_abertura_sessao: new Date(agora + dias * dia).toISOString(),
        ...extra,
      });
      const enviar = (c: Record<string, string>, comEdital = true) => {
        let r = http().post(`${base()}/fase-competitiva`).set(bearer(orgao.token));
        for (const [k, v] of Object.entries(c)) r = r.field(k, v);
        return comEdital ? r.attach('edital', pdfDeTeste('Edital da fase competitiva'), { filename: 'edital-competitivo.pdf', contentType: 'application/pdf' }) : r;
      };
      const curto = await enviar(corpo(40));
      expect(curto.status).toBe(400);
      expect(JSON.stringify(curto.body)).toMatch(/60 dias úteis/);
      const semEdital = await enviar(corpo(120), false);
      expect(semEdital.status).toBe(400);
      expect(JSON.stringify(semEdital.body)).toMatch(/Anexe o edital/);
      const modo = await enviar(corpo(120, { criterio_julgamento: 'TECNICA_E_PRECO' }));
      expect(modo.status).toBe(400);
      expect(JSON.stringify(modo.body)).toMatch(/56 §2º/);
      pncpMock.limpar();
      const ok = await enviar(corpo(120));
      expect(ok.status).toBe(201);
      expect(ok.body.etapa).toBe('COMPETITIVA');
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect(l.data_limite_impugnacao).toBeNull();
      const edital = await http().get(`${base()}/edital-fase-competitiva`);
      expect(edital.status).toBe(200);
      // PNCP: documento (edital da fase competitiva) + retificação da compra
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      const fila = await q(`SELECT tipo::text AS tipo, status::text AS status, referencia FROM pncp_sync WHERE licitacao_id::text = $1`, [lic.id]);
      const doc = fila.find((f: any) => f.tipo === 'DOCUMENTO' && String(f.referencia?.titulo ?? '').includes('fase competitiva'));
      expect(doc?.status).toBe('ENVIADO');
      expect(fila.some((f: any) => f.tipo === 'RETIFICACAO_COMPRA' && f.status === 'ENVIADO')).toBe(true);
    });
  });

  describe('F. Fase competitiva só com os pré-selecionados → contrato', () => {
    let sessaoId: string;
    test('não pré-selecionado não apresenta proposta; pré-selecionados sim', async () => {
      const r = await http()
        .post('/api/propostas')
        .set(bearer(F4.token))
        .send({ licitacao_id: lic.id, declaracao_termos: true, declaracao_integridade: true, declaracao_inexistencia_fatos: true, declaracao_menor: true, itens: [{ item_licitacao_id: lic.itens[0].id, valor_unitario: 90000 }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/pré-selecionados/);
      await enviarProposta(ctx, F1, lic, [95000]);
      await enviarProposta(ctx, F2, lic, [98000]);
    });

    test('disputa, aceitação, habilitação, recurso, adjudicação, homologação e contrato', async () => {
      await abrirSessaoAgora(ctx, lic);
      exigir(await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({}), 200, 'encerrar recebimento');
      const props: any[] = await q(`SELECT id FROM propostas WHERE licitacao_id = $1`, [lic.id]);
      for (const p of props) exigir(await http().put(`/api/propostas/${p.id}/classificar`).set(bearer(orgao.token)), 200, 'classificar');
      sessaoId = await abrirSalaEIniciar(ctx, lic, [lic.itens[0].id]);
      expect((await lanceRest(ctx, sessaoId, F2.token, { itemId: lic.itens[0].id, valor: 90000 })).status).toBe(201);
      exigir(await encerrarUnidade(ctx, sessaoId, lic.itens[0].id, orgao.token), 201, 'encerrar');
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.JULGAMENTO);
      await aceitarPropostaDaUnidade(ctx, sessaoId, lic.itens[0].id, orgao.token, F2.token);
      expect((await habilitarLicitante(ctx, lic.id, F2, orgao.token)).status).toBe('HABILITADO');
      await precluirIntencaoDeRecurso(ctx, sessaoId, orgao.token);
      exigir(await adjudicarResultado(ctx, lic.id, orgao.token), 200, 'adjudicar');
      const h = await homologarResultado(ctx, lic.id, orgao.token);
      expect(h.status).toBe(200);
      expect(h.body.instrumentos.tipo).toBe('CONTRATO');
      const [c] = await q(`SELECT fornecedor_id, valor_global, status::text AS s FROM contratos WHERE licitacao_id = $1`, [lic.id]);
      expect([c.fornecedor_id, Number(c.valor_global), c.s]).toEqual([F2.id, 90000, 'AGUARDANDO_ASSINATURA']);
    });
  });
});
