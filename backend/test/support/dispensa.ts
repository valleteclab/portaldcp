/**
 * Helpers específicos da DISPENSA ELETRÔNICA (art. 75 §3º; IN SEGES 67/2021).
 *
 * Tudo pela API pública, reproduzindo o que as telas fazem:
 *  - cockpit do órgão  (frontend/src/app/orgao/processos/[id]/page.tsx)
 *  - sala de lances do fornecedor (frontend/src/app/fornecedor/licitacoes/[id]/lances/page.tsx)
 *
 * Única exceção: `moverFimDaJanela` escreve a data de fim da janela de lances
 * direto no banco, para simular a passagem do relógio (ver comentário lá).
 *
 * Não é exportado pelo index.ts de propósito (arquivo novo, específico da
 * dispensa): importe de './support/dispensa'.
 */
import { AppE2E, processarFilaPncpAtual } from './app';
import { calendarioDoOrgao, fimDoPrazoEmDiasUteis, inicioDoDia } from '../../src/common/prazos/dias-uteis';
import {
  FornecedorFixture,
  LicitacaoFixture,
  OrgaoFixture,
  abrirSessaoAgora,
  confirmarDivulgacao,
  criarLicitacao,
  gerarAvisoDispensa,
  enviarProposta,
  ItemEntrada,
} from './fixtures';
import { RequisicaoCapturada } from './pncp-mock';
import { ModalidadeLicitacao } from '../../src/licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from '../../src/fase-interna/entities/documento-fase-interna.entity';

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function exigirStatus(resp: { status: number; body: any }, esperado: number | number[], acao: string) {
  const lista = Array.isArray(esperado) ? esperado : [esperado];
  if (!lista.includes(resp.status)) {
    throw new Error(`[dispensa] ${acao} → HTTP ${resp.status}: ${JSON.stringify(resp.body)}`);
  }
}

// ---------------------------------------------------------------------------
// Relógio / espera
// ---------------------------------------------------------------------------

/**
 * Espera até `condicao()` devolver algo "truthy" (ou estourar o tempo).
 * Usado para os efeitos disparados depois da resposta HTTP (PNCP pela fila — o
 * laço roda o worker, cujo cron fica desligado nos testes).
 */
export async function aguardar<T>(
  condicao: () => T | Promise<T>,
  opts: { timeout?: number; intervalo?: number; descricao?: string } = {},
): Promise<NonNullable<T>> {
  const limite = Date.now() + (opts.timeout ?? 15_000);
  let ultimo: T | undefined;
  while (Date.now() < limite) {
    // E7: o PNCP sai pela FILA — roda o worker (cron desligado nos testes)
    await processarFilaPncpAtual();
    ultimo = await condicao();
    if (ultimo) return ultimo as NonNullable<T>;
    await new Promise((r) => setTimeout(r, opts.intervalo ?? 100));
  }
  throw new Error(`[dispensa] tempo esgotado aguardando: ${opts.descricao ?? 'condição'}`);
}

/** Mesma conta do cockpit (addDiasUteis): N dias úteis (seg–sex) a partir de `base`. */
export function somarDiasUteis(base: Date, dias: number): Date {
  const d = new Date(base);
  let somados = 0;
  while (somados < dias) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) somados++;
  }
  return d;
}

/**
 * Corpo do PUT /publicar-edital como o cockpit envia no "Divulgar aviso":
 * publicação e início do acolhimento = agora; impugnação, fim do acolhimento
 * e abertura = `fim`.
 */
export function corpoDivulgacao(fim: Date, agora = new Date()) {
  return {
    data_publicacao_edital: agora.toISOString(),
    data_limite_impugnacao: fim.toISOString(),
    data_inicio_acolhimento: agora.toISOString(),
    data_fim_acolhimento: fim.toISOString(),
    data_abertura_sessao: fim.toISOString(),
    // LC 123 art. 49 (E3): pregão/concorrência com itens até R$ 80.000 sem exclusividade ME/EPP
    justificativa_nao_exclusividade_mpe: 'Art. 49, II: não há 3 fornecedores ME/EPP competitivos na região (teste E2E).',
  };
}

/**
 * Prazo CURTO para o teste de recusa: meio-dia (Brasília) do 2º dia útil depois
 * da divulgação, pela mesma conta do backend (art. 183, calendário com
 * feriados). Fica abaixo do mínimo de 3 dias úteis em qualquer horário e fuso
 * de execução — contar dias pelo fuso do processo de teste errava perto da
 * meia-noite e caía no 3º dia útil.
 */
export function doisDiasUteisAoMeioDia(base: Date = new Date()): Date {
  const venc = fimDoPrazoEmDiasUteis(base, 2, calendarioDoOrgao(null));
  return new Date(inicioDoDia(venc).getTime() + 12 * 3_600_000);
}

/** Prazo sugerido pelo cockpit: mínimo legal (3 dias úteis) + 1 h de folga. */
export function fimPropostasSugerido(): Date {
  // Mesma conta do backend (E7a): 3º dia útil depois da divulgação no
  // calendário (feriados nacionais), meio-dia de Brasília — art. 183 inclui o
  // dia do vencimento, então o recebimento pode terminar nesse dia.
  const venc = fimDoPrazoEmDiasUteis(new Date(), 3, calendarioDoOrgao(null));
  return new Date(inicioDoDia(venc).getTime() + 12 * 3_600_000);
}

/**
 * SIMULAÇÃO DE RELÓGIO — única escrita direta no banco destes testes.
 *
 * Não existe rota para encerrar/antecipar a janela de lances da dispensa (ela
 * termina só pelo relógio, em no mínimo 5 min — `abrirLancesDispensa` limita a
 * duração a [5, 1440] min). Para exercitar "lance nos últimos N minutos
 * prorroga" e "julgar após o encerramento" sem esperar minutos reais, movemos
 * APENAS a coluna `dispensa_lances_fim` — é exatamente o que a passagem do
 * tempo faria. Nenhuma outra coluna é tocada.
 */
export async function moverFimDaJanela(ctx: AppE2E, licitacaoId: string, fim: Date): Promise<void> {
  await ctx.dataSource.query(`UPDATE licitacoes SET dispensa_lances_fim = $1 WHERE id = $2`, [fim, licitacaoId]);
}

// ---------------------------------------------------------------------------
// Órgão / instrução / divulgação
// ---------------------------------------------------------------------------

/** Vincula o órgão à credencial PNCP da plataforma (PUT /api/orgaos/:id/pncp). */
export async function vincularOrgaoPncp(ctx: AppE2E, orgao: OrgaoFixture, codigoUnidade = '1'): Promise<void> {
  const r = await ctx
    .http()
    .put(`/api/orgaos/${orgao.id}/pncp`)
    .set(bearer(ctx.tokenAdmin()))
    .send({ pncp_vinculado: true, pncp_codigo_unidade: codigoUnidade });
  exigirStatus(r, 200, 'vincular órgão ao PNCP');
}

export const DOCUMENTOS_ART_72: Array<[TipoDocumentoFaseInterna, string]> = [
  [TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, 'Formalização da demanda (DFD)'],
  [TipoDocumentoFaseInterna.PESQUISA_PRECOS, 'Estimativa de despesa'],
  [TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA, 'Autorização da autoridade competente'],
];

/** Cria um documento da instrução (POST /api/fase-interna/:id/documento). */
export async function criarDocumentoInstrucao(
  ctx: AppE2E,
  lic: LicitacaoFixture,
  tipo: TipoDocumentoFaseInterna,
  titulo: string,
): Promise<void> {
  const r = await ctx
    .http()
    .post(`/api/fase-interna/${lic.id}/documento`)
    .set(bearer(lic.orgao.token))
    .send({ tipo, titulo, descricao: `${titulo} — documento de teste E2E` });
  exigirStatus(r, 201, `criar documento ${tipo}`);
}

/**
 * Cria a dispensa, faz a instrução do art. 72, conclui a fase interna
 * (PUT /fase-interna/:id/avancar) e divulga o aviso — o caminho do cockpit.
 */
export async function criarDispensaPublicada(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  opts: { itens?: ItemEntrada[]; extras?: Record<string, any>; confirmar?: boolean } = {},
): Promise<LicitacaoFixture> {
  const lic = await criarLicitacao(ctx, orgao, ModalidadeLicitacao.DISPENSA_ELETRONICA, opts);
  for (const [tipo, titulo] of DOCUMENTOS_ART_72) {
    await criarDocumentoInstrucao(ctx, lic, tipo, titulo);
  }
  const av = await ctx.http().put(`/api/fase-interna/${lic.id}/avancar`).set(bearer(orgao.token));
  exigirStatus(av, 200, 'concluir instrução (fase interna)');
  // IN SEGES 67/2021: o aviso de contratação direta é gerado e guardado antes de divulgar
  await gerarAvisoDispensa(ctx, lic);
  const pub = await ctx
    .http()
    .put(`/api/licitacoes/${lic.id}/publicar-edital`)
    .set(bearer(orgao.token))
    .send(corpoDivulgacao(fimPropostasSugerido()));
  exigirStatus(pub, 200, 'divulgar aviso da dispensa');
  // Divulgação oficial = PNCP: a fila (mock) confirma; sem PNCP, diário oficial (art. 176)
  if (opts.confirmar !== false) await confirmarDivulgacao(ctx, lic);
  return lic;
}

/**
 * Dispensa pronta para a sala: divulgada, com as propostas enviadas e o
 * acolhimento já encerrado (abrirSessaoAgora).
 */
export async function criarDispensaComPropostas(
  ctx: AppE2E,
  orgao: OrgaoFixture,
  propostas: Array<{ fornecedor: FornecedorFixture; valores: number[] }>,
  opts: { encerrarAcolhimento?: boolean } = {},
): Promise<LicitacaoFixture> {
  const lic = await criarDispensaPublicada(ctx, orgao);
  for (const p of propostas) {
    await enviarProposta(ctx, p.fornecedor, lic, p.valores);
  }
  if (opts.encerrarAcolhimento !== false) await abrirSessaoAgora(ctx, lic);
  return lic;
}

// ---------------------------------------------------------------------------
// Sala de lances
// ---------------------------------------------------------------------------

/** POST /dispensa/abrir-lances (cockpit: botão "Abrir fase de lances"). */
export function abrirJanelaLances(
  ctx: AppE2E,
  lic: LicitacaoFixture,
  corpo: { duracao_minutos?: number; prorrogacao_minutos?: number },
  token = lic.orgao.token,
) {
  return ctx.http().post(`/api/licitacoes/${lic.id}/dispensa/abrir-lances`).set(bearer(token)).send(corpo);
}

/**
 * POST /dispensa/lances como a sala do fornecedor faz: só o token do
 * fornecedor (a identidade vem dele — E1a). `comoFornecedorId` põe no corpo o
 * `fornecedor_id` legado, para testar a tentativa de agir por OUTRO fornecedor.
 */
export function darLance(
  ctx: AppE2E,
  fornecedor: FornecedorFixture,
  lic: LicitacaoFixture,
  itemId: string,
  valorUnitario: number,
  comoFornecedorId?: string,
) {
  return ctx
    .http()
    .post(`/api/licitacoes/${lic.id}/dispensa/lances`)
    .set(bearer(fornecedor.token))
    .send({
      item_licitacao_id: itemId,
      valor_unitario: valorUnitario,
      ...(comoFornecedorId ? { fornecedor_id: comoFornecedorId } : {}),
    });
}

/**
 * GET do painel anônimo (sem token, como qualquer visitante). O `meu_valor`
 * só vem para o fornecedor LOGADO (`.set(Authorization)`); `?fornecedorId=`
 * é legado e nunca revela o valor de outro.
 */
export function painelPublico(ctx: AppE2E, lic: LicitacaoFixture, fornecedorId?: string) {
  const q = fornecedorId ? `?fornecedorId=${fornecedorId}` : '';
  return ctx.http().get(`/api/licitacoes/${lic.id}/dispensa/lances/painel${q}`);
}

// ---------------------------------------------------------------------------
// PNCP (leitura das capturas)
// ---------------------------------------------------------------------------

/** Header da requisição capturada, sem depender de maiúsculas/minúsculas. */
export function headerCapturado(req: RequisicaoCapturada, nome: string): string | undefined {
  const chave = Object.keys(req.headers).find((k) => k.toLowerCase() === nome.toLowerCase());
  const v = chave ? req.headers[chave] : undefined;
  return Array.isArray(v) ? v.join(', ') : v;
}

/** Corpo capturado como texto (o nock entrega multipart binário em hex). */
export function corpoComoTexto(corpo: any): string {
  if (Buffer.isBuffer(corpo)) return corpo.toString('utf8');
  if (typeof corpo !== 'string') return JSON.stringify(corpo);
  if (corpo.length % 2 === 0 && /^[0-9a-f]+$/i.test(corpo)) {
    return Buffer.from(corpo, 'hex').toString('utf8');
  }
  return corpo;
}

/** Conteúdo (texto) da parte `nome` de um corpo multipart/form-data capturado. */
export function parteMultipart(corpo: any, nome: string): string | null {
  const texto = corpoComoTexto(corpo);
  const re = new RegExp(`name="${nome}"[^\\r\\n]*\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n([\\s\\S]*?)\\r\\n--`);
  const m = texto.match(re);
  return m ? m[1] : null;
}

/** JSON da parte `nome` (ex.: 'compra', 'contrato') de um multipart capturado. */
export function jsonDaParte(corpo: any, nome: string): any {
  const parte = parteMultipart(corpo, nome);
  if (parte === null) throw new Error(`[dispensa] parte multipart "${nome}" não encontrada`);
  return JSON.parse(parte);
}

/**
 * IN SEGES 67/2021: depois do fim do prazo de propostas vem a etapa de lances
 * (art. 11 — 6 a 10 h) e só depois do encerramento o julgamento (art. 15).
 * Abre a janela pela rota do órgão e SIMULA o relógio até o fim dela.
 */
export async function encerrarEtapaDeLances(ctx: AppE2E, lic: LicitacaoFixture): Promise<void> {
  const r = await abrirJanelaLances(ctx, lic, { duracao_minutos: 360 });
  exigirStatus(r, 201, 'abrir a etapa de lances');
  await moverFimDaJanela(ctx, lic.id, new Date(Date.now() - 1_000));
}
