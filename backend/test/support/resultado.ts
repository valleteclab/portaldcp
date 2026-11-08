/**
 * Apoio dos e2e ao RESULTADO ÚNICO (plano E6): adjudicação, homologação e
 * instrumentos pelas rotas reais (/api/resultado).
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/resultado'.
 */
import type { AppE2E } from './app';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export function adjudicarResultado(ctx: AppE2E, licitacaoId: string, token: string, corpo: Record<string, unknown> = {}) {
  return ctx.http().post(`/api/resultado/licitacao/${licitacaoId}/adjudicar`).set(bearer(token)).send(corpo);
}

export function homologarResultado(ctx: AppE2E, licitacaoId: string, token: string) {
  return ctx.http().post(`/api/resultado/licitacao/${licitacaoId}/homologar`).set(bearer(token)).send({});
}

export function gerarInstrumentos(ctx: AppE2E, licitacaoId: string, token: string) {
  return ctx.http().post(`/api/resultado/licitacao/${licitacaoId}/instrumentos`).set(bearer(token)).send({});
}

export async function painelResultado(ctx: AppE2E, licitacaoId: string, token: string): Promise<any> {
  const r = await ctx.http().get(`/api/resultado/licitacao/${licitacaoId}`).set(bearer(token));
  if (r.status !== 200) throw new Error(`[resultado] painel: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Vencedor e valor total por unidade (ordem do painel). */
export async function vencedoresPorUnidade(
  ctx: AppE2E,
  licitacaoId: string,
  token: string,
): Promise<Array<{ unidadeId: string; numero: number; fornecedorId: string | null; valorTotal: number; situacao: string }>> {
  const p = await painelResultado(ctx, licitacaoId, token);
  return p.unidades.map((u: any) => ({
    unidadeId: u.unidadeId,
    numero: u.numero,
    fornecedorId: u.vencedor?.fornecedorId ?? null,
    valorTotal: Number(u.valorTotal),
    situacao: u.situacao,
  }));
}

/**
 * Dispensa eletrônica: registra a habilitação de todos os vencedores (art. 72, V;
 * IN 67 art. 17) — exigida para homologar desde 08/11/2026.
 */
export async function habilitarVencedoresDispensa(ctx: AppE2E, licitacaoId: string, token: string): Promise<void> {
  const p = await ctx.http().get(`/api/licitacoes/${licitacaoId}/dispensa/pos-julgamento`).set(bearer(token));
  if (p.status === 400) return; // não é dispensa eletrônica
  if (p.status !== 200) throw new Error(`[resultado] pós-julgamento: HTTP ${p.status} ${JSON.stringify(p.body)}`);
  for (const v of p.body.vencedores ?? []) {
    if (v.habilitacao?.resultado === 'HABILITADO') continue;
    const r = await ctx
      .http()
      .post(`/api/licitacoes/${licitacaoId}/dispensa/habilitacao`)
      .set(bearer(token))
      .send({ fornecedor_id: v.fornecedor_id, resultado: 'HABILITADO', conferidos: p.body.documentos.slice(0, 2) });
    if (r.status >= 300) throw new Error(`[resultado] habilitação do vencedor: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  }
}
