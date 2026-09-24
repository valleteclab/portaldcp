/**
 * Helpers do e2e de ISOLAMENTO DE DADOS da licitação
 * (test/isolamento-dados-licitacao.e2e-spec.ts).
 *
 * Testes de regressão de AUTORIZAÇÃO: cada caso afirma que uma requisição não
 * autorizada é recusada (401/403/404) ou que a resposta não carrega dados de
 * outra parte. Tudo passa pela API pública (REST + socket), como o frontend.
 *
 * Não é exportado pelo index.ts de propósito: importe de './support/isolamento'.
 */
import { Socket } from 'socket.io-client';
import { AppE2E } from './app';
import {
  FornecedorFixture,
  ItemEntrada,
  LicitacaoFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  criarLicitacao,
  enviarProposta,
  levarAteFase,
} from './fixtures';
import { FaseLicitacao, ModalidadeLicitacao, ModoDisputa } from '../../src/licitacoes/entities/licitacao.entity';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Status que contam como "recusado por autorização/isolamento". */
export const RECUSADO = [401, 403, 404];

function exigir(resp: { status: number; body: any }, esperado: number | number[], acao: string) {
  const lista = Array.isArray(esperado) ? esperado : [esperado];
  if (!lista.includes(resp.status)) {
    throw new Error(`[isolamento] ${acao} → HTTP ${resp.status}: ${JSON.stringify(resp.body)}`);
  }
}

// ---------------------------------------------------------------------------
// Registro do que foi observado (para distinguir fixture quebrada de brecha real)
// ---------------------------------------------------------------------------

export interface Observacao {
  caso: string;
  observado: string;
}

export const observacoes: Observacao[] = [];

/** Chaves de primeiro nível do corpo (ou tipo, se não for objeto). */
export function chaves(corpo: any): string {
  const lista = (o: object) => {
    const k = Object.keys(o);
    return k.length > 8 ? `${k.slice(0, 8).join(',')},…(+${k.length - 8})` : k.join(',');
  };
  if (corpo === null || corpo === undefined) return String(corpo);
  if (Array.isArray(corpo)) {
    const primeiro = corpo[0];
    return `array(${corpo.length})${primeiro && typeof primeiro === 'object' ? `[${lista(primeiro)}]` : ''}`;
  }
  if (typeof corpo === 'object') return `{${lista(corpo)}}`;
  return typeof corpo;
}

/** Registra o status HTTP observado e as chaves do corpo (e a mensagem de erro, se houver). */
export function registrarHttp(caso: string, resp: { status: number; body: any }): void {
  const msg = resp.body?.message ? ` msg="${String(resp.body.message).slice(0, 90)}"` : '';
  observacoes.push({ caso, observado: `HTTP ${resp.status} ${chaves(resp.body)}${msg}` });
}

export function registrar(caso: string, observado: string): void {
  observacoes.push({ caso, observado });
}

/** Imprime a tabela de observações (stdout: o console.log está silenciado no e2e). */
export function imprimirObservacoes(titulo: string): void {
  const linhas = observacoes.map((o) => `  - ${o.caso}\n      ${o.observado}`);
  process.stdout.write(`\n==== ${titulo} — observado ====\n${linhas.join('\n')}\n\n`);
}

// ---------------------------------------------------------------------------
// Identidade de fornecedor em payloads
// ---------------------------------------------------------------------------

/** Lista o que, da identidade do fornecedor, aparece no payload (id, CNPJ, razão social). */
export function identidadeNoPayload(payload: any, f: FornecedorFixture): string[] {
  const texto = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null);
  const achados: string[] = [];
  if (texto.includes(f.id)) achados.push('id');
  if (texto.includes(f.cnpj)) achados.push('cnpj');
  if (texto.includes(f.razao_social)) achados.push('razao_social');
  return achados;
}

// ---------------------------------------------------------------------------
// Valores de lance
// ---------------------------------------------------------------------------

/**
 * Valores estritamente decrescentes na execução: cada lance novo é menor que
 * todos os anteriores, o que satisfaz ao mesmo tempo as regras da disputa-v2
 * (menor que a própria proposta/último lance, diferente do melhor) e do
 * gateway /sessao (menor que o melhor lance do item).
 */
export class ValoresDecrescentes {
  constructor(private atual: number) {}
  proximo(): number {
    this.atual = Math.round((this.atual - 1.37) * 100) / 100;
    return this.atual;
  }
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

/** Resolve com o payload do evento, ou null se não chegar em `ms`. */
export function recebeEm<T = any>(socket: Socket, evento: string, ms = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(evento, handler);
      resolve(null);
    }, ms);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(evento, handler);
  });
}

// ---------------------------------------------------------------------------
// Cenários de licitação
// ---------------------------------------------------------------------------

export interface ParticipantePregao {
  fornecedor: FornecedorFixture;
  /** Valor unitário por item (ordem de lic.itens). */
  valores: number[];
}

export interface PregaoEmSessao {
  lic: LicitacaoFixture;
  sessaoId: string;
  /** Proposta criada de cada fornecedor (id). */
  propostas: Record<string, string>;
}

/** Pregão eletrônico (modo aberto) em ACOLHIMENTO_PROPOSTAS, com as propostas enviadas. */
export async function prepararPregaoEmAcolhimento(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  participantes: ParticipantePregao[],
  opts: { itens?: ItemEntrada[]; extras?: Record<string, unknown> } = {},
): Promise<{ lic: LicitacaoFixture; propostas: Record<string, string> }> {
  const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.PREGAO_ELETRONICO, {
    modo_disputa: ModoDisputa.ABERTO,
    itens: opts.itens,
    extras: opts.extras,
  });
  await levarAteFase(ctx, lic, FaseLicitacao.ACOLHIMENTO_PROPOSTAS);
  const propostas: Record<string, string> = {};
  for (const p of participantes) {
    const prop = await enviarProposta(ctx, p.fornecedor, lic, p.valores);
    propostas[p.fornecedor.id] = prop.id;
  }
  return { lic, propostas };
}

/**
 * Pregão com sessão criada — mesmo caminho do simulador de disputa:
 * acolhimento → abertura → análise → classificação → POST /sessao/:licitacaoId.
 *  - `iniciarSessao` (padrão true): PUT /sessao/:id/iniciar;
 *  - `iniciarItens` (padrão true): POST /disputa-v2/sessao/:id/iniciar-itens com
 *    todos os itens (o botão "iniciar" do pregoeiro na sala v2/v3).
 */
export async function prepararPregaoEmDisputa(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  participantes: ParticipantePregao[],
  opts: { iniciarSessao?: boolean; iniciarItens?: boolean; itens?: ItemEntrada[]; extras?: Record<string, unknown> } = {},
): Promise<PregaoEmSessao> {
  const { lic, propostas } = await prepararPregaoEmAcolhimento(ctx, orgao, participantes, opts);
  await abrirSessaoAgora(ctx, lic);
  const av = await ctx.http().put(`/api/licitacoes/${lic.id}/avancar-fase`).set(bearer(orgao.token)).send({});
  exigir(av, 200, 'avançar para análise de propostas');

  for (const id of Object.values(propostas)) {
    const r = await ctx.http().put(`/api/propostas/${id}/classificar`).set(bearer(orgao.token));
    exigir(r, 200, 'classificar proposta');
  }

  const s = await ctx
    .http()
    .post(`/api/sessao/${lic.id}`)
    .set(bearer(orgao.token))
    .send({ pregoeiroId: orgao.id, pregoeiroNome: 'Pregoeiro Isolamento' });
  exigir(s, 201, 'criar sessão');
  const sessaoId: string = s.body.id;

  // Configuração da sala pelo pregoeiro (como o simulador). Desde a E2 o padrão do
  // intervalo de tempo entre lances do mesmo fornecedor já é 0 (não é exigência legal).
  const cfg = await ctx
    .http()
    .put(`/api/disputa-v2/sessao/${sessaoId}/configuracoes`)
    .set(bearer(orgao.token))
    .send({ tempo_inatividade_minutos: 10, tempo_prorrogacao_minutos: 2, intervalo_minimo_lances_minutos: 0 });
  exigir(cfg, 200, 'configurar sessão');

  if (opts.iniciarSessao !== false) {
    const ini = await ctx.http().put(`/api/sessao/${sessaoId}/iniciar`).set(bearer(orgao.token));
    exigir(ini, 200, 'iniciar sessão');
    if (opts.iniciarItens !== false) {
      const it = await ctx
        .http()
        .post(`/api/disputa-v2/sessao/${sessaoId}/iniciar-itens`)
        .set(bearer(orgao.token))
        .send({ itensIds: lic.itens.map((i) => i.id) });
      exigir(it, 201, 'iniciar itens da disputa');
      if (it.body.itensIniciados !== lic.itens.length) {
        throw new Error(`[isolamento] iniciar-itens iniciou ${it.body.itensIniciados} de ${lic.itens.length}`);
      }
    }
  }
  return { lic, sessaoId, propostas };
}

/** Lance pela API REST da disputa-v2 (o corpo diz quem é o fornecedor). */
export function lanceV2(
  ctx: AppE2E,
  sessaoId: string,
  corpo: { itemId: string; fornecedorId: string; fornecedorNome: string; valor: number },
  token?: string,
) {
  const req = ctx.http().post(`/api/disputa-v2/sessao/${sessaoId}/lance`);
  if (token) req.set(bearer(token));
  return req.send(corpo);
}
