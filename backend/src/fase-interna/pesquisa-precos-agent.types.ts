import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';
import { Licitacao } from '../licitacoes/entities/licitacao.entity';
import { FontePesquisaTipo } from './types/pesquisa-precos.type';

export interface PesquisaPrecoAgentScope {
  itemNumeros?: number[];
  fontes?: FontePesquisaTipo[];
  maxPorFonte?: number;
  usarBrowserFallback?: boolean;
  iniciadoPorId?: string;
  iniciadoPorNome?: string;
}

export interface PesquisaPrecoAgentContext {
  licitacao: Licitacao;
  itens: ItemLicitacao[];
  scope: PesquisaPrecoAgentScope;
}

export interface PesquisaPrecoCandidateInput {
  item_numero: number;
  fonte_tipo: FontePesquisaTipo;
  descricao_fonte: string;
  url_referencia?: string;
  data_pesquisa: string;
  fornecedor_cnpj?: string;
  fornecedor_razao_social?: string;
  valor_unitario: number;
  quantidade_base?: number;
  unidade?: string;
  evidencia?: {
    tipo?: 'api' | 'html' | 'screenshot' | 'arquivo' | 'manual';
    path?: string;
    hash?: string;
    titulo?: string;
    coletado_em?: string;
    origem?: string;
  };
  score?: number;
  flags?: string[];
}

export interface PesquisaPrecoProvider {
  readonly fonte: FontePesquisaTipo;
  buscar(context: PesquisaPrecoAgentContext): Promise<PesquisaPrecoCandidateInput[]>;
}
