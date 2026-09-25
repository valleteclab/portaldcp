/**
 * ============================================================================
 * E9 — LIMPEZA: rotas cruas do PNCP com escopo do órgão, estado da compra no
 * PNCP vindo da fila (pncp_sync), pregoeiro pelo vínculo e versões de
 * documentos da licitação
 * ============================================================================
 *
 * - Rotas cruas de `/api/pncp` (retificar/excluir compra, itens, resultado,
 *   ata, contrato, PCA): o órgão só opera sob o PRÓPRIO CNPJ no PNCP e só os
 *   PRÓPRIOS registros locais; `cnpj_orgao`/`licitacaoId` de outro órgão →
 *   403; fornecedor → 403; `POST /api/pncp/compras` (PDF em branco) apagado.
 * - Credencial/cadastro da plataforma no PNCP e vínculo do órgão ao PNCP
 *   (`PUT /api/orgaos/:id/pncp`, módulos) só pelo admin da plataforma.
 * - Estado da compra no PNCP: fonte `pncp_sync`; vínculo manual e migração das
 *   colunas antigas viram linha ENVIADA; as telas recebem os mesmos campos.
 * - Documentos da licitação: nova versão entra como RASCUNHO sem derrubar a
 *   versão publicada; publicar substitui a anterior; EDITAL só pela publicação.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  buscarLicitacao,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
  levarAteFase,
  pdfDeTeste,
  pncpMock,
} from './support';
import { vincularOrgaoAoPncp } from './support/pregao';
import { FaseLicitacao, ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';
import { migrarEstadoCompraPncp } from '../src/pncp/estado-compra-pncp';
import { migrarPregoeiroDaLicitacao } from '../src/licitacoes/migracao-legado-e9';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('E9 — limpeza (PNCP com escopo do órgão, estado da compra, documentos)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let cnpjA: string;
  let cnpjB: string;
  let F1: FornecedorFixture;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura E9 (A)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura E9 (B)' });
    cnpjA = A.cnpj.replace(/\D/g, '');
    cnpjB = B.cnpj.replace(/\D/g, '');
    await vincularOrgaoAoPncp(ctx, A);
    await vincularOrgaoAoPncp(ctx, B);
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. rotas cruas do PNCP: órgão só sob o próprio CNPJ e os próprios registros', () => {
    it('retificar compra com a licitação de OUTRO órgão no corpo → 403 e nada muda', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const antes = (await buscarLicitacao(ctx, lic)).objeto;
      pncpMock.limpar();
      const r = await http()
        .put('/api/pncp/compras/2026/1')
        .set(bearer(B.token))
        .send({ licitacaoId: lic.id, objetoCompra: 'Objeto trocado pelo órgão B', justificativa: 'teste' });
      expect(r.status).toBe(403);
      expect(pncpMock.filtrar()).toHaveLength(0);
      expect((await buscarLicitacao(ctx, lic)).objeto).toBe(antes);
    });

    it('retificar compra sem licitação: vai ao PNCP sob o CNPJ do PRÓPRIO órgão (nunca o de outro)', async () => {
      pncpMock.limpar();
      await http().put('/api/pncp/compras/2026/5').set(bearer(B.token)).send({ objetoCompra: 'x', justificativa: 'teste' }).expect(200);
      const chamadas = pncpMock.filtrar('PATCH', /\/compras\/2026\/5$/);
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].caminho).toContain(`/orgaos/${cnpjB}/`);
      expect(chamadas[0].caminho).not.toContain(cnpjA);
    });

    it('retificação crua NÃO altera mais a licitação local (objeto só pela retificação do edital)', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const antes = (await buscarLicitacao(ctx, lic)).objeto;
      await http()
        .put('/api/pncp/compras/2026/6')
        .set(bearer(A.token))
        .send({ licitacaoId: lic.id, objetoCompra: 'Objeto novo pela rota crua', justificativa: 'teste' })
        .expect(200);
      expect((await buscarLicitacao(ctx, lic)).objeto).toBe(antes);
    });

    it('cnpj_orgao de outro órgão no corpo (contrato, ata) → 403 sem chamar o PNCP', async () => {
      pncpMock.limpar();
      const contrato = await http()
        .post('/api/pncp/contratos')
        .set(bearer(B.token))
        .send({ cnpj_orgao: cnpjA, numero_contrato: '1/2026', objeto: 'x', valor_inicial: 1 });
      const excluir = await http()
        .delete('/api/pncp/contratos/2026/1')
        .set(bearer(B.token))
        .send({ justificativa: 'teste', cnpj_orgao: cnpjA });
      const ata = await http()
        .delete('/api/pncp/compras/2026/1/atas/1')
        .set(bearer(B.token))
        .send({ justificativa: 'teste', cnpj_orgao: cnpjA });
      expect([contrato.status, excluir.status, ata.status]).toEqual([403, 403, 403]);
      expect(pncpMock.filtrar()).toHaveLength(0);
    });

    it('contrato cru do próprio órgão vai sob o próprio CNPJ', async () => {
      pncpMock.limpar();
      await http()
        .post('/api/pncp/contratos')
        .set(bearer(A.token))
        .send({ numero_contrato: '2/2026', objeto: 'Contrato de fora do sistema', valor_inicial: 10 })
        .expect(201);
      const [c] = pncpMock.filtrar('POST', /\/contratos$/);
      expect(c.caminho).toContain(`/orgaos/${cnpjA}/contratos`);
    });

    it('excluir compra com a licitação de outro órgão → 403 (sem DELETE no PNCP)', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      pncpMock.limpar();
      const r = await http()
        .delete('/api/pncp/compras/2026/1')
        .set(bearer(B.token))
        .send({ justificativa: 'teste', licitacaoId: lic.id });
      expect(r.status).toBe(403);
      expect(pncpMock.filtrar('DELETE')).toHaveLength(0);
    });

    it('PCA: enviar/consultar/retificar PCA de outro órgão → recusado', async () => {
      const [pca] = await sql(
        `INSERT INTO planos_contratacao_anual (id, orgao_id, ano_exercicio, sequencial_pncp, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 2026, 77, now(), now()) RETURNING id::text AS id`,
        [A.id],
      );
      pncpMock.limpar();
      const enviar = await http().post(`/api/pncp/pca/${pca.id}`).set(bearer(B.token)).send({});
      const status = await http().get(`/api/pncp/pca/${pca.id}/status`).set(bearer(B.token));
      const retificar = await http().put('/api/pncp/pca/2026/77').set(bearer(B.token)).send({});
      const excluirItem = await http().delete('/api/pncp/pca/2026/77/itens/1').set(bearer(B.token)).send({});
      expect(enviar.status).toBe(403);
      expect(status.status).toBe(404);
      expect(retificar.status).toBe(404);
      expect(excluirItem.status).toBe(404);
      expect(pncpMock.filtrar()).toHaveLength(0);

      // o dono opera, sob o próprio CNPJ
      await http().put('/api/pncp/pca/2026/77').set(bearer(A.token)).send({}).expect(200);
      const [put] = pncpMock.filtrar('PUT', /\/pca\/2026\/77$/);
      expect(put.caminho).toContain(`/orgaos/${cnpjA}/pca/`);
    });

    it('importar PCA para outro órgão → 403', async () => {
      const r = await http().post('/api/pncp/importar/pca').set(bearer(B.token)).send({ orgaoId: A.id, cnpj: cnpjA, ano: 2026, sequencial: 1 });
      expect(r.status).toBe(403);
    });

    it('fornecedor não usa as rotas cruas', async () => {
      const consulta = await http().get('/api/pncp/compras/2026/1').set(bearer(F1.token));
      const contrato = await http().post('/api/pncp/contratos').set(bearer(F1.token)).send({ numero_contrato: '9/2026' });
      expect(consulta.status).toBe(403);
      expect(contrato.status).toBe(403);
    });

    it('POST /api/pncp/compras (compra crua com PDF em branco) não existe mais — a compra vai pela fila', async () => {
      const r = await http().post('/api/pncp/compras').set(bearer(A.token)).send({ objeto: 'x' });
      expect(r.status).toBe(404);
    });
  });

  // ==========================================================================
  describe('2. credencial/cadastro da plataforma e vínculo do órgão ao PNCP: só o admin', () => {
    it('órgão não associa ente, não cadastra unidade nem troca o vínculo PNCP (próprio ou de outro)', async () => {
      const associar = await http()
        .post('/api/pncp/usuario/associar-orgao-local')
        .set(bearer(B.token))
        .send({ cnpjEnte: cnpjA, orgaoId: B.id, codigoUnidade: '1' });
      const unidade = await http().post(`/api/pncp/orgaos/${cnpjA}/unidades`).set(bearer(B.token)).send({ codigoUnidade: '9' });
      const vinculoProprio = await http()
        .put(`/api/orgaos/${B.id}/pncp`)
        .set(bearer(B.token))
        .send({ pncp_vinculado: true, pncp_codigo_unidade: '1', pncp_cnpj_orgao: cnpjA });
      const modulos = await http().put(`/api/orgaos/${A.id}/modulos`).set(bearer(B.token)).send({ modulos: [] });
      expect([associar.status, unidade.status, vinculoProprio.status, modulos.status]).toEqual([403, 403, 403, 403]);
    });

    it('PUT /api/orgaos/:id: outro órgão → 403; o próprio não troca o CNPJ do PNCP pelo cadastro', async () => {
      const outro = await http().put(`/api/orgaos/${A.id}`).set(bearer(B.token)).send({ nome: 'Renomeado por B' });
      expect(outro.status).toBe(403);
      await http().put(`/api/orgaos/${B.id}`).set(bearer(B.token)).send({ pncp_cnpj_orgao: cnpjA }).expect(200);
      const [o] = await sql(`SELECT pncp_cnpj_orgao FROM orgaos WHERE id = $1`, [B.id]);
      expect(String(o.pncp_cnpj_orgao || '')).not.toBe(cnpjA);
    });
  });

  // ==========================================================================
  describe('3. estado da compra no PNCP: fonte pncp_sync', () => {
    it('vínculo manual vira linha ENVIADA da fila; a licitação não guarda cópia; a tela recebe os campos', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await levarAteFase(ctx, lic, FaseLicitacao.PUBLICADO);
      await http()
        .post(`/api/pncp/compras/${lic.id}/vincular`)
        .set(bearer(A.token))
        .send({ numeroControlePNCP: `${cnpjA}-1-000555/2026`, anoCompra: 2026, sequencialCompra: 555 })
        .expect(201);

      const linhas = await sql(
        `SELECT status::text AS status, ano_compra, sequencial_compra FROM pncp_sync
          WHERE licitacao_id::text = $1 AND tipo::text = 'COMPRA' AND status::text = 'ENVIADO'`,
        [lic.id],
      );
      expect(linhas).toEqual([{ status: 'ENVIADO', ano_compra: 2026, sequencial_compra: 555 }]);
      const [col] = await sql(`SELECT enviado_pncp, numero_controle_pncp FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(col).toEqual({ enviado_pncp: false, numero_controle_pncp: null });

      const tela = await buscarLicitacao(ctx, lic);
      expect(tela).toMatchObject({
        enviado_pncp: true,
        numero_controle_pncp: `${cnpjA}-1-000555/2026`,
        ano_compra_pncp: 2026,
        sequencial_compra_pncp: 555,
      });
      expect(tela.link_pncp).toContain(`/app/editais/${cnpjA}/2026/555`);

      // a fila enxerga a compra vinculada: nada é reenviado ao PNCP
      pncpMock.limpar();
      await ctx.processarFilaPncp({ licitacaoId: lic.id });
      expect(pncpMock.filtrar('POST', /\/compras$/)).toHaveLength(0);
    });

    it('migração (boot, idempotente): colunas antigas da licitação viram linha ENVIADA uma única vez', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await sql(
        `UPDATE licitacoes SET enviado_pncp = true, numero_controle_pncp = $2, ano_compra_pncp = NULL, sequencial_compra_pncp = NULL WHERE id = $1`,
        [lic.id, `${cnpjA}-1-000321/2025`],
      );
      const r1 = await migrarEstadoCompraPncp(ctx.dataSource.manager);
      const r2 = await migrarEstadoCompraPncp(ctx.dataSource.manager);
      expect(r1.migradas).toBeGreaterThanOrEqual(1);
      expect(r2.migradas).toBe(0);
      const [s] = await sql(
        `SELECT ano_compra, sequencial_compra, referencia->>'origem' AS origem FROM pncp_sync WHERE licitacao_id::text = $1 AND tipo::text = 'COMPRA'`,
        [lic.id],
      );
      expect(s).toEqual({ ano_compra: 2025, sequencial_compra: 321, origem: 'MIGRACAO_E9_COLUNAS_LICITACAO' });
      expect((await buscarLicitacao(ctx, lic)).ano_compra_pncp).toBe(2025);
    });
  });

  // ==========================================================================
  describe('4. pregoeiro: o usuário vinculado é a fonte', () => {
    it('migração vincula o nome digitado ao usuário ÚNICO do órgão; a leitura usa o usuário', async () => {
      const preg = await criarUsuarioOrgao(ctx, A, { nome: 'Maria Pregoeira E9' });
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      await sql(`UPDATE licitacoes SET pregoeiro_id = NULL, pregoeiro_nome = '  maria pregoeira e9 ' WHERE id = $1`, [lic.id]);
      const r = await migrarPregoeiroDaLicitacao(ctx.dataSource.manager);
      expect(r.vinculadas).toBeGreaterThanOrEqual(1);
      const [l] = await sql(`SELECT pregoeiro_id::text AS pregoeiro_id FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(l.pregoeiro_id).toBe(preg.id);
      expect((await buscarLicitacao(ctx, lic)).pregoeiro_nome).toBe('Maria Pregoeira E9');
      expect((await migrarPregoeiroDaLicitacao(ctx.dataSource.manager)).vinculadas).toBe(0);
    });
  });

  // ==========================================================================
  describe('5. documentos da licitação: versão nova não derruba a publicada', () => {
    const anexar = (licId: string, tipo: string, titulo: string, token = A.token) =>
      http()
        .post(`/api/documentos/licitacao/${licId}`)
        .set(bearer(token))
        .field('tipo', tipo)
        .field('titulo', titulo)
        .attach('arquivo', pdfDeTeste(titulo), { filename: 'doc.pdf', contentType: 'application/pdf' });
    const status = async (id: string) => (await sql(`SELECT status::text AS s, versao FROM documentos_licitacao WHERE id = $1`, [id]))[0];

    it('upload da v2 fica RASCUNHO e a v1 continua PUBLICADA; publicar a v2 substitui a v1', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const v1 = await anexar(lic.id, 'ANEXO', 'Anexo I v1');
      expect(v1.status).toBe(201);
      await http().put(`/api/documentos/${v1.body.id}/publicar`).set(bearer(A.token)).expect(200);

      const v2 = await anexar(lic.id, 'ANEXO', 'Anexo I v2');
      expect(v2.status).toBe(201);
      expect(await status(v1.body.id)).toEqual({ s: 'PUBLICADO', versao: 1 });
      expect(await status(v2.body.id)).toEqual({ s: 'RASCUNHO', versao: 2 });

      await http().put(`/api/documentos/${v2.body.id}/publicar`).set(bearer(A.token)).expect(200);
      expect(await status(v1.body.id)).toEqual({ s: 'SUBSTITUIDO', versao: 1 });
      expect(await status(v2.body.id)).toEqual({ s: 'PUBLICADO', versao: 2 });

      const reabrir = await http().put(`/api/documentos/${v1.body.id}/publicar`).set(bearer(A.token));
      expect(reabrir.status).toBe(409);
    });

    it('EDITAL não entra pelo módulo de documentos (um caminho: a publicação)', async () => {
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const r = await anexar(lic.id, 'EDITAL', 'Edital pelo caminho errado');
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/publicacao\/licitacao\/:id\/edital/);
    });
  });
});
