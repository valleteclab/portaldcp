import { IsEnum, IsNotEmpty, IsNumber, IsString, IsOptional, IsBoolean, IsUUID, Min } from 'class-validator';
import { UnidadeMedida, TipoParticipacao } from '../entities/item-licitacao.entity';

export class CreateItemDto {
  @IsUUID()
  @IsNotEmpty()
  licitacao_id: string;

  @IsNumber()
  @IsNotEmpty()
  numero_item: number;

  @IsNumber()
  @IsOptional()
  numero_lote?: number;

  @IsString()
  @IsOptional()
  codigo_catalogo?: string;

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
