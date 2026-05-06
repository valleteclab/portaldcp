/**
 * Estrutura de dados do Estudo Técnico Preliminar (ETP)
 * Conforme Art. 18, §1º da Lei 14.133/2021 — 13 incisos.
 * Também atende IN SEGES/ME 81/2022.
 */
export interface EtpDados {
  // I — descrição da necessidade da contratação, considerando o problema a ser
  // resolvido sob a perspectiva do interesse público
  descricao_necessidade: string;

  // II — demonstração da previsão da contratação no plano de contratações anual
  // (PCA), sempre que elaborado, de modo a indicar o seu alinhamento com o
  // planejamento da Administração
  previsao_pca: {
    consta_no_pca: boolean;
    pca_id?: string;
    item_pca?: string;
    justificativa_se_nao?: string;
  };

  // III — requisitos da contratação
  requisitos_contratacao: string;

  // IV — estimativas das quantidades para a contratação, acompanhadas das
  // memórias de cálculo e dos documentos que lhes dão suporte, que considerem
  // interdependências com outras contratações
  estimativas_quantidades: {
    descricao: string;
    memoria_calculo: string;
    documentos_suporte?: string[];
  };

  // V — levantamento de mercado, que consiste na análise das alternativas
  // possíveis, e justificativa técnica e econômica da escolha do tipo de solução
  levantamento_mercado: {
    alternativas_analisadas: Array<{
      descricao: string;
      vantagens: string;
      desvantagens: string;
    }>;
    solucao_escolhida: string;
    justificativa_tecnica: string;
    justificativa_economica: string;
  };

  // VI — estimativa do valor da contratação, acompanhada dos preços unitários
  // referenciais, das memórias de cálculo e dos documentos que lhe dão suporte
  estimativa_valor: {
    valor_total: number;
    moeda: 'BRL';
    metodo_calculo: string;
    referencia_pesquisa_id?: string;
  };

  // VII — descrição da solução como um todo, inclusive das exigências
  // relacionadas à manutenção e à assistência técnica, quando for o caso
  descricao_solucao: string;

  // VIII — justificativas para o parcelamento ou não da solução, quando
  // necessária para individualização do objeto
  justificativa_parcelamento: {
    tipo: 'PARCELADO' | 'INTEGRAL';
    justificativa: string;
  };

  // IX — demonstrativo dos resultados pretendidos em termos de economicidade e
  // de melhor aproveitamento dos recursos humanos, materiais e financeiros
  // disponíveis
  resultados_pretendidos: string;

  // X — providências a serem adotadas pela Administração previamente à
  // celebração do contrato, inclusive quanto à capacitação de servidores ou de
  // empregados para fiscalização e gestão contratual
  providencias_previas: string;

  // XI — contratações correlatas e/ou interdependentes
  contratacoes_correlatas: Array<{
    numero_processo?: string;
    descricao: string;
    tipo_relacao: 'CORRELATA' | 'INTERDEPENDENTE';
  }>;

  // XII — descrição de possíveis impactos ambientais e respectivas medidas
  // mitigadoras, incluídos requisitos de baixo consumo de energia e de outros
  // recursos, bem como logística reversa para desfazimento e reciclagem
  impactos_ambientais: {
    aplicavel: boolean;
    impactos_identificados?: string;
    medidas_mitigadoras?: string;
    criterios_sustentabilidade?: string;
  };

  // XIII — posicionamento conclusivo sobre a adequação da contratação para o
  // atendimento da necessidade a que se destina
  posicionamento_conclusivo: {
    contratacao_viavel: boolean;
    justificativa: string;
    recomendacoes?: string;
  };

  // Metadados de elaboração (não fazem parte da Lei mas ajudam no controle)
  responsavel_elaboracao?: {
    nome: string;
    cargo: string;
    matricula?: string;
  };
}

/**
 * Validação: retorna lista de campos obrigatórios faltantes ou vazios.
 */
export function validarEtp(dados: Partial<EtpDados>): string[] {
  const erros: string[] = [];
  const min = 30; // mínimo de caracteres em campos textuais para evitar vazio

  if (!dados.descricao_necessidade || dados.descricao_necessidade.trim().length < min) {
    erros.push('I — Descrição da necessidade (mín. 30 caracteres)');
  }
  if (!dados.previsao_pca || dados.previsao_pca.consta_no_pca === undefined) {
    erros.push('II — Previsão no PCA (informar se consta ou justificar)');
  }
  if (dados.previsao_pca && !dados.previsao_pca.consta_no_pca && !dados.previsao_pca.justificativa_se_nao) {
    erros.push('II — Justificativa para contratação fora do PCA');
  }
  if (!dados.requisitos_contratacao || dados.requisitos_contratacao.trim().length < min) {
    erros.push('III — Requisitos da contratação');
  }
  if (!dados.estimativas_quantidades?.descricao || !dados.estimativas_quantidades?.memoria_calculo) {
    erros.push('IV — Estimativas de quantidades + memória de cálculo');
  }
  if (!dados.levantamento_mercado?.solucao_escolhida || !dados.levantamento_mercado?.justificativa_tecnica) {
    erros.push('V — Levantamento de mercado e justificativa');
  }
  if (!dados.estimativa_valor?.valor_total || dados.estimativa_valor.valor_total <= 0) {
    erros.push('VI — Estimativa do valor da contratação');
  }
  if (!dados.descricao_solucao || dados.descricao_solucao.trim().length < min) {
    erros.push('VII — Descrição da solução');
  }
  if (!dados.justificativa_parcelamento?.justificativa) {
    erros.push('VIII — Justificativa para parcelamento ou não');
  }
  if (!dados.resultados_pretendidos || dados.resultados_pretendidos.trim().length < min) {
    erros.push('IX — Resultados pretendidos');
  }
  if (!dados.providencias_previas) {
    erros.push('X — Providências prévias à celebração do contrato');
  }
  if (!dados.impactos_ambientais || dados.impactos_ambientais.aplicavel === undefined) {
    erros.push('XII — Análise de impactos ambientais');
  }
  if (!dados.posicionamento_conclusivo || dados.posicionamento_conclusivo.contratacao_viavel === undefined) {
    erros.push('XIII — Posicionamento conclusivo sobre a viabilidade');
  }

  return erros;
}
