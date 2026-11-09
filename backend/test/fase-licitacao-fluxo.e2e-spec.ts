/**
 * Pregão conduzido pelo fluxo novo (homologação 09/11/2026, pregão 2026/00070):
 *  - a etapa de Publicação abria com a licitação ainda em PLANEJAMENTO e o
 *    PUBLICAR do rito completo só parte de APROVACAO_INTERNA — o alinhamento
 *    aplica os atos de conclusão das fases internas, com as travas de cada um;
 *  - o edital (PDF) só podia ser anexado: agora é gerado da minuta do edital
 *    (com o TR e a minuta do contrato como anexos).
 */
import { AppE2E, OrgaoFixture, criarApp, criarLicitacao, criarOrgao, prepararDocumentosEtapa } from './support';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { FaseDaLicitacaoNoFluxoService } from '../src/workflow/ponte/fase-da-licitacao.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Pregão no fluxo: fase da licitação e edital gerado da minuta', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  const fase = async (id: string) => (await ctx.dataSource.query(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [id]))[0].fase;

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Órgão do pregão no fluxo' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  test('sem os documentos de uma etapa, o alinhamento para nela; completos, chega à aprovação interna', async () => {
    const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
    const servico = ctx.app.get(FaseDaLicitacaoNoFluxoService);
    expect(await fase(lic.id)).toBe(FaseLicitacao.PLANEJAMENTO);
    await prepararDocumentosEtapa(ctx, lic, FaseLicitacao.PLANEJAMENTO);
    // TR ainda sem documentos: para no TERMO_REFERENCIA
    expect(await servico.alinhar(lic.id)).toBe(false);
    expect(await fase(lic.id)).toBe(FaseLicitacao.TERMO_REFERENCIA);
    for (const f of [FaseLicitacao.TERMO_REFERENCIA, FaseLicitacao.PESQUISA_PRECOS, FaseLicitacao.ANALISE_JURIDICA]) await prepararDocumentosEtapa(ctx, lic, f);
    expect(await servico.alinhar(lic.id)).toBe(true);
    expect(await fase(lic.id)).toBe(FaseLicitacao.APROVACAO_INTERNA);
    // Idempotente
    expect(await servico.alinhar(lic.id)).toBe(false);
    expect(await fase(lic.id)).toBe(FaseLicitacao.APROVACAO_INTERNA);
  });

  test('dispensa não é mexida', async () => {
    const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.DISPENSA_ELETRONICA);
    expect(await ctx.app.get(FaseDaLicitacaoNoFluxoService).alinhar(lic.id)).toBe(false);
    expect(await fase(lic.id)).toBe(FaseLicitacao.PLANEJAMENTO);
  });

  test('edital gerado da minuta: sem minuta 400; com a minuta, vira o edital (RASCUNHO) e conta no checklist', async () => {
    const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
    const gerar = () => ctx.http().post(`/api/publicacao/licitacao/${lic.id}/edital/gerar-da-minuta`).set(bearer(A.token));
    const sem = await gerar();
    expect(sem.status).toBe(400);
    expect(sem.body.message).toMatch(/minuta do edital/i);
    for (const f of [FaseLicitacao.PLANEJAMENTO, FaseLicitacao.TERMO_REFERENCIA, FaseLicitacao.PESQUISA_PRECOS]) await prepararDocumentosEtapa(ctx, lic, f);
    for (const tipo of ['ME']) {
      await ctx
        .http()
        .post(`/api/fase-interna/${lic.id}/documento`)
        .set(bearer(A.token))
        .send({ tipo, titulo: `${tipo} — e2e`, descricao: `Texto da peça ${tipo} para o edital.` })
        .expect(201);
    }
    const r = await gerar();
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('RASCUNHO');
    const e = (await ctx.http().get(`/api/publicacao/licitacao/${lic.id}/edital`).set(bearer(A.token)).expect(200)).body;
    expect(e.vigente).toMatchObject({ status: 'RASCUNHO' });
    // outro órgão não gera
    const B = await criarOrgao(ctx, { nome: 'Outro órgão' });
    expect((await ctx.http().post(`/api/publicacao/licitacao/${lic.id}/edital/gerar-da-minuta`).set(bearer(B.token))).status).toBe(403);
  });
});
