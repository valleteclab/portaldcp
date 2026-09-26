import { StatusSincronizacao, TipoSincronizacao } from '../entities/pncp-sync.entity';

/**
 * ============================================================================
 * FILA DO PNCP (outbox) — regras puras (plano E7 itens 6 e 7)
 * ============================================================================
 *
 * Toda operação no PNCP é uma linha de `pncp_sync` com a REFERÊNCIA do que
 * enviar (ids), nunca o JSON pronto: o payload é montado na hora do envio, a
 * partir dos dados atuais. Um worker (cron de 1 minuto, com trava consultiva
 * do Postgres para uma instância só) processa a fila em ordem de dependência.
 *
 * Estados: PENDENTE → ENVIANDO → ENVIADO | ERRO_TEMPORARIO (backoff, volta
 * sozinho) | ERRO_DEFINITIVO (regra de negócio do PNCP ou tentativas
 * esgotadas — volta só pelo "reenviar agora"). Dependência não satisfeita
 * (ex.: resultado antes de a compra existir no PNCP) NÃO conta tentativa: a
 * linha espera, com o motivo visível, até PRAZO_DEPENDENCIA_MS.
 */

/** Ordem de dependência: compra → itens → documentos → retificação → situação → resultados → ata → contrato. */
export const ORDEM_OPERACAO: Readonly<Record<string, number>> = {
  [TipoSincronizacao.COMPRA]: 10,
  [TipoSincronizacao.ITEM]: 20,
  [TipoSincronizacao.DOCUMENTO]: 30,
  [TipoSincronizacao.RETIFICACAO_COMPRA]: 40,
  [TipoSincronizacao.SITUACAO_COMPRA]: 50,
  [TipoSincronizacao.RESULTADO]: 60,
  [TipoSincronizacao.ATA]: 70,
  [TipoSincronizacao.CONTRATO]: 80,
  [TipoSincronizacao.RETIFICACAO_CONTRATO]: 90,
};

export const ordemDaOperacao = (tipo: TipoSincronizacao): number => ORDEM_OPERACAO[tipo] ?? 100;

/**
 * Operações que precisam sair na ORDEM EM QUE FORAM PEDIDAS entre si (ex.:
 * suspender e depois retomar). As demais do mesmo tipo são independentes
 * (resultados de itens diferentes, documentos diferentes).
 */
export const OPERACOES_SEQUENCIAIS: ReadonlyArray<TipoSincronizacao> = [
  TipoSincronizacao.RETIFICACAO_COMPRA,
  TipoSincronizacao.SITUACAO_COMPRA,
  TipoSincronizacao.RETIFICACAO_CONTRATO,
];

/** Ainda não terminou (bloqueia as operações que dependem dela). */
export const STATUS_EM_ABERTO: ReadonlyArray<StatusSincronizacao> = [
  StatusSincronizacao.PENDENTE,
  StatusSincronizacao.ENVIANDO,
  StatusSincronizacao.ERRO_TEMPORARIO,
];

/** O worker pega sozinho. */
export const STATUS_PROCESSAVEIS: ReadonlyArray<StatusSincronizacao> = [
  StatusSincronizacao.PENDENTE,
  StatusSincronizacao.ERRO_TEMPORARIO,
];

/** "Reenviar agora" (ato do órgão) aceita também os definitivos e os antigos. */
export const STATUS_REENVIAVEIS: ReadonlyArray<StatusSincronizacao> = [
  ...STATUS_PROCESSAVEIS,
  StatusSincronizacao.ERRO_DEFINITIVO,
  StatusSincronizacao.ERRO,
];

export const STATUS_DE_ERRO: ReadonlyArray<StatusSincronizacao> = [
  StatusSincronizacao.ERRO,
  StatusSincronizacao.ERRO_TEMPORARIO,
  StatusSincronizacao.ERRO_DEFINITIVO,
];

export const MAX_TENTATIVAS_PADRAO = 8;
export const BACKOFF_BASE_MS = 60_000; // 1 min
export const BACKOFF_MAXIMO_MS = 6 * 3_600_000; // 6 h
/** Espera máxima por uma dependência (compra, termo, ata) antes de virar erro definitivo. */
export const PRAZO_DEPENDENCIA_MS = 24 * 3_600_000;
/** Envio interrompido (queda do processo no meio): volta à fila depois deste tempo. */
export const ENVIANDO_ABANDONADO_MS = 10 * 60_000;
/** Reavaliação de uma dependência não satisfeita. */
export const INTERVALO_DEPENDENCIA_MS = 60_000;

/**
 * Atraso do backoff exponencial depois da N-ésima tentativa que falhou
 * (N ≥ 1): 1, 2, 4, 8, 16, 32, 64 min… até 6 h.
 */
export function atrasoDoBackoff(tentativasFeitas: number): number {
  const n = Math.max(1, Math.floor(tentativasFeitas));
  const atraso = BACKOFF_BASE_MS * 2 ** (n - 1);
  return Math.min(atraso, BACKOFF_MAXIMO_MS);
}

export function proximoEnvioAposFalha(tentativasFeitas: number, agora: Date): Date {
  return new Date(agora.getTime() + atrasoDoBackoff(tentativasFeitas));
}

// ============================================================================
// Falhas
// ============================================================================

/** TEMPORARIA: rede/indisponibilidade (tenta de novo); DEFINITIVA: regra do PNCP/dado; DEPENDENCIA: espera outra operação. */
export type NaturezaFalha = 'TEMPORARIA' | 'DEFINITIVA' | 'DEPENDENCIA';

export class ErroPncp extends Error {
  constructor(
    mensagem: string,
    readonly natureza: NaturezaFalha,
    readonly statusHttp?: number,
    /** Corpo da resposta de erro do PNCP (como veio da API) — guardado na linha da fila. */
    readonly corpo?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroPncp';
  }
}

export const falhaDefinitiva = (m: string, status?: number) => new ErroPncp(m, 'DEFINITIVA', status);
export const falhaTemporaria = (m: string, status?: number) => new ErroPncp(m, 'TEMPORARIA', status);
export const aguardandoDependencia = (m: string) => new ErroPncp(m, 'DEPENDENCIA');

const CODIGOS_REDE_TEMPORARIOS = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ERR_NETWORK', 'ENETUNREACH'];

/**
 * Natureza de uma falha HTTP do PNCP: sem resposta (rede), 5xx, 408, 429 e
 * 401 (token vencido — novo login na próxima) são temporárias; os demais 4xx
 * são regra de negócio (definitiva — reenviar igual daria o mesmo erro).
 */
export function naturezaDaFalhaHttp(statusHttp: number | null | undefined, codigoRede?: string | null): Exclude<NaturezaFalha, 'DEPENDENCIA'> {
  // sem resposta: rede, timeout, DNS (inclusive códigos desconhecidos)
  if (!statusHttp) return codigoRede && !CODIGOS_REDE_TEMPORARIOS.includes(codigoRede) && /^ERR_(INVALID|BAD)/.test(codigoRede) ? 'DEFINITIVA' : 'TEMPORARIA';
  if (statusHttp >= 500 || statusHttp === 408 || statusHttp === 429 || statusHttp === 401) return 'TEMPORARIA';
  return 'DEFINITIVA';
}

/** Compra já incluída antes: "Id contratação PNCP: 81448637000147-1-000002/2025". */
export const RE_COMPRA_JA_EXISTE = /Id contrata[çc][aã]o PNCP:\s*(\d+)-(\d+)-(\d+)\/(\d+)/i;

/**
 * Recusas do PNCP que significam "já está lá" — tratadas como SUCESSO (o
 * código já sabia disso antes da fila):
 *  - COMPRA: "Id contratação PNCP: …" (mesmo número/ano/unidade já incluído);
 *  - ITEM: "número do item já utilizado" (os itens vão embutidos na compra);
 *  - RESULTADO: resultado idêntico já informado (PNCP recusa por tipoPessoa + NI + ordem).
 */
export function recusaBenigna(tipo: TipoSincronizacao, mensagem: string | null | undefined): boolean {
  const m = String(mensagem || '');
  switch (tipo) {
    case TipoSincronizacao.COMPRA:
      return RE_COMPRA_JA_EXISTE.test(m);
    case TipoSincronizacao.ITEM:
      return /j[áa] utilizad/i.test(m);
    case TipoSincronizacao.RESULTADO:
      return /j[áa] (existe|informad|cadastrad)/i.test(m) && /resultado/i.test(m);
    default:
      return false;
  }
}

// ============================================================================
// Decisão depois de uma tentativa
// ============================================================================

export interface EstadoTentativa {
  tentativas: number;
  max_tentativas: number;
  created_at: Date;
}

export interface Decisao {
  status: StatusSincronizacao;
  tentativas: number;
  proximo_envio: Date | null;
  erro_mensagem: string | null;
}

/** Linha depois de uma falha (a tentativa em curso ainda não foi contada). */
export function decidirAposFalha(r: EstadoTentativa, falha: { natureza: NaturezaFalha; mensagem: string }, agora: Date): Decisao {
  const msg = String(falha.mensagem || 'Erro desconhecido').slice(0, 2000);
  if (falha.natureza === 'DEPENDENCIA') {
    const esperando = agora.getTime() - new Date(r.created_at).getTime();
    if (esperando > PRAZO_DEPENDENCIA_MS) {
      return { status: StatusSincronizacao.ERRO_DEFINITIVO, tentativas: r.tentativas, proximo_envio: null, erro_mensagem: `Dependência não satisfeita em 24 h — ${msg}` };
    }
    return {
      status: StatusSincronizacao.PENDENTE,
      tentativas: r.tentativas,
      proximo_envio: new Date(agora.getTime() + INTERVALO_DEPENDENCIA_MS),
      erro_mensagem: `Aguardando: ${msg}`,
    };
  }
  const tentativas = r.tentativas + 1;
  if (falha.natureza === 'DEFINITIVA') {
    return { status: StatusSincronizacao.ERRO_DEFINITIVO, tentativas, proximo_envio: null, erro_mensagem: msg };
  }
  const max = r.max_tentativas > 0 ? r.max_tentativas : MAX_TENTATIVAS_PADRAO;
  if (tentativas >= max) {
    return { status: StatusSincronizacao.ERRO_DEFINITIVO, tentativas, proximo_envio: null, erro_mensagem: `Tentativas esgotadas (${tentativas}) — ${msg}` };
  }
  return { status: StatusSincronizacao.ERRO_TEMPORARIO, tentativas, proximo_envio: proximoEnvioAposFalha(tentativas, agora), erro_mensagem: msg };
}

// ============================================================================
// Chaves de idempotência (a mesma operação nunca entra duas vezes)
// ============================================================================

export const chaveFila = {
  compra: (licitacaoId: string) => `COMPRA:${licitacaoId}`,
  itens: (licitacaoId: string) => `ITENS:${licitacaoId}`,
  documento: (licitacaoId: string, origem: string) => `DOCUMENTO:${licitacaoId}:${origem}`,
  retificacaoCompra: (licitacaoId: string, origem: string) => `RETIFICACAO_COMPRA:${licitacaoId}:${origem}`,
  situacaoCompra: (licitacaoId: string, transicaoId: string) => `SITUACAO_COMPRA:${licitacaoId}:${transicaoId}`,
  resultado: (itemId: string, origem: string) => `RESULTADO:${itemId}:${origem}`,
  ata: (ataId: string) => `ATA:${ataId}`,
  contrato: (contratoId: string) => `CONTRATO:${contratoId}`,
  retificacaoContrato: (contratoId: string, origem: string) => `RETIFICACAO_CONTRATO:${contratoId}:${origem}`,
};

/** Rótulo legível (cockpit / painel da fila). */
export const ROTULO_OPERACAO: Readonly<Record<string, string>> = {
  [TipoSincronizacao.COMPRA]: 'Compra (aviso/edital)',
  [TipoSincronizacao.ITEM]: 'Itens da compra',
  [TipoSincronizacao.DOCUMENTO]: 'Documento',
  [TipoSincronizacao.RETIFICACAO_COMPRA]: 'Retificação da compra',
  [TipoSincronizacao.SITUACAO_COMPRA]: 'Situação da compra',
  [TipoSincronizacao.RESULTADO]: 'Resultado do item',
  [TipoSincronizacao.ATA]: 'Ata de registro de preços',
  [TipoSincronizacao.CONTRATO]: 'Contrato',
  [TipoSincronizacao.RETIFICACAO_CONTRATO]: 'Retificação do contrato',
};
