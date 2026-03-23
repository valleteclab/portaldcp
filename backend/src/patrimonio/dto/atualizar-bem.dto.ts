import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsUUID,
} from 'class-validator';
import { TipoBem, EstadoConservacao, StatusBem } from '../entities/enums';

export class AtualizarBemDto {
  @IsOptional()
  @IsString()
  plaqueta?: string;

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
  @IsEnum(StatusBem)
  status?: StatusBem;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
