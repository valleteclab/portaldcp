/**
 * Apoio dos e2e à HABILITAÇÃO (plano E4): exigências do edital, convocação,
 * envio de documentos, análise, diligência e habilitar/inabilitar pelas rotas
 * reais (/api/habilitacao).
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/habilitacao'.
 */
import type { AppE2E } from './app';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** PDF mínimo para os documentos de habilitação. */
export const PDF_HABILITACAO = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

export async function painelHabilitacao(ctx: AppE2E, licitacaoId: string, token: string): Promise<any> {
  const r = await ctx.http().get(`/api/habilitacao/licitacao/${licitacaoId}`).set(bearer(token));
  if (r.status !== 200) throw new Error(`[habilitacao] painel: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export function convocarHabilitacao(ctx: AppE2E, licitacaoId: string, fornecedorId: string, token: string, prazoHoras?: number) {
  return ctx
    .http()
    .post(`/api/habilitacao/licitacao/${licitacaoId}/convocar`)
    .set(bearer(token))
    .send({ fornecedorId, ...(prazoHoras != null ? { prazoHoras } : {}) });
}

export function enviarDocumentoHabilitacao(
  ctx: AppE2E,
  licitacaoId: string,
  exigenciaId: string,
  token: string | null,
  opts: { arquivo?: Buffer | null; nome?: string; validade?: string } = {},
) {
  const req = ctx.http().post(`/api/habilitacao/licitacao/${licitacaoId}/exigencias/${exigenciaId}/documentos`);
  if (token) req.set(bearer(token));
  if (opts.validade) req.field('validade', opts.validade);
  const arquivo = opts.arquivo === undefined ? PDF_HABILITACAO : opts.arquivo;
  return arquivo ? req.attach('arquivo', arquivo, { filename: opts.nome ?? 'documento.pdf', contentType: 'application/pdf' }) : req.field('x', '1');
}

export function entregarHabilitacao(ctx: AppE2E, licitacaoId: string, token: string) {
  return ctx.http().post(`/api/habilitacao/licitacao/${licitacaoId}/entregar`).set(bearer(token)).send({});
}

export function analisarDocumentoHabilitacao(ctx: AppE2E, documentoId: string, token: string, resultado: string, motivo?: string) {
  return ctx
    .http()
    .post(`/api/habilitacao/documentos/${documentoId}/analisar`)
    .set(bearer(token))
    .send({ resultado, ...(motivo ? { motivo } : {}) });
}

export function decidirHabilitacao(ctx: AppE2E, habilitacaoId: string, token: string, ato: 'habilitar' | 'inabilitar', corpo: Record<string, unknown> = {}) {
  return ctx.http().post(`/api/habilitacao/${habilitacaoId}/${ato}`).set(bearer(token)).send(corpo);
}

const exigir = (r: { status: number; body: any }, esperado: number, oque: string) => {
  if (r.status !== esperado) throw new Error(`[habilitacao] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
};

/** O licitante anexa um PDF para cada exigência obrigatória ainda não coberta (validade futura). */
export async function enviarDocumentosFaltantes(ctx: AppE2E, licitacaoId: string, fornecedorToken: string): Promise<any> {
  const p = await painelHabilitacao(ctx, licitacaoId, fornecedorToken);
  const exigencias = p.minha ? p.minha.exigencias : p.exigencias.map((e: any) => ({ ...e, cobertaPeloCadastro: !!p.coberturaCadastro?.find((c: any) => c.exigenciaId === e.id)?.coberta, documentos: [] }));
  const validade = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  for (const e of exigencias) {
    if (!e.obrigatorio || e.cobertaPeloCadastro || e.documentos.length) continue;
    const r = await enviarDocumentoHabilitacao(ctx, licitacaoId, e.id, fornecedorToken, { validade });
    exigir(r, 201, `enviar documento "${e.descricao}"`);
  }
  return painelHabilitacao(ctx, licitacaoId, fornecedorToken);
}

/** O agente marca ATENDE em todo documento ainda NÃO analisado (PENDENTE) da habilitação. */
export async function atenderTodos(ctx: AppE2E, licitacaoId: string, habilitacaoId: string, orgaoToken: string): Promise<void> {
  const painel = await painelHabilitacao(ctx, licitacaoId, orgaoToken);
  const h = painel.habilitacoes.find((x: any) => x.id === habilitacaoId);
  if (!h) throw new Error(`[habilitacao] habilitação ${habilitacaoId} não está no painel`);
  for (const e of h.exigencias) {
    for (const d of e.documentos) {
      if (d.analise !== 'PENDENTE') continue;
      exigir(await analisarDocumentoHabilitacao(ctx, d.id, orgaoToken, 'ATENDE'), 201, `analisar "${e.descricao}"`);
    }
  }
}

/**
 * Rito completo da habilitação de quem tem proposta aceita (fluxo normal):
 * convoca, o licitante envia o que o cadastro não cobre e entrega, o agente
 * aceita os documentos e HABILITA. Devolve a habilitação.
 */
export async function habilitarLicitante(
  ctx: AppE2E,
  licitacaoId: string,
  fornecedor: { id: string; token: string },
  orgaoToken: string,
): Promise<any> {
  const c = await convocarHabilitacao(ctx, licitacaoId, fornecedor.id, orgaoToken);
  exigir(c, 201, 'convocar para a habilitação');
  await enviarDocumentosFaltantes(ctx, licitacaoId, fornecedor.token);
  exigir(await entregarHabilitacao(ctx, licitacaoId, fornecedor.token), 201, 'entregar documentação');
  await atenderTodos(ctx, licitacaoId, c.body.id, orgaoToken);
  const h = await decidirHabilitacao(ctx, c.body.id, orgaoToken, 'habilitar');
  exigir(h, 201, 'habilitar');
  return h.body;
}

/** Convoca, o licitante entrega sem nada e o agente INABILITA com o motivo. Devolve a habilitação. */
export async function inabilitarLicitante(
  ctx: AppE2E,
  licitacaoId: string,
  fornecedor: { id: string; token: string },
  orgaoToken: string,
  motivo: string,
): Promise<any> {
  const c = await convocarHabilitacao(ctx, licitacaoId, fornecedor.id, orgaoToken);
  exigir(c, 201, 'convocar para a habilitação');
  exigir(await entregarHabilitacao(ctx, licitacaoId, fornecedor.token), 201, 'entregar documentação');
  const r = await decidirHabilitacao(ctx, c.body.id, orgaoToken, 'inabilitar', { motivo });
  exigir(r, 201, 'inabilitar');
  return r.body;
}

/** Documento no registro cadastral do fornecedor (rotas do cadastro, admin), aprovado ou não. */
export async function documentoNoCadastro(
  ctx: AppE2E,
  fornecedorId: string,
  doc: { tipo: string; nivel?: string; data_validade?: string | null; aprovar?: boolean },
): Promise<string> {
  const r = await ctx
    .http()
    .post(`/api/fornecedores/${fornecedorId}/documentos`)
    .set(bearer(ctx.tokenAdmin()))
    .send({
      tipo: doc.tipo,
      nivel: doc.nivel ?? 'NIVEL_III',
      data_validade: doc.data_validade ?? null,
      nome_arquivo: `${doc.tipo.toLowerCase()}.pdf`,
      numero_documento: `E2E-${doc.tipo}`,
    });
  exigir(r, 201, `documento ${doc.tipo} no cadastro`);
  if (doc.aprovar !== false) {
    const a = await ctx
      .http()
      .put(`/api/fornecedores/documentos/${r.body.id}/analisar`)
      .set(bearer(ctx.tokenAdmin()))
      .send({ aprovado: true, observacao: 'ok', analisadoPor: 'gestor do cadastro (e2e)' });
    exigir(a, 200, `aprovar documento ${doc.tipo}`);
  }
  return r.body.id;
}
