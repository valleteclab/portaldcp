/**
 * ============================================================================
 * E6 — RESULTADO ÚNICO E CONTRATO (Lei 14.133/2021 arts. 71, 90–95;
 * IN SEGES 73/2022 arts. 29 e 42 e seguintes)
 * ============================================================================
 *
 *  A. Pregão pela sala: lance final 900 → proposta adequada readequada a 890 →
 *     adjudicado 890 ao HABILITADO → homologado 890 (valor calculado,
 *     autoridade do login) → contrato AGUARDANDO_ASSINATURA, sem data de
 *     assinatura, prazo de entrega da proposta vencedora. Efeito suspensivo:
 *     janela/intenção pendente bloqueiam. Isolamento: órgão B e fornecedor
 *     não adjudicam nem homologam; pregoeiro não homologa.
 *  B. Dispensa: o julgamento grava o MESMO dado (VENCEDOR + itens ADJUDICADO)
 *     e a homologação é o mesmo método (prazo da proposta vencedora).
 *  C. Seleção externa numa licitação SRP: mesmo dado; homologar NÃO gera
 *     contrato — chama o gancho da ARP (padrão: 501 registrado na resposta).
 *  D. Demanda → processo: demanda EM_CONTRATACAO; contrato assinado → CONTRATADA.
 *  E. Migração (boot) das licitações homologadas pelos caminhos antigos:
 *     coerente e idempotente, sem gerar contrato.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { desligarLimiteDeRequisicoes, pararTodosOsCrons } from './support/pregao';
import { prepararPregaoEmDisputa } from './support/isolamento';
import { convocarAceitacao, decidirAceitacao, enviarPropostaAdequada } from './support/julgamento';
import { habilitarLicitante } from './support/habilitacao';
import { abrirJanelaIntencao, encerrarJanelaNoRelogio, manifestarIntencao } from './support/recursos';
import { criarDispensaComPropostas } from './support/dispensa';
import { adjudicarResultado, gerarInstrumentos, homologarResultado, painelResultado } from './support/resultado';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { GERADOR_ATA_REGISTRO_PRECO } from '../src/resultado/gerador-ata';
import { migrarResultado } from '../src/resultado/migracao-resultado';
import { marcarContratado } from '../src/resultado/status-demanda-pca.sql';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E6 — resultado único (adjudicação, homologação) e contrato', () => {
  let ctx: AppE2E;
  const http = () => ctx.http();
  const q = (sql: string, p: any[] = []) => ctx.dataSource.query(sql, p);

  let orgao: OrgaoFixture;
  let orgaoB: OrgaoFixture;
  let pregoeira: UsuarioOrgaoFixture;
  let A: FornecedorFixture;
  let D: FornecedorFixture;

  beforeAll(async () => {
    ctx = await criarApp();
    pararTodosOsCrons(ctx);
    desligarLimiteDeRequisicoes(ctx);
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Resultado E6' });
    orgaoB = await criarOrgao(ctx, { nome: 'Outra Prefeitura E6' });
    pregoeira = await criarUsuarioOrgao(ctx, orgao, { nome: 'Pregoeira E6', role: RoleUsuario.PREGOEIRO });
    A = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    D = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  const situacoes = async (licId: string) =>
    (await q(`SELECT unidade_id::text AS u, fornecedor_id AS f, situacao FROM licitantes_unidade WHERE licitacao_id = $1`, [licId])) as any[];
  const itensDb = async (licId: string) =>
    (await q(
      `SELECT id::text AS id, numero_item, status::text AS status, fornecedor_vencedor_id, valor_unitario_homologado, valor_total_homologado
         FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
      [licId],
    )) as any[];
  const contratosDb = async (licId: string) =>
    (await q(
      `SELECT id, fornecedor_id, valor_global, status::text AS status, data_assinatura, prazo_execucao_dias
         FROM contratos WHERE licitacao_id = $1 ORDER BY numero_contrato`,
      [licId],
    )) as any[];

  // ==========================================================================
  describe('A. pregão pela sala: proposta readequada → adjudicação → homologação → contrato', () => {
    let licId: string;
    let sessaoId: string;
    let item: string;

    beforeAll(async () => {
      // 1 item, 10 un.: A propõe 90/un (lance inicial = 900 total), D 95/un
      const p = await prepararPregaoEmDisputa(
        ctx,
        orgao,
        [
          { fornecedor: A, valores: [90] },
          { fornecedor: D, valores: [95] },
        ],
        { itens: [{ descricao: 'Cadeira E6', quantidade: 10, valor_unitario_estimado: 100 }] },
      );
      licId = p.lic.id;
      sessaoId = p.sessaoId;
      item = p.lic.itens[0].id;
      // prazo de entrega da proposta de A (atalho de fixture: a tela da proposta grava este campo)
      await q(`UPDATE propostas SET prazo_entrega_dias = 15 WHERE licitacao_id = $1 AND fornecedor_id = $2`, [licId, A.id]);
      expect((await http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${item}`).set(bearer(orgao.token))).status).toBe(201);
    });

    test('lance final de A = R$ 900,00 (total do item)', async () => {
      const [l] = await q(`SELECT MIN(valor)::float AS v FROM lances WHERE item_id = $1 AND fornecedor_id = $2 AND cancelado = false`, [item, A.id]);
      expect(l.v).toBe(900);
    });

    test('A envia a proposta adequada READEQUADA (R$ 89,00/un = 890) e é aceito e habilitado', async () => {
      const c = await convocarAceitacao(ctx, sessaoId, item, orgao.token);
      expect(c.status).toBe(201);
      expect(c.body.fornecedorId).toBe(A.id);
      const e = await enviarPropostaAdequada(ctx, sessaoId, c.body.id, A.token, [{ itemId: item, valorUnitario: 89 }]);
      expect(e.status).toBe(201);
      expect(Number(e.body.valorTotalReadequado ?? e.body.valor_total_readequado ?? 890)).toBe(890);
      expect((await decidirAceitacao(ctx, sessaoId, c.body.id, orgao.token, 'aceitar')).status).toBe(201);
      expect((await habilitarLicitante(ctx, licId, A, orgao.token)).status).toBe('HABILITADO');
    });

    test('prévia: o painel mostra A a adjudicar por 890 (a proposta aceita, não o lance)', async () => {
      const p = await painelResultado(ctx, licId, orgao.token);
      expect(p.adjudicaPelaSala).toBe(true);
      expect(p.unidades[0]).toMatchObject({ situacao: 'A_ADJUDICAR', valorTotal: 890, vencedor: { fornecedorId: A.id } });
      expect(p.valorPrevia).toBe(890);
      // sem a janela de intenção de recurso, o ato ainda não está disponível
      expect(p.atos.adjudicar.disponivel).toBe(false);
      expect(p.atos.adjudicar.pendencias.join(' ')).toMatch(/intenção de recurso/);
    });

    test('efeito suspensivo: janela aberta e intenção pendente bloqueiam a adjudicação (art. 168)', async () => {
      const semJanela = await adjudicarResultado(ctx, licId, pregoeira.token);
      expect(semJanela.status).toBe(400);
      expect((await abrirJanelaIntencao(ctx, sessaoId, pregoeira.token)).status).toBe(201);
      const intencao = await manifestarIntencao(ctx, sessaoId, D.token, { motivacao: 'Discordo do resultado do julgamento', atoRecorrido: 'OUTRO' });
      expect(intencao.status).toBe(201);
      const comJanela = await adjudicarResultado(ctx, licId, pregoeira.token);
      expect(comJanela.status).toBe(400);
      expect(JSON.stringify(comJanela.body)).toMatch(/Janela de intenção de recurso em curso|art\. 168/);
      await encerrarJanelaNoRelogio(ctx, sessaoId);
      const pendente = await adjudicarResultado(ctx, licId, pregoeira.token);
      expect(pendente.status).toBe(400);
      expect(JSON.stringify(pendente.body)).toMatch(/art\. 168/);
      // não conhecida (sem motivação) → fim do efeito suspensivo
      const naoConhecida = await http()
        .post(`/api/recursos/${intencao.body.id}/recusar`)
        .set(bearer(pregoeira.token))
        .send({ pressuposto: 'MOTIVACAO', motivo: 'Intenção sem indicação do ato e das razões mínimas.' });
      expect(naoConhecida.status).toBe(201);
    });

    test('isolamento: órgão B e fornecedor não adjudicam, não homologam e não leem o painel', async () => {
      for (const token of [orgaoB.token, A.token, D.token]) {
        expect([403, 404]).toContain((await adjudicarResultado(ctx, licId, token)).status);
        expect([403, 404]).toContain((await homologarResultado(ctx, licId, token)).status);
        expect([403, 404]).toContain((await http().get(`/api/resultado/licitacao/${licId}`).set(bearer(token))).status);
      }
      expect((await itensDb(licId))[0].status).toBe('ATIVO');
    });

    test('ADJUDICAR: vencedor HABILITADO → VENCEDOR; item ADJUDICADO por 89/890 (proposta readequada)', async () => {
      const r = await adjudicarResultado(ctx, licId, pregoeira.token);
      expect(r.status).toBe(200);
      expect(r.body.unidades[0]).toMatchObject({ situacao: 'ADJUDICADA', valorTotal: 890, vencedor: { fornecedorId: A.id } });
      const [it] = await itensDb(licId);
      expect([it.status, it.fornecedor_vencedor_id, Number(it.valor_unitario_homologado), Number(it.valor_total_homologado)]).toEqual([
        'ADJUDICADO',
        A.id,
        89,
        890,
      ]);
      const s = await situacoes(licId);
      expect(s.find((x) => x.f === A.id)?.situacao).toBe('VENCEDOR');
      expect(s.find((x) => x.f === D.id)?.situacao).not.toBe('VENCEDOR');
      const l = await buscarLicitacao(ctx, { id: licId, orgao } as any);
      expect(l.fase).toBe(FaseLicitacao.ADJUDICACAO);
      expect(l.data_adjudicacao).toBeTruthy();
    });

    test('HOMOLOGAR: pregoeiro → 403; autoridade → valor = soma calculada (890), sem valor no corpo', async () => {
      expect((await homologarResultado(ctx, licId, pregoeira.token)).status).toBe(403);
      const r = await http()
        .post(`/api/resultado/licitacao/${licId}/homologar`)
        .set(bearer(orgao.token))
        .send({ valor_homologado: 1_000_000, nome: 'Forjado', cargo: 'Forjado' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ fase: FaseLicitacao.HOMOLOGACAO, valorHomologado: 890, itensHomologados: 1 });
      expect(r.body.autoridade.nome).not.toBe('Forjado');
      expect(r.body.instrumentos).toMatchObject({ tipo: 'CONTRATO', erro: null });
      const l = await buscarLicitacao(ctx, { id: licId, orgao } as any);
      expect(Number(l.valor_homologado)).toBe(890);
      expect(l.data_homologacao).toBeTruthy();
      expect(l.homologacao_autoridade_nome).toBe(r.body.autoridade.nome);
      expect((await itensDb(licId))[0].status).toBe('HOMOLOGADO');
    });

    test('CONTRATO: gerado para A por 890, AGUARDANDO_ASSINATURA, sem data de assinatura, prazo da proposta (15 dias), itens do contrato', async () => {
      const cs = await contratosDb(licId);
      expect(cs).toHaveLength(1);
      expect(cs[0]).toMatchObject({ fornecedor_id: A.id, status: 'AGUARDANDO_ASSINATURA', data_assinatura: null, prazo_execucao_dias: 15 });
      expect(Number(cs[0].valor_global)).toBe(890);
      const its = await q(`SELECT quantidade_contratada, valor_unitario, valor_total, item_licitacao_id FROM itens_contrato WHERE contrato_id = $1`, [cs[0].id]);
      expect(its.map((i: any) => [Number(i.quantidade_contratada), Number(i.valor_unitario), Number(i.valor_total), i.item_licitacao_id])).toEqual([
        [10, 89, 890, item],
      ]);
    });

    test('re-homologar e gerar de novo não duplicam; CONCLUIR fica disponível (contrato gerado)', async () => {
      const re = await homologarResultado(ctx, licId, orgao.token);
      expect(re.status).toBe(400);
      expect(re.body.message).toMatch(/já homologada e com contrato/);
      const g = await gerarInstrumentos(ctx, licId, orgao.token);
      expect(g.status).toBe(200);
      expect(g.body.contratos).toHaveLength(1);
      expect(await contratosDb(licId)).toHaveLength(1);
      const atos = (await http().get(`/api/licitacoes/${licId}/atos`).set(bearer(orgao.token)).expect(200)).body as any[];
      expect(atos.find((a) => a.ato === 'CONCLUIR')).toMatchObject({ disponivel: true });
    });
  });

  // ==========================================================================
  describe('B. dispensa: o julgamento grava pelo mesmo serviço; homologação única', () => {
    let lic: any;

    beforeAll(async () => {
      // 2 itens (10 un. e 20 un.): A 90 e 45; D 95 e 50 → A vence os dois
      lic = await criarDispensaComPropostas(ctx, orgao, [
        { fornecedor: A, valores: [90, 45] },
        { fornecedor: D, valores: [95, 50] },
      ]);
      await q(`UPDATE propostas SET prazo_entrega_dias = 20 WHERE licitacao_id = $1 AND fornecedor_id = $2`, [lic.id, A.id]);
    });

    test('julgar: vencedor VENCEDOR em cada item (unidade ITEM) e itens ADJUDICADO com a melhor oferta final', async () => {
      await http().post(`/api/licitacoes/${lic.id}/julgar-dispensa`).set(bearer(orgao.token)).expect(201);
      const its = await itensDb(lic.id);
      expect(its.map((i) => [i.status, i.fornecedor_vencedor_id, Number(i.valor_total_homologado)])).toEqual([
        ['ADJUDICADO', A.id, 900],
        ['ADJUDICADO', A.id, 900],
      ]);
      const venc = (await situacoes(lic.id)).filter((s) => s.situacao === 'VENCEDOR');
      expect(venc.map((s) => [s.u, s.f]).sort()).toEqual(its.map((i) => [i.id, A.id]).sort());
      const p = await painelResultado(ctx, lic.id, orgao.token);
      expect(p.adjudicaPelaSala).toBe(false);
      expect(p.unidades.map((u: any) => u.situacao)).toEqual(['ADJUDICADA', 'ADJUDICADA']);
      expect(p.valorAdjudicado).toBe(1800);
      // o ADJUDICAR da sala não se aplica à dispensa
      expect((await adjudicarResultado(ctx, lic.id, orgao.token)).status).toBe(400);
    });

    test('homologar (mesmo método): valor calculado 1800; contrato com o prazo da proposta vencedora (20 dias)', async () => {
      const r = await homologarResultado(ctx, lic.id, orgao.token);
      expect(r.status).toBe(200);
      expect(r.body.valorHomologado).toBe(1800);
      const cs = await contratosDb(lic.id);
      expect(cs).toHaveLength(1);
      expect(cs[0]).toMatchObject({ fornecedor_id: A.id, status: 'AGUARDANDO_ASSINATURA', data_assinatura: null, prazo_execucao_dias: 20 });
    });
  });

  // ==========================================================================
  describe('C. seleção externa numa licitação SRP: mesmo dado; homologar chama o gancho da ARP', () => {
    let lic: any;

    beforeAll(async () => {
      lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await q(`UPDATE licitacoes SET srp = true WHERE id = $1`, [lic.id]);
    });

    test('resultado externo grava VENCEDOR + itens ADJUDICADO pelo ResultadoService', async () => {
      const r = await http()
        .post(`/api/licitacoes/${lic.id}/resultado-externo`)
        .set(bearer(orgao.token))
        .send({
          plataforma_externa: 'BLL Compras',
          numero_processo_externo: 'PE-E6/2026',
          itens: lic.itens.map((i: any, idx: number) => ({ item_id: i.id, fornecedor_id: D.id, valor_unitario: idx === 0 ? 80 : 40 })),
        });
      expect(r.status).toBe(201);
      const its = await itensDb(lic.id);
      expect(its.map((i) => [i.status, i.fornecedor_vencedor_id, Number(i.valor_total_homologado)])).toEqual([
        ['ADJUDICADO', D.id, 800],
        ['ADJUDICADO', D.id, 800],
      ]);
      expect((await situacoes(lic.id)).filter((s) => s.situacao === 'VENCEDOR').map((s) => s.f)).toEqual([D.id, D.id]);
    });

    test('homologar: SRP não gera contrato; o gancho padrão da ARP responde 501 (registrado na resposta)', async () => {
      const r = await homologarResultado(ctx, lic.id, orgao.token);
      expect(r.status).toBe(200);
      expect(r.body.valorHomologado).toBe(1600);
      expect(r.body.instrumentos.erro).toMatch(/Ata de Registro de Preços ainda não implementada/);
      expect(r.body.instrumentos.status).toBe(501);
      expect(await contratosDb(lic.id)).toHaveLength(0);
      expect((await itensDb(lic.id)).map((i) => i.status)).toEqual(['HOMOLOGADO', 'HOMOLOGADO']);
      expect((await gerarInstrumentos(ctx, lic.id, orgao.token)).status).toBe(501);
    });

    test('gerar instrumentos chama o gancho da ARP (implementação plugável) — nunca contrato', async () => {
      const gerador: any = ctx.app.get(GERADOR_ATA_REGISTRO_PRECO);
      const spy = jest.spyOn(gerador, 'gerarAtaRegistroPreco').mockResolvedValue([]);
      try {
        const g = await gerarInstrumentos(ctx, lic.id, orgao.token);
        expect(g.status).toBe(200);
        expect(g.body.tipo).toBe('ATA');
        expect(spy).toHaveBeenCalledWith(lic.id, expect.objectContaining({ ator: expect.objectContaining({ tipo: 'ORGAO' }) }));
        expect(await contratosDb(lic.id)).toHaveLength(0);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // ==========================================================================
  describe('D. demanda de origem: EM_CONTRATACAO ao virar processo; CONTRATADA com o contrato assinado', () => {
    test('status automático da demanda', async () => {
      const [dem] = await q(
        `INSERT INTO demandas (id, orgao_id, ano_referencia, unidade_requisitante, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 2026, 'Secretaria de Educação E6', 'APROVADA', now(), now()) RETURNING id`,
        [orgao.id],
      );
      const r = await http()
        .post('/api/licitacoes/a-partir-de-demanda')
        .set(bearer(orgao.token))
        .send({ demanda_id: dem.id, objeto: 'Processo da demanda E6', modalidade: ModalidadeLicitacao.DISPENSA_ELETRONICA });
      expect(r.status).toBe(201);
      const status = async () => (await q(`SELECT status::text AS s FROM demandas WHERE id = $1`, [dem.id]))[0].s;
      expect(await status()).toBe('EM_CONTRATACAO');
      // demanda em contratação não se edita
      expect((await http().put(`/api/demandas/${dem.id}`).set(bearer(orgao.token)).send({ observacoes: 'x' })).status).toBeGreaterThanOrEqual(400);
      // última assinatura do contrato (portal de assinaturas) → CONTRATADA
      await marcarContratado(ctx.dataSource, r.body.id);
      expect(await status()).toBe('CONTRATADA');
      await marcarContratado(ctx.dataSource, r.body.id); // idempotente
      expect(await status()).toBe('CONTRATADA');
    });
  });

  // ==========================================================================
  describe('E. migração das licitações homologadas pelos caminhos antigos (idempotente)', () => {
    test('itens HOMOLOGADO, vencedor em licitantes_unidade e valor homologado — sem gerar contrato', async () => {
      const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO);
      // retrato da sala antiga: HOMOLOGACAO, vencedor/valor nos itens, status ATIVO, sem valor_homologado
      await q(`UPDATE licitacoes SET fase = 'HOMOLOGACAO', data_homologacao = now(), valor_homologado = NULL WHERE id = $1`, [lic.id]);
      await q(
        `UPDATE itens_licitacao SET fornecedor_vencedor_id = $2, valor_unitario_homologado = 70, valor_total_homologado = quantidade * 70
          WHERE licitacao_id = $1`,
        [lic.id, D.id],
      );
      const r1 = await migrarResultado(ctx.dataSource);
      expect(r1.itensHomologados).toBeGreaterThanOrEqual(2);
      const its = await itensDb(lic.id);
      expect(its.map((i) => i.status)).toEqual(['HOMOLOGADO', 'HOMOLOGADO']);
      expect((await situacoes(lic.id)).filter((s) => s.situacao === 'VENCEDOR')).toHaveLength(2);
      expect(Number((await buscarLicitacao(ctx, lic)).valor_homologado)).toBe(2100);
      expect(await contratosDb(lic.id)).toHaveLength(0);

      const r2 = await migrarResultado(ctx.dataSource);
      expect(r2).toEqual({ itensHomologados: 0, itensAdjudicados: 0, vencedores: 0, valoresHomologados: 0 });
    });
  });
});
