/**
 * Apoio dos e2e ao JULGAMENTO TÉCNICO (Lei 14.133/2021 arts. 35–37) e ao
 * DESEMPATE (art. 60; IN 73 art. 28), pelas rotas reais.
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/julgamento-tecnico'.
 */
import type { AppE2E } from './app';
import { OrgaoFixture, UsuarioOrgaoFixture, criarUsuarioOrgao } from './fixtures';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function exigir(resp: { status: number; body: any }, esperado: number, acao: string) {
  if (resp.status !== esperado) throw new Error(`[julgamento-tecnico] ${acao} → HTTP ${resp.status}: ${JSON.stringify(resp.body)}`);
}

export const PDF_TECNICO = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n% proposta tecnica\ntrailer<<>>\n%%EOF\n');

export function configurarTecnica(
  ctx: AppE2E,
  token: string,
  licitacaoId: string,
  corpo: { pesoTecnica?: number | null; notaMinima?: number | null; quesitos: Array<{ descricao: string; peso: number; notaMaxima: number }> },
) {
  return ctx.http().put(`/api/julgamento/licitacao/${licitacaoId}/tecnica/configuracao`).set(bearer(token)).send(corpo);
}

export function designarBanca(ctx: AppE2E, token: string, licitacaoId: string, usuarioIds: string[]) {
  return ctx.http().put(`/api/julgamento/licitacao/${licitacaoId}/tecnica/comissao`).set(bearer(token)).send({ usuarioIds });
}

export function atribuirNotas(
  ctx: AppE2E,
  token: string,
  licitacaoId: string,
  notas: Array<{ quesitoId: string; fornecedorId: string; nota: number; justificativa?: string }>,
) {
  return ctx.http().put(`/api/julgamento/licitacao/${licitacaoId}/tecnica/notas`).set(bearer(token)).send({ notas });
}

export function publicarTecnica(ctx: AppE2E, token: string, licitacaoId: string) {
  return ctx.http().post(`/api/julgamento/licitacao/${licitacaoId}/tecnica/publicar`).set(bearer(token));
}

export function enviarDocumentoTecnico(ctx: AppE2E, token: string, licitacaoId: string, arquivo: Buffer = PDF_TECNICO) {
  return ctx
    .http()
    .post(`/api/julgamento/licitacao/${licitacaoId}/tecnica/documentos`)
    .set(bearer(token))
    .field('descricao', 'Proposta técnica')
    .attach('arquivo', arquivo, { filename: 'proposta-tecnica.pdf', contentType: 'application/pdf' });
}

/**
 * Julgamento técnico mínimo e completo (1 quesito 0–100, banca de 3 com a
 * mesma nota): NT = a nota dada a cada fornecedor. Para cenários cujo foco não
 * é a técnica (ex.: modo FECHADO com melhor técnica). Configure ANTES da 1ª nota.
 */
export async function julgamentoTecnicoSimples(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  licitacaoId: string,
  notaPorFornecedor: Record<string, number>,
  opts: { pesoTecnica?: number | null } = {},
): Promise<{ banca: UsuarioOrgaoFixture[] }> {
  const cfg = await configurarTecnica(ctx, orgao.token, licitacaoId, {
    pesoTecnica: opts.pesoTecnica ?? null,
    quesitos: [{ descricao: 'Qualificação técnica', peso: 1, notaMaxima: 100 }],
  });
  exigir(cfg, 200, 'configurar julgamento técnico');
  const quesitoId: string = cfg.body.quesitos[0].id;
  const banca = [await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao), await criarUsuarioOrgao(ctx, orgao)];
  exigir(await designarBanca(ctx, orgao.token, licitacaoId, banca.map((b) => b.id)), 200, 'designar banca');
  for (const membro of banca) {
    const r = await atribuirNotas(
      ctx,
      membro.token,
      licitacaoId,
      Object.entries(notaPorFornecedor).map(([fornecedorId, nota]) => ({ quesitoId, fornecedorId, nota })),
    );
    exigir(r, 200, 'atribuir notas');
  }
  exigir(await publicarTecnica(ctx, orgao.token, licitacaoId), 201, 'publicar notas técnicas');
  return { banca };
}

// --- Desempate --------------------------------------------------------------

export function painelDesempate(ctx: AppE2E, sessaoId: string, token: string) {
  return ctx.http().get(`/api/julgamento/sessao/${sessaoId}/desempate`).set(bearer(token));
}

export function iniciarDesempate(ctx: AppE2E, sessaoId: string, unidadeId: string, token: string, prazoMinutos?: number) {
  return ctx
    .http()
    .post(`/api/julgamento/sessao/${sessaoId}/desempate/unidade/${unidadeId}/iniciar`)
    .set(bearer(token))
    .send(prazoMinutos != null ? { prazoMinutos } : {});
}

export function ofertaDisputaFinal(ctx: AppE2E, sessaoId: string, desempateId: string, token: string, valor: number) {
  return ctx.http().post(`/api/julgamento/sessao/${sessaoId}/desempate/${desempateId}/oferta`).set(bearer(token)).send({ valor });
}

export function sortearDesempate(ctx: AppE2E, sessaoId: string, desempateId: string, token: string) {
  return ctx.http().post(`/api/julgamento/sessao/${sessaoId}/desempate/${desempateId}/sortear`).set(bearer(token));
}

export function conferirSorteioDesempate(ctx: AppE2E, sessaoId: string, desempateId: string, token: string) {
  return ctx.http().get(`/api/julgamento/sessao/${sessaoId}/desempate/${desempateId}/conferir`).set(bearer(token));
}
