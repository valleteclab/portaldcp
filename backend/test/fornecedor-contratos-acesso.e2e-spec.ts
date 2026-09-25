/**
 * ============================================================================
 * PORTAL DO FORNECEDOR — acesso a contratos, medições, OS/OF e notas fiscais
 * ============================================================================
 *
 * `/api/fornecedor/contratos/**` e `/api/fornecedor/ordens/**`: a identidade do
 * fornecedor vem SÓ do token.
 *  - `fornecedorId`/`fornecedor_id` legado (query/corpo) igual ao do token → ok;
 *    diferente → 403; ausente → usa o do token;
 *  - contrato/medição/anexo/ordem de OUTRO fornecedor → 404 (não confirma que existe);
 *  - token de órgão nessas rotas → 403 (o órgão tem as rotas dele);
 *  - sem token → 401.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  criarApp,
  criarFornecedor,
  criarOrgao,
} from './support';
import { Medicao, StatusMedicao } from '../src/contratos/entities/medicao.entity';
import { OrdemFornecimento } from '../src/almoxarifado/entities/ordem-fornecimento.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Portal do fornecedor — contratos, medições e ordens só do próprio fornecedor', () => {
  let ctx: AppE2E;
  let orgao: OrgaoFixture;
  let A: FornecedorFixture;
  let B: FornecedorFixture;
  let contratoA: string;
  let contratoB: string;
  let medicaoA: string;
  let medicaoB: string;
  let ordemA: string;
  let ordemB: string;
  const http = () => ctx.http();

  /** Contrato pelo caminho real do órgão (POST /api/contratos). */
  async function criarContrato(f: FornecedorFixture): Promise<string> {
    const r = await http()
      .post('/api/contratos')
      .set(bearer(orgao.token))
      .send({
        orgao_id: orgao.id,
        fornecedor_id: f.id,
        fornecedor_cnpj: f.cnpj,
        fornecedor_razao_social: f.razao_social,
        objeto: `Serviço continuado E2E — ${f.razao_social}`,
        modalidade_execucao: 'CONTINUADO',
        valor_inicial: 12000,
        valor_global: 12000,
        data_assinatura: '2026-01-10',
        data_vigencia_inicio: '2026-01-10',
        data_vigencia_fim: '2026-12-31',
      });
    expect([200, 201]).toContain(r.status);
    return r.body.id;
  }

  /**
   * Medição inserida por repositório: pela API ela exige uma OS AUTORIZADA
   * (fluxo requisição → autorização no almoxarifado, com itens/estoque) — um
   * fluxo inteiro que não é o objeto deste teste (que é só o acesso de leitura
   * e escrita do fornecedor às medições existentes).
   */
  async function criarMedicao(contratoId: string, numero: number): Promise<string> {
    const m = await ctx.dataSource.getRepository(Medicao).save(
      ctx.dataSource.getRepository(Medicao).create({
        contrato_id: contratoId,
        numero_medicao: numero,
        periodo_inicio: new Date('2026-02-01'),
        periodo_fim: new Date('2026-02-28'),
        valor_medido: 1000,
        valor_acumulado_atual: 1000,
        percentual_fisico_medido: 10,
        status: StatusMedicao.RASCUNHO,
      } as any),
    );
    return (m as any).id;
  }

  /**
   * Ordem de fornecimento/serviço inserida por repositório: pela API ela nasce
   * de requisição autorizada + geração no almoxarifado (itens, estoque,
   * aprovações). Aqui só interessa o acesso do fornecedor à ordem.
   */
  async function criarOrdem(contratoId: string, f: FornecedorFixture, seq: number): Promise<string> {
    const repo = ctx.dataSource.getRepository(OrdemFornecimento);
    const o = await repo.save(
      repo.create({
        orgao_id: orgao.id,
        contrato_id: contratoId,
        fornecedor_id: f.id,
        numero: `OF-E2E-${seq}-${Date.now()}`,
        ano: 2026,
        sequencial: 900000 + seq,
        data_emissao: new Date('2026-02-01'),
        valor_total: 500,
        usuario_emitente_id: orgao.id,
        usuario_emitente_nome: 'Órgão E2E',
      } as any),
    );
    return (o as any).id;
  }

  beforeAll(async () => {
    ctx = await criarApp();
    orgao = await criarOrgao(ctx, { nome: 'Prefeitura Portal Fornecedor' });
    A = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    B = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    contratoA = await criarContrato(A);
    contratoB = await criarContrato(B);
    medicaoA = await criarMedicao(contratoA, 1);
    medicaoB = await criarMedicao(contratoB, 1);
    ordemA = await criarOrdem(contratoA, A, 1);
    ordemB = await criarOrdem(contratoB, B, 2);
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('fornecedor A lê o que é dele', () => {
    it('detalhe do contrato, medições, resumo, detalhe/anexos/discriminações da medição', async () => {
      const det = await http().get(`/api/fornecedor/contratos/${contratoA}/detalhe`).set(bearer(A.token));
      expect(det.status).toBe(200);
      expect(det.body.id).toBe(contratoA);

      // o front ainda manda ?fornecedorId= — igual ao token segue aceito
      const detQ = await http().get(`/api/fornecedor/contratos/${contratoA}/detalhe?fornecedorId=${A.id}`).set(bearer(A.token));
      expect(detQ.status).toBe(200);

      const meds = await http().get(`/api/fornecedor/contratos/${contratoA}/medicoes`).set(bearer(A.token));
      expect(meds.status).toBe(200);
      expect(JSON.stringify(meds.body)).toContain(medicaoA);

      expect((await http().get(`/api/fornecedor/contratos/${contratoA}/medicoes/resumo`).set(bearer(A.token))).status).toBe(200);
      const med = await http().get(`/api/fornecedor/contratos/medicoes/${medicaoA}`).set(bearer(A.token));
      expect(med.status).toBe(200);
      expect(med.body.id).toBe(medicaoA);
      expect((await http().get(`/api/fornecedor/contratos/medicoes/${medicaoA}/anexos`).set(bearer(A.token))).status).toBe(200);
      expect(
        (await http().get(`/api/fornecedor/contratos/medicoes/${medicaoA}/discriminacoes?fornecedorId=${A.id}`).set(bearer(A.token))).status,
      ).toBe(200);
    });

    it('lista de contratos de medição só com a rota do próprio id', async () => {
      const r = await http().get(`/api/fornecedor/contratos/${A.id}/medicao`).set(bearer(A.token));
      expect(r.status).toBe(200);
      const ids = (r.body as any[]).map((c) => c.id);
      expect(ids).toContain(contratoA);
      expect(ids).not.toContain(contratoB);
    });

    it('ordem (OF/OS) própria e as notas fiscais dela', async () => {
      const o = await http().get(`/api/fornecedor/ordens/${ordemA}`).set(bearer(A.token));
      expect(o.status).toBe(200);
      expect(o.body.id).toBe(ordemA);
      expect((await http().get(`/api/fornecedor/ordens/${ordemA}/notas-fiscais`).set(bearer(A.token))).status).toBe(200);
      const lista = await http().get('/api/fornecedor/ordens').set(bearer(A.token));
      expect(lista.status).toBe(200);
      const ids = JSON.stringify(lista.body);
      expect(ids).toContain(ordemA);
      expect(ids).not.toContain(ordemB);
    });
  });

  // ==========================================================================
  describe('fornecedor A NÃO lê nada do fornecedor B', () => {
    it('contrato de B: detalhe/etapas/itens/medições/resumo/execução financeira/equipe → 404', async () => {
      const rotas = [
        `/api/fornecedor/contratos/${contratoB}/detalhe`,
        `/api/fornecedor/contratos/${contratoB}/detalhe?fornecedorId=${A.id}`,
        `/api/fornecedor/contratos/${contratoB}/etapas`,
        `/api/fornecedor/contratos/${contratoB}/itens-cronograma`,
        `/api/fornecedor/contratos/${contratoB}/medicoes`,
        `/api/fornecedor/contratos/${contratoB}/medicoes/resumo`,
        `/api/fornecedor/contratos/${contratoB}/execucao-financeira`,
        `/api/fornecedor/contratos/${contratoB}/equipe/ultima`,
        `/api/fornecedor/contratos/${contratoB}/pre-os`,
      ];
      for (const rota of rotas) {
        const r = await http().get(rota).set(bearer(A.token));
        expect([rota, [403, 404].includes(r.status)]).toEqual([rota, true]);
        expect(JSON.stringify(r.body)).not.toContain(B.razao_social);
      }
      // as de leitura de contrato do controller principal respondem 404 (não confirma existência)
      expect((await http().get(`/api/fornecedor/contratos/${contratoB}/detalhe`).set(bearer(A.token))).status).toBe(404);
      expect((await http().get(`/api/fornecedor/contratos/${contratoB}/medicoes`).set(bearer(A.token))).status).toBe(404);
    });

    it('medição de B: detalhe/boletim/anexos/discriminações/equipe → 404', async () => {
      const rotas = [
        `/api/fornecedor/contratos/medicoes/${medicaoB}`,
        `/api/fornecedor/contratos/medicoes/${medicaoB}/boletim-oficial`,
        `/api/fornecedor/contratos/medicoes/${medicaoB}/anexos`,
        `/api/fornecedor/contratos/medicoes/${medicaoB}/discriminacoes`,
        `/api/fornecedor/contratos/medicoes/${medicaoB}/discriminacoes/sugestao`,
        `/api/fornecedor/contratos/medicoes/${medicaoB}/equipe`,
        `/api/fornecedor/contratos/${contratoA}/execucao-financeira?medicaoId=${medicaoB}`,
      ];
      for (const rota of rotas) {
        const r = await http().get(rota).set(bearer(A.token));
        expect([rota, r.status]).toEqual([rota, 404]);
      }
    });

    it('escrita em medição/contrato de B → 404 e nada muda', async () => {
      const patch = await http()
        .patch(`/api/fornecedor/contratos/medicoes/${medicaoB}`)
        .set(bearer(A.token))
        .send({ observacoes: 'invasão', periodo_inicio: '2026-02-01', periodo_fim: '2026-02-28' });
      const del = await http().delete(`/api/fornecedor/contratos/medicoes/${medicaoB}`).set(bearer(A.token));
      const disc = await http()
        .post(`/api/fornecedor/contratos/medicoes/${medicaoB}/discriminacoes`)
        .set(bearer(A.token))
        .send({ itens: [] });
      const sub = await http().patch(`/api/fornecedor/contratos/medicoes/${medicaoB}/submeter`).set(bearer(A.token)).send({});
      const ass = await http().post(`/api/fornecedor/contratos/medicoes/${medicaoB}/assinar`).set(bearer(A.token)).send({ usuario_nome: 'x' });
      const criar = await http()
        .post(`/api/fornecedor/contratos/${contratoB}/medicoes`)
        .set(bearer(A.token))
        .send({ periodo_inicio: '2026-03-01', periodo_fim: '2026-03-31' });
      expect([patch.status, del.status, disc.status, sub.status, ass.status, criar.status]).toEqual([404, 404, 404, 404, 404, 404]);
      const [m] = await ctx.dataSource.query(`SELECT status, observacoes FROM medicoes WHERE id = $1`, [medicaoB]);
      expect(m.status).toBe(StatusMedicao.RASCUNHO);
      expect(m.observacoes).not.toBe('invasão');
      const [{ n }] = await ctx.dataSource.query(`SELECT count(*)::int AS n FROM medicoes WHERE contrato_id = $1`, [contratoB]);
      expect(n).toBe(1);
    });

    it('fornecedorId de outro (query/corpo/rota) → 403, mesmo no próprio contrato', async () => {
      expect((await http().get(`/api/fornecedor/contratos/${contratoA}/detalhe?fornecedorId=${B.id}`).set(bearer(A.token))).status).toBe(403);
      expect((await http().get(`/api/fornecedor/contratos/${B.id}/medicao`).set(bearer(A.token))).status).toBe(403);
      expect((await http().get(`/api/fornecedor/contratos/mensagens?fornecedorId=${B.id}`).set(bearer(A.token))).status).toBe(403);
      expect(
        (
          await http()
            .post(`/api/fornecedor/contratos/medicoes/${medicaoA}/discriminacoes`)
            .set(bearer(A.token))
            .send({ fornecedor_id: B.id, itens: [] })
        ).status,
      ).toBe(403);
      expect((await http().get(`/api/atualizacoes/nao-lida?fornecedorId=${B.id}`).set(bearer(A.token))).status).toBe(403);
    });

    it('ordem de B e as notas fiscais dela → 404', async () => {
      expect((await http().get(`/api/fornecedor/ordens/${ordemB}`).set(bearer(A.token))).status).toBe(404);
      expect((await http().get(`/api/fornecedor/ordens/${ordemB}/notas-fiscais`).set(bearer(A.token))).status).toBe(404);
      expect((await http().get(`/api/fornecedor/ordens/${ordemB}/nota-fiscal`).set(bearer(A.token))).status).toBe(404);
      const cie = await http().post(`/api/fornecedor/ordens/${ordemB}/ciencia-recebimento`).set(bearer(A.token)).send({});
      expect([403, 404]).toContain(cie.status);
    });

    it('medição assistida (IA/chat) em contrato de B → recusado', async () => {
      const ia = await http()
        .post('/api/medicao-ia/criar-rascunho')
        .set(bearer(A.token))
        .send({ contrato_id: contratoB, periodo_inicio: '2026-03-01', periodo_fim: '2026-03-31' });
      expect(ia.status).toBe(404);
      const chat = await http().post(`/api/fornecedor/contratos/${contratoB}/medicao-chat/sessoes`).set(bearer(A.token)).send({});
      expect(chat.status).toBe(404);
    });
  });

  // ==========================================================================
  describe('outros perfis', () => {
    it('token de órgão nas rotas do fornecedor → 403 (mesmo sendo o órgão do contrato)', async () => {
      const rotas = [
        `/api/fornecedor/contratos/${contratoA}/detalhe`,
        `/api/fornecedor/contratos/${contratoA}/medicoes`,
        `/api/fornecedor/contratos/${contratoA}/execucao-financeira?fornecedorId=${A.id}`,
        `/api/fornecedor/contratos/medicoes/${medicaoA}`,
        `/api/fornecedor/contratos/medicoes/${medicaoA}/boletim-oficial?fornecedorId=${A.id}`,
        `/api/fornecedor/contratos/mensagens?fornecedorId=${A.id}`,
        `/api/fornecedor/contratos/${A.id}/medicao`,
        `/api/fornecedor/ordens/${ordemA}`,
        `/api/fornecedor/ordens/${ordemA}/notas-fiscais`,
      ];
      for (const rota of rotas) {
        const r = await http().get(rota).set(bearer(orgao.token));
        expect([rota, r.status]).toEqual([rota, 403]);
      }
      const admin = await http().get(`/api/fornecedor/contratos/${contratoA}/detalhe`).set(bearer(ctx.tokenAdmin()));
      expect(admin.status).toBe(403);
    });

    it('anônimo → 401', async () => {
      const rotas = [
        `/api/fornecedor/contratos/${contratoA}/detalhe`,
        `/api/fornecedor/contratos/${contratoA}/medicoes`,
        `/api/fornecedor/contratos/medicoes/${medicaoA}`,
        `/api/fornecedor/contratos/medicoes/${medicaoA}/boletim-oficial`,
        `/api/fornecedor/contratos/${contratoA}/execucao-financeira`,
        `/api/fornecedor/ordens/${ordemA}`,
      ];
      for (const rota of rotas) {
        const r = await http().get(rota);
        expect([rota, r.status]).toEqual([rota, 401]);
      }
    });
  });
});
