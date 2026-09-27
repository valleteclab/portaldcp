/**
 * CÓDIGOS do catálogo da fase interna (antes em `tarefas/etapas-fase-interna.ts`,
 * que os reexporta). São NOMES — o que cada etapa faz, quem faz, prazo e
 * dependências ficam nos dados do modelo de fluxo (F1).
 */

/** Etapa da tela (agrupa passos). */
export enum EtapaFaseInterna {
  DEMANDA = 'DEMANDA',
  /** Opcional (desligada por padrão): despacho "autorizo o início" (Portaria 089). */
  AUTORIZACAO_INICIO = 'AUTORIZACAO_INICIO',
  ETP_RISCOS = 'ETP_RISCOS',
  TERMO_REFERENCIA = 'TERMO_REFERENCIA',
  PESQUISA_PRECOS = 'PESQUISA_PRECOS',
  /** Opcional (desligada por padrão): indicação da modalidade/enquadramento (Portaria 089, art. 56). */
  INDICACAO_MODALIDADE = 'INDICACAO_MODALIDADE',
  RESERVA_ORCAMENTARIA = 'RESERVA_ORCAMENTARIA',
  AUTORIZACAO = 'AUTORIZACAO',
  MINUTAS_PARECER = 'MINUTAS_PARECER',
  CONTROLE_INTERNO = 'CONTROLE_INTERNO',
  CONFORMIDADE_PUBLICACAO = 'CONFORMIDADE_PUBLICACAO',
}

/** Unidade de trabalho de uma etapa (vira tarefa; o modelo é por passo). */
export enum PassoFaseInterna {
  DFD = 'DFD',
  AUTORIZACAO_INICIO = 'AUTORIZACAO_INICIO',
  ETP = 'ETP',
  TR = 'TR',
  PESQUISA = 'PESQUISA',
  INDICACAO_MODALIDADE = 'INDICACAO_MODALIDADE',
  RESERVA = 'RESERVA',
  AUTORIZACAO = 'AUTORIZACAO',
  MINUTAS = 'MINUTAS',
  PARECER = 'PARECER',
  CONTROLE_INTERNO = 'CONTROLE_INTERNO',
  PUBLICACAO = 'PUBLICACAO',
}

/**
 * Papel FUNCIONAL do usuário na fase interna (não é permissão de sistema —
 * isso continua em RoleUsuario ADMIN/PREGOEIRO/EQUIPE_APOIO). Um usuário pode
 * ter vários.
 */
export enum PapelFaseInterna {
  REQUISITANTE = 'REQUISITANTE',
  COMPRAS = 'COMPRAS',
  CONTABILIDADE = 'CONTABILIDADE',
  JURIDICO = 'JURIDICO',
  CONTROLE_INTERNO = 'CONTROLE_INTERNO',
  AUTORIDADE = 'AUTORIDADE',
  AGENTE_CONTRATACAO = 'AGENTE_CONTRATACAO',
}

export const ROTULO_PAPEL: Record<PapelFaseInterna, string> = {
  [PapelFaseInterna.REQUISITANTE]: 'Requisitante',
  [PapelFaseInterna.COMPRAS]: 'Compras',
  [PapelFaseInterna.CONTABILIDADE]: 'Contabilidade',
  [PapelFaseInterna.JURIDICO]: 'Jurídico',
  [PapelFaseInterna.CONTROLE_INTERNO]: 'Controle interno',
  [PapelFaseInterna.AUTORIDADE]: 'Autoridade',
  [PapelFaseInterna.AGENTE_CONTRATACAO]: 'Agente de contratação',
};

export const PAPEIS_FASE_INTERNA = Object.values(PapelFaseInterna) as string[];
