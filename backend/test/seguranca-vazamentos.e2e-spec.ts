/**
 * ============================================================================
 * VAZAMENTOS — auditoria de 13/11/2026 (lote 1)
 * ============================================================================
 *
 *  - propostas identificadas não saem para terceiros durante os lances
 *    (a proposta vira o primeiro lance: autor + valor desfaz o anonimato);
 *  - a base de fornecedores não é legível por outro fornecedor;
 *  - chave de API é do próprio fornecedor — órgão não gera;
 *  - cadastro criado pelo órgão não é assumido só com o CNPJ;
 *  - patrimônio/SIGA: o órgão da URL é o do token;
 *  - seed e trilha de auditoria não são de qualquer login;
 *  - cadastro do órgão: outro órgão não altera; e-mail/senha mestres não vêm pelo PUT.
 */
import { AppE2E, FornecedorFixture, OrgaoFixture, criarApp, criarFornecedor, criarOrgao } from './support';
import { PregaoEmSessao, bearer, prepararPregaoEmDisputa } from './support/isolamento';
import { desligarLimiteDeRequisicoes } from './support/pregao';

describe('Vazamentos entre fornecedores e entre órgãos (lote 1)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F1: FornecedorFixture;
  let F2: FornecedorFixture;
  let F3: FornecedorFixture; // não participa
  let P: PregaoEmSessao;

  const http = () => ctx.http();

  beforeAll(async () => {
    ctx = await criarApp();
    desligarLimiteDeRequisicoes(ctx);
    A = await criarOrgao(ctx, { nome: 'Prefeitura A (vazamentos)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura B (vazamentos)' });
    F1 = await criarFornecedor(ctx, { porte: 'ME' });
    F2 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    F3 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    P = await prepararPregaoEmDisputa(ctx, A, [
      { fornecedor: F1, valores: [90, 45] },
      { fornecedor: F2, valores: [88, 44] },
    ]);
  }, 240_000);

  afterAll(async () => {
    await ctx?.fechar();
  });

  describe('propostas durante a etapa de lances', () => {
    const lista = (token?: string) => {
      const r = http().get(`/api/propostas/licitacao/${P.lic.id}`);
      return token ? r.set(bearer(token)) : r;
    };
    const emSigilo = (corpo: any[]) =>
      corpo.length === 2 && corpo.every((p) => p.id === null && p.fornecedor === null && p.valor_total_proposta === null);

    it('anônimo, concorrente, fornecedor de fora e outro órgão só veem que as propostas existem', async () => {
      expect(emSigilo((await lista().expect(200)).body)).toBe(true);
      expect(emSigilo((await lista(F1.token).expect(200)).body)).toBe(true);
      expect(emSigilo((await lista(F3.token).expect(200)).body)).toBe(true);
      expect(emSigilo((await lista(B.token).expect(200)).body)).toBe(true);
    });

    it('o órgão dono lê o conteúdo das propostas, mas não quem é quem enquanto durarem os lances', async () => {
      const r = await lista(A.token).expect(200);
      expect(r.body.length).toBe(2);
      expect(r.body.every((p: any) => Number(p.valor_total_proposta) > 0 && /^anonimo-/.test(p.fornecedor?.id))).toBe(true);
      const texto = JSON.stringify(r.body);
      expect(texto).not.toContain(F1.id);
      expect(texto).not.toContain(F2.id);
    });

    it('o órgão dono não consulta a sala "como" um licitante nem recebe o autor dos lances na ata e nos eventos', async () => {
      expect((await http().get(`/api/disputa/sessao/${P.sessaoId}/itens/fornecedor/${F1.id}`).set(bearer(A.token))).status).toBe(403);
      for (const rota of [`/api/sessao/${P.sessaoId}/ata`, `/api/sessao/${P.sessaoId}/eventos`, `/api/disputa/sessao/${P.sessaoId}/board`, `/api/itens/licitacao/${P.lic.id}`, `/api/licitacoes/${P.lic.id}`]) {
        const r = await http().get(rota).set(bearer(A.token)).expect(200);
        const texto = JSON.stringify(r.body);
        expect(texto).not.toContain(F1.id);
        expect(texto).not.toContain(F2.id);
      }
    });

    it('com a anonimização desligada pelo suporte (justificativa obrigatória), o órgão passa a ver', async () => {
      const semJust = await http().put(`/api/admin/monitoramento/sessao/${P.sessaoId}/anonimizacao`).set(bearer(ctx.tokenAdmin())).send({ ativa: false, justificativa: 'ok' });
      expect(semJust.status).toBe(400);
      expect((await http().put(`/api/admin/monitoramento/sessao/${P.sessaoId}/anonimizacao`).set(bearer(A.token)).send({ ativa: false, justificativa: 'Determinação judicial nº 123' })).status).toBe(403);
      const ok = await http().put(`/api/admin/monitoramento/sessao/${P.sessaoId}/anonimizacao`).set(bearer(ctx.tokenAdmin())).send({ ativa: false, justificativa: 'Determinação judicial nº 123' });
      expect(ok.status).toBe(200);
      const r = await lista(A.token).expect(200);
      expect(r.body.map((p: any) => p.fornecedor?.id).sort()).toEqual([F1.id, F2.id].sort());
      const [ev] = await ctx.dataSource.query(`SELECT tipo::text AS tipo, dados_adicionais FROM eventos_sessao WHERE sessao_id = $1 AND descricao LIKE '[AUDITORIA]%' ORDER BY created_at DESC LIMIT 1`, [P.sessaoId]);
      expect(ev.tipo).toBe('MENSAGEM_SISTEMA');
      expect(ev.dados_adicionais.autor).toMatch(/^ADMIN /);
      // terceiros continuam sem ver
      expect(emSigilo((await lista(F3.token).expect(200)).body)).toBe(true);
      await http().put(`/api/admin/monitoramento/sessao/${P.sessaoId}/anonimizacao`).set(bearer(ctx.tokenAdmin())).send({ ativa: true, justificativa: 'Fim da verificação do suporte' }).expect(200);
    });

    it('ranking por item: vazio para terceiros, preenchido para o órgão dono', async () => {
      const item = P.lic.itens[0].id;
      expect((await http().get(`/api/propostas/ranking/item/${item}`).expect(200)).body).toEqual([]);
      expect((await http().get(`/api/propostas/ranking/item/${item}`).set(bearer(F2.token)).expect(200)).body).toEqual([]);
      expect((await http().get(`/api/propostas/ranking/item/${item}`).set(bearer(A.token)).expect(200)).body.length).toBe(2);
    });

    it('propostas iniciais da sala: sem identidade, sem marca e sem modelo para quem não é o órgão', async () => {
      await ctx.dataSource.query(`UPDATE proposta_itens SET marca = 'MarcaPropria', modelo = 'X1' WHERE item_licitacao_id = $1`, [P.lic.itens[0].id]);
      const r = await http().get(`/api/disputa/item/${P.lic.itens[0].id}/propostas`).set(bearer(F1.token)).expect(200);
      expect(r.body.length).toBe(2);
      expect(JSON.stringify(r.body)).not.toContain('MarcaPropria');
      expect(JSON.stringify(r.body)).not.toContain(F2.id);
    });

    it('depois do fim dos lances (julgamento), a lista sai identificada, mas só com o cadastro básico', async () => {
      await ctx.dataSource.query(`UPDATE licitacoes SET fase = 'JULGAMENTO' WHERE id = $1`, [P.lic.id]);
      const r = await lista(F3.token).expect(200);
      expect(r.body.length).toBe(2);
      const f = r.body[0].fornecedor;
      expect(f.razao_social).toBeTruthy();
      expect(Object.keys(f).sort()).toEqual(['cidade', 'cpf_cnpj', 'id', 'nome_fantasia', 'porte', 'razao_social', 'uf']);
      await ctx.dataSource.query(`UPDATE licitacoes SET fase = 'EM_DISPUTA' WHERE id = $1`, [P.lic.id]);
    });
  });

  describe('cadastro de fornecedores', () => {
    it('fornecedor não lista a base nem lê o cadastro de outro', async () => {
      expect((await http().get('/api/fornecedores').set(bearer(F1.token))).status).toBe(403);
      expect((await http().get(`/api/fornecedores/${F2.id}`).set(bearer(F1.token))).status).toBe(403);
      expect((await http().get(`/api/fornecedores/${F2.id}/habilitacao`).set(bearer(F1.token))).status).toBe(403);
      expect((await http().get(`/api/fornecedores/${F1.id}`).set(bearer(F1.token))).status).toBe(200);
    });

    it('órgão lista, mas sem o CPF do representante', async () => {
      await ctx.dataSource.query(`UPDATE fornecedores SET representante_cpf = '12345678901' WHERE id = $1`, [F2.id]);
      const r = await http().get('/api/fornecedores').set(bearer(B.token)).expect(200);
      expect(r.body.length).toBeGreaterThan(0);
      expect(JSON.stringify(r.body)).not.toContain('12345678901');
      expect(JSON.stringify((await http().get(`/api/fornecedores/${F2.id}`).set(bearer(B.token)).expect(200)).body)).not.toContain('12345678901');
    });

    it('chave de API: órgão não gera, nem com vínculo; o próprio fornecedor gera', async () => {
      expect((await http().post(`/api/fornecedores/${F1.id}/api-key`).set(bearer(A.token))).status).toBe(403);
      expect((await http().post(`/api/fornecedores/${F1.id}/api-key`).set(bearer(B.token))).status).toBe(403);
      expect((await http().post(`/api/fornecedores/${F1.id}/api-key`).set(bearer(F2.token))).status).toBe(403);
      expect([200, 201]).toContain((await http().post(`/api/fornecedores/${F1.id}/api-key`).set(bearer(F1.token))).status);
    });

    it('verificar-cnpj público não devolve o cadastro; o órgão recebe só id, nome e CNPJ', async () => {
      const [f] = await ctx.dataSource.query(`SELECT cpf_cnpj FROM fornecedores WHERE id = $1`, [F1.id]);
      const pub = await http().get(`/api/fornecedores/verificar-cnpj/${f.cpf_cnpj}`).expect(200);
      expect(pub.body.existe).toBe(true);
      expect(pub.body.fornecedor).toBeUndefined();
      const org = await http().get(`/api/fornecedores/verificar-cnpj/${f.cpf_cnpj}`).set(bearer(B.token)).expect(200);
      expect(Object.keys(org.body.fornecedor).sort()).toEqual(['cpf_cnpj', 'id', 'razao_social']);
    });

    it('cadastro criado pelo órgão não é assumido só com o CNPJ', async () => {
      const cnpj = '11444777000161';
      const c = await http().post('/api/fornecedores/orgao/cadastro-rapido').set(bearer(A.token)).send({ cnpj, razao_social: 'Contratada do Órgão LTDA' });
      expect([200, 201]).toContain(c.status);
      const r = await http().post('/api/fornecedores/reivindicar-conta').send({ cnpj, email: 'invasor@e2e.local', senha: 'Senha@12345' });
      expect(r.status).toBe(403);
      const v = await http().post('/api/fornecedores/vincular-cnpj').set(bearer(F3.token)).send({ cnpj });
      expect(v.status).toBe(403);
      const [depois] = await ctx.dataSource.query(`SELECT senha, email FROM fornecedores WHERE id = $1`, [c.body.id]);
      expect(depois.senha).toBeFalsy();
      expect(depois.email).not.toBe('invasor@e2e.local');
    });
  });

  describe('entre órgãos', () => {
    it('patrimônio e SIGA: só o órgão da URL', async () => {
      for (const rota of [`/api/orgaos/${A.id}/patrimonio`, `/api/orgaos/${A.id}/siga/config`]) {
        expect((await http().get(rota).set(bearer(B.token))).status).toBe(403);
        expect((await http().get(rota).set(bearer(F1.token))).status).toBe(403);
        expect((await http().get(rota).set(bearer(A.token))).status).toBe(200);
      }
    });

    it('seed de contas de teste: só o admin', async () => {
      expect((await http().post('/api/seed/usuarios').set(bearer(F1.token))).status).toBe(403);
      expect((await http().post('/api/seed/usuarios').set(bearer(A.token))).status).toBe(403);
      expect((await http().get('/api/seed/status').set(bearer(A.token))).status).toBe(403);
    });

    it('trilha de auditoria: fornecedor não lê; órgão só a própria', async () => {
      expect((await http().get('/api/audit/logs').set(bearer(F1.token))).status).toBe(403);
      await ctx.dataSource.query(
        `INSERT INTO audit_logs (action, resource_type, orgao_id, user_email) VALUES ('TESTE', 'X', $1, 'a@e2e.local'), ('TESTE', 'X', $2, 'b@e2e.local')`,
        [A.id, B.id],
      ).catch(() => undefined);
      const r = await http().get(`/api/audit/logs?orgaoId=${A.id}`).set(bearer(B.token)).expect(200);
      expect(JSON.stringify(r.body)).not.toContain('a@e2e.local');
    });

    it('cadastro do órgão: outro órgão não altera; e-mail e senha mestres não mudam pelo PUT', async () => {
      expect((await http().put(`/api/orgaos/${A.id}`).set(bearer(B.token)).send({ nome: 'Invadido' })).status).toBe(403);
      const [antes] = await ctx.dataSource.query(`SELECT email_login, senha_hash FROM orgaos WHERE id = $1`, [A.id]);
      const r = await http().put(`/api/orgaos/${A.id}`).set(bearer(A.token)).send({ telefone: '7133334444', email_login: 'tomado@e2e.local', senha: 'Outra@12345' });
      expect(r.status).toBe(200);
      const [depois] = await ctx.dataSource.query(`SELECT email_login, senha_hash, telefone FROM orgaos WHERE id = $1`, [A.id]);
      expect(depois.email_login).toBe(antes.email_login);
      expect(depois.senha_hash).toBe(antes.senha_hash);
      expect(depois.telefone).toBe('7133334444');
    });
  });
});
