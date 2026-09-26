import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';

/**
 * Documentos OBRIGATÓRIOS de cada etapa da fase interna no rito completo
 * (pregão, concorrência e demais modalidades competitivas — art. 18 da Lei
 * 14.133/2021). Fonte ÚNICA do gate documental (plano E1.7): usada pela
 * fase-interna (checklist/instrução) e pelas pré-condições dos atos da
 * máquina de estados (CONCLUIR_PLANEJAMENTO … CONCLUIR_FASE_INTERNA/PUBLICAR).
 *
 * A contratação direta (dispensa/inexigibilidade) NÃO usa esta tabela: segue
 * a instrução do art. 72 (FaseInternaService.getChecklistContratacaoDireta).
 */
export const DOCUMENTOS_OBRIGATORIOS_POR_ETAPA: Partial<Record<FaseLicitacao, TipoDocumentoFaseInterna[]>> = {
  [FaseLicitacao.PLANEJAMENTO]: [
    TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA,
    TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR,
  ],
  [FaseLicitacao.TERMO_REFERENCIA]: [
    TipoDocumentoFaseInterna.TERMO_REFERENCIA,
    TipoDocumentoFaseInterna.JUSTIFICATIVA_CONTRATACAO,
  ],
  [FaseLicitacao.PESQUISA_PRECOS]: [
    TipoDocumentoFaseInterna.PESQUISA_PRECOS,
    TipoDocumentoFaseInterna.MAPA_COMPARATIVO_PRECOS,
  ],
  [FaseLicitacao.ANALISE_JURIDICA]: [TipoDocumentoFaseInterna.PARECER_JURIDICO],
  [FaseLicitacao.APROVACAO_INTERNA]: [
    TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA,
    TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO,
    TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA,
  ],
};

/** Etapas internas na ordem do rito completo. */
export const ETAPAS_FASE_INTERNA: FaseLicitacao[] = [
  FaseLicitacao.PLANEJAMENTO,
  FaseLicitacao.TERMO_REFERENCIA,
  FaseLicitacao.PESQUISA_PRECOS,
  FaseLicitacao.ANALISE_JURIDICA,
  FaseLicitacao.APROVACAO_INTERNA,
];

/** Nome legível de cada tipo de documento (checklist e mensagens do gate). */
export const TITULO_DOCUMENTO: Partial<Record<TipoDocumentoFaseInterna, string>> = {
  [TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA]: 'Documento de Formalização da Demanda (DFD)',
  [TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR]: 'Estudo Técnico Preliminar (ETP)',
  [TipoDocumentoFaseInterna.TERMO_REFERENCIA]: 'Termo de Referência (TR)',
  [TipoDocumentoFaseInterna.JUSTIFICATIVA_CONTRATACAO]: 'Justificativa da contratação',
  [TipoDocumentoFaseInterna.PESQUISA_PRECOS]: 'Pesquisa de preços',
  [TipoDocumentoFaseInterna.MAPA_COMPARATIVO_PRECOS]: 'Mapa comparativo de preços',
  [TipoDocumentoFaseInterna.PARECER_JURIDICO]: 'Parecer jurídico',
  [TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA]: 'Autorização de abertura',
  [TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO]: 'Designação do agente de contratação/pregoeiro',
  [TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA]: 'Dotação orçamentária',
  [TipoDocumentoFaseInterna.ANALISE_RISCOS]: 'Análise de riscos',
  [TipoDocumentoFaseInterna.PROJETO_BASICO]: 'Projeto básico',
  [TipoDocumentoFaseInterna.PROJETO_EXECUTIVO]: 'Projeto executivo',
  [TipoDocumentoFaseInterna.PARECER_TECNICO]: 'Parecer técnico',
  [TipoDocumentoFaseInterna.DESIGNACAO_EQUIPE_APOIO]: 'Designação da equipe de apoio',
  [TipoDocumentoFaseInterna.MINUTA_EDITAL]: 'Minuta do edital / aviso de contratação direta',
  [TipoDocumentoFaseInterna.EDITAL_APROVADO]: 'Edital aprovado',
  [TipoDocumentoFaseInterna.ANEXOS_EDITAL]: 'Anexos do edital',
  [TipoDocumentoFaseInterna.OUTROS]: 'Outro documento',
  [TipoDocumentoFaseInterna.RELATORIO_AGENTE]: 'Relatório do agente de contratação',
  [TipoDocumentoFaseInterna.PARECER_FASE_EXTERNA]: 'Parecer jurídico da fase externa',
  [TipoDocumentoFaseInterna.MINUTA_CONTRATO]: 'Minuta do contrato',
  [TipoDocumentoFaseInterna.MANIFESTACAO_CONTROLE_INTERNO]: 'Manifestação do controle interno',
};

/**
 * CATÁLOGO DE PEÇAS (nome da SPEC → código do sistema). Onde já havia tipo
 * equivalente, ele é reaproveitado — nada de duplicata:
 *  - DESPACHO_AUTORIZACAO → AA (autorização da autoridade competente)
 *  - INFO_ORCAMENTARIA → DO (dotação/informação orçamentária)
 *  - PARECER_JURIDICO → PJ
 *  - PORTARIA_DESIGNACAO → DP (a portaria é documento do ÓRGÃO com vigência —
 *    `documentos_orgao` — e o processo a referencia na peça DP)
 *  - MINUTA_AVISO → ME (minuta do edital/aviso)
 * Novos: RELATORIO_AGENTE (RAG), PARECER_FASE_EXTERNA (PJE), MINUTA_CONTRATO (MC).
 */
export const CATALOGO_PECAS: Record<string, TipoDocumentoFaseInterna> = {
  DFD: TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA,
  ETP: TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR,
  TR: TipoDocumentoFaseInterna.TERMO_REFERENCIA,
  PESQUISA_PRECOS: TipoDocumentoFaseInterna.PESQUISA_PRECOS,
  INFO_ORCAMENTARIA: TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA,
  DESPACHO_AUTORIZACAO: TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA,
  PORTARIA_DESIGNACAO: TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO,
  RELATORIO_AGENTE: TipoDocumentoFaseInterna.RELATORIO_AGENTE,
  MINUTA_AVISO: TipoDocumentoFaseInterna.MINUTA_EDITAL,
  MINUTA_CONTRATO: TipoDocumentoFaseInterna.MINUTA_CONTRATO,
  PARECER_JURIDICO: TipoDocumentoFaseInterna.PARECER_JURIDICO,
  PARECER_FASE_EXTERNA: TipoDocumentoFaseInterna.PARECER_FASE_EXTERNA,
  CONTROLE_INTERNO: TipoDocumentoFaseInterna.MANIFESTACAO_CONTROLE_INTERNO,
};

/** Fundamento exibido no checklist de cada etapa. */
export const FUNDAMENTO_ETAPA: Partial<Record<FaseLicitacao, string>> = {
  [FaseLicitacao.PLANEJAMENTO]: 'Art. 18, I e §1º',
  [FaseLicitacao.TERMO_REFERENCIA]: 'Art. 18, II e IX',
  [FaseLicitacao.PESQUISA_PRECOS]: 'Art. 18, IV c/c Art. 23',
  [FaseLicitacao.ANALISE_JURIDICA]: 'Art. 53',
  [FaseLicitacao.APROVACAO_INTERNA]: 'Art. 18 (autorização, agente e dotação)',
};
