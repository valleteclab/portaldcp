/**
 * PONTE FLUXO NOVO ↔ FASE INTERNA (decisão do dono de 07/10/2026, opção A).
 *
 * Na contratação, o fluxo desenhado COMANDA (quem faz, prazo, quando
 * conclui) e cada etapa abre a TELA DA FASE INTERNA que já existe (DFD,
 * pesquisa de preço, ETP, TR, reserva, parecer, autorização…). A etapa só
 * conclui quando o documento daquela tela estiver pronto. Enquanto o fluxo
 * anda, as tarefas automáticas e o envio automático da fase interna ficam
 * desligados para aquela licitação (um motor só).
 *
 * Regras puras + uma consulta reaproveitada pela fase interna (sem DI).
 */

import { PRONTA_NA_INSTRUCAO, statusDaPeca } from '../../fase-interna/peca-regras';

/** Tela da fase interna de cada etapa (rota em /orgao/processos/<licitacao>/fase-interna/<rota>). */
export const ROTA_DA_ETAPA: Record<string, string> = {
  DEMANDA: 'dfd',
  DFD: 'dfd',
  PESQUISA_PRECO: 'pesquisa',
  ETP: 'etp',
  MAPA_RISCOS: 'etp',
  TR: 'tr',
  RESERVA_ORCAMENTARIA: 'reserva',
  MINUTAS: 'minutas',
  PARECER_JURIDICO: 'parecer',
  CONTROLE_INTERNO: 'controle-interno',
  AUTORIZACAO: 'autorizacao',
};

/** Documento da fase interna (tipo em `documentos_fase_interna`) que conclui a etapa. */
export const DOCUMENTO_DA_ETAPA: Record<string, string> = {
  DFD: 'DFD',
  PESQUISA_PRECO: 'PP',
  ETP: 'ETP',
  MAPA_RISCOS: 'AR',
  TR: 'TR',
  RESERVA_ORCAMENTARIA: 'DO',
  MINUTAS: 'RAG',
  PARECER_JURIDICO: 'PJ',
  CONTROLE_INTERNO: 'MCI',
  AUTORIZACAO: 'AA',
};

/**
 * O documento da etapa conta como pronto pelo MESMO critério da instrução da
 * contratação (`statusDaPeca`, peca-regras.ts): gerado/emitido no sistema,
 * anexado, aprovado ou assinado — ou "não se aplica" ONDE a regra permite
 * (contratação direta, peça "se for o caso"). Assinatura é opcional, salvo peça
 * que só vale assinada. A aprovação interna (motor que sai no passo 5) não é
 * lida aqui: com ela ligada a peça emitida vai sozinha para AGUARDANDO_APROVACAO,
 * que já não conta.
 */
export function documentoProntoParaAPonte(doc: Parameters<typeof statusDaPeca>[0], regras: { pode_nao_se_aplicar: boolean }): boolean {
  return PRONTA_NA_INSTRUCAO.has(statusDaPeca(doc, { pode_nao_se_aplicar: regras.pode_nao_se_aplicar }));
}

/**
 * Peças que a etapa leva junto (11/2026): a análise de riscos mora na tela do ETP
 * e a trava do art. 72, I a cobra na autorização — sem etapa própria de Mapa de
 * riscos no fluxo, o ETP só conclui com ela resolvida (feita, anexada ou "não se
 * aplica" onde a lei permite). Senão o processo trava na autorização sem ninguém
 * na vez de resolver.
 */
export const PECAS_JUNTAS_DA_ETAPA: Record<string, Array<{ tipo: string; rotulo: string }>> = {
  ETP: [{ tipo: 'AR', rotulo: 'a análise de riscos (na tela do ETP: faça, anexe ou marque "não se aplica")' }],
};

export interface EstadoNaFaseInterna {
  /** Documento da etapa: versão atual pronta (ou marcada "não se aplica" na tela da fase interna). */
  documentoPronto: boolean;
  /** A licitação já saiu da fase interna (publicada). */
  publicada: boolean;
  /** Há demanda ligada (demanda da licitação ou DFD consolidado). */
  temDemanda: boolean;
  /**
   * TRAVAS DA LEI (13/10/2026, "um motor só", passo 3): bloqueios do portão da
   * conformidade para o ato da etapa — B (art. 72) na AUTORIZACAO, C na
   * PUBLICACAO. O fluxo não conclui a etapa com a trava armada.
   */
  travasDaLei?: string[];
  /** Rótulos das peças juntas da etapa (PECAS_JUNTAS_DA_ETAPA) que ainda não estão prontas. */
  pecasJuntasPendentes?: string[];
}

const ROTULO: Record<string, string> = {
  DFD: 'o DFD',
  PESQUISA_PRECO: 'a pesquisa de preço',
  ETP: 'o ETP',
  MAPA_RISCOS: 'a análise de riscos',
  TR: 'o termo de referência',
  RESERVA_ORCAMENTARIA: 'a reserva orçamentária',
  MINUTAS: 'o relatório do agente',
  PARECER_JURIDICO: 'o parecer jurídico',
  CONTROLE_INTERNO: 'a manifestação do controle interno',
  AUTORIZACAO: 'a autorização',
};

/**
 * Tipos de etapa que a ponte resolve lendo a fase interna. Os demais (Documento,
 * Tarefa, Aprovação…) seguem a regra geral do motor: o documento da etapa é a peça
 * juntada aos autos com `etapa = 'no:<acao_id>'`.
 */
export function etapaDaPonte(tipoNo: string): boolean {
  const tipo = String(tipoNo).toUpperCase();
  return tipo === 'DEMANDA' || tipo === 'PUBLICACAO' || !!DOCUMENTO_DA_ETAPA[tipo];
}

/** O que falta para concluir a etapa da contratação, lendo o estado da fase interna. */
export function pendenciasDaPonte(tipoNo: string, e: EstadoNaFaseInterna): string[] {
  const tipo = String(tipoNo).toUpperCase();
  const travas = (e.travasDaLei ?? []).map((t) => `Trava da lei: ${t}`);
  if (tipo === 'DEMANDA') return e.temDemanda ? [] : ['Vincule a demanda à contratação (tela do DFD).'];
  if (tipo === 'PUBLICACAO') return e.publicada ? [] : [...travas, 'A contratação ainda não foi publicada: gere e divulgue o aviso/edital na tela da licitação.'];
  if (DOCUMENTO_DA_ETAPA[tipo]) {
    const doc = e.documentoPronto ? [] : [`Conclua ${ROTULO[tipo] ?? 'o documento'} na tela da fase interna: gere ou anexe o documento, ou marque "não se aplica".`];
    const juntas = (e.pecasJuntasPendentes ?? []).map((r) => `Falta ${r}.`);
    return [...travas, ...doc, ...juntas];
  }
  return [];
}

/** Portão da conformidade que segura o ato da etapa (B = autorizar, C = publicar); nulo = etapa sem trava. */
export function portaoDaEtapa(tipoNo: string): { portao: 'B' | 'C'; ato: 'AUTORIZAR' | 'PUBLICAR' } | null {
  const tipo = String(tipoNo).toUpperCase();
  if (tipo === 'AUTORIZACAO') return { portao: 'B', ato: 'AUTORIZAR' };
  if (tipo === 'PUBLICACAO') return { portao: 'C', ato: 'PUBLICAR' };
  return null;
}

type Consulta = (sql: string, params: unknown[]) => Promise<any[]>;

/**
 * A licitação é conduzida por um fluxo desenhado em andamento? Usada pela
 * fase interna para não gerar tarefas nem mover a posse por conta própria.
 */
export async function licitacaoConduzidaPeloFluxo(consulta: Consulta, licitacaoId: string): Promise<boolean> {
  const [r] = await consulta(
    `SELECT 1 FROM workflow_instancias i
       JOIN processos p ON p.id = i.vinculo_id AND p.orgao_id = i.orgao_id
      WHERE i.vinculo_tipo = 'PROCESSO' AND i.status = 'EM_ANDAMENTO'
        AND p.referencia_tipo = 'LICITACAO' AND p.referencia_id::text = $1
      LIMIT 1`,
    [licitacaoId],
  );
  return !!r;
}

/**
 * ENVIO FORA DO FLUXO (mockup "Processo enxuto", 10/10/2026): com o fluxo em
 * andamento o processo anda pelas etapas, mas quem está com ele pode mandá-lo a
 * outro setor como exceção (consulta, diligência) — com justificativa, que vai
 * ao despacho nos autos. A etapa do fluxo não muda; quem recebeu devolve.
 */
export const FINALIDADE_FORA_DO_FLUXO = 'Fora do fluxo';
export const JUSTIFICATIVA_MINIMA = 10;

/** Justificativa válida (já aparada) ou nulo. */
export function justificativaForaDoFluxo(v: unknown): string | null {
  const t = String(v ?? '').trim().slice(0, 2000);
  return t.length >= JUSTIFICATIVA_MINIMA ? t : null;
}

/** Texto do despacho do envio fora do fluxo: a justificativa primeiro, depois o que mais foi escrito. */
export function despachoForaDoFluxo(justificativa: string, despacho?: string | null): string {
  const extra = String(despacho ?? '').trim();
  return `Envio fora do fluxo. Justificativa: ${justificativa}${extra ? `\n\n${extra}` : ''}`.slice(0, 8000);
}

/** A tramitação foi um envio fora do fluxo (quem recebeu pode devolver mesmo com o fluxo andando). */
export function ehEnvioForaDoFluxo(t: { finalidade?: string | null } | null | undefined): boolean {
  return String(t?.finalidade ?? '').trim() === FINALIDADE_FORA_DO_FLUXO;
}

// ---------------------------------------------------------------------------
// SÓ A ETAPA ATUAL EDITA (decisão do dono, 12/10/2026): conduzido pelo fluxo,
// a peça só pode ser trabalhada quando a etapa dela é a que está em andamento.
// Etapa concluída: corrigir pede devolução; etapa futura: espera a vez.
// ---------------------------------------------------------------------------

/** Passo da fase interna (códigos de `codigos.ts`) que cada nó do fluxo trabalha. */
export const PASSO_DO_NO: Record<string, string> = {
  DEMANDA: 'DFD',
  DFD: 'DFD',
  ETP: 'ETP',
  MAPA_RISCOS: 'ETP',
  PESQUISA_PRECO: 'PESQUISA',
  TR: 'TR',
  RESERVA_ORCAMENTARIA: 'RESERVA',
  DEFINICAO_MODALIDADE: 'INDICACAO_MODALIDADE',
  MINUTAS: 'MINUTAS',
  PARECER_JURIDICO: 'PARECER',
  CONTROLE_INTERNO: 'CONTROLE_INTERNO',
  AUTORIZACAO: 'AUTORIZACAO',
  PUBLICACAO: 'PUBLICACAO',
};

export interface PassoDaExecucao {
  tipo: string;
  nome: string;
  /** Posição no desenho (1 = primeira etapa). */
  ordem: number;
  situacao: 'CONCLUIDA' | 'EM_ANDAMENTO' | 'A_REALIZAR';
}

export type VezDoPasso =
  | { situacao: 'ATUAL' }
  | { situacao: 'FORA' }
  | { situacao: 'CONCLUIDA'; etapa: { nome: string; ordem: number } }
  | { situacao: 'FUTURA'; etapa: { nome: string; ordem: number }; atual: { nome: string; ordem: number } | null };

/**
 * A vez de um passo da fase interna na execução do fluxo. FORA = nenhum nó do
 * desenho trabalha esse passo (documento "se for o caso"): segue a regra de
 * sempre. Com mais de um nó para o mesmo passo (ETP e Mapa de riscos), basta
 * que um esteja em andamento.
 */
export function vezDoPasso(passos: PassoDaExecucao[], codigoPasso: string): VezDoPasso {
  const meus = passos.filter((p) => PASSO_DO_NO[String(p.tipo).toUpperCase()] === codigoPasso);
  if (!meus.length) return { situacao: 'FORA' };
  if (meus.some((p) => p.situacao === 'EM_ANDAMENTO')) return { situacao: 'ATUAL' };
  const atual = passos.find((p) => p.situacao === 'EM_ANDAMENTO') ?? null;
  const futura = meus.find((p) => p.situacao === 'A_REALIZAR');
  if (futura) return { situacao: 'FUTURA', etapa: { nome: futura.nome, ordem: futura.ordem }, atual: atual ? { nome: atual.nome, ordem: atual.ordem } : null };
  const ultima = meus[meus.length - 1];
  return { situacao: 'CONCLUIDA', etapa: { nome: ultima.nome, ordem: ultima.ordem } };
}

/** Texto do "Somente leitura" quando a peça não é da etapa atual. */
export function motivoForaDaVez(vez: VezDoPasso, tituloPeca: string): string | null {
  if (vez.situacao === 'CONCLUIDA') return `"${tituloPeca}" é da etapa ${vez.etapa.ordem} (${vez.etapa.nome}), já concluída no fluxo. Para alterar, peça a devolução da etapa na tela do processo.`;
  if (vez.situacao === 'FUTURA') return `"${tituloPeca}" é da etapa ${vez.etapa.ordem} (${vez.etapa.nome}) do fluxo${vez.atual ? `; o processo está na etapa ${vez.atual.ordem} (${vez.atual.nome})` : ''}. Ela fica disponível quando o fluxo chegar nela.`;
  return null;
}
