/**
 * ============================================================================
 * ISOLAMENTO — demandas (DFD), contratações futuras e consolidação no PCA
 * ============================================================================
 *
 * Regra do dono: nada vaza entre órgãos. Órgão e usuário SEMPRE do token.
 *  - leitura de demanda/item de outro órgão → 404; escrita → 403;
 *  - `orgaoId`/`orgao_id` de outro órgão no corpo do POST → 403 (nada criado);
 *  - listagens ignoram `?orgaoId=` de outro órgão (só o admin escolhe);
 *  - listas de DFDs no corpo (contratação futura, consolidar no PCA) com DFD de
 *    outro órgão → 403, e nada muda;
 *  - PUT não troca dono/vínculos/ciclo (orgao_id, status, pca_id...);
 *  - aprovar/rejeitar: usuário do token precisa de `pode_aprovar_demandas`;
 *  - fornecedor → 403 em tudo; anônimo → 401.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { PcaService } from '../src/pca/pca.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const ANO = 2035;
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Isolamento — demandas e PCA', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F1: FornecedorFixture;
  let usuarioA: UsuarioOrgaoFixture; // sem pode_aprovar_demandas
  let aprovadorA: UsuarioOrgaoFixture; // com pode_aprovar_demandas
  let aprovadorB: UsuarioOrgaoFixture; // com pode_aprovar_demandas (de B)
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);

  // Fixtures de A
  let demandaA: string; // RASCUNHO, com item
  let itemA: string;
  let demandaAprovadaA: string; // APROVADA, com item
  let pcaA: string;
  let itemPcaA: string;
  // Fixtures de B
  let demandaB: string;
  let itemB: string;
  let demandaAprovadaB: string;
  let pcaB: string;
  let itemPcaB: string;
  let contratacaoB: string;

  async function criarDemanda(o: OrgaoFixture, unidade: string): Promise<{ demanda: string; item: string }> {
    const d = await http()
      .post('/api/demandas')
      .set(bearer(o.token))
      .send({ ano_referencia: ANO, unidade_requisitante: unidade, descricao_sucinta_objeto: `Objeto ${unidade}` })
      .expect(201);
    expect(d.body.orgao_id).toBe(o.id);
    const i = await http()
      .post(`/api/demandas/${d.body.id}/itens`)
      .set(bearer(o.token))
      .send({ categoria: 'MATERIAL', descricao_objeto: `Papel A4 ${unidade}`, quantidade_estimada: 10, valor_unitario_estimado: 25 })
      .expect(201);
    return { demanda: d.body.id, item: i.body.id };
  }

  async function aprovarDemanda(o: OrgaoFixture, id: string) {
    await http().patch(`/api/demandas/${id}/enviar`).set(bearer(o.token)).expect(200);
    await http().patch(`/api/demandas/${id}/aprovar`).set(bearer(o.token)).send({ aprovadoPor: 'Gestor' }).expect(200);
  }

  async function estadoDemanda(id: string) {
    const [d] = await sql(
      `SELECT orgao_id, status::text AS status, pca_id, contratacao_futura_id, observacoes, unidade_requisitante
       FROM demandas WHERE id = $1`,
      [id],
    );
    return d;
  }

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Demandas (A)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Demandas (B)' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    usuarioA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO });
    aprovadorA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO });
    aprovadorB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.PREGOEIRO });
    await sql(`UPDATE usuarios SET pode_aprovar_demandas = true WHERE id = ANY($1::uuid[])`, [[aprovadorA.id, aprovadorB.id]]);

    ({ demanda: demandaA, item: itemA } = await criarDemanda(A, 'Secretaria de Saúde A'));
    ({ demanda: demandaAprovadaA } = await criarDemanda(A, 'Secretaria de Educação A'));
    await aprovarDemanda(A, demandaAprovadaA);

    ({ demanda: demandaB, item: itemB } = await criarDemanda(B, 'Secretaria de Obras B'));
    ({ demanda: demandaAprovadaB } = await criarDemanda(B, 'Secretaria de Cultura B'));
    await aprovarDemanda(B, demandaAprovadaB);

    pcaA = (await http().post('/api/pca').set(bearer(A.token)).send({ ano_exercicio: ANO }).expect(201)).body.id;
    pcaB = (await http().post('/api/pca').set(bearer(B.token)).send({ ano_exercicio: ANO }).expect(201)).body.id;
    itemPcaA = (
      await http().post(`/api/pca/${pcaA}/itens`).set(bearer(A.token)).send({ categoria: 'MATERIAL', descricao_objeto: 'Item PCA A', valor_estimado: 300 }).expect(201)
    ).body.id;
    itemPcaB = (
      await http().post(`/api/pca/${pcaB}/itens`).set(bearer(B.token)).send({ categoria: 'MATERIAL', descricao_objeto: 'Item PCA B', valor_estimado: 300 }).expect(201)
    ).body.id;

    contratacaoB = (
      await http()
        .post('/api/demandas/contratacoes-futuras')
        .set(bearer(B.token))
        .send({ ano_referencia: ANO, titulo: 'Contratação B', categoria: 'MATERIAL' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. anônimo e fornecedor', () => {
    it('anônimo → 401 em demandas e PCA', async () => {
      const rs = await Promise.all([
        http().get('/api/demandas'),
        http().get(`/api/demandas/${demandaA}`),
        http().post('/api/demandas').send({ ano_referencia: ANO, unidade_requisitante: 'X', orgaoId: A.id }),
        http().patch(`/api/demandas/${demandaAprovadaA}/aprovar`).send({ aprovadoPor: 'x' }),
        http().get('/api/demandas/contratacoes-futuras?ano=' + ANO),
        http().get('/api/pca'),
        http().post(`/api/pca/${pcaA}/consolidar-demandas`).send({ demandaIds: [demandaAprovadaA] }),
      ]);
      expect(rs.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
    });

    it('fornecedor → 403 em todas as rotas de demandas/PCA do órgão; nada muda', async () => {
      const t = bearer(F1.token);
      const rs = await Promise.all([
        http().get(`/api/demandas?orgaoId=${A.id}`).set(t),
        http().get(`/api/demandas/estatisticas?orgaoId=${A.id}&ano=${ANO}`).set(t),
        http().get(`/api/demandas/unidades?orgaoId=${A.id}`).set(t),
        http().get(`/api/demandas/para-consolidar?orgaoId=${A.id}&ano=${ANO}`).set(t),
        http().get(`/api/demandas/contratacoes-futuras?orgaoId=${A.id}&ano=${ANO}`).set(t),
        http().post('/api/demandas/contratacoes-futuras').set(t).send({ orgaoId: A.id, ano_referencia: ANO, titulo: 'x', categoria: 'MATERIAL' }),
        http().get(`/api/demandas/${demandaA}`).set(t),
        http().get(`/api/demandas/${demandaA}/acompanhamento`).set(t),
        http().post('/api/demandas').set(t).send({ orgaoId: A.id, ano_referencia: ANO, unidade_requisitante: 'Fornecedor' }),
        http().put(`/api/demandas/${demandaA}`).set(t).send({ observacoes: 'fornecedor' }),
        http().delete(`/api/demandas/${demandaA}`).set(t),
        http().post(`/api/demandas/${demandaA}/itens`).set(t).send({ categoria: 'MATERIAL', descricao_objeto: 'x' }),
        http().put(`/api/demandas/itens/${itemA}`).set(t).send({ descricao_objeto: 'x' }),
        http().delete(`/api/demandas/itens/${itemA}`).set(t),
        http().patch(`/api/demandas/${demandaAprovadaA}/aprovar`).set(t).send({ aprovadoPor: 'x' }),
        http().get('/api/pca').set(t),
        http().get(`/api/pca/${pcaA}`).set(t),
        http().post(`/api/pca/${pcaA}/consolidar-demandas`).set(t).send({ demandaIds: [demandaAprovadaA] }),
      ]);
      expect(rs.map((r) => r.status)).toEqual(rs.map(() => 403));
      const d = await estadoDemanda(demandaA);
      expect(d.status).toBe('RASCUNHO');
      expect(d.observacoes).toBeNull();
    });
  });

  // ==========================================================================
  describe('2. criação: órgão do token', () => {
    it('B com orgaoId/orgao_id de A no corpo → 403; nada criado em A', async () => {
      const [antes] = await sql(`SELECT count(*)::int AS n FROM demandas WHERE orgao_id = $1`, [A.id]);
      const r1 = await http()
        .post('/api/demandas')
        .set(bearer(B.token))
        .send({ orgaoId: A.id, ano_referencia: ANO, unidade_requisitante: 'Invasor B' });
      const r2 = await http()
        .post('/api/demandas')
        .set(bearer(aprovadorB.token))
        .send({ orgao_id: A.id, ano_referencia: ANO, unidade_requisitante: 'Invasor B' });
      expect([r1.status, r2.status]).toEqual([403, 403]);
      const [depois] = await sql(`SELECT count(*)::int AS n FROM demandas WHERE orgao_id = $1`, [A.id]);
      expect(depois.n).toBe(antes.n);
    });

    it('usuário de B sem órgão no corpo cria no órgão B', async () => {
      const r = await http()
        .post('/api/demandas')
        .set(bearer(aprovadorB.token))
        .send({ ano_referencia: ANO, unidade_requisitante: 'Setor do usuário B' })
        .expect(201);
      expect(r.body.orgao_id).toBe(B.id);
    });
  });

  // ==========================================================================
  describe('3. listagens: só o órgão do token', () => {
    it('B com ?orgaoId=A recebe só dados de B', async () => {
      const t = bearer(B.token);
      const lista = await http().get(`/api/demandas?orgaoId=${A.id}`).set(t).expect(200);
      expect(lista.body.length).toBeGreaterThan(0);
      expect(lista.body.every((d: any) => d.orgao_id === B.id)).toBe(true);
      expect(lista.body.map((d: any) => d.id)).not.toContain(demandaA);

      const unidades = await http().get(`/api/demandas/unidades?orgaoId=${A.id}`).set(t).expect(200);
      expect(unidades.body).not.toContain('Secretaria de Saúde A');
      expect(unidades.body).toContain('Secretaria de Obras B');

      const estat = await http().get(`/api/demandas/estatisticas?orgaoId=${A.id}&ano=${ANO}`).set(t).expect(200);
      expect(estat.body.porUnidade.map((u: any) => u.unidade)).not.toContain('Secretaria de Saúde A');

      const consolidar = await http().get(`/api/demandas/para-consolidar?orgaoId=${A.id}&ano=${ANO}`).set(t).expect(200);
      expect(consolidar.body.map((d: any) => d.id)).not.toContain(demandaAprovadaA);
      expect(consolidar.body.map((d: any) => d.id)).toContain(demandaAprovadaB);

      const futuras = await http().get(`/api/demandas/contratacoes-futuras?orgaoId=${A.id}&ano=${ANO}`).set(t).expect(200);
      expect(futuras.body.every((c: any) => c.orgao_id === B.id)).toBe(true);
    });
  });

  // ==========================================================================
  describe('4. demanda de outro órgão por id', () => {
    it('leitura por B → 404 (demanda e acompanhamento); id inválido → 404', async () => {
      const t = bearer(B.token);
      const rs = await Promise.all([
        http().get(`/api/demandas/${demandaA}`).set(t),
        http().get(`/api/demandas/${demandaA}/acompanhamento`).set(t),
        http().get(`/api/demandas/${demandaA}`).set(bearer(aprovadorB.token)),
        http().get(`/api/demandas/nao-e-uuid`).set(t),
        http().get(`/api/demandas/${UUID_INEXISTENTE}`).set(t),
      ]);
      expect(rs.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);
      expect(JSON.stringify(rs[0].body)).not.toContain('Secretaria de Saúde A');
    });

    it('escrita por B → 403 (alterar, excluir, itens, ciclo); nada muda', async () => {
      const t = bearer(B.token);
      const rs = [
        await http().put(`/api/demandas/${demandaA}`).set(t).send({ observacoes: 'alterado por B' }),
        await http().post(`/api/demandas/${demandaA}/itens`).set(t).send({ categoria: 'MATERIAL', descricao_objeto: 'item de B' }),
        await http().put(`/api/demandas/itens/${itemA}`).set(t).send({ descricao_objeto: 'trocado por B' }),
        await http().patch(`/api/demandas/itens/${itemA}/vincular-pca`).set(t).send({ itemPcaId: itemPcaB }),
        await http().delete(`/api/demandas/itens/${itemA}`).set(t),
        await http().patch(`/api/demandas/${demandaA}/enviar`).set(t),
        await http().patch(`/api/demandas/${demandaA}/analisar`).set(t),
        await http().patch(`/api/demandas/${demandaA}/voltar-rascunho`).set(t),
        await http().patch(`/api/demandas/${demandaAprovadaA}/consolidar`).set(t).send({ pcaId: pcaB }),
        await http().delete(`/api/demandas/${demandaA}`).set(t),
      ];
      expect(rs.map((r) => r.status)).toEqual(rs.map(() => 403));

      const d = await estadoDemanda(demandaA);
      expect(d).toMatchObject({ orgao_id: A.id, status: 'RASCUNHO', observacoes: null });
      const itens = await sql(`SELECT id, descricao_objeto, item_pca_id FROM itens_demanda WHERE demanda_id = $1`, [demandaA]);
      expect(itens).toHaveLength(1);
      expect(itens[0]).toMatchObject({ id: itemA, item_pca_id: null });
      expect(itens[0].descricao_objeto).not.toContain('B');
      const aprovada = await estadoDemanda(demandaAprovadaA);
      expect(aprovada).toMatchObject({ status: 'APROVADA', pca_id: null });
    });

    it('aprovar/rejeitar demanda de A: B (órgão ou usuário com permissão) → 403', async () => {
      const idEnviada = (await criarDemanda(A, 'Setor enviado A')).demanda;
      await http().patch(`/api/demandas/${idEnviada}/enviar`).set(bearer(A.token)).expect(200);
      const rs = [
        await http().patch(`/api/demandas/${idEnviada}/aprovar`).set(bearer(B.token)).send({ aprovadoPor: 'B' }),
        await http().patch(`/api/demandas/${idEnviada}/aprovar`).set(bearer(aprovadorB.token)).send({ aprovadoPor: 'B' }),
        await http().patch(`/api/demandas/${idEnviada}/rejeitar`).set(bearer(aprovadorB.token)).send({ motivo: 'B' }),
      ];
      expect(rs.map((r) => r.status)).toEqual([403, 403, 403]);
      expect((await estadoDemanda(idEnviada)).status).toBe('ENVIADA');

      // no próprio órgão: sem a flag → 403; com a flag (usuário do TOKEN) → 200
      await http().patch(`/api/demandas/${idEnviada}/aprovar`).set(bearer(usuarioA.token)).send({ aprovadoPor: 'x' }).expect(403);
      await http().patch(`/api/demandas/${idEnviada}/aprovar`).set(bearer(aprovadorA.token)).send({ aprovadoPor: 'Aprovador A' }).expect(200);
      expect((await estadoDemanda(idEnviada)).status).toBe('APROVADA');
    });
  });

  // ==========================================================================
  describe('5. PUT não troca dono, vínculos nem ciclo', () => {
    it('A tentando mover a demanda para B / aprová-la pelo PUT: campos ignorados', async () => {
      await http()
        .put(`/api/demandas/${demandaA}`)
        .set(bearer(usuarioA.token))
        .send({ orgao_id: B.id, status: 'APROVADA', pca_id: pcaB, contratacao_futura_id: contratacaoB, observacoes: 'ok A' })
        .expect(200);
      const d = await estadoDemanda(demandaA);
      expect(d).toMatchObject({ orgao_id: A.id, status: 'RASCUNHO', pca_id: null, contratacao_futura_id: null, observacoes: 'ok A' });
    });

    it('item: demanda_id/item_pca_id do corpo são ignorados', async () => {
      await http()
        .put(`/api/demandas/itens/${itemA}`)
        .set(bearer(A.token))
        .send({ demanda_id: demandaB, item_pca_id: itemPcaB, justificativa: 'ajuste A' })
        .expect(200);
      const [i] = await sql(`SELECT demanda_id, item_pca_id, justificativa FROM itens_demanda WHERE id = $1`, [itemA]);
      expect(i).toMatchObject({ demanda_id: demandaA, item_pca_id: null, justificativa: 'ajuste A' });

      const novo = await http()
        .post(`/api/demandas/${demandaA}/itens`)
        .set(bearer(A.token))
        .send({ categoria: 'SERVICO', descricao_objeto: 'Serviço A', demanda_id: demandaB, item_pca_id: itemPcaB })
        .expect(201);
      const [n] = await sql(`SELECT demanda_id, item_pca_id FROM itens_demanda WHERE id = $1`, [novo.body.id]);
      expect(n).toMatchObject({ demanda_id: demandaA, item_pca_id: null });
      // B continua com um só item
      const [c] = await sql(`SELECT count(*)::int AS n FROM itens_demanda WHERE demanda_id = $1`, [demandaB]);
      expect(c.n).toBe(1);
      expect(itemB).toBeTruthy();
    });

    it('vincular item ao PCA: item do PCA de outro órgão → 403; do próprio → 200', async () => {
      await http().patch(`/api/demandas/itens/${itemA}/vincular-pca`).set(bearer(A.token)).send({ itemPcaId: itemPcaB }).expect(403);
      await http().patch(`/api/demandas/itens/${itemA}/vincular-pca`).set(bearer(A.token)).send({ itemPcaId: itemPcaA }).expect(200);
      const [i] = await sql(`SELECT item_pca_id FROM itens_demanda WHERE id = $1`, [itemA]);
      expect(i.item_pca_id).toBe(itemPcaA);
      await sql(`UPDATE itens_demanda SET item_pca_id = NULL WHERE id = $1`, [itemA]);
    });
  });

  // ==========================================================================
  describe('6. contratações futuras', () => {
    it('B criando contratação com DFD de A → 403; nada criado, DFD de A intocada', async () => {
      const [antes] = await sql(`SELECT count(*)::int AS n FROM contratacoes_futuras WHERE orgao_id = $1`, [B.id]);
      const r = await http()
        .post('/api/demandas/contratacoes-futuras')
        .set(bearer(B.token))
        .send({ ano_referencia: ANO, titulo: 'Com DFD de A', categoria: 'MATERIAL', demandaIds: [demandaAprovadaB, demandaAprovadaA] });
      expect(r.status).toBe(403);
      const [depois] = await sql(`SELECT count(*)::int AS n FROM contratacoes_futuras WHERE orgao_id = $1`, [B.id]);
      expect(depois.n).toBe(antes.n);
      expect((await estadoDemanda(demandaAprovadaA)).contratacao_futura_id).toBeNull();
    });

    it('B vinculando DFD de A à própria contratação → 403; contratação de A por B → 404', async () => {
      const r = await http()
        .patch(`/api/demandas/contratacoes-futuras/${contratacaoB}/demandas`)
        .set(bearer(B.token))
        .send({ demandaIds: [demandaAprovadaA] });
      expect(r.status).toBe(403);
      expect((await estadoDemanda(demandaAprovadaA)).contratacao_futura_id).toBeNull();

      const contratacaoA = (
        await http()
          .post('/api/demandas/contratacoes-futuras')
          .set(bearer(A.token))
          .send({ ano_referencia: ANO, titulo: 'Contratação A', categoria: 'MATERIAL' })
          .expect(201)
      ).body.id;
      const r2 = await http()
        .patch(`/api/demandas/contratacoes-futuras/${contratacaoA}/demandas`)
        .set(bearer(B.token))
        .send({ demandaIds: [demandaAprovadaB] });
      expect(r2.status).toBe(404);
      expect((await estadoDemanda(demandaAprovadaB)).contratacao_futura_id).toBeNull();
    });

    it('B vinculando a própria DFD à própria contratação → 200', async () => {
      const r = await http()
        .patch(`/api/demandas/contratacoes-futuras/${contratacaoB}/demandas`)
        .set(bearer(B.token))
        .send({ demandaIds: [demandaAprovadaB] })
        .expect(200);
      expect(r.body.demandas.map((d: any) => d.id)).toEqual([demandaAprovadaB]);
      await sql(`UPDATE demandas SET contratacao_futura_id = NULL WHERE id = $1`, [demandaAprovadaB]);
    });
  });

  // ==========================================================================
  describe('7. PCA: consolidar demandas', () => {
    it('B lendo/consolidando no PCA de A → 404/403', async () => {
      const ler = await http().get(`/api/pca/${pcaA}`).set(bearer(B.token));
      const consolidar = await http()
        .post(`/api/pca/${pcaA}/consolidar-demandas`)
        .set(bearer(B.token))
        .send({ demandaIds: [demandaAprovadaB] });
      expect([ler.status, consolidar.status]).toEqual([404, 403]);
      expect((await estadoDemanda(demandaAprovadaB)).status).toBe('APROVADA');
    });

    it('B consolidando DFD de A no PCA de B (sozinha ou misturada) → 403; nada muda', async () => {
      const [itensAntes] = await sql(`SELECT count(*)::int AS n FROM itens_pca WHERE pca_id = $1`, [pcaB]);
      const r1 = await http()
        .post(`/api/pca/${pcaB}/consolidar-demandas`)
        .set(bearer(B.token))
        .send({ demandaIds: [demandaAprovadaA] });
      const r2 = await http()
        .post(`/api/pca/${pcaB}/consolidar-demandas`)
        .set(bearer(B.token))
        .send({ demandaIds: [demandaAprovadaB, demandaAprovadaA] });
      expect([r1.status, r2.status]).toEqual([403, 403]);

      expect(await estadoDemanda(demandaAprovadaA)).toMatchObject({ status: 'APROVADA', pca_id: null });
      expect(await estadoDemanda(demandaAprovadaB)).toMatchObject({ status: 'APROVADA', pca_id: null });
      const [itensDepois] = await sql(`SELECT count(*)::int AS n FROM itens_pca WHERE pca_id = $1`, [pcaB]);
      expect(itensDepois.n).toBe(itensAntes.n);
    });

    it('o serviço só marca como CONSOLIDADA as DFDs do órgão do PCA (defesa em profundidade)', async () => {
      // chamada direta ao serviço (sem o controller): a DFD de A é ignorada e não é marcada
      const servico = ctx.app.get(PcaService);
      const r = await servico.consolidarDemandas(pcaB, [demandaAprovadaA, demandaAprovadaB]);
      expect(r.demandasConsolidadas).toBe(1);
      expect(await estadoDemanda(demandaAprovadaA)).toMatchObject({ status: 'APROVADA', pca_id: null });
      expect(await estadoDemanda(demandaAprovadaB)).toMatchObject({ status: 'CONSOLIDADA', pca_id: pcaB });
    });

    it('A consolida a própria DFD no próprio PCA → 201', async () => {
      const r = await http()
        .post(`/api/pca/${pcaA}/consolidar-demandas`)
        .set(bearer(A.token))
        .send({ demandaIds: [demandaAprovadaA] });
      expect([200, 201]).toContain(r.status);
      expect(r.body.demandasConsolidadas).toBe(1);
      expect(await estadoDemanda(demandaAprovadaA)).toMatchObject({ status: 'CONSOLIDADA', pca_id: pcaA });
      const [item] = await sql(`SELECT item_pca_id FROM itens_demanda WHERE demanda_id = $1`, [demandaAprovadaA]);
      const [dono] = await sql(`SELECT p.orgao_id FROM itens_pca ip JOIN planos_contratacao_anual p ON p.id = ip.pca_id WHERE ip.id = $1`, [item.item_pca_id]);
      expect(dono.orgao_id).toBe(A.id);
    });
  });

  // ==========================================================================
  describe('8. admin da plataforma', () => {
    it('admin lê demanda de qualquer órgão e lista por ?orgaoId=', async () => {
      const admin = bearer(ctx.tokenAdmin());
      await http().get(`/api/demandas/${demandaA}`).set(admin).expect(200);
      const lista = await http().get(`/api/demandas?orgaoId=${A.id}`).set(admin).expect(200);
      expect(lista.body.map((d: any) => d.id)).toContain(demandaA);
    });
  });
});
