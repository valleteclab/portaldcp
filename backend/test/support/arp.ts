/**
 * Apoio dos e2e da ATA DE REGISTRO DE PREÇOS (plano E6 — parte ARP): pregão
 * SRP até a homologação pelas rotas reais, assinatura do termo pelo assinador
 * e rotas da ata.
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/arp'.
 */
import type { AppE2E } from './app';
import type { FornecedorFixture, OrgaoFixture } from './fixtures';
import { prepararPregaoEmDisputa } from './isolamento';
import { convocarAceitacao, decidirAceitacao, enviarPropostaAdequada } from './julgamento';
import { habilitarLicitante } from './habilitacao';
import { precluirIntencaoDeRecurso } from './recursos';
import { adjudicarResultado, homologarResultado } from './resultado';
import { AssinaturasService } from '../../src/assinaturas/assinaturas.service';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function exigir(r: { status: number; body: any }, status: number, oque: string) {
  if (r.status !== status) throw new Error(`[arp] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
}

/**
 * Pregão SRP de 1 item (quantidade `quantidade`, R$ 100 estimado): propostas
 * na ordem dada (o 1º tem o menor valor e vence), proposta adequada do
 * vencedor readequada a `valorAceito`, habilitação, preclusão da intenção de
 * recurso, adjudicação (pregoeiro/órgão) e homologação (autoridade). Devolve
 * a licitação, a sessão e a resposta da homologação.
 */
export async function pregaoSrpHomologado(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  autoridadeToken: string,
  participantes: Array<{ fornecedor: FornecedorFixture; valor: number }>,
  opts: { quantidade?: number; valorAceito: number; ataVigenciaMeses?: number },
) {
  const p = await prepararPregaoEmDisputa(
    ctx,
    orgao,
    participantes.map((x) => ({ fornecedor: x.fornecedor, valores: [x.valor] })),
    { itens: [{ descricao: 'Resma de papel A4 (ARP E6)', quantidade: opts.quantidade ?? 10, valor_unitario_estimado: 100 }] },
  );
  // SRP e vigência da ata (atalho de fixture: o cadastro da licitação grava estes campos)
  await ctx.dataSource.query(`UPDATE licitacoes SET srp = true, ata_vigencia_meses = $2 WHERE id = $1`, [p.lic.id, opts.ataVigenciaMeses ?? 12]);
  const item = p.lic.itens[0].id;
  exigir(await ctx.http().post(`/api/disputa-v2/sessao/${p.sessaoId}/encerrar-item/${item}`).set(bearer(orgao.token)), 201, 'encerrar item');
  const vencedor = participantes[0].fornecedor;
  const c = await convocarAceitacao(ctx, p.sessaoId, item, orgao.token);
  exigir(c, 201, 'convocar aceitação');
  if (c.body.fornecedorId !== vencedor.id) throw new Error(`[arp] convocado ${c.body.fornecedorId} ≠ vencedor esperado ${vencedor.id}`);
  exigir(await enviarPropostaAdequada(ctx, p.sessaoId, c.body.id, vencedor.token, [{ itemId: item, valorUnitario: opts.valorAceito }]), 201, 'proposta adequada');
  exigir(await decidirAceitacao(ctx, p.sessaoId, c.body.id, orgao.token, 'aceitar'), 201, 'aceitar proposta');
  await habilitarLicitante(ctx, p.lic.id, vencedor, orgao.token);
  await precluirIntencaoDeRecurso(ctx, p.sessaoId, orgao.token);
  exigir(await adjudicarResultado(ctx, p.lic.id, orgao.token), 200, 'adjudicar');
  const h = await homologarResultado(ctx, p.lic.id, autoridadeToken);
  exigir(h, 200, 'homologar');
  return { lic: p.lic, sessaoId: p.sessaoId, itemLicitacaoId: item, homologacao: h.body };
}

export function rotaAta(ctx: AppE2E, metodo: 'get' | 'post', caminho: string, token: string, corpo?: any) {
  const req = ctx.http()[metodo](`/api/atas/${caminho}`).set(bearer(token));
  return metodo === 'post' ? req.send(corpo ?? {}) : req;
}

/** Código do OTP gerado para o telefone/e-mail (cache em memória do AssinaturasService). */
function codigoOtp(ctx: AppE2E, chaveContem: string): string {
  const cache: Map<string, { codigo: string }> = (ctx.app.get(AssinaturasService) as any).otpCache;
  for (const [k, v] of cache.entries()) if (k.includes(chaveContem)) return v.codigo;
  throw new Error(`[arp] OTP não encontrado para ${chaveContem}`);
}

/**
 * Assina o termo da ata pelas duas partes, pelos caminhos reais:
 *  - órgão: usuário logado que é o signatário (portal de assinaturas interno — OTP dispensado);
 *  - fornecedor: link do próprio painel da ata → código (WhatsApp/e-mail; lido do cache) → assinar.
 * Espera a ata ficar VIGENTE (efeito da conclusão é assíncrono).
 */
export async function assinarAta(ctx: AppE2E, ataId: string, signatarioOrgaoToken: string, fornecedor: FornecedorFixture) {
  const [ata] = await ctx.dataSource.query(`SELECT documento_assinatura_id FROM atas_registro_preco WHERE id = $1`, [ataId]);
  const docId = ata.documento_assinatura_id;
  const sigs: any[] = await ctx.dataSource.query(`SELECT id, is_orgao_user, telefone, email FROM signatarios_documento WHERE documento_id = $1`, [docId]);
  const sigOrgao = sigs.find((s) => s.is_orgao_user);
  exigir(
    await ctx.http().post(`/api/portal-assinaturas/${docId}/signatarios/${sigOrgao.id}/assinar`).set(bearer(signatarioOrgaoToken)).send({}),
    201,
    'assinatura do órgão',
  );
  const painel = await rotaAta(ctx, 'get', `fornecedor/ata/${ataId}`, fornecedor.token);
  exigir(painel, 200, 'painel do fornecedor');
  const token = String(painel.body.link_assinatura || '').split('/').pop();
  if (!token) throw new Error('[arp] link de assinatura do fornecedor ausente');
  // O envio pelo WhatsApp falha no e2e (rede bloqueada), mas o código já foi gerado
  await ctx.http().post('/api/public/assinaturas/solicitar-codigo').send({ token_acesso: token, cpf_cnpj: fornecedor.cnpj });
  const sigForn = sigs.find((s) => !s.is_orgao_user);
  const codigo = codigoOtp(ctx, String(sigForn.telefone || sigForn.email).replace(/\D/g, '') || sigForn.email);
  exigir(
    await ctx.http().post('/api/public/assinaturas/assinar').send({ token_acesso: token, cpf_cnpj: fornecedor.cnpj, codigo_otp: codigo }),
    201,
    'assinatura do fornecedor',
  );
  for (let i = 0; i < 100; i++) {
    const [a] = await ctx.dataSource.query(`SELECT status::text AS status FROM atas_registro_preco WHERE id = $1`, [ataId]);
    if (a.status === 'VIGENTE') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('[arp] a ata não ficou VIGENTE depois das assinaturas');
}
