/**
 * Apoio dos e2e do CONTRATO: assinatura do termo pelos caminhos reais do
 * portal de assinaturas (E7 — o contrato só vai ao PNCP depois da última
 * assinatura, art. 94 da Lei 14.133/2021).
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/contratos'.
 */
import type { AppE2E } from './app';
import type { FornecedorFixture } from './fixtures';
import { AssinaturasService } from '../../src/assinaturas/assinaturas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function exigir(r: { status: number; body: any }, status: number, oque: string) {
  if (r.status !== status) throw new Error(`[contratos] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
}

/** Código do OTP gerado para o telefone/e-mail (cache em memória do AssinaturasService). */
function codigoOtp(ctx: AppE2E, chaveContem: string): string {
  const cache: Map<string, { codigo: string }> = (ctx.app.get(AssinaturasService) as any).otpCache;
  for (const [k, v] of cache.entries()) if (k.includes(chaveContem)) return v.codigo;
  throw new Error(`[contratos] OTP não encontrado para ${chaveContem}`);
}

/**
 * Solicita as assinaturas do termo de contrato (o usuário do órgão — ADMIN —
 * é o signatário do órgão) e assina pelas duas partes:
 *  - órgão: portal de assinaturas interno, pelo próprio login;
 *  - fornecedor: link de acesso (vai por e-mail/WhatsApp — aqui o token é lido
 *    do banco) → código (OTP, lido do cache) → assinar.
 * Espera a data de assinatura e a operação do PNCP enfileirada (efeitos da
 * última assinatura, que rodam depois da resposta).
 */
export async function assinarContrato(
  ctx: AppE2E,
  contratoId: string,
  usuario: { token: string; email: string; nome?: string },
  fornecedor: FornecedorFixture,
  opts: { esperarFilaPncp?: boolean } = {},
): Promise<void> {
  const s = await ctx
    .http()
    .post(`/api/contratos/${contratoId}/solicitar-assinaturas`)
    .set(bearer(usuario.token))
    .send({ usuario: { nome: usuario.nome ?? 'Responsável do órgão E2E', email: usuario.email } });
  exigir(s, 201, 'solicitar assinaturas do contrato');
  const docId = s.body.documento_assinatura_id;
  const sigs: any[] = await ctx.dataSource.query(
    `SELECT id, is_orgao_user, telefone, email, token_acesso FROM signatarios_documento WHERE documento_id = $1`,
    [docId],
  );
  const sigOrgao = sigs.find((x) => x.is_orgao_user);
  exigir(
    await ctx.http().post(`/api/portal-assinaturas/${docId}/signatarios/${sigOrgao.id}/assinar`).set(bearer(usuario.token)).send({}),
    201,
    'assinatura do órgão',
  );
  const sigForn = sigs.find((x) => !x.is_orgao_user);
  // O envio do código (WhatsApp/e-mail) falha no e2e (rede bloqueada), mas o código já foi gerado
  await ctx.http().post('/api/public/assinaturas/solicitar-codigo').send({ token_acesso: sigForn.token_acesso, cpf_cnpj: fornecedor.cnpj });
  const codigo = codigoOtp(ctx, String(sigForn.telefone || sigForn.email).replace(/\D/g, '') || sigForn.email);
  exigir(
    await ctx
      .http()
      .post('/api/public/assinaturas/assinar')
      .send({ token_acesso: sigForn.token_acesso, cpf_cnpj: fornecedor.cnpj, codigo_otp: codigo }),
    201,
    'assinatura do fornecedor',
  );
  for (let i = 0; i < 100; i++) {
    const [c] = await ctx.dataSource.query(`SELECT data_assinatura FROM contratos WHERE id = $1`, [contratoId]);
    const [op] = opts.esperarFilaPncp
      ? await ctx.dataSource.query(`SELECT 1 FROM pncp_sync WHERE entidade_id = $1 AND tipo::text IN ('CONTRATO','RETIFICACAO_CONTRATO')`, [contratoId])
      : [true];
    if (c?.data_assinatura && op) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('[contratos] o contrato não ficou assinado (ou a operação do PNCP não foi enfileirada) depois das assinaturas');
}
