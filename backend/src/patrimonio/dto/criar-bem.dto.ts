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
import { TipoBem, EstadoConservacao } from '../entities/enums';

export class CriarBemDto {
  /** Vazio = o sistema numera (próximo número do órgão). */
  @IsOptional()
  @IsString()
  plaqueta?: string;

  @IsOptional()
  @IsString()
  epc?: string;

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
  @IsUUID()
  setor_id?: string;

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
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  numero_serie?: string;

  @IsOptional()
  @IsNumber()
  valor_aquisicao?: number;

  @IsOptional()
  @IsDateString()
  data_aquisicao?: string;

  @IsOptional()
  @IsString()
  nota_fiscal_numero?: string;

  @IsOptional()
  @IsString()
  fornecedor_nome?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
