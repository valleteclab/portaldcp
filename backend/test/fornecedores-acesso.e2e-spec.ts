/**
 * ============================================================================
 * CADASTRO DO FORNECEDOR — quem pode ESCREVER (QA defensivo)
 * ============================================================================
 *
 *  - análise de documento do registro cadastral: só ADMIN da plataforma
 *    (fornecedor nunca — nem o próprio; órgão analisa na habilitação);
 *    analista gravado vem do token;
 *  - aprovar / suspender / reativar / rotas /admin/*: só ADMIN;
 *  - definir senha: só o próprio fornecedor (ou ADMIN);
 *  - completar credenciamento: só o próprio cadastro (e-mail do token);
 *  - contato e reset de senha pelo órgão: só órgão com vínculo;
 *  - edição pelo órgão (PUT /:id): só nome — nada de e-mail/contato;
 *  - criar fornecedor: órgão ou ADMIN, nunca fornecedor;
 *  - GET /:id não devolve hash de senha.
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao } from './support';
import { bearer, prepararPregaoEmAcolhimento } from './support/isolamento';
import { desligarLimiteDeRequisicoes } from './support/pregao';

describe('Cadastro do fornecedor — autorização das rotas de escrita', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture; // vínculo com F1
  let B: OrgaoFixture; // sem vínculo
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let docF1: string;
  let emailF1: string;

  const http = () => ctx.http();

  beforeAll(async () => {
    ctx = await criarApp();
    desligarLimiteDeRequisicoes(ctx);
    A = await criarOrgao(ctx, { nome: 'Prefeitura A (cadastro)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura B (cadastro)' });
    F1 = await criarFornecedor(ctx, { porte: 'ME' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    await prepararPregaoEmAcolhimento(ctx, A, [{ fornecedor: F1, valores: [90, 45] }]);
    const d = await http()
      .post(`/api/fornecedores/${F1.id}/documentos`)
      .set(bearer(F1.token))
      .send({ nivel: 'NIVEL_III', tipo: 'CND_RECEITA_FEDERAL_PGFN', numero_documento: 'E2E' });
    expect(d.status).toBe(201);
    docF1 = d.body.id;
    const [f] = await ctx.dataSource.query(`SELECT email FROM fornecedores WHERE id = $1`, [F1.id]);
    emailF1 = f.email;
  }, 180_000);

  afterAll(async () => {
    await ctx?.fechar();
  });

  describe('análise do documento do registro cadastral', () => {
    const analisar = (token: string) =>
      http()
        .put(`/api/fornecedores/documentos/${docF1}/analisar`)
        .set(bearer(token))
        .send({ aprovado: true, observacao: 'ok', analisadoPor: 'Fulano' });

    it('fornecedor não analisa — nem o próprio documento (403)', async () => {
      expect((await analisar(F1.token)).status).toBe(403);
      expect((await analisar(F2.token)).status).toBe(403);
    });

    it('órgão não analisa o cadastro, mesmo com vínculo (403)', async () => {
      expect((await analisar(A.token)).status).toBe(403);
      expect((await analisar(B.token)).status).toBe(403);
    });

    it('sem login → 401; ADMIN analisa e o analista vem do token', async () => {
      expect((await http().put(`/api/fornecedores/documentos/${docF1}/analisar`).send({ aprovado: true })).status).toBe(401);
      const r = await analisar(ctx.tokenAdmin());
      expect(r.status).toBe(200);
      const [doc] = await ctx.dataSource.query(`SELECT status::text AS status, analisado_por FROM fornecedor_documentos WHERE id = $1`, [docF1]);
      expect(doc.status).toBe('APROVADO');
      expect(doc.analisado_por).toBe('Fulano [ADMIN admin@e2e.local]');
    });
  });

  describe('status e rotas /admin/*: só ADMIN', () => {
    it.each([
      ['put', 'aprovar', {}],
      ['put', 'suspender', { motivo: 'x' }],
      ['put', 'reativar', {}],
      ['put', 'admin/reset-senha', {}],
      ['put', 'admin/dados', { email: 'invasor@x.com' }],
      ['put', 'admin/nivel', { nivel: 'NIVEL_VI' }],
    ])('%s /:id/%s → 403 para fornecedor (inclusive o próprio) e órgão', async (_m, rota, corpo) => {
      for (const token of [F1.token, F2.token, A.token, B.token]) {
        const r = await http().put(`/api/fornecedores/${F1.id}/${rota}`).set(bearer(token)).send(corpo);
        expect(r.status).toBe(403);
      }
    });

    it('ADMIN aprova', async () => {
      expect((await http().put(`/api/fornecedores/${F1.id}/aprovar`).set(bearer(ctx.tokenAdmin()))).status).toBe(200);
    });
  });

  describe('senha e credenciamento: só o próprio fornecedor', () => {
    it('definir senha de outro → 403 (fornecedor e órgão); a própria → 200', async () => {
      const corpo = { senha: 'SenhaNova#2026' };
      expect((await http().put(`/api/fornecedores/${F1.id}/definir-senha`).set(bearer(F2.token)).send(corpo)).status).toBe(403);
      expect((await http().put(`/api/fornecedores/${F1.id}/definir-senha`).set(bearer(A.token)).send(corpo)).status).toBe(403);
      expect((await http().put(`/api/fornecedores/${F1.id}/definir-senha`).set(bearer(F1.token)).send(corpo)).status).toBe(200);
    });

    it('completar credenciamento de outro e-mail → 403', async () => {
      const r = await http()
        .post('/api/fornecedores/completar-credenciamento')
        .set(bearer(F2.token))
        .send({ email: emailF1, dadosCnpj: {}, representante_nome: 'x', representante_cpf: '000' });
      expect(r.status).toBe(403);
    });

    it('atualizar dados do CNPJ de outro fornecedor → 403', async () => {
      expect((await http().put(`/api/fornecedores/${F1.id}/atualizar-cnpj`).set(bearer(F2.token))).status).toBe(403);
    });
  });

  describe('atos do órgão sobre o fornecedor', () => {
    it('contato: órgão sem vínculo → 403; com vínculo → 200', async () => {
      const corpo = { telefone: '71988887777' };
      expect((await http().put(`/api/fornecedores/${F1.id}/orgao/contato`).set(bearer(B.token)).send(corpo)).status).toBe(403);
      expect((await http().put(`/api/fornecedores/${F1.id}/orgao/contato`).set(bearer(F2.token)).send(corpo)).status).toBe(403);
      expect((await http().put(`/api/fornecedores/${F1.id}/orgao/contato`).set(bearer(A.token)).send(corpo)).status).toBe(200);
    });

    it('reset de senha pelo órgão sem vínculo → 403', async () => {
      const r = await http().post(`/api/fornecedores/${F1.id}/orgao/solicitar-reset`).set(bearer(B.token)).send({ canal: 'email' });
      expect(r.status).toBe(403);
    });

    it('PUT /:id pelo órgão: e-mail → 403; só o nome → 200', async () => {
      expect((await http().put(`/api/fornecedores/${F2.id}`).set(bearer(B.token)).send({ email: 'invasor@x.com' })).status).toBe(403);
      const r = await http().put(`/api/fornecedores/${F2.id}`).set(bearer(B.token)).send({ razao_social: 'Nome corrigido pelo órgão' });
      expect(r.status).toBe(200);
      const [f] = await ctx.dataSource.query(`SELECT email FROM fornecedores WHERE id = $1`, [F2.id]);
      expect(f.email).not.toBe('invasor@x.com');
    });
  });

  it('fornecedor não cria fornecedores (POST /, cadastro-rápido, cadastrar-cnpj)', async () => {
    expect((await http().post('/api/fornecedores').set(bearer(F2.token)).send({})).status).toBe(403);
    expect((await http().post('/api/fornecedores/orgao/cadastro-rapido').set(bearer(F2.token)).send({ cnpj: '1', razao_social: 'x' })).status).toBe(403);
    expect((await http().post('/api/fornecedores/cadastrar-cnpj').set(bearer(F2.token)).send({ dadosCnpj: {} })).status).toBe(403);
  });

  it('GET /:id não devolve hash de senha nem da API key', async () => {
    const r = await http().get(`/api/fornecedores/${F1.id}`).set(bearer(F2.token));
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty('senha');
    expect(r.body).not.toHaveProperty('api_key_hash');
    expect(r.body).not.toHaveProperty('spedy_api_key');
  });
});
