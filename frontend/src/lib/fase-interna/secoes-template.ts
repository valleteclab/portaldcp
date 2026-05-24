/**
 * Templates de seções dos documentos da Fase Interna
 * Baseados na Lei 14.133/2021
 *
 * Fonte única de verdade — usado pelo wizard (novo/page.tsx)
 * e pelo editor (DocumentoSeccionado.tsx).
 */

export interface SecaoTemplate {
  /** Chave no JSON de dados_estruturados */
  id: string
  /** Título exibido no editor e no PDF */
  titulo: string
  /** Texto de ajuda dentro do editor */
  placeholder: string
  /** Obrigatório conforme §2º do Art. 18 (ETP) ou equivalente */
  obrigatorio: boolean
  /** Fundamento legal desta seção */
  fundamentoLegal: string
  /** Número de linhas sugerido para a textarea no wizard */
  rows?: number
}

export interface TemplateDocumento {
  titulo: string
  intro: string
  artigo: string
  secoes: SecaoTemplate[]
  /** Gera prompt para IA a partir do contexto da licitação */
  buildPrompt: (ctx: ContextoLicitacao) => string
}

export interface ContextoLicitacao {
  objeto: string
  categoria?: string
  modalidade?: string
  criterio?: string
  criterio_julgamento?: string
  valor?: string
  quantidade?: string
  area?: string
  valorMediano?: number
}

// ─── DFD ─────────────────────────────────────────────────────────────────────

const dfd: TemplateDocumento = {
  titulo: 'Documento de Formalização da Demanda (DFD)',
  intro:
    'Formaliza a necessidade da contratação. Deve identificar a demanda, justificar e vincular ao planejamento institucional.',
  artigo: 'Art. 18, I · Lei 14.133/2021',
  secoes: [
    {
      id: 'demanda',
      titulo: '1. Descrição da necessidade',
      placeholder: 'Descreva o problema ou demanda institucional que justifica a contratação…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, I',
    },
    {
      id: 'quantidade',
      titulo: '2. Quantidade estimada',
      placeholder: 'Volume estimado, unidade de medida e justificativa do quantitativo…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, I',
    },
    {
      id: 'previsao',
      titulo: '3. Previsão no PCA',
      placeholder: 'Vinculação ao Plano de Contratações Anual (Art. 12, §1º)…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 12, §1º',
    },
    {
      id: 'data',
      titulo: '4. Data prevista de conclusão',
      placeholder: 'Prazo estimado para conclusão da contratação…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, I',
    },
  ],
  buildPrompt: (ctx) => `Você é técnico do setor público elaborando um DFD conforme Lei 14.133/2021.

Objeto: ${ctx.objeto}
Categoria: ${ctx.categoria}
Quantidade: ${ctx.quantidade || 'a definir'}
Área demandante: ${ctx.area || 'não informada'}

Gere as 4 seções do DFD em JSON. Seja conciso, formal, técnico, em português brasileiro. Cada seção: 2-4 frases. Cite artigos quando pertinente.

Responda APENAS com JSON válido:
{"demanda":"...","quantidade":"...","previsao":"...","data":"..."}`,
}

// ─── ETP ─────────────────────────────────────────────────────────────────────

const etp: TemplateDocumento = {
  titulo: 'Estudo Técnico Preliminar (ETP)',
  intro:
    'Analisa a viabilidade técnica e econômica da contratação. Os incisos I, IV, VI, VIII e XIII são de presença obrigatória (Art. 18, §2º). Os demais exigem justificativa quando ausentes.',
  artigo: 'Art. 18, §1º (I–XIII) · Lei 14.133/2021',
  secoes: [
    {
      id: 'necessidade',
      titulo: '1. Descrição da necessidade (inc. I) *',
      placeholder: 'Necessidade fundamentada em estudos que caracteriza o interesse público envolvido…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, §1º, I',
    },
    {
      id: 'previsao_pca',
      titulo: '2. Previsão no PCA (inc. II)',
      placeholder: 'Referência ao Plano de Contratações Anual (Art. 12, §1º). Se não constar, justificar…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, II',
    },
    {
      id: 'requisitos',
      titulo: '3. Requisitos da contratação (inc. III)',
      placeholder: 'Requisitos técnicos, de sustentabilidade (Art. 5º, IV), qualidade e desempenho…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, III',
    },
    {
      id: 'estimativa',
      titulo: '4. Estimativa de quantidades (inc. IV) *',
      placeholder: 'Memória de cálculo, parâmetros utilizados e documentos de suporte para as quantidades…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, §1º, IV',
    },
    {
      id: 'levantamento',
      titulo: '5. Levantamento de mercado (inc. V)',
      placeholder: 'Alternativas de mercado analisadas, solução escolhida e justificativa técnica/econômica…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, V',
    },
    {
      id: 'estimativa_valor',
      titulo: '6. Estimativa de valor referencial (inc. VI) *',
      placeholder: 'Valor total estimado com metodologia, composição de preços e referências utilizadas (distinto da PP)…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, §1º, VI',
      rows: 4,
    },
    {
      id: 'solucao',
      titulo: '7. Descrição da solução escolhida (inc. VII)',
      placeholder: 'Descrição detalhada da solução técnica adotada e justificativa da escolha…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, VII',
    },
    {
      id: 'parcelamento',
      titulo: '8. Parcelamento ou não (inc. VIII) *',
      placeholder: 'Justificativa para parcelar ou não o objeto (Art. 40, §3º). Se não parcelado, razões técnicas/econômicas…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, §1º, VIII',
    },
    {
      id: 'beneficios',
      titulo: '9. Resultados e benefícios esperados (inc. IX)',
      placeholder: 'Resultados pretendidos em termos quantitativos e qualitativos com a contratação…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, IX',
    },
    {
      id: 'providencias',
      titulo: '10. Providências prévias necessárias (inc. X)',
      placeholder: 'Licenças, autorizações, certificações ou ações administrativas a serem adotadas previamente…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, X',
    },
    {
      id: 'correlatas',
      titulo: '11. Contratações correlatas (inc. XI)',
      placeholder: 'Contratos vigentes ou a serem celebrados que guardem relação de interdependência com esta contratação…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, XI',
    },
    {
      id: 'sustentabilidade',
      titulo: '12. Impactos ambientais e sustentabilidade (inc. XII)',
      placeholder: 'Critérios de sustentabilidade (Art. 5º, IV), impactos ambientais identificados e medidas mitigadoras…',
      obrigatorio: false,
      fundamentoLegal: 'Art. 18, §1º, XII',
    },
    {
      id: 'viabilidade',
      titulo: '13. Posicionamento conclusivo (inc. XIII) *',
      placeholder: 'Conclusão sobre a viabilidade técnica e econômica da contratação e recomendações…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, §1º, XIII',
    },
  ],
  buildPrompt: (ctx) => `Você é analista técnico elaborando um ETP conforme Art. 18, §1º, incisos I a XIII, da Lei 14.133/2021.

Os incisos I, IV, VI, VIII e XIII são OBRIGATÓRIOS (§2º). Os demais requerem justificativa se ausentes.

Contexto:
- Objeto: ${ctx.objeto}
- Natureza: ${ctx.categoria || 'não informada'}
- Modalidade: ${ctx.modalidade || 'não informada'}
- Valor estimado: ${ctx.valor ? 'R$ ' + ctx.valor : 'não informado'}
- Área demandante: ${ctx.area || 'não informada'}

Gere todas as 13 seções em JSON. 2–3 frases técnicas por seção. Cite normas quando pertinente.

Responda APENAS com JSON válido:
{"necessidade":"...","previsao_pca":"...","requisitos":"...","estimativa":"...","levantamento":"...","estimativa_valor":"...","solucao":"...","parcelamento":"...","beneficios":"...","providencias":"...","correlatas":"...","sustentabilidade":"...","viabilidade":"..."}`,
}

// ─── TR ──────────────────────────────────────────────────────────────────────

const tr: TemplateDocumento = {
  titulo: 'Termo de Referência (TR)',
  intro:
    'Consolida tudo o que foi estudado e define com precisão o objeto, requisitos, modelo de execução e fiscalização. Deve conter todos os elementos do Art. 6º, XXIII, alíneas a–j.',
  artigo: 'Art. 6º, XXIII · Art. 40 · Lei 14.133/2021',
  secoes: [
    {
      id: 'objeto',
      titulo: '1. Objeto (alínea a)',
      placeholder: 'Descrição precisa do objeto da contratação…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, a',
    },
    {
      id: 'fundamentacao',
      titulo: '2. Fundamentação e justificativa (alínea b)',
      placeholder: 'Base legal e justificativa da necessidade da contratação…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, b',
    },
    {
      id: 'descricao',
      titulo: '3. Descrição da solução (alínea c)',
      placeholder: 'Solução técnica completa, incluindo os resultados esperados…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, c',
    },
    {
      id: 'requisitos',
      titulo: '4. Requisitos da contratação (alínea d)',
      placeholder: 'Requisitos técnicos, qualidade, desempenho, sustentabilidade e outras condicionantes…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, d',
    },
    {
      id: 'modelo_execucao',
      titulo: '5. Modelo de execução do objeto (alínea e)',
      placeholder: 'Prazos, locais de entrega/execução, dinâmica de execução e demais condições práticas…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, e',
    },
    {
      id: 'modelo_gestao',
      titulo: '6. Modelo de gestão e fiscalização (alínea f)',
      placeholder: 'Estrutura de gestão, designação de fiscais, indicadores de desempenho e penalidades…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, f',
    },
    {
      id: 'pagamento',
      titulo: '7. Critérios de medição e pagamento (alínea g)',
      placeholder: 'Forma, condições, prazos e critérios objetivos de medição e pagamento…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, g',
    },
    {
      id: 'selecao_habilitacao',
      titulo: '8. Critérios de seleção e habilitação (alínea h)',
      placeholder:
        'Forma de seleção do fornecedor, modalidade, critério de julgamento, modo de disputa e requisitos de habilitação jurídica, fiscal, técnica e econômico-financeira…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, h',
    },
    {
      id: 'estimativa_valor_tr',
      titulo: '9. Estimativa de valor e sigilo (alínea i)',
      placeholder:
        'Estimativa do valor do objeto com metodologia utilizada. Se aplicável, indicar sigilo do orçamento (Art. 24, §1º) e fundamentar…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, i · Art. 24',
      rows: 4,
    },
    {
      id: 'dotacao_orcamentaria_tr',
      titulo: '10. Adequação orçamentária (alínea j)',
      placeholder:
        'Elemento de despesa, fonte de recurso, programa/ação e dotação orçamentária. Indicar exercício e disponibilidade de crédito ou justificativa de dispensa (SRP/exercício subsequente)…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 6º, XXIII, j · Art. 167, CF/88',
    },
  ],
  buildPrompt: (ctx) => `Você elabora um Termo de Referência completo conforme Art. 6º, XXIII (alíneas a–j) e Art. 40 da Lei 14.133/2021.

Contexto:
- Objeto: ${ctx.objeto}
- Categoria: ${ctx.categoria}
- Quantidade: ${ctx.quantidade || 'a definir'}
- Modalidade: ${ctx.modalidade || 'não informada'}
- Critério de julgamento: ${ctx.criterio || 'Menor preço'}
- Valor estimado mediano da pesquisa de preços: R$ ${(ctx.valorMediano || 0).toLocaleString('pt-BR')}
- ETP concluído: SIM

Gere as 10 seções do TR em JSON. 3-4 frases formais, técnicas, com citações legais.

Responda APENAS com JSON válido:
{"objeto":"...","fundamentacao":"...","descricao":"...","requisitos":"...","modelo_execucao":"...","modelo_gestao":"...","pagamento":"...","selecao_habilitacao":"...","estimativa_valor_tr":"...","dotacao_orcamentaria_tr":"..."}`,
}

// ─── Aviso de Contratação Direta ─────────────────────────────────────────────

const aviso: TemplateDocumento = {
  titulo: 'Aviso de Contratação Direta',
  intro:
    'Publicação obrigatória no PNCP e no Diário Oficial para contratações por dispensa eletrônica ou inexigibilidade. Substitui a minuta do edital nestes casos.',
  artigo: 'Art. 74-75 · Art. 54, §1º · Lei 14.133/2021',
  secoes: [
    {
      id: 'amparo_legal',
      titulo: '1. Amparo legal',
      placeholder:
        'Fundamento legal da contratação direta. Ex: Art. 75, I – valor abaixo do limite; Art. 74, III, d – notória especialização…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 74–75',
    },
    {
      id: 'objeto_contratacao',
      titulo: '2. Objeto da contratação',
      placeholder: 'Descrição objetiva do bem, serviço ou obra objeto da contratação direta…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 75',
    },
    {
      id: 'justificativa',
      titulo: '3. Justificativa da contratação direta',
      placeholder:
        'Razões fáticas e jurídicas que enquadram a contratação na hipótese de dispensa ou inexigibilidade…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 72, VII',
      rows: 4,
    },
    {
      id: 'caracterizacao',
      titulo: '4. Caracterização da situação e escolha do fornecedor',
      placeholder:
        'Demonstração objetiva do enquadramento legal, cotações realizadas, análises técnicas ou pareceres que embasam a escolha do fornecedor…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 72, VII',
    },
  ],
  buildPrompt: (ctx) => `Você elabora um Aviso de Contratação Direta conforme Arts. 74-75 da Lei 14.133/2021.

Objeto: ${ctx.objeto}
Modalidade: ${ctx.modalidade || 'Dispensa Eletrônica'}
Categoria: ${ctx.categoria || 'não informada'}
Valor estimado: ${ctx.valor ? 'R$ ' + ctx.valor : 'não informado'}

Gere as 4 seções em JSON. Seja objetivo e formal.

Responda APENAS com JSON válido:
{"amparo_legal":"...","objeto_contratacao":"...","justificativa":"...","caracterizacao":"..."}`,
}

// ─── Minuta do Edital ─────────────────────────────────────────────────────────

const edital: TemplateDocumento = {
  titulo: 'Minuta do Edital',
  intro: 'A minuta consolida as regras da licitação, vinculada ao TR e aos demais documentos da fase interna.',
  artigo: 'Art. 25 · Lei 14.133/2021',
  secoes: [
    {
      id: 'preambulo',
      titulo: '1. Preâmbulo',
      placeholder: 'Identificação do órgão, objeto, modalidade…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 25',
    },
    {
      id: 'objeto_edital',
      titulo: '2. Do objeto',
      placeholder: 'Objeto da licitação…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 25',
    },
    {
      id: 'participacao',
      titulo: '3. Da participação',
      placeholder: 'Quem pode participar e vedações…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 14',
    },
    {
      id: 'habilitacao',
      titulo: '4. Da habilitação',
      placeholder: 'Documentação necessária para habilitação…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 62–70',
    },
    {
      id: 'julgamento',
      titulo: '5. Critério de julgamento',
      placeholder: 'Critério aplicado e justificativa…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 33',
    },
    {
      id: 'recursos',
      titulo: '6. Dos recursos',
      placeholder: 'Prazos e procedimentos recursais…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 165',
    },
    {
      id: 'contratacao',
      titulo: '7. Da contratação',
      placeholder: 'Condições e prazos de contratação…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 90',
    },
  ],
  buildPrompt: (ctx) => `Você redige trechos de minuta de Edital conforme Lei 14.133/2021, Art. 25.

Objeto: ${ctx.objeto}
Modalidade: ${ctx.modalidade || 'não informada'}
Critério: ${ctx.criterio_julgamento || 'não informado'}

Gere as 7 seções em JSON. 2-3 frases em linguagem editalícia formal.

Responda APENAS com JSON válido:
{"preambulo":"...","objeto_edital":"...","participacao":"...","habilitacao":"...","julgamento":"...","recursos":"...","contratacao":"..."}`,
}

// ─── Parecer Jurídico ─────────────────────────────────────────────────────────

const parecerJuridico: TemplateDocumento = {
  titulo: 'Parecer Jurídico',
  intro: 'Análise jurídica da minuta do edital e dos atos que a instruem, verificando a legalidade do processo.',
  artigo: 'Art. 53 · Lei 14.133/2021',
  secoes: [
    {
      id: 'parecer',
      titulo: 'Parecer Jurídico',
      placeholder:
        'Análise jurídica do processo licitatório, verificando a conformidade com a Lei 14.133/2021 e legislação correlata. Conclusão sobre a regularidade do processo e condições para publicação do edital…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 53',
      rows: 8,
    },
  ],
  buildPrompt: (ctx) => `Você elabora um Parecer Jurídico conforme Art. 53 da Lei 14.133/2021.

Objeto: ${ctx.objeto}
Modalidade: ${ctx.modalidade || 'não informada'}

Elabore um parecer jurídico verificando a conformidade do processo com a Lei 14.133/2021.

Responda APENAS com JSON válido:
{"parecer":"..."}`,
}

// ─── Autorização para Abertura ────────────────────────────────────────────────

const autorizacao: TemplateDocumento = {
  titulo: 'Autorização para Abertura',
  intro: 'Ato formal da autoridade competente autorizando o início da fase externa da licitação.',
  artigo: 'Art. 18, II · Lei 14.133/2021',
  secoes: [
    {
      id: 'autorizacao',
      titulo: 'Autorização da Autoridade Competente',
      placeholder:
        'Autorização formal da autoridade competente para abertura da licitação, após análise dos documentos da fase interna e verificação das condições legais e orçamentárias…',
      obrigatorio: true,
      fundamentoLegal: 'Art. 18, II',
      rows: 6,
    },
  ],
  buildPrompt: (ctx) => `Você elabora uma Autorização para Abertura de Licitação conforme Art. 18, II da Lei 14.133/2021.

Objeto: ${ctx.objeto}
Modalidade: ${ctx.modalidade || 'não informada'}

Elabore a autorização formal da autoridade competente.

Responda APENAS com JSON válido:
{"autorizacao":"..."}`,
}

// ─── Exportações ──────────────────────────────────────────────────────────────

export const TEMPLATES_DOCUMENTOS: Record<string, TemplateDocumento> = {
  // Enum values (short codes)
  DFD: dfd,
  ETP: etp,
  TR: tr,
  ME: edital,
  PJ: parecerJuridico,
  AA: autorizacao,
  // Aliases para compatibilidade com tipos legados e aviso
  AVISO: aviso,
  AVISO_CONTRATACAO: aviso,
  EDITAL: edital,
  // Long names (legacy)
  DOCUMENTO_FORMALIZACAO_DEMANDA: dfd,
  ESTUDO_TECNICO_PRELIMINAR: etp,
  TERMO_REFERENCIA: tr,
  PARECER_JURIDICO: parecerJuridico,
  AUTORIZACAO_ABERTURA: autorizacao,
  MINUTA_EDITAL: edital,
}

/** Títulos curtos para exibição */
export const TITULOS_TIPO: Record<string, string> = {
  DFD: 'Documento de Formalização de Demanda',
  ETP: 'Estudo Técnico Preliminar',
  AR: 'Análise de Riscos',
  TR: 'Termo de Referência',
  PP: 'Pesquisa de Preços',
  PJ: 'Parecer Jurídico',
  PT: 'Parecer Técnico',
  AA: 'Autorização para Abertura',
  ME: 'Minuta do Edital',
  DO: 'Dotação Orçamentária',
  AVISO: 'Aviso de Contratação Direta',
  AVISO_CONTRATACAO: 'Aviso de Contratação Direta',
  // Long names
  TERMO_REFERENCIA: 'Termo de Referência',
  DOCUMENTO_FORMALIZACAO_DEMANDA: 'Documento de Formalização de Demanda',
  ESTUDO_TECNICO_PRELIMINAR: 'Estudo Técnico Preliminar',
  ANALISE_RISCOS: 'Análise de Riscos',
  PESQUISA_PRECOS: 'Pesquisa de Preços',
  PARECER_JURIDICO: 'Parecer Jurídico',
  AUTORIZACAO: 'Autorização para Abertura',
  AUTORIZACAO_ABERTURA: 'Autorização para Abertura',
  EDITAL: 'Minuta do Edital',
  DOTACAO_ORCAMENTARIA: 'Dotação Orçamentária',
}

/**
 * Retorna o template de um documento pelo tipo (enum value ou nome longo).
 * Retorna null se o tipo não tiver template de seções (ex: AR, PP).
 */
export function getTemplate(tipo: string): TemplateDocumento | null {
  return TEMPLATES_DOCUMENTOS[tipo.toUpperCase()] || null
}

/**
 * Retorna as seções de um documento pelo tipo.
 */
export function getSecoes(tipo: string): SecaoTemplate[] {
  return getTemplate(tipo)?.secoes || []
}
