/**
 * PAINEL PARA TV (uso interno do setor de licitação) — regras PURAS, sem banco.
 *
 * O painel não cria regra de etapa: a etapa da fase interna é a de
 * `etapasDaFaseInterna`/`etapaAtual` (Entrega 2 da fase interna) e, depois da
 * divulgação, a fase da máquina de estados da licitação (`FaseLicitacao`).
 * Aqui só se decide em QUAL COLUNA do quadro cada etapa/fase aparece, a cor
 * do prazo (dias úteis pelo calendário do órgão — a mesma função única de
 * prazos, `common/prazos/dias-uteis`), os dias na etapa, a seleção dos
 * contratos que vencem e a lista de chaves que NUNCA saem no JSON da TV.
 */
import { EtapaFaseInterna, TITULO_ETAPA } from '../fase-interna/tarefas/etapas-fase-interna';
import {
  CalendarioDiasUteis,
  DIA_MS,
  diaEmBrasilia,
  diasUteisEntre,
  fimDoPrazoEmDiasUteis,
} from '../common/prazos/dias-uteis';

// ---------------------------------------------------------------------------
// Colunas do quadro
// ---------------------------------------------------------------------------

export type ColunaPainel =
  | 'DEMANDA'
  | 'PLANEJAMENTO'
  | 'PESQUISA'
  | 'RESERVA'
  | 'AUTORIZACAO'
  | 'MINUTAS_PARECER'
  | 'PUBLICACAO'
  | 'PROPOSTAS'
  | 'JULGAMENTO'
  | 'RECURSO'
  | 'HOMOLOGACAO'
  | 'CONTRATO';

/** Ordem das colunas na TV (da demanda à formalização do contrato). */
export const COLUNAS_PAINEL: Array<{ chave: ColunaPainel; titulo: string }> = [
  { chave: 'DEMANDA', titulo: 'Demanda (DFD)' },
  { chave: 'PLANEJAMENTO', titulo: 'Planejamento (ETP/TR)' },
  { chave: 'PESQUISA', titulo: 'Pesquisa de preços' },
  { chave: 'RESERVA', titulo: 'Reserva orçamentária' },
  { chave: 'AUTORIZACAO', titulo: 'Autorização' },
  { chave: 'MINUTAS_PARECER', titulo: 'Minutas e parecer' },
  { chave: 'PUBLICACAO', titulo: 'Publicação' },
  { chave: 'PROPOSTAS', titulo: 'Recebendo propostas' },
  { chave: 'JULGAMENTO', titulo: 'Julgamento e habilitação' },
  { chave: 'RECURSO', titulo: 'Recurso' },
  { chave: 'HOMOLOGACAO', titulo: 'Homologação' },
  { chave: 'CONTRATO', titulo: 'Contrato (formalização)' },
];

/** Etapa da fase interna (Entrega 2) → coluna. O controle interno vai com o parecer. */
export const COLUNA_DA_ETAPA: Record<EtapaFaseInterna, ColunaPainel> = {
  [EtapaFaseInterna.DEMANDA]: 'DEMANDA',
  [EtapaFaseInterna.ETP_RISCOS]: 'PLANEJAMENTO',
  [EtapaFaseInterna.TERMO_REFERENCIA]: 'PLANEJAMENTO',
  [EtapaFaseInterna.PESQUISA_PRECOS]: 'PESQUISA',
  [EtapaFaseInterna.RESERVA_ORCAMENTARIA]: 'RESERVA',
  [EtapaFaseInterna.AUTORIZACAO]: 'AUTORIZACAO',
  [EtapaFaseInterna.MINUTAS_PARECER]: 'MINUTAS_PARECER',
  [EtapaFaseInterna.CONTROLE_INTERNO]: 'MINUTAS_PARECER',
  [EtapaFaseInterna.CONFORMIDADE_PUBLICACAO]: 'PUBLICACAO',
};

/**
 * Fase interna SEM etapa atual calculada (tudo concluído aguardando o ato, ou
 * processo sem instrução): a coluna vem da própria fase da máquina.
 */
const COLUNA_DA_FASE_INTERNA: Record<string, ColunaPainel> = {
  PLANEJAMENTO: 'PLANEJAMENTO',
  TERMO_REFERENCIA: 'PLANEJAMENTO',
  PESQUISA_PRECOS: 'PESQUISA',
  ANALISE_JURIDICA: 'MINUTAS_PARECER',
  APROVACAO_INTERNA: 'AUTORIZACAO',
};

/** Fases externas (máquina de estados) → coluna. */
const COLUNA_DA_FASE_EXTERNA: Record<string, ColunaPainel> = {
  AGUARDANDO_DIVULGACAO: 'PUBLICACAO',
  PUBLICADO: 'PROPOSTAS',
  IMPUGNACAO: 'PROPOSTAS',
  ACOLHIMENTO_PROPOSTAS: 'PROPOSTAS',
  ANALISE_PROPOSTAS: 'JULGAMENTO',
  EM_DISPUTA: 'JULGAMENTO',
  JULGAMENTO: 'JULGAMENTO',
  HABILITACAO: 'JULGAMENTO',
  RECURSO: 'RECURSO',
  ADJUDICACAO: 'HOMOLOGACAO',
  // HOMOLOGACAO: homologado → CONTRATO; ainda sem o ato → HOMOLOGACAO (abaixo)
};

/** Rótulo curto da fase externa (subtítulo do cartão). */
const ROTULO_FASE_EXTERNA: Record<string, string> = {
  AGUARDANDO_DIVULGACAO: 'Aguardando PNCP',
  PUBLICADO: 'Publicado',
  IMPUGNACAO: 'Prazo de impugnação',
  ACOLHIMENTO_PROPOSTAS: 'Recebendo propostas',
  ANALISE_PROPOSTAS: 'Análise das propostas',
  EM_DISPUTA: 'Em disputa',
  JULGAMENTO: 'Julgamento',
  HABILITACAO: 'Habilitação',
  RECURSO: 'Prazo recursal',
  ADJUDICACAO: 'Adjudicado',
};

/** Situações que tiram o processo do painel (encerrados). */
export const SITUACOES_FORA_DO_PAINEL = ['CONCLUIDA', 'REVOGADA', 'ANULADA', 'DESERTA', 'FRACASSADA'];
/** Situações que aparecem (suspenso com etiqueta). */
export const SITUACOES_NO_PAINEL = ['ATIVA', 'SUSPENSA'];

export const FASES_INTERNAS_PAINEL = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA'];

export function ehFaseInternaPainel(fase: string | null | undefined): boolean {
  return FASES_INTERNAS_PAINEL.includes(String(fase));
}

export interface ProcessoParaColuna {
  fase: string;
  situacao: string | null | undefined;
  data_homologacao?: Date | string | null;
  /** Etapa atual (`etapaAtual(etapasDaFaseInterna(...))`) — só na fase interna. */
  etapa_atual?: EtapaFaseInterna | string | null;
}

/**
 * Coluna do processo no quadro, ou null (encerrado/fora do painel).
 *  - fase interna: a etapa atual da Entrega 2 (sem etapa atual: a fase da máquina);
 *  - AGUARDANDO_DIVULGACAO: Publicação ("aguardando PNCP");
 *  - HOMOLOGACAO: com a homologação registrada → Contrato (formalização);
 *    sem ela → Homologação.
 */
export function colunaDoProcesso(p: ProcessoParaColuna): ColunaPainel | null {
  if (!SITUACOES_NO_PAINEL.includes(String(p.situacao ?? 'ATIVA'))) return null;
  const fase = String(p.fase);
  if (ehFaseInternaPainel(fase)) {
    const etapa = p.etapa_atual ? COLUNA_DA_ETAPA[p.etapa_atual as EtapaFaseInterna] : undefined;
    return etapa ?? COLUNA_DA_FASE_INTERNA[fase] ?? null;
  }
  if (fase === 'HOMOLOGACAO') return p.data_homologacao ? 'CONTRATO' : 'HOMOLOGACAO';
  return COLUNA_DA_FASE_EXTERNA[fase] ?? null;
}

/** Subtítulo do cartão: a etapa (fase interna) ou a fase (externa). */
export function rotuloDaEtapa(p: ProcessoParaColuna): string {
  const fase = String(p.fase);
  if (ehFaseInternaPainel(fase)) {
    return p.etapa_atual ? TITULO_ETAPA[p.etapa_atual as EtapaFaseInterna] ?? String(p.etapa_atual) : 'Fase interna';
  }
  if (fase === 'HOMOLOGACAO') return p.data_homologacao ? 'Homologado — formalizar contrato' : 'Homologação';
  return ROTULO_FASE_EXTERNA[fase] ?? fase;
}

// ---------------------------------------------------------------------------
// Prazo e dias na etapa
// ---------------------------------------------------------------------------

export type CorPrazo = 'VERDE' | 'AMARELO' | 'VERMELHO';

/** Até quantos dias úteis antes do vencimento o prazo fica amarelo. */
export const DIAS_UTEIS_AMARELO = 2;

/**
 * Cor do prazo, em DIAS ÚTEIS pelo calendário do órgão:
 *  - VERMELHO: vencido (passou das 23:59:59 do dia do vencimento, Brasília);
 *  - AMARELO: vence hoje ou em até 2 dias úteis;
 *  - VERDE: mais que isso;
 *  - null: sem prazo.
 */
export function corDoPrazo(prazo: Date | string | null | undefined, agora: Date, cal: CalendarioDiasUteis): CorPrazo | null {
  if (!prazo) return null;
  const fim = new Date(prazo);
  if (Number.isNaN(fim.getTime())) return null;
  if (fim.getTime() < agora.getTime()) return 'VERMELHO';
  return diasUteisEntre(agora, fim, cal) <= DIAS_UTEIS_AMARELO ? 'AMARELO' : 'VERDE';
}

/**
 * Prazo efetivo da etapa: o da tarefa aberta (criada pela sincronização com o
 * prazo configurado do passo); sem tarefa com prazo, o prazo configurado
 * contado da ENTRADA na etapa (a mesma `fimDoPrazoEmDiasUteis`). null = sem prazo.
 */
export function prazoEfetivoDaEtapa(
  e: { prazo_tarefa?: Date | string | null; entrada_etapa?: Date | string | null; prazo_dias_uteis?: number | null },
  cal: CalendarioDiasUteis,
): Date | null {
  if (e.prazo_tarefa) return new Date(e.prazo_tarefa);
  const dias = Math.floor(Number(e.prazo_dias_uteis) || 0);
  if (!e.entrada_etapa || dias <= 0) return null;
  return fimDoPrazoEmDiasUteis(new Date(e.entrada_etapa), dias, cal);
}

/** Dias corridos (no calendário de Brasília) desde a entrada na etapa. 0 = entrou hoje. */
export function diasNaEtapa(entrada: Date | string | null | undefined, agora: Date): number | null {
  if (!entrada) return null;
  const d = new Date(entrada);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((diaEmBrasilia(agora) - diaEmBrasilia(d)) / DIA_MS));
}

/**
 * Processo ATRASADO: alguma tarefa aberta com prazo vencido, ou a etapa atual
 * parada além do prazo configurado (prazo efetivo vencido).
 */
export function processoAtrasado(
  p: { prazos_tarefas_abertas: Array<Date | string | null>; prazo_etapa: Date | null },
  agora: Date,
): boolean {
  const venceu = (x: Date | string | null) => !!x && new Date(x).getTime() < agora.getTime();
  return p.prazos_tarefas_abertas.some(venceu) || venceu(p.prazo_etapa);
}

// ---------------------------------------------------------------------------
// Contratos vencendo
// ---------------------------------------------------------------------------

export const JANELAS_CONTRATOS = [30, 60, 90, 120] as const;
export const JANELA_CONTRATOS_PADRAO = 90;

export function janelaValida(v: unknown): v is (typeof JANELAS_CONTRATOS)[number] {
  return JANELAS_CONTRATOS.includes(Number(v) as any) && Number.isInteger(Number(v));
}

/** "Hoje" em Brasília como YYYY-MM-DD. */
export function hojeEmBrasilia(agora: Date): string {
  return new Date(diaEmBrasilia(agora)).toISOString().slice(0, 10);
}

/** YYYY-MM-DD + N dias. */
export function somarDias(dataIso: string, dias: number): string {
  return new Date(Date.parse(`${dataIso}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Dias corridos entre duas datas YYYY-MM-DD (fim − início). */
export function diasEntreDatas(inicioIso: string, fimIso: string): number {
  return Math.round((Date.parse(`${fimIso}T00:00:00Z`) - Date.parse(`${inicioIso}T00:00:00Z`)) / DIA_MS);
}

export type FaixaContrato = 'VERMELHO' | 'AMARELO' | 'NEUTRO';

/** Cor dos dias restantes: vermelho ≤ 30, amarelo ≤ 60, neutro no resto. */
export function faixaDosDiasRestantes(dias: number): FaixaContrato {
  if (dias <= 30) return 'VERMELHO';
  if (dias <= 60) return 'AMARELO';
  return 'NEUTRO';
}

export interface ContratoParaSelecao {
  status: string;
  data_vigencia_fim: string | null; // YYYY-MM-DD
}

/**
 * Contratos VIGENTES com fim da vigência de hoje até hoje + janela (dias
 * corridos), do mais próximo para o mais distante. Status VIGENTE com fim já
 * passado (a rotina de vigência ainda não virou) fica de fora.
 */
export function selecionarContratosVencendo<T extends ContratoParaSelecao>(
  contratos: T[],
  hojeIso: string,
  janela: number,
): Array<T & { dias_restantes: number }> {
  return contratos
    .filter((c) => c.status === 'VIGENTE' && !!c.data_vigencia_fim)
    .map((c) => ({ ...c, dias_restantes: diasEntreDatas(hojeIso, String(c.data_vigencia_fim).slice(0, 10)) }))
    .filter((c) => c.dias_restantes >= 0 && c.dias_restantes <= janela)
    .sort((a, b) => a.dias_restantes - b.dias_restantes);
}

/** Contagem cumulativa para os números do topo (≤ 30, ≤ 60, ≤ 90). */
export function contarPorFaixa(dias: number[]): { ate_30: number; ate_60: number; ate_90: number } {
  return {
    ate_30: dias.filter((d) => d <= 30).length,
    ate_60: dias.filter((d) => d <= 60).length,
    ate_90: dias.filter((d) => d <= 90).length,
  };
}

export type IndicacaoProrrogacao = 'CONTINUO_ART107' | 'NAO_PRORROGAVEL';

/** Art. 107: serviços e fornecimentos contínuos — prorrogação até 10 anos. */
export const LIMITE_ANOS_ART107 = 10;

/**
 * O que o contrato diz sobre prorrogar:
 *  - serviço contínuo (modalidade de execução CONTINUADO): pode prorrogar
 *    (art. 107) enquanto a vigência total não chega a 10 anos; chegou → não
 *    prorrogável;
 *  - demais: null (o cadastro do contrato não traz a informação — não se afirma nada).
 */
export function indicacaoProrrogacao(c: {
  modalidade_execucao?: string | null;
  data_vigencia_inicio?: string | null;
  data_vigencia_fim?: string | null;
}): IndicacaoProrrogacao | null {
  if (c.modalidade_execucao !== 'CONTINUADO') return null;
  if (c.data_vigencia_inicio && c.data_vigencia_fim) {
    const ini = String(c.data_vigencia_inicio).slice(0, 10);
    const limite = `${Number(ini.slice(0, 4)) + LIMITE_ANOS_ART107}${ini.slice(4)}`;
    if (String(c.data_vigencia_fim).slice(0, 10) >= limite) return 'NAO_PRORROGAVEL';
  }
  return 'CONTINUO_ART107';
}

export const TEXTO_PRORROGACAO: Record<IndicacaoProrrogacao, string> = {
  CONTINUO_ART107: 'Serviço contínuo — pode prorrogar (art. 107)',
  NAO_PRORROGAVEL: 'Não prorrogável',
};

// ---------------------------------------------------------------------------
// Texto e rótulos
// ---------------------------------------------------------------------------

/** Texto em uma linha, cortado na palavra, com reticências (~70 caracteres). */
export function resumirTexto(texto: string | null | undefined, max = 70): string {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** Nome curto da modalidade para a TV. */
export const MODALIDADE_CURTA: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão',
  PREGAO_PRESENCIAL: 'Pregão presencial',
  CONCORRENCIA: 'Concorrência',
  CONCORRENCIA_ELETRONICA: 'Concorrência',
  CONCURSO: 'Concurso',
  LEILAO: 'Leilão',
  DIALOGO_COMPETITIVO: 'Diálogo competitivo',
  DISPENSA_ELETRONICA: 'Dispensa',
  DISPENSA: 'Dispensa',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CREDENCIAMENTO: 'Credenciamento',
};

export function modalidadeCurta(m: string | null | undefined): string {
  return MODALIDADE_CURTA[String(m)] ?? String(m ?? '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

/** "PA 139/2025 · Dispensa 029/2025" (sem o número da modalidade: só o PA). */
export function numeroDoProcesso(p: { numero_processo?: string | null; numero_edital?: string | null; modalidade?: string | null }): string {
  const pa = p.numero_processo ? `PA ${p.numero_processo}` : 'PA —';
  return p.numero_edital ? `${pa} · ${modalidadeCurta(p.modalidade)} ${p.numero_edital}` : pa;
}

// ---------------------------------------------------------------------------
// Campos que NUNCA saem na TV (a tela fica exposta a quem passa)
// ---------------------------------------------------------------------------

/**
 * Chaves proibidas no JSON do painel — valores de processo (o orçamento pode
 * ser sigiloso, art. 24), dados de propostas/lances/licitantes (sigilo até a
 * abertura), textos de pareceres, diligências e achados, e dados pessoais
 * (CPF, e-mail, telefone). O JSON é montado por lista branca; esta lista é a
 * segunda barreira (e a conferência dos testes).
 */
export const CHAVES_PROIBIDAS = [
  'valor_total_estimado',
  'valor_estimado',
  'valor_unitario_estimado',
  'valor_referencia',
  'valor_homologado',
  'valor_proposta',
  'valor_lance',
  'propostas',
  'proposta',
  'lances',
  'lance',
  'fornecedores',
  'licitantes',
  'participantes',
  'quantidade_propostas',
  'total_propostas',
  'cpf',
  'cpf_cnpj',
  'cnpj',
  'fornecedor_cnpj',
  'engenheiro_cpf',
  'email',
  'telefone',
  'whatsapp',
  'celular',
  'parecer',
  'texto',
  'conteudo',
  'mensagem',
  'descricao',
  'evidencias',
  'trecho',
  'diligencias',
  'achados',
  'justificativa',
  'justificativa_sigilo',
  'fundamentacao',
  'motivo',
  'senha',
  'token',
  'token_hash',
] as const;

const PROIBIDAS = new Set<string>(CHAVES_PROIBIDAS);

/** Caminhos das chaves proibidas encontradas (vazio = limpo). */
export function chavesProibidasEm(valor: unknown, caminho = '$'): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => chavesProibidasEm(v, `${caminho}[${i}]`));
  if (!valor || typeof valor !== 'object' || valor instanceof Date) return [];
  const achadas: string[] = [];
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (PROIBIDAS.has(k)) achadas.push(`${caminho}.${k}`);
    achadas.push(...chavesProibidasEm(v, `${caminho}.${k}`));
  }
  return achadas;
}

/** Cópia sem as chaves proibidas (em qualquer nível). */
export function removerChavesProibidas<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((v) => removerChavesProibidas(v)) as unknown as T;
  if (!valor || typeof valor !== 'object' || valor instanceof Date) return valor;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (PROIBIDAS.has(k)) continue;
    saida[k] = removerChavesProibidas(v);
  }
  return saida as T;
}

// ---------------------------------------------------------------------------
// Limite de requisições por token e cache curto
// ---------------------------------------------------------------------------

/**
 * Limite por chave em janela fixa (ex.: 30 requisições por minuto por token).
 * Em memória do processo; as janelas vencidas são descartadas quando o mapa
 * cresce (não acumula estado com a TV ligada por dias).
 */
export class LimitadorPorChave {
  private readonly janelas = new Map<string, { inicio: number; n: number }>();

  constructor(
    private readonly limite: number,
    private readonly janelaMs: number,
    private readonly maxChaves = 5000,
  ) {}

  permitir(chave: string, agoraMs: number = Date.now()): boolean {
    const j = this.janelas.get(chave);
    if (!j || agoraMs - j.inicio >= this.janelaMs) {
      if (this.janelas.size >= this.maxChaves) this.limpar(agoraMs);
      this.janelas.set(chave, { inicio: agoraMs, n: 1 });
      return true;
    }
    j.n++;
    return j.n <= this.limite;
  }

  private limpar(agoraMs: number) {
    for (const [k, j] of this.janelas) if (agoraMs - j.inicio >= this.janelaMs) this.janelas.delete(k);
    // Ainda cheio (ataque com muitas chaves): descarta as mais antigas
    if (this.janelas.size >= this.maxChaves) {
      const sobra = this.janelas.size - Math.floor(this.maxChaves / 2);
      let i = 0;
      for (const k of this.janelas.keys()) {
        if (i++ >= sobra) break;
        this.janelas.delete(k);
      }
    }
  }

  get tamanho(): number {
    return this.janelas.size;
  }
}

/** Cache curto por chave (o painel do órgão, de 30 a 60 s). */
export class CacheCurto<T> {
  private readonly itens = new Map<string, { valor: T; expira: number }>();

  constructor(private readonly ttlMs: number) {}

  obter(chave: string, agoraMs: number = Date.now()): T | undefined {
    const i = this.itens.get(chave);
    if (!i) return undefined;
    if (agoraMs >= i.expira) {
      this.itens.delete(chave);
      return undefined;
    }
    return i.valor;
  }

  guardar(chave: string, valor: T, agoraMs: number = Date.now(), ttlMs: number = this.ttlMs): void {
    if (ttlMs <= 0) return;
    for (const [k, i] of this.itens) if (agoraMs >= i.expira) this.itens.delete(k);
    this.itens.set(chave, { valor, expira: agoraMs + ttlMs });
  }

  descartar(chave: string): void {
    this.itens.delete(chave);
  }
}
