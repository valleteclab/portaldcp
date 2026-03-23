import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsUUID,
} from 'class-validator';
import { TipoBem, EstadoConservacao } from '../entities/enums';

export class CriarBemDto {
  @IsOptional()
  @IsString()
  plaqueta?: string;

  @IsString()
  descricao: string;

  @IsOptional()
  @IsUUID()
  categoria_id?: string;

  @IsEnum(TipoBem)
  tipo: TipoBem;

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
  @IsString()
  observacoes?: string;
}
