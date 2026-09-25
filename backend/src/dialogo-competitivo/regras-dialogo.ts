import { CalendarioDiasUteis, calendarioDoOrgao, fimDoPrazoEmDiasUteis, inicioDoDia } from '../common/prazos/dias-uteis';
import { motivoModoCriterioInvalido } from '../disputa-v2/modos-disputa';
import { motivoModalidadeCriterioInvalido } from '../modalidades-especiais/perfil-modalidade';

/**
 * ============================================================================
 * DIÁLOGO COMPETITIVO — regras PURAS (Lei 14.133/2021 art. 32; plano E7c)
 * ============================================================================
 * Art. 32 caput: restrito às contratações em que a Administração
 *   I  vise a objeto com: a) inovação tecnológica ou técnica; b) impossibilidade
 *      de ter a necessidade satisfeita sem adaptar soluções disponíveis no
 *      mercado; c) impossibilidade de definir as especificações técnicas com
 *      precisão suficiente;
 *   II verifique a necessidade de definir e identificar os meios e as
 *      alternativas quanto a: a) a solução técnica mais adequada; b) os
 *      requisitos técnicos aptos a concretizar a solução já definida; c) a
 *      estrutura jurídica ou financeira do contrato.
 * §1º: I necessidades + exigências no edital, prazo ≥ 25 dias úteis para
 * manifestação de interesse; II critérios de pré-seleção no edital, admitidos
 * TODOS os que preencherem os requisitos objetivos; III vedada divulgação
 * discriminatória; IV não revelar soluções/informações sigilosas de um
 * licitante aos outros sem consentimento; V diálogo até a decisão
 * fundamentada que identifique a(s) solução(ões); VI reuniões registradas em
 * ata e gravadas em áudio e vídeo; VII fases sucessivas possíveis; VIII ao
 * concluir, juntar registros e gravações, divulgar edital da fase competitiva
 * (especificação da solução + critérios objetivos) e prazo ≥ 60 dias úteis
 * para as propostas dos pré-selecionados; IX esclarecimentos/ajustes sem
 * discriminação; X vencedora pelos critérios divulgados no início da fase
 * competitiva; XI comissão de contratação com pelo menos 3 servidores
 * efetivos ou empregados públicos dos quadros permanentes (admitido
 * assessoramento técnico contratado). §2º: assessores assinam termo de
 * confidencialidade e se abstêm de conflito de interesses.
 */

export const DIAS_UTEIS_MANIFESTACAO = 25; // §1º I
export const DIAS_UTEIS_FASE_COMPETITIVA = 60; // §1º VIII
export const MINIMO_COMISSAO_EFETIVOS = 3; // §1º XI
export const TAMANHO_MINIMO_MOTIVACAO = 20;

export const HIPOTESES_ART32: Record<string, string> = {
  I_A: 'Art. 32, I, a — inovação tecnológica ou técnica',
  I_B: 'Art. 32, I, b — necessidade não satisfeita sem adaptar soluções do mercado',
  I_C: 'Art. 32, I, c — especificações técnicas não definíveis com precisão suficiente',
  II_A: 'Art. 32, II, a — definir a solução técnica mais adequada',
  II_B: 'Art. 32, II, b — definir os requisitos técnicos da solução já definida',
  II_C: 'Art. 32, II, c — definir a estrutura jurídica ou financeira do contrato',
};

const vazio = (v: unknown) => !String(v ?? '').trim();

export interface ConfiguracaoDialogoEntrada {
  hipoteses?: string[] | null;
  justificativa_hipotese?: string | null;
  necessidades?: string | null;
  exigencias_definidas?: string | null;
  criterios_preselecao?: Array<{ id?: string; descricao: string }> | null;
}

/** Hipótese I exige as três condições (a, b e c — "envolva as seguintes condições"); II exige ao menos um aspecto. */
export function validarConfiguracaoDialogo(c: ConfiguracaoDialogoEntrada): string[] {
  const e: string[] = [];
  const h = (c.hipoteses ?? []).map(String);
  const invalidas = h.filter((x) => !HIPOTESES_ART32[x]);
  if (invalidas.length) e.push(`Hipótese(s) inválida(s): ${invalidas.join(', ')}.`);
  const temI = h.some((x) => x.startsWith('I_'));
  const temII = h.some((x) => x.startsWith('II_'));
  if (!temI && !temII) e.push('Indique a hipótese legal do diálogo competitivo (art. 32, I ou II).');
  if (temI && !['I_A', 'I_B', 'I_C'].every((x) => h.includes(x))) {
    e.push('A hipótese do art. 32, I exige as TRÊS condições (alíneas a, b e c).');
  }
  if (vazio(c.justificativa_hipotese)) e.push('Justifique o enquadramento na hipótese do art. 32.');
  if (vazio(c.necessidades)) e.push('Descreva as necessidades da Administração (art. 32, §1º, I).');
  if (vazio(c.exigencias_definidas)) e.push('Informe as exigências já definidas (art. 32, §1º, I) — ou "nenhuma além das do edital".');
  const crit = (c.criterios_preselecao ?? []).filter((x) => !vazio(x?.descricao));
  if (!crit.length) e.push('Defina os critérios objetivos de pré-seleção (art. 32, §1º, II).');
  return e;
}

/** Etapa efetiva: a gravada, ou PRE_SELECAO quando a manifestação terminou (fase ANALISE_PROPOSTAS). */
export function etapaEfetiva(etapa: string | null | undefined, fase: string | null | undefined): string {
  const e = String(etapa ?? 'MANIFESTACAO');
  if (e === 'MANIFESTACAO' && fase === 'ANALISE_PROPOSTAS') return 'PRE_SELECAO';
  return e;
}

/** §1º II — pré-selecionado quem atende TODOS os critérios; não selecionado precisa de motivo e de critério não atendido. */
export function motivoDecisaoPreSelecaoInvalida(p: {
  decisao: string;
  criteriosAtendidos: string[];
  criteriosDoEdital: string[];
  motivo?: string | null;
}): string | null {
  const atende = p.criteriosDoEdital.every((c) => p.criteriosAtendidos.includes(c));
  if (p.decisao === 'PRE_SELECIONADO') {
    if (!atende) return 'Pré-seleção só de quem atende todos os critérios objetivos do edital (art. 32, §1º, II).';
    return null;
  }
  if (p.decisao === 'NAO_SELECIONADO') {
    if (atende) return 'Quem atende todos os critérios objetivos deve ser admitido (art. 32, §1º, II: "serão admitidos todos os interessados que preencherem os requisitos").';
    if (String(p.motivo ?? '').trim().length < 10) return 'Informe o motivo da não seleção (mínimo 10 caracteres).';
    return null;
  }
  return 'Decisão inválida: PRE_SELECIONADO ou NAO_SELECIONADO.';
}

/** §1º XI e §2º — comissão. */
export function pendenciasComissao(membros: Array<{ vinculo: string; papel?: string; nome?: string; termo_confidencialidade_em?: Date | string | null }>): string[] {
  const p: string[] = [];
  const efetivos = membros.filter((m) => m.vinculo === 'EFETIVO' || m.vinculo === 'EMPREGADO_PERMANENTE').length;
  if (efetivos < MINIMO_COMISSAO_EFETIVOS) {
    p.push(`A comissão de contratação precisa de pelo menos ${MINIMO_COMISSAO_EFETIVOS} servidores efetivos ou empregados públicos permanentes (art. 32, §1º, XI) — há ${efetivos}.`);
  }
  for (const m of membros.filter((x) => x.vinculo === 'ASSESSOR_CONTRATADO' && !x.termo_confidencialidade_em)) {
    p.push(`Assessor ${m.nome ?? ''}: termo de confidencialidade e de ausência de conflito de interesses pendente (art. 32, §2º).`.replace('  ', ' '));
  }
  return p;
}

/** Iniciar a fase de diálogo: pré-seleção concluída, ≥ 1 pré-selecionado, comissão válida. */
export function pendenciasInicioDialogo(p: {
  etapa: string;
  participantes: Array<{ situacao: string }>;
  comissao: Array<{ vinculo: string; papel?: string; nome?: string; termo_confidencialidade_em?: Date | string | null }>;
}): string[] {
  const pend: string[] = [];
  if (p.etapa !== 'PRE_SELECAO') pend.push('A fase de diálogo começa depois da pré-seleção (fim do prazo de manifestação de interesse).');
  const pendentes = p.participantes.filter((x) => x.situacao === 'INTERESSADO').length;
  if (pendentes) pend.push(`${pendentes} manifestação(ões) de interesse sem decisão de pré-seleção.`);
  if (!p.participantes.some((x) => x.situacao === 'PRE_SELECIONADO')) pend.push('Nenhum licitante pré-selecionado — sem diálogo possível (declare a licitação deserta/fracassada).');
  pend.push(...pendenciasComissao(p.comissao));
  return pend;
}

/** §1º V, VI e VIII — conclusão do diálogo. */
export function pendenciasConclusaoDialogo(p: {
  etapa: string;
  comissao: Array<{ vinculo: string; papel?: string; nome?: string; termo_confidencialidade_em?: Date | string | null }>;
  reunioes: Array<{ status: string; ata_texto?: string | null; ata_arquivo?: string | null; gravacao_arquivo?: string | null; gravacao_link?: string | null; rotulo?: string }>;
  solucaoIdentificada?: string | null;
  somenteAvaliacao?: boolean;
  /** Pendências de pedidos de reconsideração da não seleção (art. 165, II). */
  reconsideracoes?: string[];
}): string[] {
  const pend: string[] = [...(p.reconsideracoes ?? [])];
  if (p.etapa !== 'DIALOGO') pend.push('A conclusão só cabe durante a fase de diálogo.');
  pend.push(...pendenciasComissao(p.comissao));
  const realizadas = p.reunioes.filter((r) => r.status === 'REALIZADA');
  if (!realizadas.length) pend.push('Nenhuma reunião de diálogo realizada e registrada (art. 32, §1º, VI).');
  const abertas = p.reunioes.filter((r) => r.status === 'AGENDADA').length;
  if (abertas) pend.push(`${abertas} reunião(ões) agendada(s) sem registro — registre (ata e gravação) ou cancele.`);
  for (const r of realizadas) {
    if (vazio(r.ata_texto) && vazio(r.ata_arquivo)) pend.push(`${r.rotulo ?? 'Reunião'}: sem ata (art. 32, §1º, VI).`);
    if (vazio(r.gravacao_arquivo) && vazio(r.gravacao_link)) pend.push(`${r.rotulo ?? 'Reunião'}: sem gravação em áudio e vídeo (art. 32, §1º, VI).`);
  }
  if (!p.somenteAvaliacao && vazio(p.solucaoIdentificada)) pend.push('Descreva a(s) solução(ões) identificada(s) (art. 32, §1º, V).');
  return pend;
}

export interface DadosFaseCompetitiva {
  especificacao_solucao?: string | null;
  criterios_selecao?: string | null;
  criterio_julgamento?: string | null;
  modo_disputa?: string | null;
  data_inicio_acolhimento?: string | Date | null;
  data_fim_acolhimento?: string | Date | null;
  data_abertura_sessao?: string | Date | null;
}

const dt = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Primeira data admitida para o fim das propostas: 00:00 do 60º dia útil depois da divulgação (art. 183 — mesma leitura do art. 55). */
export function minimoFaseCompetitiva(divulgacao: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): Date {
  return inicioDoDia(fimDoPrazoEmDiasUteis(divulgacao, DIAS_UTEIS_FASE_COMPETITIVA, cal));
}

/** §1º VIII — edital da fase competitiva: solução, critérios objetivos, critério/modo válidos e ≥ 60 dias úteis. */
export function pendenciasFaseCompetitiva(p: {
  etapa: string;
  dados: DadosFaseCompetitiva;
  agora: Date;
  cal?: CalendarioDiasUteis;
  temEdital: boolean;
  somenteAvaliacao?: boolean;
}): string[] {
  const pend: string[] = [];
  if (p.etapa !== 'CONCLUIDO') pend.push('A fase competitiva só se abre depois da conclusão motivada do diálogo (art. 32, §1º, V e VIII).');
  if (p.somenteAvaliacao) return pend;
  const d = p.dados || {};
  if (!p.temEdital) pend.push('Anexe o edital da fase competitiva (PDF) com a especificação da solução (art. 32, §1º, VIII).');
  if (vazio(d.especificacao_solucao)) pend.push('Informe a especificação da solução que atende às necessidades (art. 32, §1º, VIII).');
  if (vazio(d.criterios_selecao)) pend.push('Informe os critérios objetivos de seleção da proposta mais vantajosa (art. 32, §1º, VIII e X).');
  const criterio = String(d.criterio_julgamento ?? '');
  if (!criterio) pend.push('Informe o critério de julgamento da fase competitiva (art. 33).');
  else {
    const m = motivoModalidadeCriterioInvalido('DIALOGO_COMPETITIVO', criterio) ?? motivoModoCriterioInvalido(d.modo_disputa ?? 'ABERTO', criterio);
    if (m) pend.push(m);
  }
  const fim = dt(d.data_fim_acolhimento);
  const abertura = dt(d.data_abertura_sessao);
  const inicio = dt(d.data_inicio_acolhimento);
  if (!fim || !abertura) pend.push('Informe o fim do recebimento das propostas e a abertura da sessão da fase competitiva.');
  const minimo = minimoFaseCompetitiva(p.agora, p.cal);
  const fmt = (x: Date) => x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  for (const [rotulo, data] of [
    ['o fim do recebimento das propostas', fim],
    ['a abertura da sessão', abertura],
  ] as Array<[string, Date | null]>) {
    if (data && data.getTime() < minimo.getTime()) {
      pend.push(`Prazo mínimo de ${DIAS_UTEIS_FASE_COMPETITIVA} dias úteis para as propostas da fase competitiva (art. 32, §1º, VIII): ${rotulo} a partir de ${fmt(minimo)}.`);
    }
  }
  if (inicio && fim && inicio.getTime() >= fim.getTime()) pend.push('O início do recebimento deve ser anterior ao fim.');
  if (fim && abertura && fim.getTime() > abertura.getTime()) pend.push('O recebimento deve terminar até a abertura da sessão.');
  return pend;
}

// ---------------------------------------------------------------------------
// PEDIDO DE RECONSIDERAÇÃO da não seleção (Lei 14.133/2021, art. 165, II)
// ---------------------------------------------------------------------------
// A não seleção na pré-seleção do diálogo não está entre os atos do art. 165 I
// (recurso); cabe o PEDIDO DE RECONSIDERAÇÃO do art. 165 II: "no prazo de 3
// (três) dias úteis, contado da data de intimação, relativamente a ato do qual
// não caiba recurso hierárquico". A lei não fixa prazo para a decisão do
// pedido: a plataforma adota 3 dias úteis (analogia com o art. 165 §2º) —
// prazo SINALIZADO quando vencido, nunca decisão automática.

export const DIAS_UTEIS_PEDIDO_RECONSIDERACAO = 3; // art. 165, II
export const DIAS_UTEIS_DECISAO_RECONSIDERACAO = 3; // parâmetro da plataforma (lei omissa)

/** Fim do prazo do pedido: 3 dias úteis da intimação (decisão de não seleção), art. 183. */
export function prazoPedidoReconsideracao(intimacao: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): Date {
  return fimDoPrazoEmDiasUteis(intimacao, DIAS_UTEIS_PEDIDO_RECONSIDERACAO, cal);
}

export function motivoPedidoReconsideracaoInvalido(p: {
  situacao: string;
  etapa: string;
  jaPediu: boolean;
  intimacao: Date | null;
  agora: Date;
  razoes: string | null | undefined;
  cal?: CalendarioDiasUteis;
}): string | null {
  if (p.situacao !== 'NAO_SELECIONADO') return 'O pedido de reconsideração cabe contra a NÃO seleção na pré-seleção (art. 165, II).';
  if (p.jaPediu) return 'Pedido de reconsideração já apresentado.';
  if (!['PRE_SELECAO', 'DIALOGO'].includes(p.etapa)) return 'A fase de diálogo já foi concluída — não cabe mais o pedido.';
  if (!p.intimacao) return 'Decisão de não seleção sem data de intimação.';
  const fim = prazoPedidoReconsideracao(p.intimacao, p.cal);
  if (p.agora.getTime() > fim.getTime()) return 'Prazo de 3 dias úteis do pedido de reconsideração encerrado (art. 165, II).';
  if (String(p.razoes ?? '').trim().length < 20) return 'Apresente as razões do pedido de reconsideração (mínimo 20 caracteres).';
  return null;
}

/** Pendências de reconsideração que impedem concluir o diálogo (pedido em análise ou prazo do pedido em curso). */
export function pendenciasReconsideracao(
  participantes: Array<{ situacao: string; decidido_em?: Date | string | null; reconsideracao_status?: string | null; rotulo?: string }>,
  agora: Date,
  cal?: CalendarioDiasUteis,
): string[] {
  const p: string[] = [];
  for (const x of participantes) {
    if (x.reconsideracao_status === 'PENDENTE') {
      p.push(`${x.rotulo ?? 'Interessado'}: pedido de reconsideração da não seleção aguardando decisão (art. 165, II).`);
    } else if (x.situacao === 'NAO_SELECIONADO' && !x.reconsideracao_status && x.decidido_em) {
      const fim = prazoPedidoReconsideracao(new Date(x.decidido_em), cal);
      if (agora.getTime() <= fim.getTime()) p.push(`${x.rotulo ?? 'Interessado'}: prazo do pedido de reconsideração em curso (art. 165, II).`);
    }
  }
  return p;
}
