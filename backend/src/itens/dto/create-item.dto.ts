import { IsEnum, IsNotEmpty, IsNumber, IsString, IsOptional, IsBoolean, IsUUID, Min } from 'class-validator';
import { UnidadeMedida, TipoParticipacao } from '../entities/item-licitacao.entity';

export class CreateItemDto {
  @IsUUID()
  @IsNotEmpty()
  licitacao_id: string;

  // Vinculação com PCA
  @IsUUID()
  @IsOptional()
  item_pca_id?: string;

  @IsBoolean()
  @IsOptional()
  sem_pca?: boolean;

  @IsString()
  @IsOptional()
  justificativa_sem_pca?: string;

  @IsNumber()
  @IsNotEmpty()
  numero_item: number;

  @IsNumber()
  @IsOptional()
  numero_lote?: number;

  @IsString()
  @IsOptional()
  codigo_catalogo?: string;

  // Dados do Catálogo de Compras (compras.gov.br)
  @IsString()
  @IsOptional()
  codigo_catmat?: string; // Código CATMAT (materiais)

  @IsString()
  @IsOptional()
  codigo_catser?: string; // Código CATSER (serviços)

  @IsString()
  @IsOptional()
  codigo_pdm?: string; // Código do PDM (Padrão Descritivo de Materiais)

  @IsString()
  @IsOptional()
  nome_pdm?: string; // Nome do PDM

  @IsString()
  @IsOptional()
  classe_catalogo?: string; // Classe/categoria do catálogo

  @IsString()
  @IsOptional()
  codigo_grupo?: string; // Código do grupo

  @IsString()
  @IsOptional()
  nome_grupo?: string; // Nome do grupo

  @IsString()
  @IsNotEmpty({ message: 'Descrição do item é obrigatória' })
  descricao_resumida: string;

  @IsString()
  @IsOptional()
  descricao_detalhada?: string;

  @IsString()
  @IsOptional()
  marca_referencia?: string;

  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  quantidade: number;

  @IsNumber()
  @IsOptional()
  quantidade_minima?: number;

  @IsEnum(UnidadeMedida)
  @IsNotEmpty()
  unidade_medida: UnidadeMedida;

  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  valor_unitario_estimado: number;

  @IsEnum(TipoParticipacao)
  @IsOptional()
  tipo_participacao?: TipoParticipacao;

  @IsBoolean()
  @IsOptional()
  margem_preferencia?: boolean;

  @IsNumber()
  @IsOptional()
  percentual_margem?: number;

  @IsString()
  @IsOptional()
  observacoes?: string;
}

export class UpdateItemDto {
  @IsString()
  @IsOptional()
  descricao_resumida?: string;

  @IsString()
  @IsOptional()
  descricao_detalhada?: string;

  @IsNumber()
  @IsOptional()
  quantidade?: number;

  @IsNumber()
  @IsOptional()
  valor_unitario_estimado?: number;

  @IsEnum(TipoParticipacao)
  @IsOptional()
  tipo_participacao?: TipoParticipacao;

  @IsString()
  @IsOptional()
  observacoes?: string;

  // Dados do Catálogo de Compras (compras.gov.br)
  @IsString()
  @IsOptional()
  codigo_catalogo?: string;

  @IsString()
  @IsOptional()
  codigo_catmat?: string; // Código CATMAT (materiais)

  @IsString()
  @IsOptional()
  codigo_catser?: string; // Código CATSER (serviços)

  @IsString()
  @IsOptional()
  codigo_pdm?: string; // Código do PDM (Padrão Descritivo de Materiais)

  @IsString()
  @IsOptional()
  nome_pdm?: string; // Nome do PDM

  @IsString()
  @IsOptional()
  classe_catalogo?: string; // Classe/categoria do catálogo

  @IsString()
  @IsOptional()
  codigo_grupo?: string; // Código do grupo

  @IsString()
  @IsOptional()
  nome_grupo?: string; // Nome do grupo
}

export class AdjudicarItemDto {
  @IsUUID()
  @IsNotEmpty()
  fornecedor_id: string;

  @IsString()
  @IsNotEmpty()
  fornecedor_nome: string;

  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  valor_unitario_homologado: number;
}

// DTO para importar múltiplos itens do PCA
export class ImportarItensPcaDto {
  @IsUUID()
  @IsNotEmpty()
  licitacao_id: string;

  @IsUUID()
  @IsNotEmpty()
  item_pca_id: string;

  itens: {
    descricao_resumida: string;
    descricao_detalhada?: string;
    quantidade: number;
    unidade_medida: UnidadeMedida;
    valor_unitario_estimado: number;
    codigo_catalogo?: string;
    tipo_participacao?: TipoParticipacao;
  }[];
}

// DTO para item sem PCA
export class CreateItemSemPcaDto {
  @IsUUID()
  @IsNotEmpty()
  licitacao_id: string;

  @IsString()
  @IsNotEmpty({ message: 'Justificativa é obrigatória para itens sem PCA' })
  justificativa_sem_pca: string;

  @IsNumber()
  @IsNotEmpty()
  numero_item: number;

  @IsString()
  @IsNotEmpty()
  descricao_resumida: string;

  @IsString()
  @IsOptional()
  descricao_detalhada?: string;

  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  quantidade: number;

  @IsEnum(UnidadeMedida)
  @IsNotEmpty()
  unidade_medida: UnidadeMedida;

  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  valor_unitario_estimado: number;

  @IsString()
  @IsOptional()
  codigo_catalogo?: string;
}
