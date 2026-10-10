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

/** Tela da fase interna de cada etapa (rota em /orgao/processos/<licitacao>/fase-interna/<rota>). */
export const ROTA_DA_ETAPA: Record<string, string> = {
  DEMANDA: 'dfd',
  DFD: 'dfd',
  PESQUISA_PRECO: 'pesquisa',
  ETP: 'etp',
  MAPA_RISCOS: 'etp',
  TR: 'tr',
  RESERVA_ORCAMENTARIA: 'reserva',
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
  PARECER_JURIDICO: 'PJ',
  CONTROLE_INTERNO: 'MCI',
  AUTORIZACAO: 'AA',
};

/** Situações do documento da fase interna que contam como pronto. */
export const STATUS_PRONTO = ['APROVADO', 'ASSINADO', 'IMPORTADO'];

export interface EstadoNaFaseInterna {
  /** Documento da etapa: versão atual pronta (ou marcada "não se aplica" na tela da fase interna). */
  documentoPronto: boolean;
  /** A licitação já saiu da fase interna (publicada). */
  publicada: boolean;
  /** Há demanda ligada (demanda da licitação ou DFD consolidado). */
  temDemanda: boolean;
}

const ROTULO: Record<string, string> = {
  DFD: 'o DFD',
  PESQUISA_PRECO: 'a pesquisa de preço',
  ETP: 'o ETP',
  MAPA_RISCOS: 'a análise de riscos',
  TR: 'o termo de referência',
  RESERVA_ORCAMENTARIA: 'a reserva orçamentária',
  PARECER_JURIDICO: 'o parecer jurídico',
  CONTROLE_INTERNO: 'a manifestação do controle interno',
  AUTORIZACAO: 'a autorização',
};

/** O que falta para concluir a etapa da contratação, lendo o estado da fase interna. */
export function pendenciasDaPonte(tipoNo: string, e: EstadoNaFaseInterna): string[] {
  const tipo = String(tipoNo).toUpperCase();
  if (tipo === 'DEMANDA') return e.temDemanda ? [] : ['Vincule a demanda à contratação (tela do DFD).'];
  if (tipo === 'PUBLICACAO') return e.publicada ? [] : ['A contratação ainda não foi publicada: gere e divulgue o aviso/edital na tela da licitação.'];
  if (DOCUMENTO_DA_ETAPA[tipo]) {
    return e.documentoPronto ? [] : [`Conclua ${ROTULO[tipo] ?? 'o documento'} na tela da fase interna (aprovado, assinado, anexado ou marcado como "não se aplica").`];
  }
  return [];
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
