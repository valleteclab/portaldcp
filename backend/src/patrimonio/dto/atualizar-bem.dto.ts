import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsUUID,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { TipoBem, EstadoConservacao, StatusBem } from '../entities/enums';

export class AtualizarBemDto {
  @IsOptional()
  @IsString()
  plaqueta?: string;

  @IsOptional()
  @IsString()
  epc?: string | null;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsUUID()
  categoria_id?: string;

  @IsOptional()
  @IsEnum(TipoBem)
  tipo?: TipoBem;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;

  @IsOptional()
  @IsEnum(EstadoConservacao)
  estado_conservacao?: EstadoConservacao;

  @IsOptional()
  setor_id?: string | null;

  @IsOptional()
  @IsString()
  localizacao_codigo?: string;

  @IsOptional()
  @IsString()
  localizacao_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_cargo?: string;

  @IsOptional()
  @IsString()
  marca?: string | null;

  @IsOptional()
  @IsString()
  modelo?: string | null;

  @IsOptional()
  @IsString()
  numero_serie?: string | null;

  @IsOptional()
  @IsNumber()
  valor_aquisicao?: number | null;

  @IsOptional()
  @IsDateString()
  data_aquisicao?: string | null;

  @IsOptional()
  @IsString()
  nota_fiscal_numero?: string | null;

  @IsOptional()
  @IsString()
  fornecedor_nome?: string | null;

  @IsOptional()
  @IsEnum(StatusBem)
  status?: StatusBem;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
