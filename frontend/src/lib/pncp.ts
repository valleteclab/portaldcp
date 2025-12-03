/**
 * Serviço de Integração PNCP - Frontend
 * 
 * Este módulo fornece funções para interagir com a API de integração PNCP
 * do backend LicitaFácil.
 * 
 * @version 1.0.0
 * @date 2025-12-01
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============ TIPOS/INTERFACES ============

export interface PncpResponse {
  sucesso: boolean;
  mensagem: string;
  numeroControlePNCP?: string;
  dados?: any;
  link?: string;
}

// === PCA ===
export interface ItemPca {
  numero_item: number;
  categoria_item_pca: number;           // 1=Bens, 2=Serviços, 3=Obras
  descricao: string;
  unidade_fornecimento: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  valor_orcamento_exercicio: number;
  unidade_requisitante: string;
  data_desejada: string;                // YYYY-MM-DD
  classificacao_catalogo_id?: number;   // 1=CATMAT, 2=CATSER
  codigo_classe?: string;
  descricao_classe?: string;
}

export interface Pca {
  ano_pca: number;
  codigo_unidade?: string;  // Código da unidade no PNCP (ex: "1", "2")
  nome_unidade?: string;    // Nome da unidade para referência
  itens: ItemPca[];
}

// === COMPRA ===
export interface ItemCompra {
  numero_item: number;
  descricao: string;
  tipo: 'MATERIAL' | 'SERVICO';
  quantidade: number;
  unidade_medida: string;
  valor_unitario: number;
  valor_total: number;
  tipo_beneficio_id?: number;
  criterio_julgamento_id?: number;
  orcamento_sigiloso?: boolean;
  item_categoria_id?: number;
}

export interface Compra {
  codigo_unidade: string;
  ano_compra: number;
  numero_compra?: string;
  numero_processo: string;
  objeto: string;
  modalidade_id: number;
  modo_disputa_id: number;
  tipo_instrumento_id: number;
  amparo_legal_id: number;
  srp: boolean;
  data_abertura_proposta: string;
  data_encerramento_proposta: string;
  informacao_complementar?: string;
  titulo_documento: string;
  link_sistema_origem?: string;
  itens: ItemCompra[];
}

export interface CompraRetificacao {
  objeto?: string;
  informacao_complementar?: string;
  data_abertura_proposta?: string;
  data_encerramento_proposta?: string;
}

// === RESULTADO ===
export interface Resultado {
  data_resultado: string;
  cnpj_fornecedor: string;
  nome_fornecedor: string;
  quantidade_homologada: number;
  valor_unitario_homologado: number;
  valor_total_homologado: number;
  percentual_desconto?: number;
  porte_fornecedor_id?: number;
  codigo_pais?: string;
  subcontratacao?: boolean;
  aplicacao_margem_preferencia?: boolean;
  aplicacao_beneficio_me_epp?: boolean;
  aplicacao_criterio_desempate?: boolean;
}

export interface ResultadoRetificacao extends Resultado {
  situacao_id: number;
  sequencial_resultado?: number;
}

// === ATA ===
export interface ItemAta {
  numero_item: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

export interface Ata {
  numero_ata: string;
  ano_ata: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  cnpj_fornecedor: string;
  nome_fornecedor: string;
  itens: ItemAta[];
}

export interface AtaRetificacao {
  numero_ata: string;
  ano_ata: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  justificativa: string;
  situacao_id?: number;
}

// === CONTRATO ===
export interface Contrato {
  ano_compra: number;
  sequencial_compra: number;
  tipo_contrato_id: number;
  numero_contrato: string;
  ano_contrato: number;
  objeto: string;
  cnpj_fornecedor: string;
  nome_fornecedor: string;
  valor_inicial: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
}

// ============ CONSTANTES ============

export const MODALIDADES = {
  LEILAO_ELETRONICO: 1,
  DIALOGO_COMPETITIVO: 2,
  CONCURSO: 3,
  CONCORRENCIA_ELETRONICA: 4,
  CONCORRENCIA_PRESENCIAL: 5,
  PREGAO_ELETRONICO: 6,
  PREGAO_PRESENCIAL: 7,
  DISPENSA: 8,
  INEXIGIBILIDADE: 9,
  LEILAO_PRESENCIAL: 12,
  PRE_QUALIFICACAO: 13,
} as const;

export const MODO_DISPUTA = {
  ABERTO: 1,
  FECHADO: 2,
  ABERTO_FECHADO: 3,
  FECHADO_ABERTO: 4,
  NAO_SE_APLICA: 5,
} as const;

export const TIPO_INSTRUMENTO = {
  EDITAL: 1,
  AVISO_CONTRATACAO_DIRETA: 2,
  ATO_AUTORIZACAO: 3,
} as const;

export const PORTE_FORNECEDOR = {
  ME: 1,
  EPP: 2,
  DEMAIS: 3,
  NAO_SE_APLICA: 4,
  NAO_INFORMADO: 5,
} as const;

export const CATEGORIA_ITEM_PCA = {
  BENS: 1,
  SERVICOS: 2,
  OBRAS: 3,
} as const;

// ============ FUNÇÕES AUXILIARES ============

async function handleResponse(response: Response): Promise<PncpResponse> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Erro na requisição');
  }
  return data;
}

function getHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('orgao_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

// ============ SERVIÇO PNCP ============

export const pncpService = {
  // === CONFIGURAÇÃO ===
  
  async getStatus(): Promise<any> {
    const response = await fetch(`${API_URL}/api/pncp/config/status`);
    return handleResponse(response);
  },

  async testarConexao(): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/config/testar-conexao`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // === PCA ===

  async incluirPca(pca: Pca): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/pca`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(pca),
    });
    return handleResponse(response);
  },

  async retificarPca(ano: number, sequencial: number, pca: Partial<Pca>): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/pca/${ano}/${sequencial}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(pca),
    });
    return handleResponse(response);
  },

  async excluirPca(ano: number, sequencial: number, justificativa: string): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/pca/${ano}/${sequencial}`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ justificativa }),
    });
    return handleResponse(response);
  },

  async consultarPca(ano: number, sequencial: number): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/pca/${ano}/${sequencial}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  async incluirItemPca(ano: number, sequencial: number, item: ItemPca): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/pca/${ano}/${sequencial}/itens`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(item),
    });
    return handleResponse(response);
  },

  async retificarItemPca(ano: number, sequencial: number, numeroItem: number, item: Partial<ItemPca>): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/pca/${ano}/${sequencial}/itens/${numeroItem}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(item),
    });
    return handleResponse(response);
  },

  async excluirItemPca(ano: number, sequencial: number, numeroItem: number, justificativa: string): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/pca/${ano}/${sequencial}/itens/${numeroItem}`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ justificativa }),
    });
    return handleResponse(response);
  },

  // === COMPRAS ===

  async incluirCompra(compra: Compra): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(compra),
    });
    return handleResponse(response);
  },

  async retificarCompra(ano: number, sequencial: number, compra: CompraRetificacao): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(compra),
    });
    return handleResponse(response);
  },

  async excluirCompra(ano: number, sequencial: number, justificativa: string): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ justificativa }),
    });
    return handleResponse(response);
  },

  async consultarCompra(ano: number, sequencial: number): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // === RESULTADO DE ITENS ===

  async incluirResultado(ano: number, sequencial: number, numeroItem: number, resultado: Resultado): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}/itens/${numeroItem}/resultado`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(resultado),
    });
    return handleResponse(response);
  },

  async retificarResultado(ano: number, sequencial: number, numeroItem: number, resultado: ResultadoRetificacao): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}/itens/${numeroItem}/resultado`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(resultado),
    });
    return handleResponse(response);
  },

  // === ATA DE REGISTRO DE PREÇO ===

  async incluirAta(ano: number, sequencial: number, ata: Ata): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}/atas`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(ata),
    });
    return handleResponse(response);
  },

  async retificarAta(ano: number, sequencial: number, sequencialAta: number, ata: AtaRetificacao): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}/atas/${sequencialAta}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(ata),
    });
    return handleResponse(response);
  },

  async excluirAta(ano: number, sequencial: number, sequencialAta: number, justificativa: string): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/compras/${ano}/${sequencial}/atas/${sequencialAta}`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ justificativa }),
    });
    return handleResponse(response);
  },

  // === CONTRATOS ===

  async incluirContrato(contrato: Contrato): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/contratos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(contrato),
    });
    return handleResponse(response);
  },

  async retificarContrato(ano: number, sequencial: number, contrato: Partial<Contrato>): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/contratos/${ano}/${sequencial}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(contrato),
    });
    return handleResponse(response);
  },

  async excluirContrato(ano: number, sequencial: number, justificativa: string): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/contratos/${ano}/${sequencial}`, {
      method: 'DELETE',
      headers: getHeaders(),
      body: JSON.stringify({ justificativa }),
    });
    return handleResponse(response);
  },

  async consultarContrato(ano: number, sequencial: number): Promise<PncpResponse> {
    const response = await fetch(`${API_URL}/api/pncp/contratos/${ano}/${sequencial}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // === UTILITÁRIOS ===

  /**
   * Gera link para visualização no portal PNCP
   */
  getLinkEdital(cnpj: string, ano: number, sequencial: number): string {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    return `https://pncp.gov.br/app/editais/${cnpjLimpo}/${ano}/${sequencial}`;
  },

  getLinkAta(cnpj: string, anoCompra: number, seqCompra: number, seqAta: number): string {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    return `https://pncp.gov.br/app/atas/${cnpjLimpo}/${anoCompra}/${seqCompra}/${seqAta}`;
  },

  getLinkContrato(cnpj: string, ano: number, sequencial: number): string {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    return `https://pncp.gov.br/app/contratos/${cnpjLimpo}/${ano}/${sequencial}`;
  },

  /**
   * Valida CNPJ
   */
  validarCNPJ(cnpj: string): boolean {
    cnpj = cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) return false;
    
    // Validação básica
    if (/^(\d)\1+$/.test(cnpj)) return false;
    
    // Cálculo dos dígitos verificadores
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    const digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return resultado === parseInt(digitos.charAt(1));
  },

  /**
   * Formata CNPJ
   */
  formatarCNPJ(cnpj: string): string {
    cnpj = cnpj.replace(/\D/g, '');
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  },

  /**
   * Detecta tipo de pessoa pelo documento
   */
  detectarTipoPessoa(documento: string): 'PF' | 'PJ' | 'PE' {
    const doc = documento.replace(/\D/g, '');
    if (doc.length === 11) return 'PF';
    if (doc.length === 14) return 'PJ';
    return 'PE';
  },
};

export default pncpService;
