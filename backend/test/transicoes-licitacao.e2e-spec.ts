/**
 * E1 — MÁQUINA DE ESTADOS DA LICITAÇÃO (TransicoesService), contra o banco real.
 *
 *  1. histórico `licitacao_transicoes` gravado em cada ato (e só o órgão dono lê);
 *  2. corrida cron × usuário: lock na licitação → uma transição só;
 *  3. suspender → retomar volta à MESMA fase (situação separada da fase);
 *  4. revogar/anular bloqueados com contrato assinado;
 *  5. deserta: roll-up automático dos itens e ato explícito;
 *  6. migração dos dados legados (fase = SUSPENSO/REVOGADO...) idempotente.
 */
import {
  AppE2E,
  abrirSessaoAgora,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  enviarProposta,
  levarAteFase,
  LicitacaoFixture,
  OrgaoFixture,
} from './support';
import { homologarResultado } from './support/resultado';
import { criarDispensaComPropostas, criarDispensaPublicada } from './support/dispensa';
import { FaseLicitacao, ModalidadeLicitacao, SituacaoLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { TransicoesService } from '../src/licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, atorSistema } from '../src/licitacoes/transicoes/transicoes.tipos';
import { migrarSituacaoLegada } from '../src/licitacoes/transicoes/migracao-situacao';
import { MigracaoSituacaoBootService } from '../src/licitacoes/transicoes/migracao-situacao-boot.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E1 — transições da licitação (máquina de estados)', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let outroOrgao: OrgaoFixture;

  const http = () => ctx.http();
  const historico = async (lic: LicitacaoFixture, token = lic.orgao.token) =>
    (await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(token)).expect(200)).body as any[];

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Transições E2E' });
    outroOrgao = await criarOrgao(ctx, { nome: 'Outra Prefeitura Transições E2E' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // --------------------------------------------------------------------------
  describe('1. histórico de transições', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    });

    it('cada ato vira uma linha (de/para, situação, ato, ator) desde a criação', async () => {
      const h = await historico(lic);
      expect(h.map((t) => [t.ato, t.fase_de, t.fase_para])).toEqual([
        ['CRIAR', null, 'PLANEJAMENTO'],
        ['CONCLUIR_PLANEJAMENTO', 'PLANEJAMENTO', 'TERMO_REFERENCIA'],
        ['CONCLUIR_TERMO_REFERENCIA', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS'],
        ['CONCLUIR_PESQUISA_PRECOS', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA'],
        ['CONCLUIR_ANALISE_JURIDICA', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA'],
        ['PUBLICAR', 'APROVACAO_INTERNA', 'PUBLICADO'],
        ['INICIAR_ACOLHIMENTO', 'PUBLICADO', 'ACOLHIMENTO_PROPOSTAS'],
      ]);
      for (const t of h) {
        expect(t.situacao_para).toBe('ATIVA');
        expect(t.ator_tipo).toBe('ORGAO');
        expect(t.ator_id).toBe(orgao.id);
        expect(t.created_at).toBeTruthy();
      }
      // o PUBLICAR guarda o cronograma pedido
      expect(h[5].dados?.dados?.data_fim_acolhimento).toBeTruthy();
      const l = await buscarLicitacao(ctx, lic);
      expect(l.situacao).toBe('ATIVA');
      expect(l.fase_anterior).toBe('PUBLICADO');
    });

    it('só o órgão dono lê o histórico (outro órgão 404, fornecedor 403)', async () => {
      const b = await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(outroOrgao.token));
      expect(b.status).toBe(404);
      const f = await criarFornecedor(ctx);
      const r = await http().get(`/api/licitacoes/${lic.id}/transicoes`).set(bearer(f.token));
      expect(r.status).toBe(403);
    });

    it('processo-completo traz situação e atos disponíveis com pendências', async () => {
      const pc = (await http().get(`/api/licitacoes/${lic.id}/processo-completo`).set(bearer(orgao.token)).expect(200)).body;
      expect(pc.licitacao.situacao).toBe('ATIVA');
      const atos = Object.fromEntries(pc.atos_disponiveis.map((a: any) => [a.ato, a]));
      expect(atos.ENCERRAR_ACOLHIMENTO.disponivel).toBe(false);
      expect(atos.ENCERRAR_ACOLHIMENTO.pendencias.join(' ')).toMatch(/prazo de recebimento de propostas ainda está aberto/);
      expect(atos.SUSPENDER).toMatchObject({ disponivel: true, requer_motivo: true, situacao_para: 'SUSPENSA' });
      expect(atos.REVOGAR.disponivel).toBe(true);
      expect(atos.INICIAR_DISPUTA).toBeUndefined(); // não cabe na fase atual
      expect(atos.CANCELAR_PUBLICACAO).toBeUndefined(); // só o sistema (exclusão no PNCP)
    });

    it('edição (PUT) não muda fase/situação — só ato muda estado', async () => {
      await http()
        .put(`/api/licitacoes/${lic.id}`)
        .set(bearer(orgao.token))
        // E7a: edital publicado — campo interno (observações) segue livre; regra do edital, só por retificação
        .send({ fase: 'HOMOLOGACAO', situacao: 'CONCLUIDA', observacoes: 'Anotação interna E1' })
        .expect(200);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect(l.situacao).toBe('ATIVA');
      expect(l.observacoes).toBe('Anotação interna E1');
    });

    it('avançar/retroceder genéricos respeitam o rito (sem "fase seguinte" livre)', async () => {
      const av = await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({});
      expect(av.status).toBe(400); // encerrar acolhimento antes do prazo
      expect(av.body.message).toMatch(/prazo de recebimento de propostas ainda está aberto/);
      const ret = await http().put(`/api/licitacoes/${lic.id}/retroceder-fase`).set(bearer(orgao.token)).send({ motivo: 'x' });
      expect(ret.status).toBe(409);
      expect(ret.body.message).toMatch(/Não há ato de retorno/);
      const desconhecido = await http().post(`/api/licitacoes/${lic.id}/atos/PULAR_PARA_HOMOLOGACAO`).set(bearer(orgao.token)).send({});
      expect(desconhecido.status).toBe(400);
    });
  });

  // --------------------------------------------------------------------------
  describe('2. corrida cron × usuário (lock na licitação)', () => {
    it('encerrar acolhimento pelo "cron" e pelo pregoeiro ao mesmo tempo → uma transição só', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await abrirSessaoAgora(ctx, lic); // prazo de propostas encerrado (sem propostas)

      const transicoes = ctx.app.get(TransicoesService);
      const [cron, usuario] = await Promise.allSettled([
        transicoes.executar(lic.id, AtoLicitacao.ENCERRAR_ACOLHIMENTO, { ator: atorSistema('scheduler') }),
        http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({}),
      ]);
      const cronOk = cron.status === 'fulfilled';
      const usuarioOk = usuario.status === 'fulfilled' && (usuario.value as any).status === 200;
      // exatamente um vence; o outro é recusado (409 se perdeu o lock; 400 se
      // chegou depois e o "próximo" ato, iniciar disputa, não tem propostas)
      expect(Number(cronOk) + Number(usuarioOk)).toBe(1);
      if (!usuarioOk) expect([400, 409]).toContain((usuario as any).value.status);
      if (!cronOk) expect((cron as any).reason?.status ?? (cron as any).reason?.getStatus?.()).toBe(409);

      const l = await buscarLicitacao(ctx, lic);
      expect(l.fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);
      const h = await historico(lic);
      expect(h.filter((t) => t.ato === 'ENCERRAR_ACOLHIMENTO')).toHaveLength(1);
    });

    it('dois cliques simultâneos no "avançar" → uma transição só', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await abrirSessaoAgora(ctx, lic);
      const respostas = await Promise.all(
        [1, 2, 3].map(() => http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({})),
      );
      expect(respostas.filter((r) => r.status === 200)).toHaveLength(1);
      expect((await buscarLicitacao(ctx, lic)).fase).toBe(FaseLicitacao.ANALISE_PROPOSTAS);
      expect((await historico(lic)).filter((t) => t.ato === 'ENCERRAR_ACOLHIMENTO')).toHaveLength(1);
    });

    it('pedido idempotente do sistema (ignorarSeJaAplicado) não falha nem duplica', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO);
      const transicoes = ctx.app.get(TransicoesService);
      const r = await transicoes.executar(lic.id, AtoLicitacao.PUBLICAR, {
        ator: atorSistema('pncp'),
        ignorarSeJaAplicado: true,
      });
      expect(r.fase).toBe(FaseLicitacao.PUBLICADO);
      expect((await historico(lic)).filter((t) => t.ato === 'PUBLICAR')).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  describe('3. suspender → retomar', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    });

    it('suspender exige motivo', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}/suspender`).set(bearer(orgao.token)).send({});
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Motivo obrigatório/);
    });

    it('suspende preservando a fase; atos de fase ficam bloqueados', async () => {
      const r = await http()
        .put(`/api/licitacoes/${lic.id}/suspender`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Impugnação acolhida — ajuste do TR' })
        .expect(200);
      expect(r.body.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      expect(r.body.situacao).toBe(SituacaoLicitacao.SUSPENSA);
      expect(r.body.observacoes).toMatch(/Impugnação acolhida/);

      const av = await http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({});
      expect(av.status).toBe(409);
      expect(av.body.message).toMatch(/suspensa/);
      const de2 = await http().put(`/api/licitacoes/${lic.id}/suspender`).set(bearer(orgao.token)).send({ motivo: 'de novo' });
      expect(de2.status).toBe(409);

      // continua pública (fase externa), com a situação visível
      const pub = await http().get(`/api/licitacoes/publicas/${lic.id}`).expect(200);
      expect(pub.body.situacao).toBe('SUSPENSA');
    });

    it('retomar volta à MESMA fase, reabre o prazo pedido e registra no histórico', async () => {
      const novoFim = new Date(Date.now() + 10 * 24 * 3_600_000).toISOString();
      const r = await http()
        .put(`/api/licitacoes/${lic.id}/retomar`)
        .set(bearer(orgao.token))
        .send({ fase_destino: 'EM_DISPUTA', data_fim_acolhimento: novoFim, data_abertura_sessao: novoFim })
        .expect(200);
      expect(r.body.situacao).toBe(SituacaoLicitacao.ATIVA);
      expect(r.body.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS); // fase_destino ignorado
      const h = await historico(lic);
      const [susp, ret] = h.slice(-2);
      expect(susp).toMatchObject({ ato: 'SUSPENDER', fase_de: 'ACOLHIMENTO_PROPOSTAS', fase_para: 'ACOLHIMENTO_PROPOSTAS', situacao_de: 'ATIVA', situacao_para: 'SUSPENSA', motivo: 'Impugnação acolhida — ajuste do TR' });
      expect(ret).toMatchObject({ ato: 'RETOMAR', situacao_de: 'SUSPENSA', situacao_para: 'ATIVA' });
      expect(ret.dados.dados.data_fim_acolhimento).toBe(novoFim);
    });

    it('retomar uma licitação ativa é recusado (409)', async () => {
      const r = await http().put(`/api/licitacoes/${lic.id}/retomar`).set(bearer(orgao.token)).send({});
      expect(r.status).toBe(409);
    });
  });

  // --------------------------------------------------------------------------
  describe('4. revogar/anular bloqueados com contrato assinado', () => {
    let lic: LicitacaoFixture;

    beforeAll(async () => {
      const f = await criarFornecedor(ctx, { porte: 'ME' });
      lic = await criarDispensaComPropostas(ctx, orgao, [{ fornecedor: f, valores: [90, 45] }]);
      await http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token)).expect(201);
      await homologarResultado(ctx, lic.id, orgao.token).expect(200);
    });

    it('homologada e com contrato gerado: re-homologar é recusado', async () => {
      const r = await homologarResultado(ctx, lic.id, orgao.token);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/já homologada e com contrato/);
    });

    it('com contrato ASSINADO, revogar e anular são recusados com a pendência', async () => {
      // Atalho de fixture (sem rota simples): a assinatura depende do portal de
      // assinaturas (signatários + OTP). Marcamos o contrato como assinado.
      await ctx.dataSource.query(`UPDATE contratos SET data_assinatura = NOW() WHERE licitacao_id = $1`, [lic.id]);
      for (const ato of ['revogar', 'anular']) {
        const r = await http().put(`/api/licitacoes/${lic.id}/${ato}`).set(bearer(orgao.token)).send({ motivo: 'Interesse público superveniente' });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/contrato\(s\) assinado\(s\)/);
      }
      const l = await buscarLicitacao(ctx, lic);
      expect(l.situacao).toBe('ATIVA');
      expect(l.fase).toBe(FaseLicitacao.HOMOLOGACAO);
    });

    it('concluir: com contrato gerado, o processo vira CONCLUIDA (fase continua HOMOLOGACAO)', async () => {
      const r = await http().post(`/api/licitacoes/${lic.id}/atos/CONCLUIR`).set(bearer(orgao.token)).send({}).expect(201);
      expect(r.body.licitacao.situacao).toBe('CONCLUIDA');
      expect(r.body.licitacao.fase).toBe(FaseLicitacao.HOMOLOGACAO);
      const depois = await http().put(`/api/licitacoes/${lic.id}/suspender`).set(bearer(orgao.token)).send({ motivo: 'x' });
      expect(depois.status).toBe(409);
    });

    it('sem contrato assinado, revoga: situação terminal e nenhum ato depois', async () => {
      const outra = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, outra, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const r = await http()
        .put(`/api/licitacoes/${outra.id}/revogar`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Fato superveniente (art. 71, II)' })
        .expect(200);
      expect(r.body.situacao).toBe('REVOGADA');
      expect(r.body.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      for (const [metodo, rota] of [
        ['put', 'avancar-fase'],
        ['put', 'suspender'],
        ['put', 'anular'],
        ['put', 'retomar'],
      ] as const) {
        const x = await (http() as any)[metodo](`/api/licitacoes/${outra.id}/${rota}`).set(bearer(orgao.token)).send({ motivo: 'x' });
        expect(x.status).toBe(409);
      }
      const edit = await http().put(`/api/licitacoes/${outra.id}`).set(bearer(orgao.token)).send({ objeto: 'x' });
      expect(edit.status).toBe(409);
      // filtro legado ?fase=REVOGADO continua funcionando (vira filtro de situação)
      const lista = (await http().get('/api/licitacoes?fase=REVOGADO').set(bearer(orgao.token)).expect(200)).body;
      expect(lista.map((l: any) => l.id)).toContain(outra.id);
      expect(lista.every((l: any) => l.situacao === 'REVOGADA')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  describe('5. deserta / fracassada', () => {
    it('roll-up: todos os itens declarados desertos → licitação DESERTA', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await http().put(`/api/itens/${lic.itens[0].id}/deserto`).set(bearer(orgao.token)).expect(200);
      expect((await buscarLicitacao(ctx, lic)).situacao).toBe('ATIVA'); // ainda há item ativo
      await http().put(`/api/itens/${lic.itens[1].id}/deserto`).set(bearer(orgao.token)).expect(200);
      const l = await buscarLicitacao(ctx, lic);
      expect(l.situacao).toBe('DESERTA');
      expect(l.fase).toBe(FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const ultima = (await historico(lic)).pop();
      expect(ultima).toMatchObject({ ato: 'DECLARAR_DESERTA', situacao_para: 'DESERTA', ator_tipo: 'ORGAO' });
      expect(ultima.dados.rollup).toBe(true);
    });

    it('roll-up: item fracassado + deserto, sem vencedor → FRACASSADA', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      await http().put(`/api/itens/${lic.itens[0].id}/fracassado`).set(bearer(orgao.token)).send({ motivo: 'Todas inabilitadas' }).expect(200);
      await http().put(`/api/itens/${lic.itens[1].id}/deserto`).set(bearer(orgao.token)).expect(200);
      expect((await buscarLicitacao(ctx, lic)).situacao).toBe('FRACASSADA');
    });

    it('dispensa sem propostas: julgar orienta a declarar deserta, e o ato explícito encerra', async () => {
      const lic = await criarDispensaPublicada(ctx, orgao);
      await abrirSessaoAgora(ctx, lic);
      const j = await http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token));
      expect(j.status).toBe(400);
      expect(j.body.message).toMatch(/declare a dispensa deserta/);

      const atos = (await http().get(`/api/licitacoes/${lic.id}/atos`).set(bearer(orgao.token)).expect(200)).body;
      expect(atos.find((a: any) => a.ato === 'DECLARAR_DESERTA')).toMatchObject({ disponivel: true, requer_motivo: true });

      const semMotivo = await http().post(`/api/licitacoes/${lic.id}/atos/DECLARAR_DESERTA`).set(bearer(orgao.token)).send({});
      expect(semMotivo.status).toBe(400);
      const r = await http()
        .post(`/api/licitacoes/${lic.id}/atos/DECLARAR_DESERTA`)
        .set(bearer(orgao.token))
        .send({ motivo: 'Nenhum fornecedor apresentou proposta no prazo' })
        .expect(201);
      expect(r.body.licitacao.situacao).toBe('DESERTA');
    });

    it('com proposta recebida, "deserta" é recusada (use fracassada)', async () => {
      const f = await criarFornecedor(ctx);
      const lic = await criarDispensaComPropostas(ctx, orgao, [{ fornecedor: f, valores: [99, 49] }]);
      const r = await http()
        .post(`/api/licitacoes/${lic.id}/atos/DECLARAR_DESERTA`)
        .set(bearer(orgao.token))
        .send({ motivo: 'teste' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/proposta\(s\) recebida\(s\)/);
    });
  });

  // --------------------------------------------------------------------------
  describe('6. migração dos dados legados (fase = situação)', () => {
    it('leva SUSPENSO/REVOGADO para situação + fase real, com histórico, e é idempotente', async () => {
      const suspensa = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, suspensa, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
      const revogada = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, revogada, FaseLicitacao.PUBLICADO, {
        datas: { data_inicio_acolhimento: new Date(Date.now() + 5 * 24 * 3_600_000).toISOString() },
      });
      // Simula linhas gravadas ANTES da E1 (fase = situação, observação sobrescrita)
      await ctx.dataSource.query(
        `UPDATE licitacoes SET fase = 'SUSPENSO', fase_anterior = NULL, observacoes = 'Suspenso: motivo antigo' WHERE id = $1`,
        [suspensa.id],
      );
      await ctx.dataSource.query(
        `UPDATE licitacoes SET fase = 'REVOGADO', fase_anterior = NULL, observacoes = 'Revogado: motivo antigo' WHERE id = $1`,
        [revogada.id],
      );

      // 1ª execução: pelo hook de boot (o caminho de produção)
      await ctx.app.get(MigracaoSituacaoBootService).onApplicationBootstrap();
      const s = await buscarLicitacao(ctx, suspensa);
      expect([s.fase, s.situacao]).toEqual([FaseLicitacao.ACOLHIMENTO_PROPOSTAS, 'SUSPENSA']);
      expect(s.observacoes).toBe('Suspenso: motivo antigo');
      const r = await buscarLicitacao(ctx, revogada);
      expect([r.fase, r.situacao]).toEqual([FaseLicitacao.PUBLICADO, 'REVOGADA']);

      const hs = (await historico(suspensa)).filter((t) => t.ato === 'MIGRACAO_SITUACAO');
      expect(hs).toHaveLength(1);
      expect(hs[0]).toMatchObject({ fase_de: 'SUSPENSO', fase_para: 'ACOLHIMENTO_PROPOSTAS', situacao_para: 'SUSPENSA', ator_tipo: 'SISTEMA' });
      expect(hs[0].dados.regra).toBe('inicio_acolhimento_passou');

      // 2ª execução (migration TypeORM / novo boot): nada a fazer
      const de2 = await migrarSituacaoLegada(ctx.dataSource);
      expect(de2.detalhes.filter((d) => [suspensa.id, revogada.id].includes(d.id))).toEqual([]);
      expect((await historico(suspensa)).filter((t) => t.ato === 'MIGRACAO_SITUACAO')).toHaveLength(1);

      // Migrada, a suspensa pode ser retomada na fase certa
      const ret = await http().put(`/api/licitacoes/${suspensa.id}/retomar`).set(bearer(orgao.token)).send({}).expect(200);
      expect([ret.body.fase, ret.body.situacao]).toEqual([FaseLicitacao.ACOLHIMENTO_PROPOSTAS, 'ATIVA']);
    });
  });

  // --------------------------------------------------------------------------
  it('fornecedor com proposta não pratica atos do órgão pela rota genérica', async () => {
    const f = await criarFornecedor(ctx);
    const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
    await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    await enviarProposta(ctx, f, lic, [95, 45]);
    const r = await http().post(`/api/licitacoes/${lic.id}/atos/SUSPENDER`).set(bearer(f.token)).send({ motivo: 'x' });
    expect(r.status).toBe(403);
    const b = await http().post(`/api/licitacoes/${lic.id}/atos/SUSPENDER`).set(bearer(outroOrgao.token)).send({ motivo: 'x' });
    expect(b.status).toBe(403);
  });
});
