import { FaseLicitacao, SituacaoLicitacao } from '../entities/licitacao.entity';

/** Fases internas (preparatórias), na ordem. */
export const FASES_INTERNAS: FaseLicitacao[] = [
  FaseLicitacao.PLANEJAMENTO,
  FaseLicitacao.TERMO_REFERENCIA,
  FaseLicitacao.PESQUISA_PRECOS,
  FaseLicitacao.ANALISE_JURIDICA,
  FaseLicitacao.APROVACAO_INTERNA,
];

/** Fases externas (após a divulgação), na ordem do rito completo. */
export const FASES_EXTERNAS: FaseLicitacao[] = [
  FaseLicitacao.PUBLICADO,
  FaseLicitacao.IMPUGNACAO,
  FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
  FaseLicitacao.ANALISE_PROPOSTAS,
  FaseLicitacao.EM_DISPUTA,
  FaseLicitacao.JULGAMENTO,
  FaseLicitacao.HABILITACAO,
  FaseLicitacao.RECURSO,
  FaseLicitacao.ADJUDICACAO,
  FaseLicitacao.HOMOLOGACAO,
];

/** Ordem completa das fases do processo (sem os valores legados de situação). */
export const ORDEM_FASES: FaseLicitacao[] = [...FASES_INTERNAS, ...FASES_EXTERNAS];

/** Fases externas antes da homologação (onde cabe suspender, deserta, fracassada...). */
export const FASES_EXTERNAS_ATE_ADJUDICACAO: FaseLicitacao[] = FASES_EXTERNAS.filter(
  (f) => f !== FaseLicitacao.HOMOLOGACAO,
);

/** Todas as fases do processo antes da homologação. */
export const FASES_ANTES_DA_HOMOLOGACAO: FaseLicitacao[] = ORDEM_FASES.filter(
  (f) => f !== FaseLicitacao.HOMOLOGACAO,
);

export function indiceFase(fase: FaseLicitacao | string | null | undefined): number {
  return ORDEM_FASES.indexOf(fase as FaseLicitacao);
}

export function ehFaseInterna(fase: FaseLicitacao | string | null | undefined): boolean {
  return FASES_INTERNAS.includes(fase as FaseLicitacao);
}

export const ROTULO_FASE: Record<string, string> = {
  PLANEJAMENTO: 'Planejamento',
  TERMO_REFERENCIA: 'Termo de Referência',
  PESQUISA_PRECOS: 'Pesquisa de Preços',
  ANALISE_JURIDICA: 'Análise Jurídica',
  APROVACAO_INTERNA: 'Aprovação Interna',
  PUBLICADO: 'Publicado',
  IMPUGNACAO: 'Impugnação',
  ACOLHIMENTO_PROPOSTAS: 'Acolhimento de Propostas',
  ANALISE_PROPOSTAS: 'Análise de Propostas',
  EM_DISPUTA: 'Em Disputa',
  JULGAMENTO: 'Julgamento',
  HABILITACAO: 'Habilitação',
  RECURSO: 'Recurso',
  ADJUDICACAO: 'Adjudicação',
  HOMOLOGACAO: 'Homologação',
  // legados
  CONCLUIDO: 'Concluído',
  FRACASSADO: 'Fracassado',
  DESERTO: 'Deserto',
  REVOGADO: 'Revogado',
  ANULADO: 'Anulado',
  SUSPENSO: 'Suspenso',
};

export const ROTULO_SITUACAO: Record<SituacaoLicitacao, string> = {
  [SituacaoLicitacao.ATIVA]: 'Ativa',
  [SituacaoLicitacao.SUSPENSA]: 'Suspensa',
  [SituacaoLicitacao.REVOGADA]: 'Revogada',
  [SituacaoLicitacao.ANULADA]: 'Anulada',
  [SituacaoLicitacao.DESERTA]: 'Deserta',
  [SituacaoLicitacao.FRACASSADA]: 'Fracassada',
  [SituacaoLicitacao.CONCLUIDA]: 'Concluída',
};

export function formatarDataHora(d: Date | string): string {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
