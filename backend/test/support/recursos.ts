/**
 * Apoio dos e2e aos RECURSOS (plano E5): janela de intenção, intenção pelo
 * licitante, razões/contrarrazões com arquivo e o "relógio" dos prazos
 * (deslocado no banco — nunca esperando minutos/dias de verdade).
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/recursos'.
 */
import type { AppE2E } from './app';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const PDF_RECURSO = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const exigir = (r: { status: number; body: any }, esperado: number, oque: string) => {
  if (r.status !== esperado) throw new Error(`[recursos] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
};

export function painelRecursos(ctx: AppE2E, sessaoId: string, token?: string | null) {
  const req = ctx.http().get(`/api/recursos/sessao/${sessaoId}`);
  if (token) req.set(bearer(token));
  return req;
}

export function abrirJanelaIntencao(ctx: AppE2E, sessaoId: string, token: string, minutos?: number) {
  return ctx
    .http()
    .post(`/api/recursos/sessao/${sessaoId}/janela`)
    .set(bearer(token))
    .send(minutos != null ? { minutos } : {});
}

export function manifestarIntencao(
  ctx: AppE2E,
  sessaoId: string,
  token: string,
  corpo: { motivacao: string; atoRecorrido?: string; fornecedorAlvoId?: string; unidadeId?: string; fornecedorId?: string },
) {
  return ctx.http().post(`/api/recursos/sessao/${sessaoId}/intencao`).set(bearer(token)).send(corpo);
}

/** Razões/contrarrazões (multipart: texto + arquivo PDF opcional). */
export function enviarPeca(
  ctx: AppE2E,
  recursoId: string,
  peca: 'razoes' | 'contrarrazoes',
  token: string,
  texto: string,
  arquivo: Buffer | null = PDF_RECURSO,
) {
  const req = ctx.http().post(`/api/recursos/${recursoId}/${peca}`).set(bearer(token)).field('texto', texto);
  return arquivo ? req.attach('arquivo', arquivo, { filename: `${peca}.pdf`, contentType: 'application/pdf' }) : req;
}

/** Leva a janela de intenção aberta da sessão ao passado (encerrada) — o "relógio" da janela. */
export async function encerrarJanelaNoRelogio(ctx: AppE2E, sessaoId: string): Promise<void> {
  await ctx.dataSource.query(
    `UPDATE janelas_intencao_recurso
        SET aberta_em = aberta_em - interval '1 day', fecha_em = fecha_em - interval '1 day'
      WHERE sessao_id = $1 AND superada_em IS NULL`,
    [sessaoId],
  );
}

/** Vence um prazo do recurso (desloca 30 dias para trás). */
export async function vencerPrazoDoRecurso(
  ctx: AppE2E,
  recursoId: string,
  campo: 'prazo_razoes' | 'prazo_contrarrazoes' | 'prazo_reconsideracao' | 'prazo_decisao_autoridade',
): Promise<void> {
  await ctx.dataSource.query(`UPDATE recursos_administrativos SET ${campo} = ${campo} - interval '30 days' WHERE id::text = $1`, [recursoId]);
}

/**
 * Rito sem recurso: o agente abre a janela de intenção e ela se encerra sem
 * manifestação (preclusão) — a adjudicação fica liberada.
 */
export async function precluirIntencaoDeRecurso(ctx: AppE2E, sessaoId: string, orgaoToken: string): Promise<void> {
  exigir(await abrirJanelaIntencao(ctx, sessaoId, orgaoToken), 201, 'abrir janela de intenção de recurso');
  await encerrarJanelaNoRelogio(ctx, sessaoId);
}
