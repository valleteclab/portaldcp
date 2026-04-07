export interface CamposExtraidosNF {
  nota_fiscal_numero: string | null;
  nota_fiscal_valor: number | null;
  nota_fiscal_data: string | null; // YYYY-MM-DD
  cnpj_emitente: string | null;
  razao_social_emitente: string | null;
  competencia: string | null; // ex: "MARÇO/2026"
  periodo_inicio: string | null; // ex: "2026-03-01"
  periodo_fim: string | null; // ex: "2026-03-31"
}

export interface ValidacaoNF {
  tipo: 'info' | 'warning' | 'error';
  campo: string;
  mensagem: string;
}

export interface DiscriminacaoSugerida {
  descricao: string;
  valor: number;
  percentual: number;
}

export interface ResultadoExtracao {
  campos: CamposExtraidosNF;
  validacoes: ValidacaoNF[];
  discriminacoes_sugeridas: DiscriminacaoSugerida[];
  fonte: 'xml' | 'pdf_ia' | 'imagem_ia';
}

export interface NfRawItem {
  descricao: string;
  quantidade?: number;
  unidade?: string;
  valor_unitario?: number;
  valor_total: number;
}

export interface NfRawData {
  numero?: string;
  serie?: string;
  data_emissao?: string;
  valor_total?: number;
  cnpj_emitente?: string;
  razao_social_emitente?: string;
  competencia?: string | null;
  itens?: NfRawItem[];
}

export interface CriarRascunhoDto {
  contrato_id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  periodo_inicio: string;
  periodo_fim: string;
  competencia?: string;
  nota_fiscal_numero?: string;
  nota_fiscal_valor?: number;
  nota_fiscal_data?: string;
  observacoes?: string;
  valor_medido?: number;
  discriminacoes?: DiscriminacaoSugerida[];
  itens?: Array<
    | { etapa_id: string; percentual_executado_atual: number; valor_executado_atual?: number }
    | { item_cronograma_id: string; quantidade_medida: number }
  >;
}
