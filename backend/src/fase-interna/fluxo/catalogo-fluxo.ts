/**
 * CATÁLOGO DAS ETAPAS (F1) — o que o SISTEMA sabe fazer em cada etapa: a
 * tela que a implementa, os tipos de peça que ela produz, como ela conclui, a
 * fase da máquina de estados e o portão (trava da lei) ligado ao ato dela.
 *
 * É código porque descreve o próprio sistema (como a tela "Pesquisa" existe),
 * igual ao catálogo de regras da conformidade (o "como verificar"). QUAIS
 * etapas um processo percorre, em que ordem, com que dependências, quem faz e
 * em quanto tempo ficam nos DADOS do modelo de fluxo (semeados a partir de
 * `semente-fluxo.ts`, editáveis pelo órgão).
 */
import { FaseLicitacao } from '../../licitacoes/entities/licitacao.entity';
import { TipoDocumentoFaseInterna as T } from '../entities/documento-fase-interna.entity';
import { EtapaFaseInterna as E, PassoFaseInterna as P } from './codigos';
import type { ConclusaoEtapa } from './modelo-fluxo';

export interface EtapaDoCatalogo {
  codigo: P;
  grupo: E;
  titulo: string;
  tela: string | null;
  conclusao: ConclusaoEtapa;
  fase_maquina: FaseLicitacao;
  portao: string | null;
  fundamento: string | null;
  /** Peças que a etapa produz (a justificativa da contratação muda de lugar conforme o rito). */
  tipos_peca: { direta: string[]; licitacao: string[] };
}

export const TITULO_ETAPA: Record<E, string> = {
  DEMANDA: 'Demanda (DFD)',
  AUTORIZACAO_INICIO: 'Autorização de início',
  ETP_RISCOS: 'ETP e análise de riscos',
  TERMO_REFERENCIA: 'Termo de referência',
  PESQUISA_PRECOS: 'Pesquisa de preços (art. 23)',
  INDICACAO_MODALIDADE: 'Indicação da modalidade',
  RESERVA_ORCAMENTARIA: 'Reserva orçamentária',
  AUTORIZACAO: 'Autorização',
  MINUTAS_PARECER: 'Minutas e parecer jurídico',
  CONTROLE_INTERNO: 'Controle interno',
  CONFORMIDADE_PUBLICACAO: 'Conformidade e publicação',
};

const F = FaseLicitacao;

export const CATALOGO_ETAPAS: EtapaDoCatalogo[] = [
  { codigo: P.DFD, grupo: E.DEMANDA, titulo: 'Formalizar a demanda (DFD)', tela: 'dfd', conclusao: 'PECAS', fase_maquina: F.PLANEJAMENTO, portao: null, fundamento: 'art. 72, I; art. 18, I', tipos_peca: { direta: [T.DOCUMENTO_FORMALIZACAO_DEMANDA], licitacao: [T.DOCUMENTO_FORMALIZACAO_DEMANDA] } },
  { codigo: P.AUTORIZACAO_INICIO, grupo: E.AUTORIZACAO_INICIO, titulo: 'Despacho de autorização do início', tela: null, conclusao: 'REGISTRO', fase_maquina: F.PLANEJAMENTO, portao: null, fundamento: 'regulamento do órgão (ex.: Portaria 089/2024)', tipos_peca: { direta: [], licitacao: [] } },
  { codigo: P.ETP, grupo: E.ETP_RISCOS, titulo: 'Estudo técnico preliminar e análise de riscos', tela: 'etp', conclusao: 'PECAS', fase_maquina: F.PLANEJAMENTO, portao: null, fundamento: 'art. 72, I; art. 18, §1º', tipos_peca: { direta: [T.ESTUDO_TECNICO_PRELIMINAR, T.ANALISE_RISCOS], licitacao: [T.ESTUDO_TECNICO_PRELIMINAR, T.ANALISE_RISCOS] } },
  { codigo: P.TR, grupo: E.TERMO_REFERENCIA, titulo: 'Termo de referência', tela: 'tr', conclusao: 'PECAS', fase_maquina: F.TERMO_REFERENCIA, portao: null, fundamento: 'art. 72, I; art. 6º, XXIII', tipos_peca: { direta: [T.TERMO_REFERENCIA, T.PROJETO_BASICO, T.PROJETO_EXECUTIVO], licitacao: [T.TERMO_REFERENCIA, T.PROJETO_BASICO, T.PROJETO_EXECUTIVO, T.JUSTIFICATIVA_CONTRATACAO] } },
  { codigo: P.PESQUISA, grupo: E.PESQUISA_PRECOS, titulo: 'Pesquisa de preços e mapa', tela: 'pesquisa', conclusao: 'PECAS', fase_maquina: F.PESQUISA_PRECOS, portao: 'A_LIMITE', fundamento: 'art. 72, II; art. 23', tipos_peca: { direta: [T.PESQUISA_PRECOS, T.MAPA_COMPARATIVO_PRECOS], licitacao: [T.PESQUISA_PRECOS, T.MAPA_COMPARATIVO_PRECOS] } },
  { codigo: P.INDICACAO_MODALIDADE, grupo: E.INDICACAO_MODALIDADE, titulo: 'Indicação da modalidade e do enquadramento', tela: null, conclusao: 'REGISTRO', fase_maquina: F.PESQUISA_PRECOS, portao: null, fundamento: 'regulamento do órgão (ex.: Portaria 089/2024, art. 56)', tipos_peca: { direta: [], licitacao: [] } },
  { codigo: P.RESERVA, grupo: E.RESERVA_ORCAMENTARIA, titulo: 'Informação orçamentária e reserva', tela: 'reserva', conclusao: 'PECAS', fase_maquina: F.APROVACAO_INTERNA, portao: null, fundamento: 'art. 72, IV', tipos_peca: { direta: [T.DOTACAO_ORCAMENTARIA], licitacao: [T.DOTACAO_ORCAMENTARIA] } },
  { codigo: P.AUTORIZACAO, grupo: E.AUTORIZACAO, titulo: 'Autorização da autoridade competente', tela: 'autorizacao', conclusao: 'PECAS', fase_maquina: F.APROVACAO_INTERNA, portao: 'B_ART72', fundamento: 'art. 72, VIII', tipos_peca: { direta: [T.AUTORIZACAO_ABERTURA, T.DESIGNACAO_PREGOEIRO, T.DESIGNACAO_EQUIPE_APOIO], licitacao: [T.AUTORIZACAO_ABERTURA, T.DESIGNACAO_PREGOEIRO, T.DESIGNACAO_EQUIPE_APOIO] } },
  { codigo: P.MINUTAS, grupo: E.MINUTAS_PARECER, titulo: 'Relatório do agente e minutas', tela: 'minutas', conclusao: 'PECAS', fase_maquina: F.ANALISE_JURIDICA, portao: null, fundamento: 'art. 72, VI e VII', tipos_peca: { direta: [T.RELATORIO_AGENTE, T.MINUTA_EDITAL, T.MINUTA_CONTRATO, T.ANEXOS_EDITAL, T.JUSTIFICATIVA_CONTRATACAO], licitacao: [T.RELATORIO_AGENTE, T.MINUTA_EDITAL, T.MINUTA_CONTRATO, T.ANEXOS_EDITAL] } },
  { codigo: P.PARECER, grupo: E.MINUTAS_PARECER, titulo: 'Parecer jurídico', tela: 'parecer', conclusao: 'PECAS', fase_maquina: F.ANALISE_JURIDICA, portao: 'MINUTAS_ANTES_DO_PARECER', fundamento: 'art. 72, III; art. 53', tipos_peca: { direta: [T.PARECER_JURIDICO, T.PARECER_TECNICO], licitacao: [T.PARECER_JURIDICO, T.PARECER_TECNICO] } },
  { codigo: P.CONTROLE_INTERNO, grupo: E.CONTROLE_INTERNO, titulo: 'Manifestação do controle interno', tela: 'controle-interno', conclusao: 'PECAS', fase_maquina: F.ANALISE_JURIDICA, portao: null, fundamento: 'regulamento do órgão (ex.: Portaria 089/2024, art. 85)', tipos_peca: { direta: [T.MANIFESTACAO_CONTROLE_INTERNO], licitacao: [T.MANIFESTACAO_CONTROLE_INTERNO] } },
  { codigo: P.PUBLICACAO, grupo: E.CONFORMIDADE_PUBLICACAO, titulo: 'Conformidade e publicação', tela: 'conformidade', conclusao: 'DIVULGACAO', fase_maquina: F.APROVACAO_INTERNA, portao: 'C_CONFORMIDADE', fundamento: 'art. 72, parágrafo único; art. 75, §3º; art. 54', tipos_peca: { direta: [], licitacao: [] } },
];

export const CODIGOS_DO_CATALOGO: string[] = CATALOGO_ETAPAS.map((e) => e.codigo);

export const etapaDoCatalogo = (codigo: string) => CATALOGO_ETAPAS.find((e) => e.codigo === codigo) ?? null;

/** Fase da máquina de estados (rito completo) em que a etapa se encaixa. */
export const FASE_MAQUINA_DA_ETAPA: Record<E, FaseLicitacao> = Object.fromEntries(
  Object.values(E).map((g) => [g, CATALOGO_ETAPAS.find((e) => e.grupo === g)!.fase_maquina]),
) as Record<E, FaseLicitacao>;

/** Telas por etapa: `/orgao/processos/:id/fase-interna/<tela>` (do catálogo). */
export const TELA_DO_PASSO: Partial<Record<string, string>> = Object.fromEntries(
  CATALOGO_ETAPAS.filter((e) => e.tela).map((e) => [e.codigo, e.tela as string]),
);
