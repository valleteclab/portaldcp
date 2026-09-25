/**
 * ============================================================================
 * E9 — ACESSO: configuração de e-mail/WhatsApp do órgão, cadastro do órgão e PCA
 * ============================================================================
 *
 * - `/api/orgaos/:id/email-config` e `/whatsapp-config` (GET/PUT/testes):
 *   leitura mascarada por membro do órgão; alteração e envio de teste só pelo
 *   próprio órgão (login do órgão ou usuário com papel ADMIN do órgão) ou pelo
 *   admin da plataforma. Fornecedor e outro órgão → 403. Nenhuma resposta
 *   devolve senha/token/chave (nem criptografados).
 * - `/api/orgaos` (lista) só admin; `/api/orgaos/:id` só membro/admin; o
 *   cadastro nunca sai com hash de senha ou credenciais.
 * - `/api/pca`: órgão vem do token (`orgao_id` de outro órgão → 403);
 *   leitura de PCA/item de outro órgão → 404, escrita → 403; fornecedor → 403.
 */
import {
  AppE2E,
  FornecedorFixture,
  OrgaoFixture,
  UsuarioOrgaoFixture,
  criarApp,
  criarFornecedor,
  criarLicitacao,
  criarOrgao,
  criarUsuarioOrgao,
} from './support';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';
import { ModalidadeLicitacao } from '../src/licitacoes/entities/licitacao.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const SEGREDOS = ['segredo-smtp-A', 'segredo-imap-A', 'chave-resend-A', 'token-zapi-A', 'client-token-A'];
const CAMPOS_SECRETOS = [
  'senha_hash',
  'pncp_senha',
  'email_smtp_senha',
  'email_imap_senha',
  'whatsapp_token',
  'whatsapp_client_token',
];

/** Nenhum segredo (em claro) e nenhum campo de credencial no corpo. */
function semSegredos(body: unknown) {
  const texto = JSON.stringify(body);
  for (const s of SEGREDOS) expect(texto).not.toContain(s);
  for (const campo of CAMPOS_SECRETOS) expect(texto).not.toContain(`"${campo}"`);
}

describe('E9 — acesso a configurações do órgão e ao PCA', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  let B: OrgaoFixture;
  let F1: FornecedorFixture;
  let pregoeiroA: UsuarioOrgaoFixture;
  let adminDoOrgaoA: UsuarioOrgaoFixture;
  let admin: string;
  const http = () => ctx.http();
  const sql = (q: string, p: unknown[] = []) => ctx.dataSource.query(q, p);

  beforeAll(async () => {
    ctx = await criarApp();
    A = await criarOrgao(ctx, { nome: 'Prefeitura Acesso (A)' });
    B = await criarOrgao(ctx, { nome: 'Prefeitura Acesso (B)' });
    F1 = await criarFornecedor(ctx, { porte: 'DEMAIS' });
    pregoeiroA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.PREGOEIRO });
    adminDoOrgaoA = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN });
    admin = ctx.tokenAdmin();
  });

  afterAll(async () => {
    await ctx?.fechar();
  });

  // ==========================================================================
  describe('1. configuração de e-mail', () => {
    it('o próprio órgão grava; a resposta vem mascarada (sem senhas nem chave)', async () => {
      const r = await http()
        .put(`/api/orgaos/${A.id}/email-config`)
        .set(bearer(A.token))
        .send({
          email_metodo: 'SMTP',
          email_smtp_host: 'smtp.orgao-a.local',
          email_smtp_port: 587,
          email_smtp_user: 'licitacao@orgao-a.local',
          email_smtp_senha: 'segredo-smtp-A',
          email_imap_senha: 'segredo-imap-A',
          email_resend_api_key: 'chave-resend-A',
          email_from: 'licitacao@orgao-a.local',
        })
        .expect(200);
      expect(r.body.config.email_smtp_host).toBe('smtp.orgao-a.local');
      expect(r.body.config.email_resend_api_key).toBe('***');
      semSegredos(r.body);

      const [linha] = await sql(`SELECT email_smtp_senha FROM orgaos WHERE id = $1`, [A.id]);
      expect(linha.email_smtp_senha).toBeTruthy();
      expect(linha.email_smtp_senha).not.toBe('segredo-smtp-A'); // criptografada
    });

    it('outro órgão e fornecedor não leem, não alteram e não testam (403) — nada muda', async () => {
      const lerB = await http().get(`/api/orgaos/${A.id}/email-config`).set(bearer(B.token));
      const lerF = await http().get(`/api/orgaos/${A.id}/email-config`).set(bearer(F1.token));
      const gravarB = await http()
        .put(`/api/orgaos/${A.id}/email-config`)
        .set(bearer(B.token))
        .send({ email_smtp_host: 'smtp.invasor.local' });
      const gravarF = await http()
        .put(`/api/orgaos/${A.id}/email-config`)
        .set(bearer(F1.token))
        .send({ email_smtp_host: 'smtp.invasor.local' });
      const testarB = await http().post(`/api/orgaos/${A.id}/email-config/testar`).set(bearer(B.token)).send({ email: 'x@y.z' });
      const imapB = await http().post(`/api/orgaos/${A.id}/email-config/testar-imap`).set(bearer(B.token));
      const testarF = await http().post(`/api/orgaos/${A.id}/email-config/testar`).set(bearer(F1.token)).send({ email: 'x@y.z' });
      expect([lerB.status, lerF.status, gravarB.status, gravarF.status, testarB.status, imapB.status, testarF.status]).toEqual([
        403, 403, 403, 403, 403, 403, 403,
      ]);
      const [linha] = await sql(`SELECT email_smtp_host FROM orgaos WHERE id = $1`, [A.id]);
      expect(linha.email_smtp_host).toBe('smtp.orgao-a.local');
    });

    it('pregoeiro do órgão lê (mascarado) mas não altera; usuário ADMIN do órgão altera', async () => {
      const ler = await http().get(`/api/orgaos/${A.id}/email-config`).set(bearer(pregoeiroA.token)).expect(200);
      semSegredos(ler.body);
      const gravarPregoeiro = await http()
        .put(`/api/orgaos/${A.id}/email-config`)
        .set(bearer(pregoeiroA.token))
        .send({ email_from: 'outro@orgao-a.local' });
      expect(gravarPregoeiro.status).toBe(403);
      const testarPregoeiro = await http()
        .post(`/api/orgaos/${A.id}/email-config/testar`)
        .set(bearer(pregoeiroA.token))
        .send({ email: 'x@y.z' });
      expect(testarPregoeiro.status).toBe(403);

      const r = await http()
        .put(`/api/orgaos/${A.id}/email-config`)
        .set(bearer(adminDoOrgaoA.token))
        .send({ email_from: 'compras@orgao-a.local' })
        .expect(200);
      expect(r.body.config.email_from).toBe('compras@orgao-a.local');
      semSegredos(r.body);
    });

    it('admin da plataforma lê e altera (sempre mascarado)', async () => {
      const ler = await http().get(`/api/orgaos/${A.id}/email-config`).set(bearer(admin)).expect(200);
      expect(ler.body.email_smtp_host).toBe('smtp.orgao-a.local');
      semSegredos(ler.body);
      const r = await http()
        .put(`/api/orgaos/${A.id}/email-config`)
        .set(bearer(admin))
        .send({ email_smtp_port: 465 })
        .expect(200);
      expect(r.body.config.email_smtp_port).toBe(465);
      semSegredos(r.body);
    });
  });

  // ==========================================================================
  describe('2. configuração de WhatsApp', () => {
    it('o próprio órgão grava; tokens nunca voltam', async () => {
      const r = await http()
        .put(`/api/orgaos/${A.id}/whatsapp-config`)
        .set(bearer(A.token))
        .send({
          whatsapp_provider: 'ZAPI',
          whatsapp_instance_id: 'instancia-A',
          whatsapp_token: 'token-zapi-A',
          whatsapp_client_token: 'client-token-A',
        })
        .expect(200);
      expect(r.body.config).toEqual(expect.objectContaining({ whatsapp_instance_id: 'instancia-A', configurado: true }));
      semSegredos(r.body);
    });

    it('outro órgão e fornecedor: 403 em ler, alterar e testar; nada muda', async () => {
      const lerB = await http().get(`/api/orgaos/${A.id}/whatsapp-config`).set(bearer(B.token));
      const lerF = await http().get(`/api/orgaos/${A.id}/whatsapp-config`).set(bearer(F1.token));
      const gravarB = await http()
        .put(`/api/orgaos/${A.id}/whatsapp-config`)
        .set(bearer(B.token))
        .send({ whatsapp_instance_id: 'instancia-invasor' });
      const gravarF = await http()
        .put(`/api/orgaos/${A.id}/whatsapp-config`)
        .set(bearer(F1.token))
        .send({ whatsapp_instance_id: 'instancia-invasor' });
      const testarB = await http().post(`/api/orgaos/${A.id}/whatsapp-config/testar`).set(bearer(B.token)).send({ numero: '77999999999' });
      const testarF = await http().post(`/api/orgaos/${A.id}/whatsapp-config/testar`).set(bearer(F1.token)).send({ numero: '77999999999' });
      expect([lerB.status, lerF.status, gravarB.status, gravarF.status, testarB.status, testarF.status]).toEqual([
        403, 403, 403, 403, 403, 403,
      ]);
      const [linha] = await sql(`SELECT whatsapp_instance_id FROM orgaos WHERE id = $1`, [A.id]);
      expect(linha.whatsapp_instance_id).toBe('instancia-A');
    });

    it('pregoeiro do órgão consulta se está configurado (telas de medição/contratos), sem alterar', async () => {
      const ler = await http().get(`/api/orgaos/${A.id}/whatsapp-config`).set(bearer(pregoeiroA.token)).expect(200);
      expect(ler.body.configurado).toBe(true);
      semSegredos(ler.body);
      const gravar = await http()
        .put(`/api/orgaos/${A.id}/whatsapp-config`)
        .set(bearer(pregoeiroA.token))
        .send({ whatsapp_instance_id: 'instancia-pregoeiro' });
      expect(gravar.status).toBe(403);
    });

    it('admin da plataforma lê (mascarado)', async () => {
      const ler = await http().get(`/api/orgaos/${A.id}/whatsapp-config`).set(bearer(admin)).expect(200);
      expect(ler.body.whatsapp_instance_id).toBe('instancia-A');
      semSegredos(ler.body);
    });
  });

  // ==========================================================================
  describe('3. cadastro do órgão sem credenciais e por dono', () => {
    it('GET /api/orgaos/:id: o próprio órgão lê (sem segredos); outro órgão e fornecedor → 403', async () => {
      const proprio = await http().get(`/api/orgaos/${A.id}`).set(bearer(A.token)).expect(200);
      expect(proprio.body.id).toBe(A.id);
      semSegredos(proprio.body);
      const outro = await http().get(`/api/orgaos/${A.id}`).set(bearer(B.token));
      const forn = await http().get(`/api/orgaos/${A.id}`).set(bearer(F1.token));
      const modulos = await http().get(`/api/orgaos/${A.id}/modulos`).set(bearer(B.token));
      const statusPncp = await http().get(`/api/orgaos/${A.id}/pncp/status`).set(bearer(F1.token));
      expect([outro.status, forn.status, modulos.status, statusPncp.status]).toEqual([403, 403, 403, 403]);
    });

    it('GET /api/orgaos (lista completa) só o admin, sem segredos; /me sem segredos', async () => {
      const orgao = await http().get('/api/orgaos').set(bearer(A.token));
      const forn = await http().get('/api/orgaos').set(bearer(F1.token));
      expect([orgao.status, forn.status]).toEqual([403, 403]);
      const lista = await http().get('/api/orgaos').set(bearer(admin)).expect(200);
      expect(lista.body.some((o: { id: string }) => o.id === A.id)).toBe(true);
      semSegredos(lista.body);
      const me = await http().get('/api/orgaos/me').set(bearer(A.token)).expect(200);
      semSegredos(me.body);
    });

    it('PUT /api/orgaos/:id devolve o cadastro sem credenciais', async () => {
      const r = await http().put(`/api/orgaos/${A.id}`).set(bearer(A.token)).send({ telefone: '7733330000' }).expect(200);
      semSegredos(r.body);
    });
  });

  // ==========================================================================
  describe('4. PCA', () => {
    let pcaA: string;
    let itemA: string;

    it('órgão A cria o PCA para si (orgao_id do corpo = o próprio ou ausente)', async () => {
      const r = await http()
        .post('/api/pca')
        .set(bearer(A.token))
        .send({ ano_exercicio: 2031, orgao_id: A.id })
        .expect(201);
      pcaA = r.body.id;
      expect(r.body.orgao_id).toBe(A.id);

      const item = await http()
        .post(`/api/pca/${pcaA}/itens`)
        .set(bearer(A.token))
        .send({ categoria: 'MATERIAL', descricao_objeto: 'Papel A4', valor_estimado: 300 })
        .expect(201);
      itemA = item.body.id;
      expect(item.body.pca_id).toBe(pcaA);
    });

    it('órgão B não cria PCA para A (403); sem orgao_id cria para o próprio B', async () => {
      const paraA = await http().post('/api/pca').set(bearer(B.token)).send({ ano_exercicio: 2032, orgao_id: A.id });
      expect(paraA.status).toBe(403);
      const [conta] = await sql(`SELECT count(*)::int AS n FROM planos_contratacao_anual WHERE orgao_id = $1 AND ano_exercicio = 2032`, [A.id]);
      expect(conta.n).toBe(0);

      const proprio = await http().post('/api/pca').set(bearer(B.token)).send({ ano_exercicio: 2032 }).expect(201);
      expect(proprio.body.orgao_id).toBe(B.id);
    });

    it('fornecedor não cria nem lê PCA (403)', async () => {
      const criar = await http().post('/api/pca').set(bearer(F1.token)).send({ ano_exercicio: 2033, orgao_id: A.id });
      const ler = await http().get(`/api/pca/${pcaA}`).set(bearer(F1.token));
      const listar = await http().get('/api/pca').set(bearer(F1.token));
      expect([criar.status, ler.status, listar.status]).toEqual([403, 403, 403]);
    });

    it('órgão B: leitura do PCA/itens de A → 404; escrita → 403; nada muda', async () => {
      const ler = await http().get(`/api/pca/${pcaA}`).set(bearer(B.token));
      const itens = await http().get(`/api/pca/${pcaA}/itens`).set(bearer(B.token));
      const item = await http().get(`/api/pca/itens/${itemA}`).set(bearer(B.token));
      const estat = await http().get(`/api/pca/estatisticas/${pcaA}`).set(bearer(B.token));
      expect([ler.status, itens.status, item.status, estat.status]).toEqual([404, 404, 404, 404]);

      const atualizar = await http().put(`/api/pca/${pcaA}`).set(bearer(B.token)).send({ observacoes: 'por B' });
      const addItem = await http().post(`/api/pca/${pcaA}/itens`).set(bearer(B.token)).send({ categoria: 'MATERIAL', descricao_objeto: 'x' });
      const editItem = await http().put(`/api/pca/itens/${itemA}`).set(bearer(B.token)).send({ descricao_objeto: 'trocado por B' });
      const statusItem = await http().patch(`/api/pca/itens/${itemA}/status`).set(bearer(B.token)).send({ status: 'CANCELADO' });
      const removerItem = await http().delete(`/api/pca/itens/${itemA}`).set(bearer(B.token));
      const publicar = await http().patch(`/api/pca/${pcaA}/publicar`).set(bearer(B.token));
      const limpar = await http().delete(`/api/pca/${pcaA}/limpar-itens`).set(bearer(B.token));
      const excluir = await http().delete(`/api/pca/${pcaA}`).set(bearer(B.token));
      expect([
        atualizar.status,
        addItem.status,
        editItem.status,
        statusItem.status,
        removerItem.status,
        publicar.status,
        limpar.status,
        excluir.status,
      ]).toEqual([403, 403, 403, 403, 403, 403, 403, 403]);

      const [pca] = await sql(`SELECT orgao_id::text AS orgao_id, status::text AS status FROM planos_contratacao_anual WHERE id = $1`, [pcaA]);
      expect(pca.orgao_id).toBe(A.id);
      const [it] = await sql(`SELECT descricao_objeto FROM itens_pca WHERE id = $1`, [itemA]);
      expect(it.descricao_objeto).toBe('Papel A4');
    });

    it('listagem de B com orgaoId=A na consulta continua mostrando só os PCAs de B', async () => {
      const r = await http().get(`/api/pca?orgaoId=${A.id}`).set(bearer(B.token)).expect(200);
      const ids = (r.body as { id: string; orgao_id: string }[]).map((p) => p.orgao_id);
      expect(ids.every((o) => o === B.id)).toBe(true);
    });

    it('órgão A lê/altera o próprio PCA, mas não o move para outro órgão pelo corpo', async () => {
      await http().get(`/api/pca/${pcaA}`).set(bearer(A.token)).expect(200);
      await http().get(`/api/pca/itens/${itemA}`).set(bearer(pregoeiroA.token)).expect(200);
      await http().put(`/api/pca/${pcaA}`).set(bearer(A.token)).send({ orgao_id: B.id }).expect(200);
      const [pca] = await sql(`SELECT orgao_id::text AS orgao_id FROM planos_contratacao_anual WHERE id = $1`, [pcaA]);
      expect(pca.orgao_id).toBe(A.id);
    });

    it('admin da plataforma lê o PCA de qualquer órgão', async () => {
      const r = await http().get(`/api/pca/${pcaA}`).set(bearer(admin)).expect(200);
      expect(r.body.id).toBe(pcaA);
    });
  });

  // ==========================================================================
  describe('5. unidades do órgão e solicitações de acesso', () => {
    it('unidades: órgão B não lista/cria/altera as de A; A cria para si', async () => {
      const criada = await http()
        .post('/api/unidades')
        .set(bearer(A.token))
        .send({ codigo_unidade: '101', nome: 'Secretaria de Administração' });
      expect(criada.status).toBe(201);
      expect(criada.body.orgao_id).toBe(A.id);

      const listarB = await http().get(`/api/unidades/orgao/${A.id}`).set(bearer(B.token));
      const lerB = await http().get(`/api/unidades/${criada.body.id}`).set(bearer(B.token));
      const criarB = await http().post('/api/unidades').set(bearer(B.token)).send({ orgao_id: A.id, codigo_unidade: '999' });
      const alterarB = await http().put(`/api/unidades/${criada.body.id}`).set(bearer(B.token)).send({ nome: 'por B' });
      const excluirF = await http().delete(`/api/unidades/${criada.body.id}`).set(bearer(F1.token));
      expect([listarB.status, lerB.status, criarB.status, alterarB.status, excluirF.status]).toEqual([404, 404, 403, 403, 403]);
    });

    it('solicitações de acesso (aprovar/listar) só o admin da plataforma', async () => {
      const listarOrgao = await http().get('/api/solicitacoes-acesso').set(bearer(A.token));
      const listarForn = await http().get('/api/solicitacoes-acesso').set(bearer(F1.token));
      const aprovar = await http()
        .put('/api/solicitacoes-acesso/00000000-0000-0000-0000-000000000000/aprovar')
        .set(bearer(F1.token))
        .send({ aprovado_por: 'x' });
      expect([listarOrgao.status, listarForn.status, aprovar.status]).toEqual([403, 403, 403]);
      await http().get('/api/solicitacoes-acesso').set(bearer(admin)).expect(200);
    });
  });

  // ==========================================================================
  describe('6. usuários do órgão e pregoeiro da licitação (pregoeiro_id)', () => {
    it('lista de usuários: só os do órgão do token (orgao_id da consulta ignorado); fornecedor → 403', async () => {
      const usuarioB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.PREGOEIRO });
      const deB = await http().get(`/api/usuarios?orgao_id=${A.id}`).set(bearer(B.token)).expect(200);
      const ids = (deB.body as { id: string; orgao_id: string }[]).map((u) => u.id);
      expect(ids).toContain(usuarioB.id);
      expect(ids).not.toContain(pregoeiroA.id);
      semSegredos(deB.body); // nem o órgão embutido traz credenciais

      const forn = await http().get('/api/usuarios').set(bearer(F1.token));
      const pregoeirosDeA = await http().get(`/api/usuarios/pregoeiros/${A.id}`).set(bearer(B.token));
      expect([forn.status, pregoeirosDeA.status]).toEqual([403, 404]);

      const deA = await http().get('/api/usuarios').set(bearer(A.token)).expect(200);
      expect((deA.body as { id: string }[]).map((u) => u.id)).toEqual(expect.arrayContaining([pregoeiroA.id, adminDoOrgaoA.id]));
    });

    it('PUT /licitacoes/:id: pregoeiro_id de outro órgão → 400; usuário do próprio órgão grava o vínculo', async () => {
      const usuarioB = await criarUsuarioOrgao(ctx, B, { role: RoleUsuario.PREGOEIRO });
      const lic = await criarLicitacao(ctx, A, ModalidadeLicitacao.PREGAO_ELETRONICO);
      const deOutro = await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ pregoeiro_id: usuarioB.id });
      expect(deOutro.status).toBe(400);

      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ pregoeiro_id: pregoeiroA.id }).expect(200);
      const lida = await http().get(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).expect(200);
      expect(lida.body.pregoeiro_id).toBe(pregoeiroA.id);

      await http().put(`/api/licitacoes/${lic.id}`).set(bearer(A.token)).send({ pregoeiro_id: null }).expect(200);
      const [linha] = await sql(`SELECT pregoeiro_id FROM licitacoes WHERE id = $1`, [lic.id]);
      expect(linha.pregoeiro_id).toBeNull();
    });
  });

  // ==========================================================================
  describe('7. /api/usuarios/:id — dono, gestor do órgão, sem escalada', () => {
    it('outro órgão: leitura 404, escrita 403; fornecedor 403; nada muda', async () => {
      const ler = await http().get(`/api/usuarios/${pregoeiroA.id}`).set(bearer(B.token));
      const modulos = await http().get(`/api/usuarios/${pregoeiroA.id}/modulos`).set(bearer(B.token));
      const alterar = await http().put(`/api/usuarios/${pregoeiroA.id}`).set(bearer(B.token)).send({ nome: 'por B', role: 'ADMIN' });
      const desativar = await http().put(`/api/usuarios/${pregoeiroA.id}/desativar`).set(bearer(B.token));
      const remover = await http().delete(`/api/usuarios/${pregoeiroA.id}`).set(bearer(B.token));
      const senha = await http().put(`/api/usuarios/${pregoeiroA.id}/senha`).set(bearer(B.token)).send({ senha_atual: 'x', nova_senha: 'y' });
      const lerF = await http().get(`/api/usuarios/${pregoeiroA.id}`).set(bearer(F1.token));
      const alterarF = await http().put(`/api/usuarios/${pregoeiroA.id}`).set(bearer(F1.token)).send({ nome: 'por F' });
      expect([ler.status, modulos.status, alterar.status, desativar.status, remover.status, senha.status, lerF.status, alterarF.status]).toEqual([
        404, 404, 403, 403, 403, 403, 403, 403,
      ]);
      const [u] = await sql(`SELECT nome, role::text AS role, ativo FROM usuarios WHERE id = $1`, [pregoeiroA.id]);
      expect(u.role).toBe('PREGOEIRO');
      expect(u.ativo).toBe(true);
      expect(u.nome).not.toBe('por B');
    });

    it('usuário comum: lê e edita só o próprio perfil (sem papel/órgão/permissões); não mexe nos colegas', async () => {
      const proprio = await http().get(`/api/usuarios/${pregoeiroA.id}`).set(bearer(pregoeiroA.token)).expect(200);
      semSegredos(proprio.body);
      await http()
        .put(`/api/usuarios/${pregoeiroA.id}`)
        .set(bearer(pregoeiroA.token))
        .send({ nome: 'Pregoeiro A (editado)', role: 'ADMIN', orgao_id: B.id, pode_liberar_contratos: true })
        .expect(200);
      const [u] = await sql(
        `SELECT nome, role::text AS role, orgao_id::text AS orgao_id, pode_liberar_contratos FROM usuarios WHERE id = $1`,
        [pregoeiroA.id],
      );
      expect(u).toEqual({ nome: 'Pregoeiro A (editado)', role: 'PREGOEIRO', orgao_id: A.id, pode_liberar_contratos: false });

      const colega = await http().get(`/api/usuarios/${adminDoOrgaoA.id}`).set(bearer(pregoeiroA.token));
      const alterarColega = await http().put(`/api/usuarios/${adminDoOrgaoA.id}`).set(bearer(pregoeiroA.token)).send({ nome: 'x' });
      const criar = await http()
        .post('/api/usuarios')
        .set(bearer(pregoeiroA.token))
        .send({ nome: 'Novo', email: `novo.${Date.now()}@e2e.local`, senha: 'Senha-1', role: 'ADMIN' });
      expect([colega.status, alterarColega.status, criar.status]).toEqual([403, 403, 403]);
    });

    it('gestor do órgão (login do órgão / usuário ADMIN) altera papel; papel inválido → 400; não cria em outro órgão', async () => {
      const alvo = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.EQUIPE_APOIO });
      await http().put(`/api/usuarios/${alvo.id}`).set(bearer(adminDoOrgaoA.token)).send({ role: 'PREGOEIRO' }).expect(200);
      const invalido = await http().put(`/api/usuarios/${alvo.id}`).set(bearer(A.token)).send({ role: 'SUPER_ADMIN' });
      expect(invalido.status).toBe(400);
      const mudaOrgao = await http().put(`/api/usuarios/${alvo.id}`).set(bearer(A.token)).send({ orgao_id: B.id }).expect(200);
      expect(mudaOrgao.body.orgao_id).toBe(A.id);
      const [u] = await sql(`SELECT role::text AS role FROM usuarios WHERE id = $1`, [alvo.id]);
      expect(u.role).toBe('PREGOEIRO');

      const emB = await http()
        .post('/api/usuarios')
        .set(bearer(A.token))
        .send({ nome: 'Intruso', email: `intruso.${Date.now()}@e2e.local`, senha: 'Senha-1', orgao_id: B.id });
      expect(emB.status).toBe(403);

      // o token do usuário continua sendo de órgão (nunca ADMIN da plataforma)
      await http().get('/api/orgaos').set(bearer(adminDoOrgaoA.token)).expect(403);
    });

    it('senha: só o próprio usuário (nem o gestor troca a senha alheia por aqui)', async () => {
      const r = await http().put(`/api/usuarios/${pregoeiroA.id}/senha`).set(bearer(A.token)).send({ senha_atual: 'x', nova_senha: 'y' });
      expect(r.status).toBe(403);
      await http()
        .put(`/api/usuarios/${pregoeiroA.id}/senha`)
        .set(bearer(pregoeiroA.token))
        .send({ senha_atual: pregoeiroA.senha, nova_senha: 'Nova-Senha-1' })
        .expect(200);
    });

    it('admin da plataforma lê qualquer usuário', async () => {
      await http().get(`/api/usuarios/${pregoeiroA.id}`).set(bearer(admin)).expect(200);
    });
  });

  // ==========================================================================
  describe('8. autocadastro de órgão: só pela solicitação de acesso (pendente)', () => {
    it('POST /api/orgaos/registro e reset-credenciais: sem login → 401; órgão/fornecedor → 403', async () => {
      const corpo = { email: `reg.${Date.now()}@e2e.local`, senha: 'x', nome: 'Órgão pirata', cnpj: '11222333000181', codigo: 'PIRATA' };
      const anon = await http().post('/api/orgaos/registro').send(corpo);
      const orgao = await http().post('/api/orgaos/registro').set(bearer(A.token)).send(corpo);
      const reset = await http().post('/api/orgaos/reset-credenciais').send({ cnpj: A.cnpj, email: 'tomada@e2e.local', senha: 'x' });
      const resetF = await http().post('/api/orgaos/reset-credenciais').set(bearer(F1.token)).send({ cnpj: A.cnpj, email: 'tomada@e2e.local', senha: 'x' });
      expect([anon.status, orgao.status, reset.status, resetF.status]).toEqual([401, 403, 401, 403]);
      const [n] = await sql(`SELECT count(*)::int AS n FROM orgaos WHERE nome = 'Órgão pirata' OR email_login = 'tomada@e2e.local'`);
      expect(n.n).toBe(0);
    });

    it('solicitação de acesso é pública, valida os campos e fica PENDENTE sem criar órgão', async () => {
      const cnpj = '45997418000153';
      const r = await http()
        .post('/api/solicitacoes-acesso')
        .send({
          cnpj: '45.997.418/0001-53',
          razao_social: 'Câmara Municipal Teste',
          email: 'contato@camara-teste.local',
          nome_responsavel: 'Responsável',
          status: 'APROVADA',
          orgao_id: A.id,
          aprovado_por: 'eu mesmo',
        })
        .expect(201);
      expect(r.body.status).toBe('PENDENTE');
      expect(r.body.orgao_id ?? null).toBeNull();
      expect(r.body.aprovado_por ?? null).toBeNull();
      const [n] = await sql(`SELECT count(*)::int AS n FROM orgaos WHERE regexp_replace(cnpj, '\\D', '', 'g') = $1`, [cnpj]);
      expect(n.n).toBe(0);

      const semEmail = await http().post('/api/solicitacoes-acesso').send({ cnpj, razao_social: 'X', nome_responsavel: 'Y' });
      const cnpjRuim = await http().post('/api/solicitacoes-acesso').send({ cnpj: '123', razao_social: 'X', email: 'a@b.co', nome_responsavel: 'Y' });
      const repetida = await http()
        .post('/api/solicitacoes-acesso')
        .send({ cnpj, razao_social: 'X', email: 'a@b.co', nome_responsavel: 'Y' });
      expect([semEmail.status, cnpjRuim.status, repetida.status]).toEqual([400, 400, 409]);

      // aprovar/listar continuam só do admin
      const aprovarAnon = await http().put(`/api/solicitacoes-acesso/${r.body.id}/aprovar`).send({ aprovado_por: 'x' });
      expect([401, 403]).toContain(aprovarAnon.status);
    });
  });
});
