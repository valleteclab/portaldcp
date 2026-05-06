/**
 * Estrutura de dados da Pesquisa de Preços
 * Conforme Art. 23 da Lei 14.133/2021 e IN SEGES/ME 65/2021.
 *
 * Exige no mínimo 3 fontes de pesquisa entre:
 *  I — Painel de Preços (paineldeprecos.planejamento.gov.br)
 *  II — contratações similares (PNCP / contratos vigentes)
 *  III — mídias e sítios eletrônicos especializados
 *  IV — pesquisa direta com fornecedores (mín. 3 fornecedores)
 *  V — pesquisa em base nacional de notas fiscais eletrônicas
 */
export type FontePesquisaTipo =
  | 'PAINEL_DE_PRECOS'
  | 'PNCP'
  | 'CONTRATO_VIGENTE_SISTEMA'
  | 'MIDIA_ESPECIALIZADA'
  | 'FORNECEDOR_DIRETO'
  | 'NOTA_FISCAL_ELETRONICA'
  | 'OUTRA';

export interface CotacaoPorFonte {
  fonte: FontePesquisaTipo;
  descricao_fonte: string; // Ex: "Painel de Preços", "Loja XPTO", "Contrato CT-2024/0023"
  url_referencia?: string;
  data_pesquisa: string; // ISO date

  // Identificação do fornecedor (obrigatório para FORNECEDOR_DIRETO)
  fornecedor_cnpj?: string;
  fornecedor_razao_social?: string;

  valor_unitario: number;
  observacao?: string;

  // Documento comprobatório (PDF da cotação, screenshot, contrato, etc.)
  documento_comprobatorio_path?: string;
  documento_hash?: string;
}

export interface ItemPesquisaPrecos {
  item_numero: number;
  descricao: string;
  quantidade: number;
  unidade: string;

  cotacoes: CotacaoPorFonte[];

  // Cálculos automáticos (preenchidos pelo backend)
  valor_minimo?: number;
  valor_maximo?: number;
  valor_medio?: number;
  valor_mediano?: number;
  desvio_padrao?: number;
  cv_percent?: number; // coeficiente de variação

  // Metodologia escolhida e valor referencial
  metodologia: 'MEDIA' | 'MEDIANA' | 'MENOR_VALOR' | 'OUTRA';
  justificativa_metodologia?: string; // obrigatória se OUTRA ou se descartar outliers
  valor_referencial: number;

  // Outliers descartados
  outliers_descartados?: Array<{
    cotacao_index: number;
    motivo: string;
  }>;
}

export interface PesquisaPrecosDados {
  itens: ItemPesquisaPrecos[];

  // Metodologia geral
  metodologia_geral?: string;
  observacoes?: string;

  // Resumo
  valor_total_estimado?: number;

  responsavel_pesquisa?: {
    nome: string;
    cargo: string;
    matricula?: string;
  };
}

/**
 * Validação:
 * - mínimo 3 fontes DISTINTAS por item
 * - se < 3, deve haver justificativa formal (Art. 23, §4º permite só em casos excepcionais)
 */
export function validarPesquisaPrecos(dados: Partial<PesquisaPrecosDados>): string[] {
  const erros: string[] = [];

  if (!dados.itens || dados.itens.length === 0) {
    erros.push('Pesquisa deve conter ao menos 1 item');
    return erros;
  }

  dados.itens.forEach((item, idx) => {
    const prefix = `Item ${item.item_numero ?? idx + 1}`;
    if (!item.cotacoes || item.cotacoes.length === 0) {
      erros.push(`${prefix}: nenhuma cotação informada`);
      return;
    }

    const fontesDistintas = new Set(item.cotacoes.map(c => c.fonte));
    if (fontesDistintas.size < 3) {
      erros.push(`${prefix}: pesquisa exige no mínimo 3 fontes distintas (Art. 23, §1º) — atualmente ${fontesDistintas.size}`);
    }

    // FORNECEDOR_DIRETO precisa CNPJ
    item.cotacoes.forEach((cot, ci) => {
      if (cot.fonte === 'FORNECEDOR_DIRETO' && !cot.fornecedor_cnpj) {
        erros.push(`${prefix} cotação #${ci + 1}: CNPJ do fornecedor é obrigatório`);
      }
      if (!cot.valor_unitario || cot.valor_unitario <= 0) {
        erros.push(`${prefix} cotação #${ci + 1}: valor unitário deve ser > 0`);
      }
      if (!cot.data_pesquisa) {
        erros.push(`${prefix} cotação #${ci + 1}: data da pesquisa é obrigatória`);
      }
    });

    if (!item.metodologia) {
      erros.push(`${prefix}: metodologia de cálculo é obrigatória`);
    }
    if (item.metodologia === 'OUTRA' && !item.justificativa_metodologia) {
      erros.push(`${prefix}: justificativa obrigatória para metodologia "OUTRA"`);
    }
    if (item.outliers_descartados?.length && !item.justificativa_metodologia) {
      erros.push(`${prefix}: descarte de outliers exige justificativa`);
    }
    if (!item.valor_referencial || item.valor_referencial <= 0) {
      erros.push(`${prefix}: valor referencial é obrigatório`);
    }
  });

  return erros;
}

/**
 * Calcula estatísticas a partir das cotações de um item.
 */
export function calcularEstatisticasItem(item: ItemPesquisaPrecos): ItemPesquisaPrecos {
  const valores = item.cotacoes
    .filter((_, idx) => !item.outliers_descartados?.some(o => o.cotacao_index === idx))
    .map(c => c.valor_unitario)
    .filter(v => v > 0);

  if (valores.length === 0) return item;

  const sorted = [...valores].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = valores.reduce((a, b) => a + b, 0);
  const media = sum / valores.length;
  const mediana = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variancia = valores.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / valores.length;
  const desvio = Math.sqrt(variancia);
  const cv = media > 0 ? (desvio / media) * 100 : 0;

  return {
    ...item,
    valor_minimo: min,
    valor_maximo: max,
    valor_medio: parseFloat(media.toFixed(4)),
    valor_mediano: parseFloat(mediana.toFixed(4)),
    desvio_padrao: parseFloat(desvio.toFixed(4)),
    cv_percent: parseFloat(cv.toFixed(2)),
  };
}
