/**
 * Dispensa eletrônica depois do julgamento (homologação 08/11/2026):
 *  - sem a habilitação do vencedor registrada, a homologação é recusada (art. 72, V);
 *  - inabilitado: a proposta sai e o próximo da classificação vira o vencedor;
 *  - contraproposta aceita pelo vencedor vira o valor adjudicado (IN 67, art. 16);
 *  - o fornecedor assina o termo do contrato pelo portal, sem link de e-mail.
 */
import { AppE2E, OrgaoFixture, criarApp, criarFornecedor, criarLicitacao, criarOrgao, levarAteFase, FornecedorFixture } from './support';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { homologarResultado, habilitarVencedoresDispensa } from './support/resultado';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Dispensa eletrônica — habilitação do vencedor, negociação e assinatura do fornecedor', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let f1: FornecedorFixture;
  let f2: FornecedorFixture;
  let licId: string;
  let itemId: string;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Órgão pós-julgamento da dispensa' });
    f1 = await criarFornecedor(ctx, { porte: 'ME' });
    f2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA, {
      itens: [{ descricao: 'Manutenção de ar-condicionado', quantidade: 10, valor_unitario_estimado: 100 }],
    });
    licId = lic.id;
    itemId = lic.itens[0].id;
    await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
    for (const [f, v] of [[f1, 90], [f2, 95]] as Array<[FornecedorFixture, number]>) {
      const p = await http().post('/api/propostas').set(bearer(f.token)).send({ licitacao_id: licId, itens: [{ item_licitacao_id: itemId, valor_unitario: v }], declaracao_termos: true, declaracao_mpe: false, declaracao_integridade: false, declaracao_reserva_cargos: false, declaracao_inexistencia_fatos: true, declaracao_menor: true, declaracao_custos_trabalhistas: true, declaracao_responsabilidade: true });
      if (p.status >= 300) throw new Error('proposta ' + JSON.stringify(p.body));
      await http().put(`/api/propostas/${p.body.id}/enviar`).set(bearer(f.token)).expect(200);
    }
    // fim do prazo e julgamento sem etapa de lances
    await sql(`UPDATE licitacoes SET data_fim_acolhimento = now() - interval '1 minute', data_abertura_sessao = now() - interval '1 minute', dispensa_com_lances = false WHERE id = $1`, [licId]);
    const j = await http().post(`/api/licitacoes/${licId}/julgar-dispensa`).set(bearer(orgao.token));
    if (j.status >= 300) throw new Error('julgar ' + JSON.stringify(j.body));
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  test('sem habilitação registrada, homologar é recusado', async () => {
    const r = await homologarResultado(ctx, licId, orgao.token);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).toMatch(/Habilitação do vencedor pendente/);
  });

  test('inabilitar o 1º chama o 2º da classificação', async () => {
    const r = await http().post(`/api/licitacoes/${licId}/dispensa/habilitacao`).set(bearer(orgao.token)).send({ fornecedor_id: f1.id, resultado: 'INABILITADO', motivo: 'CND federal vencida em 01/11/2026' });
    expect(r.status).toBe(201);
    expect(r.body.vencedores.map((v: any) => v.fornecedor_id)).toEqual([f2.id]);
  });

  test('contraproposta aceita pelo vencedor vira o valor adjudicado', async () => {
    const r = await http().post(`/api/licitacoes/${licId}/dispensa/negociacao`).set(bearer(orgao.token)).send({ item_id: itemId, valor_unitario: 92 });
    expect(r.status).toBe(201);
    const minhas = await http().get(`/api/licitacoes/${licId}/dispensa/negociacao/minhas`).set(bearer(f2.token)).expect(200);
    const pendente = minhas.body.find((n: any) => n.status === 'PENDENTE');
    expect(pendente).toBeTruthy();
    // outro fornecedor não responde a contraproposta alheia
    expect((await http().post(`/api/licitacoes/${licId}/dispensa/negociacao/${pendente.id}/responder`).set(bearer(f1.token)).send({ aceitar: true })).status).toBe(404);
    await http().post(`/api/licitacoes/${licId}/dispensa/negociacao/${pendente.id}/responder`).set(bearer(f2.token)).send({ aceitar: true }).expect(201);
    const [it] = await sql(`SELECT valor_unitario_homologado, valor_total_homologado FROM itens_licitacao WHERE id = $1`, [itemId]);
    expect([Number(it.valor_unitario_homologado), Number(it.valor_total_homologado)]).toEqual([92, 920]);
  });

  test('habilitado, homologa com o valor negociado e o fornecedor assina o termo pelo portal', async () => {
    await habilitarVencedoresDispensa(ctx, licId, orgao.token);
    const h = await homologarResultado(ctx, licId, orgao.token).expect(200);
    expect(h.body.valorHomologado).toBe(920);
    const [ctr] = await sql(`SELECT id::text AS id FROM contratos WHERE licitacao_id = $1`, [licId]);
    expect(ctr).toBeTruthy();
    await http().post(`/api/contratos/${ctr.id}/solicitar-assinaturas`).set(bearer(orgao.token)).send({}).expect(201);
    const s0 = await http().get(`/api/fornecedor/contratos/${ctr.id}/assinatura`).set(bearer(f2.token)).expect(200);
    expect(s0.body.pode_assinar).toBe(true);
    // outro fornecedor não vê nem assina
    expect((await http().get(`/api/fornecedor/contratos/${ctr.id}/assinatura`).set(bearer(f1.token))).status).toBe(404);
    await http().post(`/api/fornecedor/contratos/${ctr.id}/assinar`).set(bearer(f2.token)).expect(201);
    const s1 = await http().get(`/api/fornecedor/contratos/${ctr.id}/assinatura`).set(bearer(f2.token)).expect(200);
    expect(s1.body.ja_assinou).toBe(true);
  });
});
