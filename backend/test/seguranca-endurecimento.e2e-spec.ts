/**
 * ============================================================================
 * ENDURECIMENTO — auditoria de 13/11/2026 (lote 3)
 * ============================================================================
 *
 *  - senhas novas em bcrypt; hash antigo (SHA-256 sem sal) é aceito e regravado no login;
 *  - usuário desativado perde o acesso na hora (o token vale 7 dias); papel vale o do cadastro;
 *  - 8 erros seguidos na mesma conta bloqueiam o login dessa conta por 15 minutos;
 *  - código de assinatura: 5 erros descartam o código;
 *  - webhook do WhatsApp: com WEBHOOK_ZAPI_TOKEN definido, só entra com o token.
 */
import { createHash } from 'crypto';
import { AppE2E, OrgaoFixture, criarApp, criarOrgao, criarUsuarioOrgao } from './support';
import { bearer } from './support/isolamento';
import { desligarLimiteDeRequisicoes } from './support/pregao';
import { AssinaturasService } from '../src/assinaturas/assinaturas.service';
import { zerarLimiteDeLogin } from '../src/common/limite-login';
import { RoleUsuario } from '../src/usuarios/entities/usuario.entity';

describe('Endurecimento (lote 3)', () => {
  let ctx: AppE2E;
  let A: OrgaoFixture;
  const http = () => ctx.http();

  beforeAll(async () => {
    ctx = await criarApp();
    desligarLimiteDeRequisicoes(ctx);
    A = await criarOrgao(ctx, { nome: 'Prefeitura A (endurecimento)' });
  }, 120_000);

  afterAll(async () => {
    delete process.env.WEBHOOK_ZAPI_TOKEN;
    await ctx?.fechar();
  });

  beforeEach(() => zerarLimiteDeLogin());

  it('senha nova vai em bcrypt; hash antigo em SHA-256 entra e é regravado', async () => {
    const u = await criarUsuarioOrgao(ctx, A);
    const [novo] = await ctx.dataSource.query(`SELECT senha_hash FROM usuarios WHERE id = $1`, [u.id]);
    expect(novo.senha_hash).toMatch(/^\$2/);

    await ctx.dataSource.query(`UPDATE usuarios SET senha_hash = $2 WHERE id = $1`, [u.id, createHash('sha256').update('Antiga@123').digest('hex')]);
    expect((await http().post('/api/usuarios/login').send({ email: u.email, senha: 'errada' })).status).toBe(400);
    expect([200, 201]).toContain((await http().post('/api/usuarios/login').send({ email: u.email, senha: 'Antiga@123' })).status);
    const [migrado] = await ctx.dataSource.query(`SELECT senha_hash FROM usuarios WHERE id = $1`, [u.id]);
    expect(migrado.senha_hash).toMatch(/^\$2/);
    expect([200, 201]).toContain((await http().post('/api/usuarios/login').send({ email: u.email, senha: 'Antiga@123' })).status);
  });

  it('usuário desativado perde o acesso com o token que já tinha; papel rebaixado vale na hora', async () => {
    const u = await criarUsuarioOrgao(ctx, A, { role: RoleUsuario.ADMIN });
    expect((await http().get(`/api/licitacoes`).set(bearer(u.token))).status).toBe(200);

    await ctx.dataSource.query(`UPDATE usuarios SET role = 'EQUIPE_APOIO' WHERE id = $1`, [u.id]);
    const criar = await http().post('/api/usuarios').set(bearer(u.token)).send({ nome: 'X', email: `x.${Date.now()}@e2e.local`, senha: 'Senha@12345', role: 'PREGOEIRO', orgao_id: A.id, cpf: '52998224725' });
    expect(criar.status).toBe(403);

    await ctx.dataSource.query(`UPDATE usuarios SET ativo = false WHERE id = $1`, [u.id]);
    expect((await http().get(`/api/licitacoes`).set(bearer(u.token))).status).toBe(401);
  });

  it('8 erros seguidos bloqueiam o login da conta, mesmo com a senha certa depois', async () => {
    const u = await criarUsuarioOrgao(ctx, A);
    for (let i = 0; i < 8; i++) {
      expect((await http().post('/api/usuarios/login').send({ email: u.email, senha: 'errada-' + i })).status).toBe(400);
    }
    const bloqueado = await http().post('/api/usuarios/login').send({ email: u.email, senha: u.senha });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.message).toMatch(/Muitas tentativas/);
    // outra conta não é afetada
    const outro = await criarUsuarioOrgao(ctx, A);
    expect(outro.token).toBeTruthy();
  });

  it('código de assinatura: 5 erros descartam o código', async () => {
    const svc = ctx.app.get(AssinaturasService);
    const cache: Map<string, any> = (svc as any).otpCache;
    const chave = `otp_email_${A.id}_fulano@e2e.local`;
    cache.set(chave, { codigo: '123456', expiracao: Date.now() + 60_000, tentativas: 1 });
    for (let i = 0; i < 4; i++) {
      await expect(svc.validarOtpEmail(A.id, 'fulano@e2e.local', '000000')).rejects.toThrow(/Restam/);
    }
    await expect(svc.validarOtpEmail(A.id, 'fulano@e2e.local', '000000')).rejects.toThrow(/Limite de tentativas/);
    // o código certo já não vale: foi descartado
    await expect(svc.validarOtpEmail(A.id, 'fulano@e2e.local', '123456')).rejects.toThrow(/Nenhum código ativo/);

    cache.set(chave, { codigo: '654321', expiracao: Date.now() + 60_000, tentativas: 1 });
    await expect(svc.validarOtpEmail(A.id, 'fulano@e2e.local', '000000')).rejects.toThrow(/Restam 4/);
    await expect(svc.validarOtpEmail(A.id, 'fulano@e2e.local', '654321')).resolves.toBe(true);
  });

  it('webhook do WhatsApp: com o segredo configurado, só entra com o token', async () => {
    const corpo = { isGroup: true };
    expect((await http().post('/api/whatsapp/agent/webhook').send(corpo)).status).toBeLessThan(300);
    process.env.WEBHOOK_ZAPI_TOKEN = 'segredo-e2e';
    expect((await http().post('/api/whatsapp/agent/webhook').send(corpo)).status).toBe(403);
    expect((await http().post('/api/webhooks/zapi').send({})).status).toBe(403);
    expect((await http().post('/api/whatsapp/agent/webhook?token=errado').send(corpo)).status).toBe(403);
    expect((await http().post('/api/whatsapp/agent/webhook?token=segredo-e2e').send(corpo)).status).toBeLessThan(300);
    expect((await http().post('/api/whatsapp/agent/webhook').set('x-webhook-token', 'segredo-e2e').send(corpo)).status).toBeLessThan(300);
    delete process.env.WEBHOOK_ZAPI_TOKEN;
  });
});
