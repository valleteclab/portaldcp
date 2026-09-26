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
  [TipoDocumentoFaseInterna.PUBLICACAO_DIARIO_OFICIAL]: 'Publicação no Diário Oficial',
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
  PUBLICACAO_DIARIO_OFICIAL: TipoDocumentoFaseInterna.PUBLICACAO_DIARIO_OFICIAL,
};

/** Fundamento exibido no checklist de cada etapa. */
export const FUNDAMENTO_ETAPA: Partial<Record<FaseLicitacao, string>> = {
  [FaseLicitacao.PLANEJAMENTO]: 'Art. 18, I e §1º',
  [FaseLicitacao.TERMO_REFERENCIA]: 'Art. 18, II e IX',
  [FaseLicitacao.PESQUISA_PRECOS]: 'Art. 18, IV c/c Art. 23',
  [FaseLicitacao.ANALISE_JURIDICA]: 'Art. 53',
  [FaseLicitacao.APROVACAO_INTERNA]: 'Art. 18 (autorização, agente e dotação)',
};

/** Modalidades com instrução do art. 72 (contratação direta) em vez do art. 18. */
export const MODALIDADES_CONTRATACAO_DIRETA: string[] = [
  'DISPENSA_ELETRONICA',
  'INEXIGIBILIDADE',
  // Credenciamento (E7b): as contratações são inexigibilidade (art. 74 IV) —
  // instrução do art. 72 + edital de chamamento (gate do PUBLICAR).
  'CREDENCIAMENTO',
];

export interface LinhaChecklistInstrucao {
  tipo: TipoDocumentoFaseInterna;
  titulo: string;
  obrigatorio: boolean;
  fundamento: string;
  etapa?: FaseLicitacao;
}

/**
 * INSTRUÇÃO DA CONTRATAÇÃO DIRETA (art. 72) — fonte única (antes dentro do
 * FaseInternaService): obrigatórios DFD, estimativa de despesa e autorização;
 * os demais "se for o caso" (admitem "não se aplica" com justificativa).
 */
export const CHECKLIST_CONTRATACAO_DIRETA: ReadonlyArray<LinhaChecklistInstrucao> = [
  { tipo: TipoDocumentoFaseInterna.DOCUMENTO_FORMALIZACAO_DEMANDA, titulo: 'Formalização da demanda (DFD)', obrigatorio: true, fundamento: 'Art. 72, I' },
  { tipo: TipoDocumentoFaseInterna.PESQUISA_PRECOS, titulo: 'Estimativa de despesa (pesquisa de preços)', obrigatorio: true, fundamento: 'Art. 72, II c/c Art. 23' },
  { tipo: TipoDocumentoFaseInterna.AUTORIZACAO_ABERTURA, titulo: 'Autorização da autoridade competente', obrigatorio: true, fundamento: 'Art. 72, VIII' },
  { tipo: TipoDocumentoFaseInterna.ESTUDO_TECNICO_PRELIMINAR, titulo: 'Estudo Técnico Preliminar (ETP)', obrigatorio: false, fundamento: 'Art. 72, I — "se for o caso"' },
  { tipo: TipoDocumentoFaseInterna.TERMO_REFERENCIA, titulo: 'Termo de Referência (TR)', obrigatorio: false, fundamento: 'Art. 72, I — "se for o caso"' },
  { tipo: TipoDocumentoFaseInterna.ANALISE_RISCOS, titulo: 'Análise de riscos', obrigatorio: false, fundamento: 'Art. 72, I — "se for o caso"' },
  { tipo: TipoDocumentoFaseInterna.PARECER_JURIDICO, titulo: 'Parecer jurídico', obrigatorio: false, fundamento: 'Art. 72, III c/c Art. 53, §5º' },
  { tipo: TipoDocumentoFaseInterna.DOTACAO_ORCAMENTARIA, titulo: 'Compatibilidade orçamentária', obrigatorio: false, fundamento: 'Art. 72, IV' },
  {
    tipo: TipoDocumentoFaseInterna.JUSTIFICATIVA_CONTRATACAO,
    titulo: 'Justificativa da contratação direta (razão da escolha e do preço)',
    obrigatorio: false,
    fundamento: 'Art. 72, VI e VII',
  },
  // Peças dos autos reais (PA 139/2025) — "se for o caso"; a obrigatoriedade
  // por regulamento do órgão vem na Entrega 4 (checklist por modalidade).
  { tipo: TipoDocumentoFaseInterna.DESIGNACAO_PREGOEIRO, titulo: 'Designação do agente de contratação (portaria do exercício)', obrigatorio: false, fundamento: 'Art. 8º' },
  { tipo: TipoDocumentoFaseInterna.RELATORIO_AGENTE, titulo: 'Relatório do agente de contratação', obrigatorio: false, fundamento: 'Art. 72, VI e VII' },
  { tipo: TipoDocumentoFaseInterna.MINUTA_CONTRATO, titulo: 'Minuta do contrato', obrigatorio: false, fundamento: 'Art. 72 c/c art. 92' },
  // Entrega 3B — a minuta do aviso (com anexos) é peça dos autos analisada
  // pela Procuradoria antes da divulgação (art. 75, §3º); na inexigibilidade
  // sem aviso, "não se aplica".
  { tipo: TipoDocumentoFaseInterna.MINUTA_EDITAL, titulo: 'Minuta do aviso de contratação direta', obrigatorio: false, fundamento: 'Art. 72 c/c art. 75, §3º' },
];

/**
 * LINHAS DA INSTRUÇÃO do processo (fonte única do checklist — `getInstrucao`
 * e a entrada "fase interna feita fora", antes de o processo existir):
 *  - contratação direta: o art. 72 (acima);
 *  - rito completo: os obrigatórios de todas as etapas internas do art. 18 (ou
 *    só os da `etapa` pedida — gate da etapa);
 *  - controle interno ativado pelo órgão (Entrega 2): a manifestação, como
 *    aviso (não obrigatória).
 * "Não se aplica" só na contratação direta, nas peças "se for o caso" (o
 * controle interno, exigido pelo regulamento, não admite).
 */
export function linhasDoChecklist(opcoes: {
  contratacao_direta: boolean;
  controle_interno_ativo?: boolean;
  etapa?: FaseLicitacao;
}): Array<LinhaChecklistInstrucao & { pode_nao_se_aplicar: boolean }> {
  const { contratacao_direta: direta, etapa } = opcoes;
  const linhas: LinhaChecklistInstrucao[] = direta
    ? CHECKLIST_CONTRATACAO_DIRETA.map((l) => ({ ...l }))
    : ETAPAS_FASE_INTERNA.filter((f) => !etapa || f === etapa).flatMap((f) =>
        (DOCUMENTOS_OBRIGATORIOS_POR_ETAPA[f] || []).map((tipo) => ({
          tipo,
          titulo: TITULO_DOCUMENTO[tipo] ?? (tipo as string),
          obrigatorio: true,
          fundamento: FUNDAMENTO_ETAPA[f] ?? 'Art. 18',
          etapa: f,
        })),
      );
  if (opcoes.controle_interno_ativo && (direta || !etapa || etapa === FaseLicitacao.ANALISE_JURIDICA)) {
    linhas.push({
      tipo: TipoDocumentoFaseInterna.MANIFESTACAO_CONTROLE_INTERNO,
      titulo: 'Manifestação do controle interno',
      obrigatorio: false,
      fundamento: 'Art. 169, II — regulamento do órgão',
      ...(direta ? {} : { etapa: FaseLicitacao.ANALISE_JURIDICA }),
    });
  }
  return linhas.map((l) => ({
    ...l,
    pode_nao_se_aplicar: direta && !l.obrigatorio && l.tipo !== TipoDocumentoFaseInterna.MANIFESTACAO_CONTROLE_INTERNO,
  }));
}
