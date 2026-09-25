/**
 * Apoio dos e2e das MODALIDADES ESPECIAIS (plano E7c — leilão, concurso,
 * diálogo competitivo), pelas rotas reais.
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/modalidades-especiais'.
 */
import type { AppE2E } from './app';
import { FornecedorFixture, LicitacaoFixture, gerarCpf, unico } from './fixtures';
import { UserType } from '../../src/auth/auth.service';
import { PorteEmpresa } from '../../src/fornecedores/entities/enums';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export function exigir(r: { status: number; body: any }, esperado: number, oque: string) {
  if (r.status !== esperado) throw new Error(`[e7c] ${oque}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
}

/** PESSOA FÍSICA (CPF) — arrematante no leilão / autor no concurso (cadastro do fornecedor com CPF). */
export async function criarPessoaFisica(ctx: AppE2E, nome?: string): Promise<FornecedorFixture> {
  const u = unico();
  const cpf = gerarCpf();
  const razao_social = nome ?? `Pessoa Física E2E ${u}`;
  const email = `pf.${u}@e2e.local`;
  const resp = await ctx
    .http()
    .post('/api/fornecedores')
    .set(bearer(ctx.tokenAdmin()))
    .send({
      tipo_pessoa: 'FISICA',
      cpf_cnpj: cpf,
      razao_social,
      logradouro: 'Rua de Teste',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Cidade Teste',
      uf: 'BA',
      cep: '40000-000',
      telefone: '71988880000',
      email,
      representante_nome: razao_social,
      representante_cpf: cpf,
    });
  exigir(resp, 201, 'criar pessoa física');
  exigir(await ctx.http().put(`/api/fornecedores/${resp.body.id}/aprovar`).set(bearer(ctx.tokenAdmin())), 200, 'aprovar pessoa física');
  const token = ctx.jwt.sign({ sub: resp.body.id, type: UserType.FORNECEDOR, cnpj: cpf, email });
  return { id: resp.body.id, cnpj: cpf, razao_social, porte: (resp.body.porte ?? PorteEmpresa.MEDIO) as PorteEmpresa, mpe: false, token };
}

/** Abre a sala (sessão + iniciar + iniciar as unidades) — depois do acolhimento e da classificação das propostas. */
export async function abrirSalaEIniciar(ctx: AppE2E, lic: LicitacaoFixture, unidades: string[]): Promise<string> {
  const t = lic.orgao.token;
  const s = await ctx.http().post(`/api/sessao/${lic.id}`).set(bearer(t)).send({ pregoeiroId: lic.orgao.id, pregoeiroNome: 'Leiloeiro E2E' });
  exigir(s, 201, 'criar sessão');
  exigir(
    await ctx
      .http()
      .put(`/api/disputa-v2/sessao/${s.body.id}/configuracoes`)
      .set(bearer(t))
      .send({ tempo_inatividade_minutos: 10, tempo_prorrogacao_minutos: 2, intervalo_minimo_lances_minutos: 0 }),
    200,
    'configurar sessão',
  );
  exigir(await ctx.http().put(`/api/sessao/${s.body.id}/iniciar`).set(bearer(t)), 200, 'iniciar sessão');
  exigir(await ctx.http().post(`/api/disputa-v2/sessao/${s.body.id}/iniciar-itens`).set(bearer(t)).send({ itensIds: unidades }), 201, 'iniciar unidades');
  return s.body.id;
}

export function encerrarUnidade(ctx: AppE2E, sessaoId: string, unidadeId: string, token: string) {
  return ctx.http().post(`/api/disputa-v2/sessao/${sessaoId}/encerrar-item/${unidadeId}`).set(bearer(token));
}

export function lanceRest(ctx: AppE2E, sessaoId: string, token: string, corpo: { itemId?: string; loteId?: string; valor: number }) {
  return ctx.http().post(`/api/disputa-v2/sessao/${sessaoId}/lance`).set(bearer(token)).send(corpo);
}

export async function board(ctx: AppE2E, sessaoId: string, token: string): Promise<any[]> {
  const r = await ctx.http().get(`/api/disputa-v2/sessao/${sessaoId}/itens`).set(bearer(token));
  exigir(r, 200, 'board');
  return [...(r.body.aguardando ?? []), ...(r.body.emDisputa ?? []), ...(r.body.encerrados ?? [])];
}

/** Documento PDF mínimo. */
export const PDF_E7C = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n% e7c\ntrailer<<>>\n%%EOF\n');
/** JPEG mínimo (cabeçalho). */
export const JPG_E7C = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
