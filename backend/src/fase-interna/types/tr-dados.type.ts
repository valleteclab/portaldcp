/**
 * Estrutura de dados do Termo de Referência (TR)
 * Conforme Art. 6º, XXIII da Lei 14.133/2021 — 11 elementos.
 */
export interface TrDados {
  // a) definição do objeto, incluídos sua natureza, os quantitativos, o prazo
  // do contrato e, se for o caso, a possibilidade de sua prorrogação
  definicao_objeto: {
    natureza: string;
    descricao_detalhada: string;
    prazo_contrato_meses: number;
    permite_prorrogacao: boolean;
    limite_prorrogacao?: string;
  };

  // b) fundamentação da contratação
  fundamentacao_contratacao: string;

  // c) descrição da solução como um todo, considerado todo o ciclo de vida do
  // objeto
  descricao_solucao: string;

  // d) requisitos da contratação
  requisitos_contratacao: {
    requisitos_gerais: string;
    sustentabilidade?: string;
    acessibilidade?: string;
    seguranca?: string;
  };

  // e) modelo de execução do objeto, que consiste na definição de como o
  // contrato deverá produzir os resultados pretendidos
  modelo_execucao: string;

  // f) modelo de gestão do contrato, que descreve como a execução do objeto
  // será acompanhada e fiscalizada
  modelo_gestao: {
    descricao: string;
    fiscal_titular?: string;
    fiscal_substituto?: string;
    gestor_contrato?: string;
  };

  // g) critérios de medição e de pagamento
  criterios_medicao_pagamento: {
    forma_medicao: string;
    periodicidade: 'MENSAL' | 'QUINZENAL' | 'POR_ENTREGA' | 'POR_ETAPA' | 'OUTRA';
    forma_pagamento: string;
    prazo_pagamento_dias: number;
    instrumento_medicao?: string;
  };

  // h) forma e critérios de seleção do fornecedor
  forma_criterios_selecao: {
    modalidade: string; // PREGAO, DISPENSA_ELETRONICA, CONCORRENCIA, etc.
    criterio_julgamento: string; // MENOR_PRECO, TECNICA_E_PRECO, etc.
    modo_disputa: string;
    requisitos_habilitacao: {
      juridica: string[];
      fiscal_trabalhista: string[];
      tecnica?: string[];
      economica_financeira?: string[];
    };
  };

  // i) estimativas do valor da contratação, acompanhadas dos preços unitários
  // referenciais, das memórias de cálculo e dos documentos que lhe dão suporte
  estimativas_valor: {
    valor_total: number;
    valor_unitario_medio?: number;
    referencia_pesquisa_id?: string;
    sigilo_orcamento: boolean;
    justificativa_sigilo?: string;
  };

  // j) adequação orçamentária
  adequacao_orcamentaria: {
    fonte_recurso: string;
    elemento_despesa: string;
    dotacao_orcamentaria: string;
    exercicio_financeiro: number;
  };

  // Quantitativos e itens (deriva da licitação, mas pode ser sobreposto)
  quantitativos: Array<{
    item_numero: number;
    descricao: string;
    quantidade: number;
    unidade: string;
    valor_unitario_estimado?: number;
  }>;

  // Metadados
  responsavel_elaboracao?: {
    nome: string;
    cargo: string;
    matricula?: string;
  };
}

export function validarTr(dados: Partial<TrDados>): string[] {
  const erros: string[] = [];
  const min = 30;

  if (!dados.definicao_objeto?.descricao_detalhada || !dados.definicao_objeto?.natureza) {
    erros.push('a) Definição do objeto (natureza + descrição)');
  }
  if (!dados.definicao_objeto?.prazo_contrato_meses || dados.definicao_objeto.prazo_contrato_meses <= 0) {
    erros.push('a) Prazo do contrato em meses');
  }
  if (!dados.fundamentacao_contratacao || dados.fundamentacao_contratacao.trim().length < min) {
    erros.push('b) Fundamentação da contratação');
  }
  if (!dados.descricao_solucao || dados.descricao_solucao.trim().length < min) {
    erros.push('c) Descrição da solução (ciclo de vida)');
  }
  if (!dados.requisitos_contratacao?.requisitos_gerais) {
    erros.push('d) Requisitos da contratação');
  }
  if (!dados.modelo_execucao || dados.modelo_execucao.trim().length < min) {
    erros.push('e) Modelo de execução');
  }
  if (!dados.modelo_gestao?.descricao) {
    erros.push('f) Modelo de gestão do contrato');
  }
  if (!dados.criterios_medicao_pagamento?.forma_medicao || !dados.criterios_medicao_pagamento?.forma_pagamento) {
    erros.push('g) Critérios de medição e pagamento');
  }
  if (!dados.forma_criterios_selecao?.modalidade || !dados.forma_criterios_selecao?.criterio_julgamento) {
    erros.push('h) Forma e critérios de seleção');
  }
  if (!dados.estimativas_valor?.valor_total || dados.estimativas_valor.valor_total <= 0) {
    erros.push('i) Estimativa do valor');
  }
  if (dados.estimativas_valor?.sigilo_orcamento && !dados.estimativas_valor.justificativa_sigilo) {
    erros.push('i) Justificativa do sigilo do orçamento');
  }
  if (!dados.adequacao_orcamentaria?.dotacao_orcamentaria) {
    erros.push('j) Adequação orçamentária (dotação)');
  }
  if (!dados.quantitativos || dados.quantitativos.length === 0) {
    erros.push('Itens / quantitativos (mínimo 1)');
  }

  return erros;
}
