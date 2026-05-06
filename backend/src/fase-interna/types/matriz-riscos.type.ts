/**
 * Matriz de Riscos
 * Conforme Art. 18, X e Art. 22 da Lei 14.133/2021.
 * É documento obrigatório para contratações de obras e serviços de engenharia
 * de grande vulto (Art. 22, §3º) e fortemente recomendado para demais.
 */
export type CategoriaRisco =
  | 'TECNICO'
  | 'JURIDICO'
  | 'ECONOMICO_FINANCEIRO'
  | 'OPERACIONAL'
  | 'AMBIENTAL'
  | 'SEGURANCA_TRABALHO'
  | 'IMAGEM_REPUTACAO'
  | 'EXTERNO_FORCA_MAIOR';

export type Probabilidade = 1 | 2 | 3 | 4 | 5; // 1=Muito Baixa, 5=Muito Alta
export type Impacto = 1 | 2 | 3 | 4 | 5;

export type ResponsavelRisco = 'CONTRATANTE' | 'CONTRATADO' | 'AMBOS';

export interface RiscoIdentificado {
  id: string; // UUID
  numero: number; // R-01, R-02...
  categoria: CategoriaRisco;
  descricao: string; // O que pode acontecer
  causa: string; // Por que pode acontecer
  consequencia: string; // O impacto se ocorrer
  fase_aplicavel: 'PLANEJAMENTO' | 'SELECAO' | 'EXECUCAO' | 'TODAS';

  probabilidade: Probabilidade;
  impacto: Impacto;
  // grau = probabilidade × impacto. 1-6 baixo, 7-14 médio, 15-25 alto
  grau?: number;
  nivel?: 'BAIXO' | 'MEDIO' | 'ALTO';

  // Tratamento (Art. 22, §1º — alocação de riscos entre as partes)
  responsavel: ResponsavelRisco;
  acoes_preventivas: string;
  acoes_contingencia: string;
  responsavel_monitoramento?: string;

  // Status
  status: 'IDENTIFICADO' | 'EM_TRATAMENTO' | 'MITIGADO' | 'MATERIALIZADO' | 'ENCERRADO';
  observacoes?: string;
}

export interface MatrizRiscosDados {
  riscos: RiscoIdentificado[];

  // Resumo executivo
  resumo_executivo?: string;

  // Critérios usados
  criterios_avaliacao?: {
    descricao_probabilidade: Record<Probabilidade, string>;
    descricao_impacto: Record<Impacto, string>;
  };

  responsavel_elaboracao?: {
    nome: string;
    cargo: string;
    matricula?: string;
  };

  // Estatísticas (calculadas)
  total_riscos?: number;
  riscos_por_nivel?: { baixo: number; medio: number; alto: number };
  riscos_por_categoria?: Record<CategoriaRisco, number>;
}

export function calcularGrauRisco(p: Probabilidade, i: Impacto): { grau: number; nivel: 'BAIXO' | 'MEDIO' | 'ALTO' } {
  const grau = p * i;
  let nivel: 'BAIXO' | 'MEDIO' | 'ALTO';
  if (grau <= 6) nivel = 'BAIXO';
  else if (grau <= 14) nivel = 'MEDIO';
  else nivel = 'ALTO';
  return { grau, nivel };
}

export function validarMatrizRiscos(dados: Partial<MatrizRiscosDados>): string[] {
  const erros: string[] = [];

  if (!dados.riscos || dados.riscos.length === 0) {
    erros.push('Matriz deve conter ao menos 1 risco identificado');
    return erros;
  }

  dados.riscos.forEach((r, idx) => {
    const prefix = `Risco ${r.numero ?? idx + 1}`;
    if (!r.descricao) erros.push(`${prefix}: descrição obrigatória`);
    if (!r.causa) erros.push(`${prefix}: causa obrigatória`);
    if (!r.consequencia) erros.push(`${prefix}: consequência obrigatória`);
    if (!r.categoria) erros.push(`${prefix}: categoria obrigatória`);
    if (!r.probabilidade || r.probabilidade < 1 || r.probabilidade > 5) {
      erros.push(`${prefix}: probabilidade deve ser 1-5`);
    }
    if (!r.impacto || r.impacto < 1 || r.impacto > 5) {
      erros.push(`${prefix}: impacto deve ser 1-5`);
    }
    if (!r.responsavel) erros.push(`${prefix}: responsável (alocação) obrigatório`);
    if (!r.acoes_preventivas) erros.push(`${prefix}: ações preventivas obrigatórias`);
    if (!r.acoes_contingencia) erros.push(`${prefix}: ações de contingência obrigatórias`);
  });

  // Lei orienta avaliar pelo menos categorias técnicas e jurídicas
  const categorias = new Set(dados.riscos.map(r => r.categoria));
  if (categorias.size < 2) {
    erros.push('Recomendado avaliar riscos de pelo menos 2 categorias diferentes');
  }

  return erros;
}

export function gerarEstatisticas(dados: MatrizRiscosDados): MatrizRiscosDados {
  const total = dados.riscos.length;
  const baixo = dados.riscos.filter(r => r.nivel === 'BAIXO').length;
  const medio = dados.riscos.filter(r => r.nivel === 'MEDIO').length;
  const alto = dados.riscos.filter(r => r.nivel === 'ALTO').length;

  const porCategoria: any = {};
  dados.riscos.forEach(r => {
    porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + 1;
  });

  return {
    ...dados,
    total_riscos: total,
    riscos_por_nivel: { baixo, medio, alto },
    riscos_por_categoria: porCategoria,
  };
}
