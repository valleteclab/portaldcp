import { IsString, IsNumber, IsOptional, IsEnum, Min, IsUUID } from 'class-validator';
import { UnidadeMedidaContrato } from '../entities/item-contrato.entity';

export class CriarItemContratoDto {
  @IsOptional()
  @IsUUID()
  contrato_id?: string;

  @IsNumber()
  @Min(1)
  numero_item: number;

  @IsOptional()
  @IsString()
  codigo_catalogo?: string;

  @IsOptional()
  @IsString()
  codigo_catalogo_proprio?: string;

  @IsOptional()
  @IsNumber()
  lote_numero?: number;

  @IsOptional()
  @IsString()
  lote_descricao?: string;

  @IsString()
  descricao: string;

  @IsOptional()
  @IsString()
  descricao_detalhada?: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsEnum(UnidadeMedidaContrato)
  unidade_medida: UnidadeMedidaContrato;

  @IsNumber()
  @Min(0)
  valor_unitario: number;

  @IsNumber()
  @Min(0)
  quantidade_contratada: number;

  @IsOptional()
  @IsString()
  item_licitacao_id?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class AtualizarItemContratoDto {
  @IsOptional()
  @IsString()
  codigo_catalogo?: string;

  @IsOptional()
  @IsString()
  codigo_catalogo_proprio?: string;

  @IsOptional()
  @IsNumber()
  lote_numero?: number;

  @IsOptional()
  @IsString()
  lote_descricao?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  descricao_detalhada?: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_unitario?: number;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
