/**
 * Apoio dos e2e ao JULGAMENTO (plano E3): aceitação da proposta adequada ao
 * último lance (IN SEGES 73/2022 art. 29) pelas rotas reais.
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/julgamento'.
 */
import type { AppE2E } from './app';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** PDF mínimo para o anexo da proposta adequada. */
export const PDF_PROPOSTA = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/** Valores unitários = teto de cada item (limites da convocação), sem ultrapassá-lo. */
export function valoresNoLimite(limites: { itens: Array<{ itemId: string; quantidade: number; valorMaximoTotal: number | null }> }) {
  return limites.itens.map((i) => ({
    itemId: i.itemId,
    valorUnitario: Math.floor(((i.valorMaximoTotal ?? 0) / (i.quantidade || 1)) * 10_000) / 10_000,
  }));
}

export function convocarAceitacao(ctx: AppE2E, sessaoId: string, unidadeId: string, token: string, prazoHoras?: number) {
  return ctx
    .http()
    .post(`/api/julgamento/sessao/${sessaoId}/aceitacao/unidade/${unidadeId}/convocar`)
    .set(bearer(token))
    .send(prazoHoras != null ? { prazoHoras } : {});
}

export function enviarPropostaAdequada(
  ctx: AppE2E,
  sessaoId: string,
  aceitacaoId: string,
  token: string,
  valores: Array<{ itemId: string; valorUnitario: number }>,
  arquivo: Buffer | null = PDF_PROPOSTA,
) {
  const req = ctx
    .http()
    .post(`/api/julgamento/sessao/${sessaoId}/aceitacao/${aceitacaoId}/proposta`)
    .set(bearer(token))
    .field('valores', JSON.stringify(valores));
  return arquivo ? req.attach('arquivo', arquivo, { filename: 'proposta.pdf', contentType: 'application/pdf' }) : req;
}

export function decidirAceitacao(
  ctx: AppE2E,
  sessaoId: string,
  aceitacaoId: string,
  token: string,
  decisao: 'aceitar' | 'recusar',
  corpo: Record<string, unknown> = {},
) {
  return ctx.http().post(`/api/julgamento/sessao/${sessaoId}/aceitacao/${aceitacaoId}/${decisao}`).set(bearer(token)).send(corpo);
}

export async function painelAceitacao(ctx: AppE2E, sessaoId: string, token: string): Promise<any> {
  const r = await ctx.http().get(`/api/julgamento/sessao/${sessaoId}/aceitacao`).set(bearer(token));
  if (r.status !== 200) throw new Error(`[julgamento] painel da aceitação: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/**
 * Rito completo da aceitação numa unidade: convoca o licitante na vez, ele
 * envia a proposta no limite do último lance e o agente aceita. Devolve a
 * convocação aceita.
 */
export async function aceitarPropostaDaUnidade(
  ctx: AppE2E,
  sessaoId: string,
  unidadeId: string,
  orgaoToken: string,
  fornecedorToken: string,
): Promise<any> {
  const c = await convocarAceitacao(ctx, sessaoId, unidadeId, orgaoToken);
  if (c.status !== 201) throw new Error(`[julgamento] convocar: HTTP ${c.status} ${JSON.stringify(c.body)}`);
  const e = await enviarPropostaAdequada(ctx, sessaoId, c.body.id, fornecedorToken, valoresNoLimite(c.body.limites));
  if (e.status !== 201) throw new Error(`[julgamento] enviar proposta: HTTP ${e.status} ${JSON.stringify(e.body)}`);
  const a = await decidirAceitacao(ctx, sessaoId, c.body.id, orgaoToken, 'aceitar');
  if (a.status !== 201) throw new Error(`[julgamento] aceitar: HTTP ${a.status} ${JSON.stringify(a.body)}`);
  return a.body;
}
