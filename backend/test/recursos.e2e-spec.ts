/**
 * ============================================================================
 * E5 — RECURSOS COM EFEITO, contra o banco real
 * ============================================================================
 *
 * Base legal: Lei 14.133/2021 art. 165 (intenção imediata sob pena de
 * preclusão — §1º I; fase recursal única após a habilitação — §1º II; razões
 * em 3 dias úteis; contrarrazões no mesmo prazo — §4º; reconsideração em 3
 * dias úteis ou encaminhamento à autoridade superior, que decide em 10 — §2º;
 * acolhimento invalida só os atos insuscetíveis de aproveitamento — §3º),
 * art. 168 (efeito suspensivo) e IN SEGES 73/2022 art. 40 (janela ≥ 10 min;
 * contrarrazões contadas do fim do prazo das razões).
 *
 *  A. Inabilitação reformada em reconsideração (pregão, 1 item, A 1º, D 2º, C 3º):
 *     A inabilitado → D aceito e habilitado; adjudicar sem janela → 400;
 *     janela aberta só pelo órgão dono (≥ 10 min); intenção só do licitante,
 *     só na janela (antes/depois → 409, preclusão); efeito suspensivo;
 *     razões só do recorrente e contrarrazões só dos demais, com arquivo;
 *     fora do prazo → 409; órgão B não decide; publicidade (licitantes veem
 *     tudo e baixam os arquivos; o público só o decidido); agente RECONSIDERA
 *     → A volta HABILITADO, D é invalidado (CLASSIFICADO, aceitação
 *     cancelada), licitação RECURSO → HABILITACAO (RETORNAR_HABILITACAO) e a
 *     adjudicação/homologação seguem com A vencedor.
 *  B. Recurso contra a habilitação de outro, MANTIDO pelo agente e decidido
 *     pela autoridade superior (usuário ADMIN): pregoeira não decide como
 *     autoridade; provido → A INABILITADO, licitação volta ao JULGAMENTO,
 *     D convocado para a aceitação, janela anterior superada (o novo
 *     resultado exige nova janela antes de adjudicar); razões fora do prazo →
 *     409 e o recurso de quem não as apresentou é "não conhecido".
 *  C. Migração (idempotente) do fluxo antigo: intenção por evento → recurso
 *     aguardando admissibilidade, janela reconstituída, contrarrazões JSON →
 *     tabela, decisão antiga → instância LEGADO sem efeito.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { aceitarPropostaDaUnidade, decidirAceitacao, enviarPropostaAdequada, valoresNoLimite } from './support/julgamento';
import { habilitarLicitante, inabilitarLicitante } from './support/habilitacao';
import {
  abrirJanelaIntencao,
  encerrarJanelaNoRelogio,
  enviarPeca,
  manifestarIntencao,
  painelRecursos,
  precluirIntencaoDeRecurso,
  vencerPrazoDoRecurso,
} from './support/recursos';
import { FaseLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { EtapaSessao } from '../src/sessao/entities/sessao-disputa.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { migrarRecursos } from '../src/sessao/migracao-recursos';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E5 — recursos com efeito', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  let orgao: OrgaoFixture;
  let orgaoB: OrgaoFixture;
  let pregoeira: UsuarioOrgaoFixture;
  let autoridade: UsuarioOrgaoFixture;
  let A: FornecedorFixture;
  let D: FornecedorFixture;
  let C: FornecedorFixture;
  let X: FornecedorFixture;

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Recursos E5' });
    orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura E5' });
    pregoeira = await criarUsuarioOrgao(ctx, orgao, { nome: 'Pregoeira E5', role: RoleUsuario.PREGOEIRO });
    autoridade = await criarUsuarioOrgao(ctx, orgao, { nome: 'Secretária de Administração E5', role: RoleUsuario.ADMIN });
    A = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    D = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    C = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    X = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  const situacoes = async (unidadeId: string) =>
    Object.fromEntries(
      (await q(`SELECT fornecedor_id, situacao FROM licitantes_unidade WHERE unidade_id = $1`, [unidadeId])).map((r: any) => [r.fornecedor_id, r.situacao]),
    );
  const historico = async (licId: string) =>
    (await http().get(`/api/licitacoes/${licId}/transicoes`).set(bearer(orgao.token)).expect(200)).body as any[];
  const etapa = async (sessaoId: string) => (await http().get(`/api/disputa-v2/sessao/${sessaoId}`).expect(200)).body.etapa;
  const recursoDe = (painel: any, fornecedorId: string, ato?: string) =>
    painel.recursos.find((r: any) => r.recorrente.id === fornecedorId && (!ato || r.atoRecorrido === ato));

  /** Convocação ATIVA do licitante na unidade (convocado automaticamente): envia a proposta e o agente aceita. */
  const aceitarConvocacaoAtiva = async (sessaoId: string, f: FornecedorFixture) => {
    const minhas = await http().get(`/api/julgamento/sessao/${sessaoId}/aceitacao`).set(bearer(f.token)).expect(200);
    const c = minhas.body.convocacoes.find((x: any) => x.status === 'AGUARDANDO_ENVIO');
    expect(c).toBeTruthy();
    expect((await enviarPropostaAdequada(ctx, sessaoId, c.id, f.token, valoresNoLimite(c.limites))).status).toBe(201);
    expect((await decidirAceitacao(ctx, sessaoId, c.id, orgao.token, 'aceitar')).status).toBe(201);
  };

  /** Pregão de 1 item (A 90, D 92, C 95), lances encerrados, sala na aceitação. */
  const pregaoJulgado = async () => {
    const p = await prepararPregaoEmDisputa(
      ctx,
      orgao,
      [
        { fornecedor: A, valores: [90] },
        { fornecedor: D, valores: [92] },
        { fornecedor: C, valores: [95] },
      ],
      { itens: [{ descricao: 'Notebook E5', quantidade: 1, valor_unitario_estimado: 100 }] },
    );
    const item = p.lic.itens[0].id;
    expect((await http().post(`/api/disputa-v2/sessao/${p.sessaoId}/encerrar-item/${item}`).set(bearer(orgao.token))).status).toBe(201);
    return { licId: p.lic.id, lic: p.lic, sessaoId: p.sessaoId, item };
  };

  // ==========================================================================
  describe('A. inabilitação reformada em reconsideração', () => {
    let licId: string;
    let lic: any;
    let sessaoId: string;
    let item: string;
    let recursoA: string;
    let recursoC: string;

    beforeAll(async () => {
      ({ licId, lic, sessaoId, item } = await pregaoJulgado());
      await aceitarPropostaDaUnidade(ctx, sessaoId, item, orgao.token, A.token);
      await inabilitarLicitante(ctx, licId, A, orgao.token, 'Certidão de regularidade fiscal federal vencida');
      await aceitarConvocacaoAtiva(sessaoId, D);
      await habilitarLicitante(ctx, licId, D, orgao.token);
    });

    test('resultado da habilitação: A INABILITADO, D HABILITADO; sala na intenção de recurso', async () => {
      expect(await situacoes(item)).toMatchObject({ [A.id]: 'INABILITADO', [D.id]: 'HABILITADO', [C.id]: 'CLASSIFICADO' });
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.HABILITACAO);
    });

    test('sem a janela de intenção, não se adjudica (art. 165 §1º I) e a intenção não é recebida (409)', async () => {
      const adj = await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(orgao.token)).send({});
      expect(adj.status).toBe(400);
      expect(JSON.stringify(adj.body)).toMatch(/intenção de recurso/);
      const i = await manifestarIntencao(ctx, sessaoId, A.token, { motivacao: 'A certidão estava válida', atoRecorrido: 'INABILITACAO' });
      expect(i.status).toBe(409);
    });

    test('janela: só o órgão dono abre, no mínimo 10 minutos (IN 73 art. 40)', async () => {
      expect((await abrirJanelaIntencao(ctx, sessaoId, A.token)).status).toBe(403);
      expect((await abrirJanelaIntencao(ctx, sessaoId, orgaoB.token)).status).toBe(403);
      expect((await abrirJanelaIntencao(ctx, sessaoId, pregoeira.token, 5)).status).toBe(400);
      const j = await abrirJanelaIntencao(ctx, sessaoId, pregoeira.token);
      expect(j.status).toBe(201);
      expect(j.body.minutos).toBeGreaterThanOrEqual(10);
      expect(new Date(j.body.fechaEm).getTime() - new Date(j.body.abertaEm).getTime()).toBeGreaterThanOrEqual(10 * 60_000);
      expect(await etapa(sessaoId)).toBe(EtapaSessao.INTENCAO_RECURSO);
      expect((await abrirJanelaIntencao(ctx, sessaoId, pregoeira.token)).status).toBe(409);
    });

    test('intenção pelo próprio licitante, na janela; quem não participa → 403; efeito suspensivo', async () => {
      const semAto = await manifestarIntencao(ctx, sessaoId, D.token, { motivacao: 'Quero recorrer da minha inabilitação', atoRecorrido: 'INABILITACAO' });
      expect(semAto.status).toBe(400); // D não foi inabilitado
      expect((await manifestarIntencao(ctx, sessaoId, X.token, { motivacao: 'Não participei mas recorro' })).status).toBe(403);
      // o token manda: id de outro no corpo → 403
      expect((await manifestarIntencao(ctx, sessaoId, C.token, { motivacao: 'Em nome de A', fornecedorId: A.id })).status).toBe(403);

      const a = await manifestarIntencao(ctx, sessaoId, A.token, {
        motivacao: 'A certidão federal estava válida na data da sessão',
        atoRecorrido: 'INABILITACAO',
      });
      expect(a.status).toBe(201);
      recursoA = a.body.id;
      const c = await manifestarIntencao(ctx, sessaoId, C.token, { motivacao: 'Discordo do resultado', atoRecorrido: 'OUTRO' });
      expect(c.status).toBe(201);
      recursoC = c.body.id;

      const adj = await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(orgao.token)).send({});
      expect(adj.status).toBe(400);
      expect(JSON.stringify(adj.body)).toMatch(/Janela de intenção de recurso em curso|art\. 168/);
    });

    test('encerrada a janela, a intenção preclui (409)', async () => {
      await encerrarJanelaNoRelogio(ctx, sessaoId);
      const tarde = await manifestarIntencao(ctx, sessaoId, D.token, { motivacao: 'Intenção depois do prazo', atoRecorrido: 'OUTRO' });
      expect(tarde.status).toBe(409);
      expect(tarde.body.message).toMatch(/preclusão/);
    });

    test('admissibilidade: admite a de A (licitação → RECURSO) e não admite a de C com o pressuposto ausente', async () => {
      expect((await http().post(`/api/recursos/${recursoA}/admitir`).set(bearer(orgaoB.token)).send({})).status).toBe(403);
      const adm = await http().post(`/api/recursos/${recursoA}/admitir`).set(bearer(pregoeira.token)).send({});
      expect(adm.status).toBe(201);
      expect(adm.body.status).toBe('AGUARDANDO_RAZOES');
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.RECURSO);
      const [t] = (await historico(licId)).filter((h) => h.ato === 'ABRIR_PRAZO_RECURSAL');
      expect(t).toMatchObject({ fase_de: 'HABILITACAO', fase_para: 'RECURSO' });

      const rec = await http()
        .post(`/api/recursos/${recursoC}/recusar`)
        .set(bearer(pregoeira.token))
        .send({ pressuposto: 'MOTIVACAO', motivo: 'A intenção não indica o ato recorrido nem a razão do inconformismo.' });
      expect(rec.status).toBe(201);
      expect(rec.body.status).toBe('NAO_CONHECIDO');
    });

    test('razões só do recorrente (com arquivo); contrarrazões só dos demais', async () => {
      expect((await enviarPeca(ctx, recursoA, 'razoes', D.token, 'Razões apresentadas por quem não recorreu.')).status).toBe(403);
      expect((await enviarPeca(ctx, recursoA, 'razoes', orgao.token, 'O órgão não registra razões pelo licitante.')).status).toBe(403);
      const r = await enviarPeca(ctx, recursoA, 'razoes', A.token, 'A certidão juntada tinha validade até o dia da sessão pública.');
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('CONTRARRAZOES');
      expect((await enviarPeca(ctx, recursoA, 'contrarrazoes', A.token, 'Contrarrazões do próprio recorrente.')).status).toBe(403);
      expect((await enviarPeca(ctx, recursoA, 'contrarrazoes', X.token, 'Contrarrazões de quem não participa.')).status).toBe(403);
      expect((await enviarPeca(ctx, recursoA, 'contrarrazoes', orgao.token, 'O órgão não registra contrarrazões.')).status).toBe(403);
      const c = await enviarPeca(ctx, recursoA, 'contrarrazoes', D.token, 'A certidão venceu antes da sessão pública; a inabilitação é correta.');
      expect(c.status).toBe(201);
    });

    test('publicidade: licitantes veem razões/contrarrazões e baixam os arquivos; o público, só o decidido', async () => {
      const pd = (await painelRecursos(ctx, sessaoId, D.token).expect(200)).body;
      const rA = recursoDe(pd, A.id);
      expect(rA.razoes).toMatch(/validade/);
      expect(rA.razoesArquivo).toMatchObject({ nome: 'razoes.pdf' });
      expect(rA.contrarrazoes).toHaveLength(1);
      expect(rA.contrarrazoes[0]).toMatchObject({ fornecedorId: D.id });
      const arq = await http().get(`/api/recursos/${recursoA}/razoes/arquivo`).set(bearer(C.token));
      expect(arq.status).toBe(200);
      expect(Buffer.from(arq.body).toString().startsWith('%PDF')).toBe(true);
      const arqC = await http().get(`/api/recursos/${recursoA}/contrarrazoes/${rA.contrarrazoes[0].id}/arquivo`).set(bearer(A.token));
      expect(arqC.status).toBe(200);
      expect((await http().get(`/api/recursos/${recursoA}/razoes/arquivo`).set(bearer(X.token))).status).toBe(404);
      expect((await http().get(`/api/recursos/${recursoA}/razoes/arquivo`).set(bearer(orgaoB.token))).status).toBe(404);

      for (const token of [null, orgaoB.token, X.token]) {
        const pub = (await painelRecursos(ctx, sessaoId, token).expect(200)).body;
        expect(recursoDe(pub, A.id)).toBeUndefined(); // ainda não decidido
        expect(recursoDe(pub, C.id)?.status).toBe('NAO_CONHECIDO');
        expect(pub.janelas).toBeUndefined();
      }
    });

    test('o agente só decide depois do contraditório; contrarrazões fora do prazo → 409; órgão B não decide', async () => {
      const cedo = await http()
        .post(`/api/recursos/${recursoA}/reconsiderar`)
        .set(bearer(pregoeira.token))
        .send({ reconsiderar: true, fundamentacao: 'Reconsidero: a certidão era válida na data.' });
      expect(cedo.status).toBe(409);
      await vencerPrazoDoRecurso(ctx, recursoA, 'prazo_contrarrazoes');
      expect((await enviarPeca(ctx, recursoA, 'contrarrazoes', C.token, 'Contrarrazões apresentadas depois do prazo.')).status).toBe(409);
      const b = await http()
        .post(`/api/recursos/${recursoA}/reconsiderar`)
        .set(bearer(orgaoB.token))
        .send({ reconsiderar: true, fundamentacao: 'Outro órgão tentando decidir o recurso.' });
      expect(b.status).toBe(403);
      const adj = await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(orgao.token)).send({});
      expect(adj.status).toBe(400); // efeito suspensivo (art. 168)
    });

    test('RECONSIDERADO: A volta HABILITADO, D invalidado, licitação volta à habilitação (RETORNAR_HABILITACAO)', async () => {
      const r = await http()
        .post(`/api/recursos/${recursoA}/reconsiderar`)
        .set(bearer(pregoeira.token))
        .send({ reconsiderar: true, fundamentacao: 'Reconsidero: a certidão federal era válida na data da sessão pública.' });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('PROVIDO');
      expect(r.body.instanciaDecisao).toBe('AGENTE');
      expect(r.body.efeitos).toMatchObject({ automatico: true, alterou_resultado: true });
      expect(r.body.efeitos.alteracoes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fornecedor_id: A.id, de: 'INABILITADO', para: 'HABILITADO', tipo: 'RESTAURADO' }),
          expect.objectContaining({ fornecedor_id: D.id, de: 'HABILITADO', para: 'CLASSIFICADO', tipo: 'INVALIDADO' }),
        ]),
      );
      expect(await situacoes(item)).toMatchObject({ [A.id]: 'HABILITADO', [D.id]: 'CLASSIFICADO', [C.id]: 'CLASSIFICADO' });
      const acD = await q(`SELECT status, decisao_motivo FROM aceitacoes_proposta WHERE unidade_id = $1 AND fornecedor_id = $2`, [item, D.id]);
      expect(acD.map((x: any) => x.status)).toEqual(['CANCELADA']);
      expect(acD[0].decisao_motivo).toMatch(/art\. 165 §3º/);

      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.HABILITACAO);
      const [t] = (await historico(licId)).filter((h) => h.ato === 'RETORNAR_HABILITACAO');
      expect(t).toMatchObject({ fase_de: 'RECURSO', fase_para: 'HABILITACAO', ator_tipo: 'USUARIO', ator_id: pregoeira.id });
      expect(t.motivo).toMatch(/provido/);
      const [rec] = await q(`SELECT efeitos FROM recursos_administrativos WHERE id = $1`, [recursoA]);
      expect(rec.efeitos).toMatchObject({ fase_concluida: true, ato_fase: 'RETORNAR_HABILITACAO' });
      expect(await etapa(sessaoId)).toBe(EtapaSessao.ADJUDICACAO);
    });

    test('decidido, o recurso é público (como a ata)', async () => {
      const pub = (await painelRecursos(ctx, sessaoId, null).expect(200)).body;
      expect(recursoDe(pub, A.id)).toMatchObject({ status: 'PROVIDO', decisao: expect.stringMatching(/certidão/) });
      expect((await http().get(`/api/recursos/${recursoA}/razoes/arquivo`)).status).toBe(401);
    });

    test('próximos passos coerentes: adjudicação e homologação com A vencedor', async () => {
      await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(orgao.token)).send({}).expect(200);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ADJUDICACAO);
      const adj = await http().get(`/api/sessao/${sessaoId}/adjudicacao`).set(bearer(orgao.token)).expect(200);
      expect(adj.body.itens[0].vencedor.fornecedorId).toBe(A.id);
      const h = await http().put(`/api/sessao/${sessaoId}/homologar`).set(bearer(orgao.token)).send({ nome: 'Prefeito E5', cargo: 'Autoridade competente' });
      expect(h.status).toBe(200);
      const [it] = await q(`SELECT fornecedor_vencedor_id FROM itens_licitacao WHERE id = $1`, [item]);
      expect(it.fornecedor_vencedor_id).toBe(A.id);
    });
  });

  // ==========================================================================
  describe('B. mantido pelo agente → autoridade superior provê contra a habilitação de outro', () => {
    let licId: string;
    let lic: any;
    let sessaoId: string;
    let item: string;
    let recursoD: string;
    let recursoC: string;

    beforeAll(async () => {
      ({ licId, lic, sessaoId, item } = await pregaoJulgado());
      await aceitarPropostaDaUnidade(ctx, sessaoId, item, orgao.token, A.token);
      await habilitarLicitante(ctx, licId, A, orgao.token);
      expect((await abrirJanelaIntencao(ctx, sessaoId, orgao.token)).status).toBe(201);
      const d = await manifestarIntencao(ctx, sessaoId, D.token, {
        motivacao: 'O atestado técnico de A não comprova a quantidade exigida',
        atoRecorrido: 'HABILITACAO_TERCEIRO',
        fornecedorAlvoId: A.id,
      });
      expect(d.status).toBe(201);
      recursoD = d.body.id;
      const c = await manifestarIntencao(ctx, sessaoId, C.token, { motivacao: 'Discordo da habilitação de A', atoRecorrido: 'OUTRO' });
      expect(c.status).toBe(201);
      recursoC = c.body.id;
      await encerrarJanelaNoRelogio(ctx, sessaoId);
      for (const id of [recursoD, recursoC]) {
        expect((await http().post(`/api/recursos/${id}/admitir`).set(bearer(pregoeira.token)).send({})).status).toBe(201);
      }
    });

    test('razões fora do prazo → 409; o recurso sem razões não é conhecido', async () => {
      await vencerPrazoDoRecurso(ctx, recursoC, 'prazo_razoes');
      expect((await enviarPeca(ctx, recursoC, 'razoes', C.token, 'Razões apresentadas depois do prazo legal.')).status).toBe(409);
      const p = (await painelRecursos(ctx, sessaoId, orgao.token).expect(200)).body;
      expect(recursoDe(p, C.id)).toMatchObject({ status: 'NAO_CONHECIDO', motivoNaoConhecimento: expect.stringMatching(/não apresentadas/) });
    });

    test('razões de D e contrarrazões de A; o agente MANTÉM e encaminha à autoridade (10 dias úteis)', async () => {
      expect((await enviarPeca(ctx, recursoD, 'razoes', D.token, 'O atestado de A comprova só metade da quantidade exigida no edital.', null)).status).toBe(201);
      expect((await enviarPeca(ctx, recursoD, 'contrarrazoes', A.token, 'O atestado somado ao contrato anterior comprova a quantidade.')).status).toBe(201);
      await vencerPrazoDoRecurso(ctx, recursoD, 'prazo_contrarrazoes');
      const m = await http()
        .post(`/api/recursos/${recursoD}/reconsiderar`)
        .set(bearer(pregoeira.token))
        .send({ reconsiderar: false, fundamentacao: 'Mantenho: os atestados somados comprovam a capacidade técnica.' });
      expect(m.status).toBe(201);
      expect(m.body.status).toBe('AGUARDANDO_AUTORIDADE');
      const prazo = new Date(m.body.prazoDecisaoAutoridade).getTime();
      expect(prazo - Date.now()).toBeGreaterThan(13 * 86_400_000); // 10 dias úteis ≥ 14 dias corridos
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.RECURSO);
    });

    test('só a autoridade superior decide: a pregoeira (quem manteve) → 403; conta do órgão sem nome/cargo → 400', async () => {
      const corpo = { provido: true, fundamentacao: 'Dou provimento: o atestado não comprova a quantidade mínima.', cargo: 'Secretária' };
      expect((await http().post(`/api/recursos/${recursoD}/decisao-autoridade`).set(bearer(pregoeira.token)).send(corpo)).status).toBe(403);
      expect((await http().post(`/api/recursos/${recursoD}/decisao-autoridade`).set(bearer(orgaoB.token)).send(corpo)).status).toBe(403);
      expect(
        (await http().post(`/api/recursos/${recursoD}/decisao-autoridade`).set(bearer(orgao.token)).send({ provido: true, fundamentacao: corpo.fundamentacao }))
          .status,
      ).toBe(400);
      const p = (await painelRecursos(ctx, sessaoId, orgao.token).expect(200)).body;
      expect(recursoDe(p, D.id)).toMatchObject({ status: 'AGUARDANDO_AUTORIDADE', autoridadeAtrasada: false, podeDecidirAutoridade: true });
    });

    test('PROVIDO pela autoridade: A INABILITADO, licitação volta ao JULGAMENTO e D é convocado para a aceitação', async () => {
      const r = await http()
        .post(`/api/recursos/${recursoD}/decisao-autoridade`)
        .set(bearer(autoridade.token))
        .send({ provido: true, fundamentacao: 'Dou provimento: o atestado não comprova a quantidade mínima exigida.', cargo: 'Secretária de Administração' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ status: 'PROVIDO', instanciaDecisao: 'AUTORIDADE' });
      expect(r.body.efeitos.alteracoes).toEqual([
        expect.objectContaining({ fornecedor_id: A.id, de: 'HABILITADO', para: 'INABILITADO', tipo: 'EXCLUIDO' }),
      ]);
      const [rec] = await q(`SELECT decidido_por, decidido_por_cargo, decidido_por_tipo FROM recursos_administrativos WHERE id = $1`, [recursoD]);
      expect(rec).toMatchObject({ decidido_por: 'Secretária de Administração E5', decidido_por_cargo: 'Secretária de Administração', decidido_por_tipo: 'USUARIO' });

      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.JULGAMENTO);
      const [t] = (await historico(licId)).filter((h) => h.ato === 'RETORNAR_JULGAMENTO');
      expect(t).toMatchObject({ fase_de: 'RECURSO', fase_para: 'JULGAMENTO', ator_id: autoridade.id });
      const s = await situacoes(item);
      expect(s[A.id]).toBe('INABILITADO');
      expect(s[D.id]).toBe('CONVOCADO_ACEITACAO');
      expect(await etapa(sessaoId)).toBe(EtapaSessao.ACEITACAO_PROPOSTA);
      const [j] = await q(`SELECT superada_em FROM janelas_intencao_recurso WHERE sessao_id = $1`, [sessaoId]);
      expect(j.superada_em).toBeTruthy();
    });

    test('o novo resultado exige nova janela de intenção antes de adjudicar', async () => {
      await aceitarConvocacaoAtiva(sessaoId, D);
      await habilitarLicitante(ctx, licId, D, orgao.token);
      const adj = await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(orgao.token)).send({});
      expect(adj.status).toBe(400);
      await precluirIntencaoDeRecurso(ctx, sessaoId, orgao.token);
      await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(orgao.token)).send({}).expect(200);
      const r = await http().get(`/api/sessao/${sessaoId}/adjudicacao`).set(bearer(orgao.token)).expect(200);
      expect(r.body.itens[0].vencedor.fornecedorId).toBe(D.id);
    });
  });
  // ==========================================================================
  describe('C. migração do fluxo antigo (idempotente)', () => {
    test('intenções por evento, janelas e contrarrazões JSON vão ao modelo novo; rodar de novo não duplica', async () => {
      const { sessaoId, licId } = await pregaoJulgado();
      // licitação "parada" em HABILITACAO no fluxo antigo
      await q(`UPDATE licitacoes SET fase = 'HABILITACAO' WHERE id = $1`, [licId]);
      const t0 = new Date(Date.now() - 3 * 3_600_000);
      await q(
        `INSERT INTO eventos_sessao (id, sessao_id, tipo, descricao, usuario_nome, is_sistema, created_at)
         VALUES (gen_random_uuid(), $1, 'PRAZO_RECURSAL_INICIADO', 'Prazo de 10 minutos para manifestacao de intencao de recurso iniciado', 'Pregoeiro', true, $2)`,
        [sessaoId, t0],
      );
      await q(
        `INSERT INTO eventos_sessao (id, sessao_id, tipo, descricao, fornecedor_identificador, usuario_nome, is_sistema, dados_adicionais, created_at)
         VALUES (gen_random_uuid(), $1, 'INTENCAO_RECURSO_REGISTRADA', 'Fornecedor manifestou intencao', $2, $2, false, $3, $4)`,
        [sessaoId, C.id, JSON.stringify({ motivacao: 'Discordo da habilitação' }), new Date(t0.getTime() + 60_000)],
      );
      await q(
        `INSERT INTO recursos_administrativos (id, sessao_id, licitacao_id, fornecedor_id, fornecedor_nome, status, intencao_aceita, razoes,
                                               data_razoes, contrarrazoes, decisao, data_decisao, data_intencao, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Legado D', 'IMPROVIDO', true, 'razões antigas', $4, $5, 'improvido (antigo)', $4, $4, $4, $4)`,
        [sessaoId, licId, D.id, new Date(t0.getTime() + 120_000), JSON.stringify([{ fornecedor_id: A.id, texto: 'contrarrazões antigas', data: t0.toISOString() }])],
      );

      const r1 = await migrarRecursos(ctx.dataSource);
      expect(r1.intencoes).toBe(1);
      expect(r1.contrarrazoes).toBe(1);
      expect(r1.recursos).toBe(1);
      expect(r1.janelas).toBeGreaterThanOrEqual(1);
      const r2 = await migrarRecursos(ctx.dataSource);
      expect(r2).toEqual({ janelas: 0, intencoes: 0, contrarrazoes: 0, recursos: 0 });

      const recs = await q(
        `SELECT fornecedor_id, status::text AS status, ato_recorrido, origem, instancia_decisao, janela_id, efeitos FROM recursos_administrativos WHERE sessao_id = $1`,
        [sessaoId],
      );
      const deC = recs.find((r: any) => r.fornecedor_id === C.id);
      expect(deC).toMatchObject({ status: 'INTENCAO', ato_recorrido: 'OUTRO', origem: 'MIGRACAO_E5' });
      expect(deC.janela_id).toBeTruthy();
      expect(recs.find((r: any) => r.fornecedor_id === D.id)).toMatchObject({ status: 'IMPROVIDO', instancia_decisao: 'LEGADO', origem: 'MIGRACAO_E5' });
      const [j] = await q(`SELECT fecha_em, aberta_em, origem FROM janelas_intencao_recurso WHERE sessao_id = $1`, [sessaoId]);
      expect(j.origem).toBe('MIGRACAO_E5');
      const cs = await q(`SELECT fornecedor_id, texto FROM recursos_contrarrazoes WHERE licitacao_id = $1`, [licId]);
      expect(cs).toEqual([{ fornecedor_id: A.id, texto: 'contrarrazões antigas' }]);
      // a intenção migrada aguarda o juízo de admissibilidade na tela nova
      const p = (await painelRecursos(ctx, sessaoId, orgao.token).expect(200)).body;
      expect(recursoDe(p, C.id)).toMatchObject({ status: 'INTENCAO', podeAdmitir: true });
    });
  });
});
