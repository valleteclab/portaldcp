/**
 * ============================================================================
 * ARQUIVOS PRIVADOS — uploads sensíveis fora da pasta pública (QA defensivo)
 * ============================================================================
 *
 *  - anônimo não baixa arquivo sensível por URL (rota estática /uploads nem
 *    GET /api/uploads);
 *  - documento do registro cadastral: só o fornecedor dono, ADMIN ou órgão com
 *    vínculo (proposta numa licitação do órgão); outro fornecedor e órgão sem
 *    vínculo → 404;
 *  - arquivo novo sensível é gravado no diretório privado (fora de UPLOAD_DIR
 *    servido); URL assinada devolvida pela API funciona sem login e sai limpa
 *    ao voltar no corpo;
 *  - DELETE /api/uploads não existe mais (qualquer conta apagava qualquer arquivo);
 *  - pasta pública (anexo do edital) continua pública;
 *  - legado: arquivo na pasta antiga (inclusive `geral/`) continua baixável
 *    pelo dono antes e depois da migração para o privado.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  criarApp,
  criarFornecedor,
  criarOrgao,
} from './support';
import { bearer, prepararPregaoEmAcolhimento } from './support/isolamento';
import { desligarLimiteDeRequisicoes } from './support/pregao';
import { diretorioPrivado, diretorioUploads } from '../src/common/arquivos/arquivos';
import { migrarArquivosPrivados } from '../src/upload/migracao-arquivos-privados';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

describe('Arquivos privados (uploads sensíveis)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture; // tem vínculo com F1 (proposta)
  let B: OrgaoFixture; // sem vínculo
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  /** URL devolvida pelo upload genérico do documento do registro de F1. */
  let urlDocF1: string;
  let nomeDocF1: string;

  const enviar = (token: string, tipo: string, nome = 'documento.pdf') =>
    ctx
      .http()
      .post('/api/uploads')
      .set(bearer(token))
      // arquivo ANTES do campo `tipo` — ordem real do FormData do frontend
      .attach('file', PDF, { filename: nome, contentType: 'application/pdf' })
      .field('tipo', tipo);

  const semAssinatura = (u: string) => u.split('?')[0];

  beforeAll(async () => {
    ctx = await criarApp();
    desligarLimiteDeRequisicoes(ctx);
    A = await criarOrgao(ctx, { nome: 'Prefeitura A (arquivos)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura B (arquivos)' });
    F1 = await criarFornecedor(ctx, { porte: 'ME' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    // vínculo A ↔ F1: proposta enviada num pregão de A
    await prepararPregaoEmAcolhimento(ctx, A, [{ fornecedor: F1, valores: [90, 45] }]);

    const up = await enviar(F1.token, 'documentos', 'contrato-social.pdf');
    expect(up.status).toBe(201);
    urlDocF1 = semAssinatura(up.body.url);
    nomeDocF1 = up.body.filename;
    // grava no registro cadastral de F1 (a URL assinada que voltou na resposta)
    const doc = await ctx
      .http()
      .post(`/api/fornecedores/${F1.id}/documentos`)
      .set(bearer(F1.token))
      .send({ nivel: 'NIVEL_II', tipo: 'CONTRATO_SOCIAL', nome_arquivo: 'contrato-social.pdf', caminho_arquivo: up.body.url });
    expect(doc.status).toBe(201);
  }, 180_000);

  afterAll(async () => {
    await ctx?.fechar();
  });

  describe('upload genérico de documento sensível', () => {
    it('grava no diretório PRIVADO (não na pasta servida) e registra o dono', async () => {
      expect(urlDocF1).toBe(`/api/uploads/documentos/${nomeDocF1}`);
      expect(existsSync(join(diretorioPrivado(), 'documentos', nomeDocF1))).toBe(true);
      expect(existsSync(join(diretorioUploads(), 'documentos', nomeDocF1))).toBe(false);
      expect(existsSync(join(diretorioUploads(), 'geral', nomeDocF1))).toBe(false);
      const [dono] = await ctx.dataSource.query(`SELECT fornecedor_id, privado FROM arquivos_upload WHERE caminho = $1`, [
        `documentos/${nomeDocF1}`,
      ]);
      expect(dono).toMatchObject({ fornecedor_id: F1.id, privado: true });
    });

    it('a URL assinada que voltou no corpo foi gravada LIMPA no banco', async () => {
      const [d] = await ctx.dataSource.query(`SELECT caminho_arquivo FROM fornecedor_documentos WHERE fornecedor_id = $1`, [F1.id]);
      expect(d.caminho_arquivo).toBe(urlDocF1);
    });

    it('fornecedor não envia para pasta pública', async () => {
      const r = await enviar(F1.token, 'logos', 'logo.png');
      expect(r.status).toBe(403);
    });
  });

  describe('download do documento do registro cadastral', () => {
    it('anônimo: GET /api/uploads → 401; rota estática /uploads → 401', async () => {
      expect((await ctx.http().get(urlDocF1)).status).toBe(401);
      expect((await ctx.http().get(`/uploads/documentos/${nomeDocF1}`)).status).toBe(401);
    });

    it('a pasta privada não é alcançável por URL', async () => {
      const r1 = await ctx.http().get(`/uploads/.privado/documentos/${nomeDocF1}`);
      const r2 = await ctx.http().get(`/api/uploads/.privado/documentos/${nomeDocF1}`).set(bearer(F1.token));
      expect([401, 404]).toContain(r1.status);
      expect([401, 404]).toContain(r2.status);
      const r3 = await ctx.http().get(`/uploads/documentos/..%2F..%2F.privado%2Fdocumentos%2F${nomeDocF1}`);
      expect([400, 401, 404]).toContain(r3.status);
    });

    it('o próprio fornecedor baixa (API e rota estática com Bearer)', async () => {
      const r = await ctx.http().get(urlDocF1).set(bearer(F1.token));
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('application/pdf');
      expect((await ctx.http().get(`/uploads/documentos/${nomeDocF1}`).set(bearer(F1.token))).status).toBe(200);
    });

    it('outro fornecedor → 404', async () => {
      expect((await ctx.http().get(urlDocF1).set(bearer(F2.token))).status).toBe(404);
    });

    it('órgão SEM vínculo → 404; órgão com vínculo (proposta) → 200; ADMIN → 200', async () => {
      expect((await ctx.http().get(urlDocF1).set(bearer(B.token))).status).toBe(404);
      expect((await ctx.http().get(urlDocF1).set(bearer(A.token))).status).toBe(200);
      expect((await ctx.http().get(urlDocF1).set(bearer(ctx.tokenAdmin()))).status).toBe(200);
    });

    it('URL assinada entregue ao dono funciona sem login; adulterada não', async () => {
      const lista = await ctx.http().get(`/api/fornecedores/${F1.id}/documentos`).set(bearer(F1.token));
      expect(lista.status).toBe(200);
      const assinada: string = lista.body[0].caminho_arquivo;
      expect(assinada).toMatch(/\?expira=\d+&assinatura=/);
      expect((await ctx.http().get(assinada)).status).toBe(200);
      expect((await ctx.http().get(assinada.replace('/api/uploads/', '/uploads/'))).status).toBe(200);
      expect((await ctx.http().get(assinada.replace(/assinatura=[^&]*/, 'assinatura=adulterada'))).status).toBe(401);
    });

    it('listagem do registro cadastral: outro fornecedor e órgão sem vínculo → 404', async () => {
      expect((await ctx.http().get(`/api/fornecedores/${F1.id}/documentos`).set(bearer(F2.token))).status).toBe(404);
      expect((await ctx.http().get(`/api/fornecedores/${F1.id}/documentos`).set(bearer(B.token))).status).toBe(404);
      expect((await ctx.http().get(`/api/fornecedores/${F1.id}/completo`).set(bearer(F2.token))).status).toBe(404);
      expect((await ctx.http().get(`/api/fornecedores/${F1.id}/documentos`).set(bearer(A.token))).status).toBe(200);
    });

    it('fornecedor não grava documento no cadastro de outro', async () => {
      const r = await ctx
        .http()
        .post(`/api/fornecedores/${F1.id}/documentos`)
        .set(bearer(F2.token))
        .send({ nivel: 'NIVEL_II', tipo: 'CONTRATO_SOCIAL', caminho_arquivo: urlDocF1 });
      expect(r.status).toBe(403);
    });

    it('citar a URL do arquivo de outro no PRÓPRIO cadastro não dá acesso (dono autoritativo)', async () => {
      const r = await ctx
        .http()
        .post(`/api/fornecedores/${F2.id}/documentos`)
        .set(bearer(F2.token))
        .send({ nivel: 'NIVEL_II', tipo: 'CONTRATO_SOCIAL', caminho_arquivo: urlDocF1 });
      expect(r.status).toBe(201);
      expect((await ctx.http().get(urlDocF1).set(bearer(F2.token))).status).toBe(404);
    });
  });

  it('DELETE /api/uploads não existe mais: ninguém apaga o arquivo de outro', async () => {
    const r = await ctx.http().delete(`/api/uploads/documentos/${nomeDocF1}`).set(bearer(F2.token));
    expect(r.status).toBe(404);
    expect(existsSync(join(diretorioPrivado(), 'documentos', nomeDocF1))).toBe(true);
  });

  it('anexo do edital (pasta pública) continua público, pela API e pela rota estática', async () => {
    const up = await enviar(A.token, 'licitacao', 'edital.pdf');
    expect(up.status).toBe(201);
    expect(up.body.url).not.toContain('assinatura=');
    expect(existsSync(join(diretorioUploads(), 'licitacao', up.body.filename))).toBe(true);
    expect((await ctx.http().get(up.body.url)).status).toBe(200);
    expect((await ctx.http().get(`/uploads/licitacao/${up.body.filename}`)).status).toBe(200);
  });

  it('pasta sensível antiga (ex.: medições) não sai mais pela rota estática sem login', async () => {
    const dir = join(diretorioUploads(), 'medicoes', '00000000-0000-4000-8000-000000000999');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'foto.pdf'), PDF);
    expect((await ctx.http().get('/uploads/medicoes/00000000-0000-4000-8000-000000000999/foto.pdf')).status).toBe(401);
    expect((await ctx.http().get('/api/uploads/medicoes/00000000-0000-4000-8000-000000000999/foto.pdf')).status).toBe(401);
    // fornecedor sem relação com o registro → 404
    expect(
      (await ctx.http().get('/api/uploads/medicoes/00000000-0000-4000-8000-000000000999/foto.pdf').set(bearer(F2.token))).status,
    ).toBe(404);
  });

  describe('legado: arquivo na pasta pública antiga', () => {
    let nomeLegado: string;

    beforeAll(async () => {
      // como o Multer antigo gravava: `tipo` depois do arquivo → caía em geral/
      nomeLegado = `1690000000000-${Math.round(Math.random() * 1e9)}.pdf`;
      mkdirSync(join(diretorioUploads(), 'geral'), { recursive: true });
      writeFileSync(join(diretorioUploads(), 'geral', nomeLegado), PDF);
      await ctx.dataSource.query(
        `INSERT INTO fornecedor_documentos (fornecedor_id, nivel, tipo, nome_arquivo, caminho_arquivo, status)
         VALUES ($1, 'NIVEL_VI', 'BALANCO_PATRIMONIAL', 'balanco.pdf', $2, 'PENDENTE')`,
        [F1.id, `/api/uploads/documentos/${nomeLegado}`],
      );
    });

    it('antes da migração: dono baixa (resolvedor lê a pasta antiga); anônimo e outro fornecedor não', async () => {
      const url = `/api/uploads/documentos/${nomeLegado}`;
      expect((await ctx.http().get(url).set(bearer(F1.token))).status).toBe(200);
      expect((await ctx.http().get(url)).status).toBe(401);
      expect((await ctx.http().get(`/uploads/geral/${nomeLegado}`)).status).toBe(401);
      expect((await ctx.http().get(url).set(bearer(F2.token))).status).toBe(404);
    });

    it('migração move para o privado (idempotente) e o dono continua baixando', async () => {
      const r1 = await migrarArquivosPrivados(ctx.dataSource);
      expect(r1.movidos).toBeGreaterThanOrEqual(1);
      expect(existsSync(join(diretorioPrivado(), 'documentos', nomeLegado))).toBe(true);
      expect(existsSync(join(diretorioUploads(), 'geral', nomeLegado))).toBe(false);
      const r2 = await migrarArquivosPrivados(ctx.dataSource);
      expect(r2.movidos).toBe(0);
      expect(r2.donosRegistrados).toBe(0);

      const [dono] = await ctx.dataSource.query(`SELECT fornecedor_id FROM arquivos_upload WHERE caminho = $1`, [`documentos/${nomeLegado}`]);
      expect(dono.fornecedor_id).toBe(F1.id);
      // a URL gravada no banco não mudou
      const [d] = await ctx.dataSource.query(`SELECT caminho_arquivo FROM fornecedor_documentos WHERE nome_arquivo = 'balanco.pdf' AND fornecedor_id = $1`, [F1.id]);
      expect(d.caminho_arquivo).toBe(`/api/uploads/documentos/${nomeLegado}`);

      const url = `/api/uploads/documentos/${nomeLegado}`;
      expect((await ctx.http().get(url).set(bearer(F1.token))).status).toBe(200);
      expect((await ctx.http().get(url).set(bearer(A.token))).status).toBe(200);
      expect((await ctx.http().get(url).set(bearer(B.token))).status).toBe(404);
      expect((await ctx.http().get(url)).status).toBe(401);
    });
  });
});
