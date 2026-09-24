/**
 * E1 item 6 — PRAZO DE IMPUGNAÇÃO/ESCLARECIMENTO e RELÓGIO DO CRONOGRAMA.
 *
 *  1. impugnação e pedido de esclarecimento são aceitos DURANTE o acolhimento
 *     até o prazo-limite (art. 164: até 3 dias úteis antes da abertura, ou a
 *     `data_limite_impugnacao` do edital) e recusados depois — a data decide,
 *     não a fase; as visões expõem `data_limite_impugnacao_efetiva`;
 *  2. o scheduler move as fases por ATOS (INICIAR/ENCERRAR_ACOLHIMENTO) com
 *     histórico (ator SISTEMA/scheduler); o PUT atualizar-fase usa o mesmo
 *     caminho (ator = órgão);
 *  3. licitação suspensa não é movida pelo relógio;
 *  4. a falha de uma licitação não interrompe o lote;
 *  5. scheduler × ato manual simultâneos → uma transição só.
 *
 * Datas com folga de DIAS: as colunas são `timestamp without time zone` e o
 * fuso do processo de teste pode deslocar o relógio em algumas horas.
 */
import {
  AppE2E,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  FornecedorFixture,
  levarAteFase,
  LicitacaoFixture,
  OrgaoFixture,
} from './support';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { LicitacoesSchedulerService } from '../src/licitacoes/licitacoes-scheduler.service';
import { TransicoesService } from '../src/licitacoes/transicoes/transicoes.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const DIA = 86_400_000;
const emDias = (n: number) => new Date(Date.now() + n * DIA).toISOString();

describe('E1 — prazo de impugnação (art. 164) e relógio do cronograma', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let fornecedor: FornecedorFixture;
  let scheduler: LicitacoesSchedulerService;

  const http = () => ctx.http();
  const historico = async (lic: LicitacaoFixture) =>
    (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(orgao.token)).expect(200)).body as any[];
  const impugnar = (lic: LicitacaoFixture) =>
    http()
      .post('/api/impugnacoes')
      .set(bearer(fornecedor.token))
      .send({ licitacao_id: lic.id, texto_impugnacao: 'Cláusula restritiva (teste de prazo)' });
  const esclarecer = (lic: LicitacaoFixture) =>
    http()
      .post('/api/esclarecimentos')
      .set(bearer(fornecedor.token))
      .send({ licitacao_id: lic.id, texto_esclarecimento: 'Dúvida sobre o item 1 (teste de prazo)' });
  const editar = (lic: LicitacaoFixture, dados: Record<string, any>) =>
    http().put(`/api/licitacoes/${lic.id}`).set(bearer(orgao.token)).send(dados).expect(200);

  /** Pregão publicado com o acolhimento já iniciado pelo edital (ainda em PUBLICADO). */
  const pregaoPublicado = async (): Promise<LicitacaoFixture> => {
    const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
    await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO, {
      datas: { data_inicio_acolhimento: emDias(-1), data_publicacao_edital: emDias(-1) },
    });
    return lic;
  };

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Prazos Impugnação E2E' });
    fornecedor = await criarFornecedor(ctx);
    scheduler = ctx.app.get(LicitacoesSchedulerService);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('1. impugnação e esclarecimento decididos pela data-limite, não pela fase', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    });

    it('aceita impugnação e esclarecimento DURANTE o acolhimento, antes do limite do edital', async () => {
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const imp = await impugnar(lic);
      expect(imp.status).toBe(201);
      const esc = await esclarecer(lic);
      expect(esc.status).toBe(201);
    });

    it('visões do fornecedor, pública e do órgão expõem o prazo efetivo', async () => {
      const f = (await http().get(`/api/licitacoes/${lic.id}`).set(bearer(fornecedor.token)).expect(200)).body;
      expect(f.prazo_manifestacao_aberto).toBe(true);
      expect(f.data_limite_impugnacao_efetiva).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      const pub = (await http().get(`/api/licitacoes/publicas/${lic.id}`).expect(200)).body;
      expect(pub.prazo_manifestacao_aberto).toBe(true);
      expect(pub.data_limite_impugnacao_efetiva).toBeTruthy();
      const o = await buscarLicitacao(ctx, lic);
      expect(o.prazo_manifestacao_aberto).toBe(true);
    });

    it('recusa depois do limite do edital (data_limite_impugnacao vencida), mesmo em acolhimento', async () => {
      await editar(lic, { data_limite_impugnacao: emDias(-1) });
      const imp = await impugnar(lic);
      expect(imp.status).toBe(400);
      expect(imp.body.message).toMatch(/Fora do prazo para impugnação/);
      const esc = await esclarecer(lic);
      expect(esc.status).toBe(400);
      expect(esc.body.message).toMatch(/Fora do prazo para pedido de esclarecimento/);
      const f = (await http().get(`/api/licitacoes/${lic.id}`).set(bearer(fornecedor.token)).expect(200)).body;
      expect(f.prazo_manifestacao_aberto).toBe(false);
    });

    it('sem data-limite no edital: 3 dias úteis antes da abertura da sessão', async () => {
      // abertura amanhã → o 3º dia útil anterior já passou
      await editar(lic, { data_limite_impugnacao: null, data_abertura_sessao: emDias(1), data_fim_acolhimento: emDias(1) });
      expect((await impugnar(lic)).status).toBe(400);
      expect((await esclarecer(lic)).status).toBe(400);

      // abertura em 15 dias → prazo aberto (limite calculado ≈ 10 dias à frente)
      await editar(lic, { data_limite_impugnacao: null, data_abertura_sessao: emDias(15), data_fim_acolhimento: emDias(15) });
      const f = (await http().get(`/api/licitacoes/${lic.id}`).set(bearer(fornecedor.token)).expect(200)).body;
      expect(f.prazo_manifestacao_aberto).toBe(true);
      const limite = new Date(f.data_limite_impugnacao_efetiva).getTime();
      expect(limite).toBeGreaterThan(Date.now() + 8 * DIA);
      expect(limite).toBeLessThan(Date.now() + 15 * DIA);
      expect((await impugnar(lic)).status).toBe(201);
      expect((await esclarecer(lic)).status).toBe(201);
    });

    it('depois de aberta a sessão não cabe mais (salvaguarda pela fase)', async () => {
      const outra = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, outra, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await abrirSessaoAgora(ctx, outra);
      await http().put(`/api/licitacoes/${outra.id}/avancar-fase`).set(bearer(orgao.token)).send({}).expect(200);
      expect((await buscarLicitacao(ctx, outra)).fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);
      // mesmo com uma data-limite (errada) no futuro
      await editar(outra, { data_limite_impugnacao: emDias(5) });
      expect((await impugnar(outra)).status).toBe(400);
    });
  });

  // --------------------------------------------------------------------------
  describe('2. scheduler move as fases por atos, com histórico', () => {
    it('INICIAR_ACOLHIMENTO e ENCERRAR_ACOLHIMENTO com ator SISTEMA/scheduler', async () => {
      const lic = await pregaoPublicado();
      await scheduler.atualizarFasesAutomaticamente();
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);

      // o relógio entrar no acolhimento NÃO encerra o prazo de impugnação
      expect((await impugnar(lic)).status).toBe(201);

      await abrirSessaoAgora(ctx, lic); // fim do acolhimento no passado
      await scheduler.atualizarFasesAutomaticamente();
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);

      const h = await historico(lic);
      const doRelogio = h.filter((t) => ['INICIAR_ACOLHIMENTO', 'ENCERRAR_ACOLHIMENTO'].includes(t.ato));
      expect(doRelogio.map((t) => [t.ato, t.fase_de, t.fase_para, t.ator_tipo, t.ator_id])).toEqual([
        ['INICIAR_ACOLHIMENTO', 'PUBLICADO', 'ACOLHIMENTO_PROPOSTAS', 'SISTEMA', 'scheduler'],
        ['ENCERRAR_ACOLHIMENTO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'SISTEMA', 'scheduler'],
      ]);
      expect(doRelogio[0].dados).toMatchObject({ origem: 'cronograma' });

      // rodar de novo não duplica nada (idempotente)
      await scheduler.atualizarFasesAutomaticamente();
      expect((await historico(lic)).length).toBe(h.length);
    });

    it('PUT atualizar-fase usa o mesmo caminho (ato registrado com o órgão como ator)', async () => {
      const lic = await pregaoPublicado();
      const r = await http().put(`/api/licitacoes/${lic.id}/atualizar-fase`).set(bearer(orgao.token)).expect(200);
      expect(r.body.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const t = (await historico(lic)).find((x) => x.ato === 'INICIAR_ACOLHIMENTO');
      expect(t).toMatchObject({ ator_tipo: 'ORGAO', ator_id: orgao.id, fase_de: 'PUBLICADO' });
      // nada vencido: devolve sem alterar
      const r2 = await http().put(`/api/licitacoes/${lic.id}/atualizar-fase`).set(bearer(orgao.token)).expect(200);
      expect(r2.body.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    });

    it('não entra mais na fase IMPUGNACAO (ABRIR_IMPUGNACAO fora do fluxo)', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO, { datas: { data_inicio_acolhimento: emDias(2) } });
      const r = await http().post(`/api/licitacoes/${lic.id}/atos/ABRIR_IMPUGNACAO`).set(bearer(orgao.token)).send({});
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/não se aplica/);
      // acolhimento ainda não começou: o relógio não mexe
      await scheduler.atualizarFasesAutomaticamente();
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.PUBLICADO);
    });
  });

  // --------------------------------------------------------------------------
  describe('3. licitação suspensa não anda pelo relógio', () => {
    it('scheduler e atualizar-fase mantêm fase e situação', async () => {
      const lic = await pregaoPublicado();
      await http()
        .post(`/api/licitacoes/${lic.id}/atos/SUSPENDER`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Suspensão para análise de impugnação (teste do relógio)' })
        .expect(201);
      const antes = (await historico(lic)).length;

      await scheduler.atualizarFasesAutomaticamente();
      const r = await http().put(`/api/licitacoes/${lic.id}/atualizar-fase`).set(bearer(orgao.token)).expect(200);
      expect(r.body.fase).toBe(FaseLicitacao.PUBLICADO);

      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.PUBLICADO);
      expect(l.situacao).toBe('SUSPENSA');
      expect((await historico(lic)).length).toBe(antes);
    });
  });

  // --------------------------------------------------------------------------
  describe('4. lote resiliente', () => {
    it('a falha de uma licitação não interrompe as demais', async () => {
      const falha = await pregaoPublicado();
      const ok = await pregaoPublicado();
      const transicoes = ctx.app.get(TransicoesService);
      const original = transicoes.executar.bind(transicoes);
      const espiao = jest.spyOn(transicoes, 'executar').mockImplementation(async (id, ato, opcoes) => {
        if (id === falha.id) throw new Error('falha simulada no teste');
        return original(id, ato, opcoes);
      });
      try {
        await expect(scheduler.atualizarFasesAutomaticamente()).resolves.toBeGreaterThanOrEqual(1);
      } finally {
        espiao.mockRestore();
      }
      expect((await buscarLicitacao(ctx, falha)).fase).toBe(FaseLicitacao.PUBLICADO);
      expect((await buscarLicitacao(ctx, ok)).fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);

      // no próximo minuto a que falhou é processada normalmente
      await scheduler.atualizarFasesAutomaticamente();
      expect((await buscarLicitacao(ctx, falha)).fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    });
  });

  // --------------------------------------------------------------------------
  describe('5. corrida scheduler × ato manual', () => {
    it('scheduler e INICIAR_ACOLHIMENTO do órgão ao mesmo tempo → uma transição só', async () => {
      const lic = await pregaoPublicado();
      const [cron, manual] = await Promise.allSettled([
        scheduler.atualizarFaseLicitacao(lic.id),
        http().post(`/api/licitacoes/${lic.id}/atos/INICIAR_ACOLHIMENTO`).set(bearer(orgao.token)).send({}),
      ]);
      // o scheduler nunca falha por chegar depois (ignorarSeJaAplicado)
      expect(cron.status).toBe('fulfilled');
      const statusManual = (manual as any).value?.status;
      expect([201, 409]).toContain(statusManual);

      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const inicios = (await historico(lic)).filter((t) => t.ato === 'INICIAR_ACOLHIMENTO');
      expect(inicios).toHaveLength(1);
      expect(inicios[0].ator_tipo).toBe(statusManual === 201 ? 'ORGAO' : 'SISTEMA');
    });
  });
});
