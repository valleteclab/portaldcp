import { CalendarioDiasUteis, calendarioDoOrgao, fimDoPrazoEmDiasUteis } from '../common/prazos/dias-uteis';
import { ResultadoSorteio, sorteioAuditavel } from '../julgamento/sorteio';
import { DIAS_UTEIS_RECONSIDERACAO, TAMANHO_MINIMO_FUNDAMENTACAO, prazoAutoridade } from '../sessao/regras-recursos';

export { TAMANHO_MINIMO_FUNDAMENTACAO };

/**
 * ============================================================================
 * CREDENCIAMENTO — REGRAS PURAS (plano E7b)
 * ============================================================================
 *
 * Base legal (Lei 14.133/2021):
 *  - art. 6º XLIII: credenciamento = processo administrativo de chamamento
 *    público em que a Administração convoca interessados em prestar serviços
 *    ou fornecer bens para que, preenchidos os requisitos necessários, se
 *    credenciem para executar o objeto quando convocados;
 *  - art. 78 I: procedimento auxiliar das licitações e contratações;
 *  - art. 79 caput — hipóteses: I paralela e não excludente (contratações
 *    simultâneas em condições padronizadas); II com seleção a critério de
 *    terceiros (o beneficiário escolhe); III em mercados fluidos (a
 *    flutuação dos preços impede a seleção por licitação);
 *  - art. 79 parágrafo único: I edital de chamamento divulgado e mantido à
 *    disposição do público, permitindo o CADASTRAMENTO PERMANENTE de novos
 *    interessados; II na hipótese I, sem contratação imediata e simultânea
 *    de todos, CRITÉRIOS OBJETIVOS DE DISTRIBUIÇÃO da demanda; III condições
 *    padronizadas de contratação e, nas hipóteses I e II, VALOR DA
 *    CONTRATAÇÃO definido no edital; IV na hipótese III, registro das
 *    COTAÇÕES de mercado vigentes no momento da contratação; V vedado o
 *    cometimento a terceiros sem autorização expressa; VI DENÚNCIA por
 *    qualquer das partes nos prazos fixados no edital;
 *  - art. 74 IV: a contratação do credenciado é por INEXIGIBILIDADE;
 *  - art. 165 I: recurso em 3 dias úteis (contagem do art. 183);
 *  - Decreto 11.878/2024 (credenciamento na Administração federal) como
 *    referência de procedimento (edital no PNCP, análise, distribuição).
 *
 * Nada aqui toca o banco: o CredenciamentoService e a máquina de estados usam
 * estas funções; os testes unitários as exercitam diretamente.
 */

export enum HipoteseCredenciamento {
  /** Art. 79 I — contratação paralela e não excludente. */
  PARALELA_NAO_EXCLUDENTE = 'PARALELA_NAO_EXCLUDENTE',
  /** Art. 79 II — seleção a critério de terceiros (o beneficiário escolhe). */
  SELECAO_POR_TERCEIROS = 'SELECAO_POR_TERCEIROS',
  /** Art. 79 III — mercados fluidos (preço cotado no momento da contratação). */
  MERCADO_FLUIDO = 'MERCADO_FLUIDO',
}

export const ROTULO_HIPOTESE: Record<HipoteseCredenciamento, string> = {
  [HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE]: 'Art. 79, I — contratação paralela e não excludente',
  [HipoteseCredenciamento.SELECAO_POR_TERCEIROS]: 'Art. 79, II — seleção a critério de terceiros',
  [HipoteseCredenciamento.MERCADO_FLUIDO]: 'Art. 79, III — mercados fluidos',
};

/** Critério objetivo de distribuição da demanda (art. 79 par. único II / IV). */
export enum RegraDistribuicao {
  /** Fila circular na ordem do credenciamento; novos credenciados entram no fim. */
  RODIZIO = 'RODIZIO',
  /** Sorteio auditável (julgamento/sorteio.ts — SHA256-FY-v1) a cada demanda. */
  SORTEIO = 'SORTEIO',
  /** Demanda ao credenciado com MENOR valor já contratado (equaliza a divisão). */
  DIVISAO_IGUALITARIA = 'DIVISAO_IGUALITARIA',
  /** Hipótese II: o beneficiário escolhe o credenciado (registrada a escolha). */
  ESCOLHA_BENEFICIARIO = 'ESCOLHA_BENEFICIARIO',
  /** Hipótese III: cotações registradas no momento; contrata a menor cotação. */
  COTACAO_MERCADO = 'COTACAO_MERCADO',
}

export const ROTULO_REGRA: Record<RegraDistribuicao, string> = {
  [RegraDistribuicao.RODIZIO]: 'Rodízio (ordem do credenciamento)',
  [RegraDistribuicao.SORTEIO]: 'Sorteio auditável a cada demanda',
  [RegraDistribuicao.DIVISAO_IGUALITARIA]: 'Divisão igualitária (menor valor já contratado)',
  [RegraDistribuicao.ESCOLHA_BENEFICIARIO]: 'Escolha do beneficiário',
  [RegraDistribuicao.COTACAO_MERCADO]: 'Cotação de mercado no momento da contratação',
};

/** Regras de distribuição admitidas em cada hipótese do art. 79. */
export const REGRAS_POR_HIPOTESE: Record<HipoteseCredenciamento, RegraDistribuicao[]> = {
  [HipoteseCredenciamento.PARALELA_NAO_EXCLUDENTE]: [
    RegraDistribuicao.RODIZIO,
    RegraDistribuicao.SORTEIO,
    RegraDistribuicao.DIVISAO_IGUALITARIA,
  ],
  [HipoteseCredenciamento.SELECAO_POR_TERCEIROS]: [RegraDistribuicao.ESCOLHA_BENEFICIARIO],
  [HipoteseCredenciamento.MERCADO_FLUIDO]: [RegraDistribuicao.COTACAO_MERCADO],
};

/** Situação da inscrição (decisões gravadas; a documentação vem da habilitação — E4). */
export enum StatusInscricao {
  /** Inscrita: documentação em preenchimento ou em análise (ver a habilitação). */
  PENDENTE = 'PENDENTE',
  CREDENCIADO = 'CREDENCIADO',
  INDEFERIDO = 'INDEFERIDO',
  DESCREDENCIADO = 'DESCREDENCIADO',
  /** Vigência do edital encerrada antes da decisão (não há mais contratações). */
  ARQUIVADA = 'ARQUIVADA',
}

/**
 * Recurso contra o indeferimento da inscrição — art. 165 I "a" (ato que
 * indefere inscrição em registro cadastral/pré-qualificação; aplicado ao
 * credenciamento) e §2º: razões em 3 dias úteis → RECONSIDERAÇÃO pelo agente
 * em 3 dias úteis (reconsidera = PROVIDO) ou mantém e encaminha → decisão da
 * AUTORIDADE SUPERIOR em 10 dias úteis. Prazos do E5 (sessao/regras-recursos).
 */
export enum StatusRecursoInscricao {
  /** Razões apresentadas: aguarda a reconsideração do agente. */
  INTERPOSTO = 'INTERPOSTO',
  /** Agente manteve o indeferimento: aguarda a autoridade superior. */
  AGUARDANDO_AUTORIDADE = 'AGUARDANDO_AUTORIDADE',
  PROVIDO = 'PROVIDO',
  IMPROVIDO = 'IMPROVIDO',
}

export const STATUS_RECURSO_INSCRICAO_PENDENTES: ReadonlyArray<string> = [
  StatusRecursoInscricao.INTERPOSTO,
  StatusRecursoInscricao.AGUARDANDO_AUTORIDADE,
];

/** Prazo de reconsideração do agente (3 dias úteis da interposição — art. 165 §2º). */
export function prazoReconsideracaoInscricao(interpostoEm: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): Date {
  return fimDoPrazoEmDiasUteis(interpostoEm, DIAS_UTEIS_RECONSIDERACAO, cal);
}

/** Prazo da autoridade superior (10 dias úteis do encaminhamento — art. 165 §2º). */
export function prazoAutoridadeInscricao(encaminhadoEm: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): Date {
  return prazoAutoridade(encaminhadoEm, cal);
}

/** Atos do rito: quem pode fazer o quê agora (null = pode). */
export function motivoNaoReconsidera(status: string | null | undefined): string | null {
  if (status !== StatusRecursoInscricao.INTERPOSTO) return 'Não há recurso aguardando a reconsideração do agente nesta inscrição';
  return null;
}

export function motivoNaoDecideAutoridade(status: string | null | undefined): string | null {
  if (status !== StatusRecursoInscricao.AGUARDANDO_AUTORIDADE) {
    return 'O recurso não está aguardando a autoridade superior (o agente precisa manter a decisão antes — art. 165 §2º)';
  }
  return null;
}

/** Atrasos (sinalizados, nunca decididos automaticamente — mesmo critério do E5). */
export function atrasosRecursoInscricao(r: { recurso_status?: string | null; recurso_prazo_reconsideracao?: Date | string | null; recurso_prazo_autoridade?: Date | string | null }, agora = new Date()) {
  const passou = (v?: Date | string | null) => !!v && agora.getTime() > new Date(v).getTime();
  return {
    reconsideracaoAtrasada: r.recurso_status === StatusRecursoInscricao.INTERPOSTO && passou(r.recurso_prazo_reconsideracao),
    autoridadeAtrasada: r.recurso_status === StatusRecursoInscricao.AGUARDANDO_AUTORIDADE && passou(r.recurso_prazo_autoridade),
  };
}

/** Quem pôs fim ao credenciamento (art. 79 par. único VI). */
export enum IniciativaDescredenciamento {
  /** Descumprimento das condições do edital — efeito imediato, motivado. */
  ADMINISTRACAO_DESCUMPRIMENTO = 'ADMINISTRACAO_DESCUMPRIMENTO',
  /** Denúncia pela Administração — efeito depois do aviso prévio do edital. */
  ADMINISTRACAO_DENUNCIA = 'ADMINISTRACAO_DENUNCIA',
  /** Denúncia pelo credenciado — efeito depois do aviso prévio do edital. */
  CREDENCIADO_DENUNCIA = 'CREDENCIADO_DENUNCIA',
}

export const DIAS_UTEIS_RECURSO = 3; // art. 165 I
export const MOTIVO_MINIMO_CREDENCIAMENTO = 10;
const DIA_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Edital de chamamento (pré-condições do PUBLICAR)
// ---------------------------------------------------------------------------

export interface EstadoEditalCredenciamento {
  hipotese: string | null;
  regra_distribuicao: string | null;
  vigencia_inicio: Date | string | null;
  vigencia_fim: Date | string | null;
  condicoes_padronizadas: string | null;
  prazo_denuncia_dias: number | null;
  validade_credenciado_meses?: number | null;
  itens: Array<{ numero_item: number; descricao?: string | null; valor_unitario_estimado: number | string | null }>;
}

const data = (v: Date | string | null | undefined): Date | null => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function ehHipotese(v: unknown): v is HipoteseCredenciamento {
  return typeof v === 'string' && (Object.values(HipoteseCredenciamento) as string[]).includes(v);
}

export function ehRegra(v: unknown): v is RegraDistribuicao {
  return typeof v === 'string' && (Object.values(RegraDistribuicao) as string[]).includes(v);
}

/** Regra padrão da hipótese (a primeira admitida). */
export function regraPadrao(h: HipoteseCredenciamento): RegraDistribuicao {
  return REGRAS_POR_HIPOTESE[h][0];
}

/** A regra é admitida na hipótese? (null = sim) */
export function motivoRegraIncompativel(hipotese: unknown, regra: unknown): string | null {
  if (!ehHipotese(hipotese)) return 'Informe a hipótese do credenciamento (art. 79, I, II ou III).';
  if (!ehRegra(regra)) return 'Informe a regra de distribuição da demanda (art. 79, parágrafo único, II).';
  if (!REGRAS_POR_HIPOTESE[hipotese].includes(regra)) {
    return `Regra "${ROTULO_REGRA[regra]}" não se aplica à hipótese ${ROTULO_HIPOTESE[hipotese]} — admitidas: ${REGRAS_POR_HIPOTESE[hipotese].map((r) => ROTULO_REGRA[r]).join(', ')}.`;
  }
  return null;
}

/**
 * Pendências para PUBLICAR o edital de chamamento: hipótese × regra, vigência
 * coerente e futura, condições padronizadas, valor fixado (I e II), prazo de
 * denúncia (VI) e itens.
 */
export function pendenciasEditalCredenciamento(e: EstadoEditalCredenciamento | null, agora: Date = new Date()): string[] {
  if (!e) return ['Configure o edital de credenciamento (hipótese do art. 79, regra de distribuição, vigência e condições padronizadas).'];
  const p: string[] = [];
  const regra = motivoRegraIncompativel(e.hipotese, e.regra_distribuicao);
  if (regra) p.push(regra);
  const ini = data(e.vigencia_inicio);
  const fim = data(e.vigencia_fim);
  if (!ini || !fim) p.push('Informe a vigência do edital de credenciamento (início e fim) — as inscrições ficam abertas durante toda a vigência (art. 79, parágrafo único, I).');
  else {
    if (fim.getTime() <= ini.getTime()) p.push('O fim da vigência do edital deve ser posterior ao início.');
    if (fim.getTime() <= agora.getTime()) p.push('A vigência do edital já terminou — informe um fim futuro.');
  }
  if (String(e.condicoes_padronizadas ?? '').trim().length < MOTIVO_MINIMO_CREDENCIAMENTO) {
    p.push('Descreva as condições padronizadas de contratação (art. 79, parágrafo único, III).');
  }
  const prazo = Number(e.prazo_denuncia_dias);
  if (!Number.isInteger(prazo) || prazo < 1) p.push('Informe o prazo de aviso da denúncia, em dias (art. 79, parágrafo único, VI).');
  if (e.validade_credenciado_meses != null && (!Number.isInteger(Number(e.validade_credenciado_meses)) || Number(e.validade_credenciado_meses) < 1)) {
    p.push('Validade do credenciamento inválida (meses ≥ 1, ou vazio para valer até o fim da vigência).');
  }
  if (!e.itens?.length) p.push('Cadastre ao menos um item (serviço/bem objeto do credenciamento).');
  else {
    const semValor = e.itens.filter((i) => !(Number(i.valor_unitario_estimado) > 0)).map((i) => `item ${i.numero_item}`);
    if (semValor.length && e.hipotese === HipoteseCredenciamento.MERCADO_FLUIDO) {
      p.push(
        `Informe o valor estimado de referência (o PNCP exige; a contratação usa a cotação do momento — art. 79, parágrafo único, IV): ${semValor.join(', ')} sem valor.`,
      );
    } else if (semValor.length) {
      p.push(`Defina o valor da contratação (tabela de remuneração) — art. 79, parágrafo único, III: ${semValor.join(', ')} sem valor.`);
    }
  }
  return p;
}

// ---------------------------------------------------------------------------
// Inscrição e validade
// ---------------------------------------------------------------------------

/** Inscrição aberta: processo ATIVO, divulgado e dentro da vigência (cadastramento permanente). */
export function motivoNaoInscreve(
  lic: { fase: string; situacao: string | null },
  vigencia: { inicio: Date | string | null; fim: Date | string | null },
  agora: Date = new Date(),
): string | null {
  const situacao = lic.situacao ?? 'ATIVA';
  if (situacao === 'CONCLUIDA') return 'A vigência do edital de credenciamento terminou — não se recebem novas inscrições.';
  if (situacao === 'SUSPENSA') return 'Credenciamento suspenso — inscrições temporariamente fechadas.';
  if (situacao !== 'ATIVA') return 'Credenciamento encerrado (revogado/anulado) — não se recebem inscrições.';
  if (!['PUBLICADO', 'ACOLHIMENTO_PROPOSTAS'].includes(lic.fase)) return 'Edital de credenciamento ainda não publicado.';
  const ini = data(vigencia.inicio);
  const fim = data(vigencia.fim);
  if (ini && agora.getTime() < ini.getTime()) return `As inscrições abrem em ${formatar(ini)} (início da vigência do edital).`;
  if (fim && agora.getTime() > fim.getTime()) return 'A vigência do edital de credenciamento terminou — não se recebem novas inscrições.';
  return null;
}

/** Fim da validade do credenciado: meses do edital a partir do credenciamento, nunca além da vigência. */
export function validadeDoCredenciado(credenciadoEm: Date, meses: number | null | undefined, vigenciaFim: Date | string | null): Date | null {
  const fim = data(vigenciaFim);
  if (!meses) return fim;
  const v = new Date(credenciadoEm);
  v.setUTCMonth(v.getUTCMonth() + Number(meses));
  return fim && fim.getTime() < v.getTime() ? fim : v;
}

/** Prazo do recurso contra o indeferimento (art. 165 I — 3 dias úteis, art. 183). */
export function prazoRecursoInscricao(decididaEm: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): Date {
  return fimDoPrazoEmDiasUteis(decididaEm, DIAS_UTEIS_RECURSO, cal);
}

/** Data em que o descredenciamento produz efeito (imediato ou depois do aviso da denúncia). */
export function efeitoDoDescredenciamento(iniciativa: IniciativaDescredenciamento, agora: Date, prazoDenunciaDias: number | null | undefined): Date {
  if (iniciativa === IniciativaDescredenciamento.ADMINISTRACAO_DESCUMPRIMENTO) return agora;
  return new Date(agora.getTime() + Math.max(0, Number(prazoDenunciaDias) || 0) * DIA_MS);
}

export interface InscricaoParaRegra {
  id: string;
  fornecedor_id: string;
  status: string;
  ordem_rodizio: number | null;
  validade_ate: Date | string | null;
  descredenciamento_efeitos_em: Date | string | null;
}

/** Pode ser contratado agora? (credenciado, dentro da validade, sem denúncia com efeito) */
export function motivoInelegivel(i: InscricaoParaRegra, agora: Date = new Date()): string | null {
  if (i.status !== StatusInscricao.CREDENCIADO) return 'não está credenciado';
  const validade = data(i.validade_ate);
  if (validade && validade.getTime() < agora.getTime()) return 'credenciamento com validade vencida';
  const efeito = data(i.descredenciamento_efeitos_em);
  if (efeito && efeito.getTime() <= agora.getTime()) return 'descredenciado (denúncia com efeito)';
  return null;
}

/** Status mostrado nas telas (a denúncia com efeito já passado vira DESCREDENCIADO). */
export function statusEfetivoInscricao(i: InscricaoParaRegra, agora: Date = new Date()): string {
  if (i.status === StatusInscricao.CREDENCIADO) {
    const efeito = data(i.descredenciamento_efeitos_em);
    if (efeito && efeito.getTime() <= agora.getTime()) return StatusInscricao.DESCREDENCIADO;
  }
  return i.status;
}

// ---------------------------------------------------------------------------
// Distribuição da demanda (art. 79 parágrafo único II e IV)
// ---------------------------------------------------------------------------

export interface CredenciadoNaFila {
  inscricaoId: string;
  fornecedorId: string;
  ordemRodizio: number;
  contratacoes: number;
  valorContratado: number;
}

const porOrdem = (a: CredenciadoNaFila, b: CredenciadoNaFila) => a.ordemRodizio - b.ordemRodizio || a.inscricaoId.localeCompare(b.inscricaoId);

/**
 * RODÍZIO: fila circular na ordem do credenciamento (`ordem_rodizio`,
 * atribuída no deferimento — quem se credencia depois entra no fim da fila).
 * O próximo é o primeiro da fila com ordem MAIOR que a do último contratado
 * pelo rodízio; acabada a fila, volta ao início. Descredenciado sai da fila
 * sem mudar a vez dos demais.
 */
export function proximoDoRodizio(
  elegiveis: CredenciadoNaFila[],
  ordemDoUltimo: number | null,
): { escolhido: CredenciadoNaFila; fila: CredenciadoNaFila[] } {
  if (!elegiveis.length) throw new Error('Nenhum credenciado apto para receber a demanda');
  const fila = [...elegiveis].sort(porOrdem);
  const escolhido = ordemDoUltimo == null ? fila[0] : fila.find((c) => c.ordemRodizio > ordemDoUltimo) ?? fila[0];
  return { escolhido, fila };
}

/** DIVISÃO IGUALITÁRIA: menor valor já contratado; empate → menos contratações; persistindo → ordem do rodízio. */
export function escolhaDivisaoIgualitaria(elegiveis: CredenciadoNaFila[]): CredenciadoNaFila {
  if (!elegiveis.length) throw new Error('Nenhum credenciado apto para receber a demanda');
  return [...elegiveis].sort(
    (a, b) =>
      Math.round(a.valorContratado * 100) - Math.round(b.valorContratado * 100) ||
      a.contratacoes - b.contratacoes ||
      porOrdem(a, b),
  )[0];
}

/**
 * SORTEIO auditável da demanda (mesmo algoritmo do desempate — SHA256-FY-v1):
 * entrada pública = credenciamento, demanda (id da contratação), credenciados
 * aptos e instante do ato, registrado ANTES do cálculo. Qualquer credenciado
 * confere com `conferirSorteio`.
 */
export function sorteioDaDemanda(p: { licitacaoId: string; contratacaoId: string; candidatos: string[]; atoEm: Date }): ResultadoSorteio {
  if (!p.candidatos.length) throw new Error('Nenhum credenciado apto para o sorteio');
  return sorteioAuditavel({
    licitacaoId: p.licitacaoId,
    unidadeId: p.contratacaoId,
    candidatos: p.candidatos,
    atoEm: p.atoEm,
    contexto: 'CREDENCIAMENTO',
  });
}

export interface CotacaoMercado {
  inscricaoId: string;
  valorUnitario: number;
  fonte?: string | null;
}

/** MERCADO FLUIDO: cotações registradas no momento; vence a menor (empate → a registrada primeiro). */
export function escolhaPorCotacao(cotacoes: CotacaoMercado[]): CotacaoMercado {
  const validas = cotacoes.filter((c) => Number(c.valorUnitario) > 0);
  if (!validas.length) throw new Error('Registre ao menos uma cotação de credenciado com valor');
  return validas.reduce((m, c) => (Number(c.valorUnitario) < Number(m.valorUnitario) ? c : m));
}

export const arred2 = (v: number) => Math.round(v * 100) / 100;

function formatar(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
