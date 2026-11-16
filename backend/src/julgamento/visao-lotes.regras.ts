/**
 * SALA POR FASES (dono, 09/11/2026 — referência de organização: BLL): cada
 * lote/item está numa FASE, e a sala lista os lotes por fase (abas). Regras
 * puras: a fase da unidade e a visibilidade dos anexos entre os licitantes.
 */
export type FaseLote =
  | 'AGUARDANDO'
  | 'DISPUTA'
  | 'DESEMPATE'
  | 'JULGAMENTO'
  | 'HABILITACAO'
  | 'RECURSOS'
  | 'EM_ADJUDICACAO'
  | 'ADJUDICADO'
  | 'HOMOLOGADO'
  | 'SEM_RESULTADO';

export const ORDEM_FASES_LOTE: FaseLote[] = [
  'AGUARDANDO',
  'DISPUTA',
  'DESEMPATE',
  'JULGAMENTO',
  'HABILITACAO',
  'RECURSOS',
  'EM_ADJUDICACAO',
  'ADJUDICADO',
  'HOMOLOGADO',
  'SEM_RESULTADO',
];

export const ROTULO_FASE_LOTE: Record<FaseLote, string> = {
  AGUARDANDO: 'Aguardando disputa',
  DISPUTA: 'Disputa',
  DESEMPATE: 'Desempate',
  JULGAMENTO: 'Aceitação e negociação',
  HABILITACAO: 'Habilitação',
  RECURSOS: 'Recursos',
  EM_ADJUDICACAO: 'Em adjudicação',
  ADJUDICADO: 'Adjudicado',
  HOMOLOGADO: 'Homologado',
  SEM_RESULTADO: 'Sem resultado',
};

const SEM_RESULTADO = ['DESERTO', 'FRACASSADO', 'CANCELADO'];

export function faseDoLote(u: {
  encerrada: boolean;
  statusDisputa?: string | null;
  itensStatus: string[];
  ranking: Array<{ situacao: string; excluido: boolean; desempatePendente?: boolean }>;
  recursosPendentes: boolean;
}): FaseLote {
  const itens = u.itensStatus.map((s) => String(s ?? '').toUpperCase());
  if (itens.length && itens.every((s) => SEM_RESULTADO.includes(s))) return 'SEM_RESULTADO';
  if (itens.some((s) => s === 'HOMOLOGADO')) return 'HOMOLOGADO';
  if (itens.some((s) => s === 'ADJUDICADO')) return 'ADJUDICADO';
  if (!u.encerrada) {
    const st = String(u.statusDisputa ?? '').toUpperCase();
    return st === 'EM_DISPUTA' || st === 'TEMPO_ALEATORIO' ? 'DISPUTA' : 'AGUARDANDO';
  }
  const ativos = u.ranking.filter((e) => !e.excluido);
  if (ativos.some((e) => e.situacao === 'CONVOCADO_DESEMPATE' || e.desempatePendente)) return 'DESEMPATE';
  const lider = ativos[0];
  if (!lider) return u.ranking.length ? 'JULGAMENTO' : 'SEM_RESULTADO';
  if (lider.situacao === 'HABILITADO' || lider.situacao === 'VENCEDOR') return u.recursosPendentes ? 'RECURSOS' : 'EM_ADJUDICACAO';
  if (lider.situacao === 'ACEITO') return 'HABILITACAO';
  return 'JULGAMENTO';
}

/**
 * Anexos de um licitante visíveis aos DEMAIS licitantes (dono, 09/11/2026:
 * "os documentos devem ser vistos por todos, depois da habilitação"):
 *  - proposta adequada: depois de decidida a aceitação (aceita ou recusada);
 *  - documentos de habilitação: depois do resultado da habilitação dele.
 * O órgão dono e o próprio licitante sempre veem.
 */
export function anexoVisivel(a: {
  tipo: 'PROPOSTA_ADEQUADA' | 'HABILITACAO';
  souOrgao: boolean;
  souDono: boolean;
  statusAceitacao?: string | null;
  statusHabilitacao?: string | null;
}): boolean {
  if (a.souOrgao || a.souDono) return true;
  if (a.tipo === 'PROPOSTA_ADEQUADA') return ['ACEITA', 'RECUSADA'].includes(String(a.statusAceitacao ?? ''));
  return ['HABILITADO', 'INABILITADO'].includes(String(a.statusHabilitacao ?? ''));
}
