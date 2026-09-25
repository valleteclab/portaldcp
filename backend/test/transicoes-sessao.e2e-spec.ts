/**
 * E1 — ATOS DA SALA (sessão pública / disputa-v2 / recursos) PELA MÁQUINA DE
 * ESTADOS, contra o banco real.
 *
 *  1. cada ato da sala que muda a fase vira linha em `licitacao_transicoes`,
 *     com o pregoeiro (usuário do órgão) como ator — e o relógio da disputa
 *     como SISTEMA; encerrado o último item, a licitação sai de EM_DISPUTA;
 *     o recurso leva a licitação a RECURSO e a decisão, de volta a ADJUDICACAO;
 *  2. licitação SUSPENSA: a sala recusa (409 / 'erro') iniciar item, lance,
 *     encerrar item e suspender a sessão — por REST e por socket — e o relógio
 *     não encerra itens; retomada a licitação, a sala volta a aceitar.
 */
import { Socket } from 'socket.io-client';
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
} from './support';
import {
  darLance,
  desligarLimiteDeRequisicoes,
  deslocarRelogioItem,
  entrarNaSala,
  iniciarItensNaSala,
  pararTodosOsCrons,
  tiqueRelogioDisputa,
} from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../src/licitacoes/entities/licitacao.entity';
import { EtapaSessao, StatusSessao } from '../src/sessao/entities/sessao-disputa.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const MIN = 60_000;

describe('E1 — atos da sala pela máquina de estados', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();

  const historico = async (licId: string, token: string) =>
    (await http().get(`/api/licitacoes/${licId}/transicoes`).set(bearer(token)).expect(200)).body as any[];
  const itemStatus = async (itemId: string) =>
    (await http().get(`/api/itens/${itemId}`).expect(200)).body.status_disputa;

  beforeAll(async () => {
    ctx = await criarApp();
    // relógio da disputa e transições por data só pelo "tique" manual
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
  });

  afterAll(async () => {
    fecharSockets();
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('1. rito da sala com histórico (pregoeiro como ator)', () => {
    let orgao: OrgaoFixture;
    let pregoeiro: UsuarioOrgaoFixture;
    let F1: FornecedorFixture;
    let F2: FornecedorFixture;
    let lic: LicitacaoFixture;
    let itemId: string;
    let sessaoId: string;
    const propostaId: Record<string, string> = {};
    let salaPregoeiro: Socket;
    let salaF1: Socket;
    let recursoId: string;

    const atoDo = (h: any[], ato: string) => h.filter((t) => t.ato === ato);
    const doPregoeiro = { ator_tipo: 'USUARIO' };

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura Sala E1' });
      pregoeiro = await criarUsuarioOrgao(ctx, orgao, { nome: 'Pregoeira Sala E1' });
      F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
        modo_disputa: ModoDisputa.ABERTO,
        itens: [{ descricao: 'Notebook E1', quantidade: 1, valor_unitario_estimado: 100 }],
      });
      itemId = lic.itens[0].id;
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      propostaId.F1 = (await enviarProposta(ctx, F1, lic, [90])).id;
      propostaId.F2 = (await enviarProposta(ctx, F2, lic, [95])).id;
      await abrirSessaoAgora(ctx, lic);
    });

    test('abrir a sessão encerra o acolhimento (ENCERRAR_ACOLHIMENTO pelo pregoeiro)', async () => {
      const criada = await http()
        .post(`/api/sessao/${lic.id}`)
        .set(bearer(pregoeiro.token))
        .send({ pregoeiroId: pregoeiro.id, pregoeiroNome: 'Pregoeira Sala E1' })
        .expect(201);
      sessaoId = criada.body.id;
      await http()
        .put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`)
        .set(bearer(pregoeiro.token))
        .send({ intervalo_minimo_lances_minutos: 0 })
        .expect(200);
      await http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(pregoeiro.token)).expect(200);

      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);
      const [t] = atoDo(await historico(lic.id, orgao.token), 'ENCERRAR_ACOLHIMENTO');
      expect(t).toMatchObject({
        fase_de: 'ACOLHIMENTO_PROPOSTAS',
        fase_para: 'ANALISE_PROPOSTAS',
        ...doPregoeiro,
        ator_id: pregoeiro.id,
      });
      expect(t.dados).toMatchObject({ origem: 'sessao', sessao_id: sessaoId });

      for (const id of Object.values(propostaId)) {
        await http().put(`/api/propostas/${id}/classificar`).set(bearer(pregoeiro.token)).expect(200);
      }
    });

    test('iniciar o item pela sala (socket) abre a disputa: INICIAR_DISPUTA com o pregoeiro', async () => {
      const p = await entrarNaSala(ctx, sessaoId, {
        id: pregoeiro.id,
        nome: 'Pregoeira Sala E1',
        tipo: 'PREGOEIRO',
        token: pregoeiro.token,
      });
      expect(p.resposta.evento).toBe('dados_iniciais');
      salaPregoeiro = p.socket;
      const r = await iniciarItensNaSala(salaPregoeiro, sessaoId, [itemId]);
      expect(r.evento).toBe('itens_iniciados');

      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.EM_DISPUTA);
      const [t] = atoDo(await historico(lic.id, orgao.token), 'INICIAR_DISPUTA');
      expect(t).toMatchObject({ fase_de: 'ANALISE_PROPOSTAS', fase_para: 'EM_DISPUTA', ...doPregoeiro, ator_id: pregoeiro.id });

      const f = await entrarNaSala(ctx, sessaoId, { id: F1.id, nome: F1.razao_social, tipo: 'FORNECEDOR', token: F1.token });
      expect(f.resposta.evento).toBe('dados_iniciais');
      salaF1 = f.socket;
      expect((await darLance(salaF1, sessaoId, itemId, 80)).ok).toBe(true);
    });

    test('último item encerrado pelo relógio: sessão sai da etapa de lances e a licitação de EM_DISPUTA (ENCERRAR_DISPUTA pelo SISTEMA)', async () => {
      await deslocarRelogioItem(ctx, itemId, { inicioHaMs: 11 * MIN, ultimoLanceHaMs: 11 * MIN });
      await tiqueRelogioDisputa(ctx);
      expect(await itemStatus(itemId)).toBe('ENCERRADO');

      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.JULGAMENTO);
      expect(l.data_fim_disputa).toBeTruthy();
      const s = (await http().get(`/api/disputa-v2/sessao/${sessaoId}`).expect(200)).body;
      expect(s.status).toBe(StatusSessao.EM_ANDAMENTO);
      expect(s.etapa).toBe(EtapaSessao.NEGOCIACAO);

      const h = await historico(lic.id, orgao.token);
      expect(atoDo(h, 'ENCERRAR_DISPUTA')).toHaveLength(1);
      expect(atoDo(h, 'ENCERRAR_DISPUTA')[0]).toMatchObject({ fase_de: 'EM_DISPUTA', fase_para: 'JULGAMENTO', ator_tipo: 'SISTEMA', ator_id: 'disputa-timer' });

      // tique seguinte não repete a transição (sessão fora do MODO_ABERTO)
      await tiqueRelogioDisputa(ctx);
      expect(atoDo(await historico(lic.id, orgao.token), 'ENCERRAR_DISPUTA')).toHaveLength(1);
    });

    test('convocar para a habilitação: INICIAR_HABILITACAO com o pregoeiro; reconvocar não duplica', async () => {
      await http().put(`/api/sessao/${sessaoId}/habilitacao/convocar/${F1.id}`).set(bearer(pregoeiro.token)).send({}).expect(200);
      await http().put(`/api/sessao/${sessaoId}/habilitacao/convocar/${F1.id}`).set(bearer(pregoeiro.token)).send({}).expect(200);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.HABILITACAO);
      const h = atoDo(await historico(lic.id, orgao.token), 'INICIAR_HABILITACAO');
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ fase_de: 'JULGAMENTO', fase_para: 'HABILITACAO', ...doPregoeiro, ator_id: pregoeiro.id });
      await http().put(`/api/sessao/${sessaoId}/habilitacao/aprovar/${F1.id}`).set(bearer(pregoeiro.token)).send({}).expect(200);
    });

    test('intenção admitida abre o prazo recursal: licitação vai a RECURSO (ABRIR_PRAZO_RECURSAL)', async () => {
      await http()
        .post(`/api/sessao/${sessaoId}/recursos/intencao`)
        .set(bearer(F2.token))
        .send({ motivacao: 'Proposta de F1 inexequível' })
        .expect(201);
      await http().put(`/api/sessao/${sessaoId}/recursos/encerrar-prazo`).set(bearer(pregoeiro.token)).send({}).expect(200);
      // encerrar o prazo de INTENÇÃO não muda a fase: o recurso só nasce na admissão
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.HABILITACAO);

      const adm = await http()
        .post(`/api/sessao/${sessaoId}/recursos/${F2.id}/admitir`)
        .set(bearer(pregoeiro.token))
        .send({ fornecedorNome: F2.razao_social, motivacao: 'Inexequibilidade' })
        .expect(201);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.RECURSO);
      const [t] = atoDo(await historico(lic.id, orgao.token), 'ABRIR_PRAZO_RECURSAL');
      expect(t).toMatchObject({ fase_de: 'HABILITACAO', fase_para: 'RECURSO', ...doPregoeiro, ator_id: pregoeiro.id });

      await http()
        .put(`/api/sessao/recursos/${adm.body.id}/razoes`)
        .set(bearer(F2.token))
        .send({ razoes: 'O preço de F1 está abaixo do custo.' })
        .expect(200);
      recursoId = adm.body.id;
    });

    test('decidido o último recurso, a licitação volta a ADJUDICACAO (DECIDIR_RECURSOS); adjudicar pela sala não duplica', async () => {
      await http()
        .put(`/api/sessao/recursos/${recursoId}/decidir`)
        .set(bearer(orgao.token))
        .send({ provido: false, decisao: 'Exequibilidade comprovada. Recurso improvido.', decididoPor: 'Prefeito E1' })
        .expect(200);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.ADJUDICACAO);
      expect(l.data_adjudicacao).toBeTruthy();
      const [t] = atoDo(await historico(lic.id, orgao.token), 'DECIDIR_RECURSOS');
      expect(t).toMatchObject({ fase_de: 'RECURSO', fase_para: 'ADJUDICACAO', ator_tipo: 'ORGAO', ator_id: orgao.id });
      expect(t.motivo).toMatch(/improvido/);

      await http().put(`/api/sessao/${sessaoId}/adjudicar-todos`).set(bearer(pregoeiro.token)).send({}).expect(200);
      const h = await historico(lic.id, orgao.token);
      expect(atoDo(h, 'ADJUDICAR')).toHaveLength(0);
    });

    test('homologar pela sala: HOMOLOGAR com o valor gravado na mesma transação', async () => {
      const r = await http()
        .put(`/api/sessao/${sessaoId}/homologar`)
        .set(bearer(pregoeiro.token))
        .send({ nome: 'Prefeito E1', cargo: 'Autoridade' })
        .expect(200);
      expect(r.body.totalHomologado).toBe(1);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.HOMOLOGACAO);
      expect(Number(l.valor_homologado)).toBeCloseTo(r.body.valorTotal, 2);
      expect(l.data_homologacao).toBeTruthy();
      const [t] = atoDo(await historico(lic.id, orgao.token), 'HOMOLOGAR');
      expect(t).toMatchObject({ fase_de: 'ADJUDICACAO', fase_para: 'HOMOLOGACAO', ...doPregoeiro, ator_id: pregoeiro.id });
      expect(t.dados).toMatchObject({ origem: 'sessao', totalHomologado: 1 });
    });

    test('a sequência completa do histórico segue o rito, sem saltos', async () => {
      const h = await historico(lic.id, orgao.token);
      const externos = h.map((t) => t.ato).slice(h.findIndex((t) => t.ato === 'PUBLICAR'));
      expect(externos).toEqual([
        'PUBLICAR',
        'INICIAR_ACOLHIMENTO',
        'ENCERRAR_ACOLHIMENTO',
        'INICIAR_DISPUTA',
        'ENCERRAR_DISPUTA',
        'INICIAR_HABILITACAO',
        'ABRIR_PRAZO_RECURSAL',
        'DECIDIR_RECURSOS',
        'HOMOLOGAR',
      ]);
      // cada linha continua de onde a anterior parou
      for (let i = 1; i < h.length; i++) expect(h[i].fase_de).toBe(h[i - 1].fase_para);
    });
  });

  // --------------------------------------------------------------------------
  describe('2. licitação suspensa: a sala recusa atos (REST e socket)', () => {
    let orgao: OrgaoFixture;
    let F1: FornecedorFixture;
    let lic: LicitacaoFixture;
    let sessaoId: string;
    let item1: string;
    let item2: string;
    let salaPregoeiro: Socket;
    let salaF1: Socket;

    beforeAll(async () => {
      orgao = await criarOrgao(ctx, { nome: 'Prefeitura Sala Suspensa E1' });
      F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
      const itens = [
        { descricao: 'Item suspenso 1', quantidade: 1, valor_unitario_estimado: 100 },
        { descricao: 'Item suspenso 2', quantidade: 1, valor_unitario_estimado: 100 },
      ];
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: F1, valores: [90, 90] },
          { fornecedor: F2, valores: [95, 95] },
        ],
        { iniciarItens: false, itens },
      );
      lic = p.lic;
      sessaoId = p.sessaoId;
      [item1, item2] = lic.itens.map((i) => i.id);

      await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`)
        .set(bearer(orgao.token))
        .send({ itensIds: [item1] })
        .expect(201);
      salaPregoeiro = (await entrarNaSala(ctx, sessaoId, { id: orgao.id, nome: 'Pregoeiro', tipo: 'PREGOEIRO', token: orgao.token })).socket;
      const f = await entrarNaSala(ctx, sessaoId, { id: F1.id, nome: F1.razao_social, tipo: 'FORNECEDOR', token: F1.token });
      expect(f.resposta.evento).toBe('dados_iniciais');
      salaF1 = f.socket;
      expect((await darLance(salaF1, sessaoId, item1, 85)).ok).toBe(true);

      await http()
        .put(`/api/licitacoes/${lic.id}/suspender`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Representação ao TCM — suspensão cautelar' })
        .expect(200);
    });

    test('lance por REST → 409; por socket → erro "suspensa"', async () => {
      const r = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/lance`)
        .set(bearer(F1.token))
        .send({ itemId: item1, valor: 84 });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/suspensa/i);

      const s = await darLance(salaF1, sessaoId, item1, 84);
      expect(s.ok).toBe(false);
      expect(s.mensagem).toMatch(/suspensa/i);
    });

    test('iniciar item por REST → 409; por socket → erro; o item continua aguardando', async () => {
      const r = await http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`)
        .set(bearer(orgao.token))
        .send({ itensIds: [item2] });
      expect(r.status).toBe(409);

      const s = await iniciarItensNaSala(salaPregoeiro, sessaoId, [item2]);
      expect(s.evento).toBe('erro');
      expect(s.payload.mensagem).toMatch(/suspensa/i);

      // rota legada da sala /sessao: REMOVIDA na E2 (item 8 — canal único); iniciar item é só pelo motor
      const legado = await http().put(`/api/sessao/${sessaoId}/iniciar-item/${item2}`).set(bearer(orgao.token));
      expect(legado.status).toBe(404);
      expect(await itemStatus(item2)).not.toBe('EM_DISPUTA');
    });

    test('encerrar item, suspender/retomar/reiniciar a sessão e atos pós-disputa → 409', async () => {
      const casos = [
        http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${item1}`).set(bearer(orgao.token)),
        http().post(`/api/disputa-v2/sessao/${sessaoId}/suspender`).set(bearer(orgao.token)).send({ motivo: 'ADMINISTRATIVO', justificativa: 'x' }),
        http().post(`/api/disputa-v2/sessao/${sessaoId}/retomar`).set(bearer(orgao.token)),
        http().post(`/api/disputa-v2/sessao/${sessaoId}/reiniciar`).set(bearer(orgao.token)).send({ justificativa: 'x' }),
        http().put(`/api/sessao/${sessaoId}/habilitacao/convocar/${F1.id}`).set(bearer(orgao.token)).send({}),
        http().put(`/api/sessao/${sessaoId}/homologar`).set(bearer(orgao.token)).send({}),
      ];
      for (const r of await Promise.all(casos)) expect(r.status).toBe(409);
      expect(await itemStatus(item1)).toBe('EM_DISPUTA');
    });

    test('o relógio não encerra item de licitação suspensa', async () => {
      await deslocarRelogioItem(ctx, item1, { inicioHaMs: 11 * MIN, ultimoLanceHaMs: 11 * MIN });
      await tiqueRelogioDisputa(ctx);
      expect(await itemStatus(item1)).toBe('EM_DISPUTA');
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.EM_DISPUTA);
    });

    test('retomada a licitação, a sala volta a aceitar lance', async () => {
      await deslocarRelogioItem(ctx, item1, { inicioHaMs: MIN, ultimoLanceHaMs: MIN });
      await http().put(`/api/licitacoes/${lic.id}/retomar`).set(bearer(orgao.token)).send({}).expect(200);
      expect((await darLance(salaF1, sessaoId, item1, 84)).ok).toBe(true);
    });
  });
});
