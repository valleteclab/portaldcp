import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsEnum, Min } from 'class-validator';
import { TipoAprovador } from '../entities/configuracao-aprovacao.entity';

export class CriarConfiguracaoAprovacaoDto {
  @IsNumber()
  @Min(1)
  nivel: number;

  @IsString()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsNumber()
  @Min(0)
  valor_minimo: number;

  @IsOptional()
  @IsNumber()
  valor_maximo?: number;

  @IsEnum(TipoAprovador)
  tipo_aprovador: TipoAprovador;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  perfis_permitidos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usuarios_aprovadores_ids?: string[];

  @IsOptional()
  @IsBoolean()
  bloquear_auto_aprovacao?: boolean;

  @IsOptional()
  @IsBoolean()
  exigir_justificativa_aprovacao?: boolean;

  @IsOptional()
  @IsBoolean()
  exigir_justificativa_negacao?: boolean;

  @IsOptional()
  @IsBoolean()
  notificar_email_aprovador?: boolean;

  @IsOptional()
  @IsBoolean()
  notificar_email_solicitante?: boolean;
}

export class AtualizarConfiguracaoAprovacaoDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  nivel?: number;

  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_minimo?: number;

  @IsOptional()
  @IsNumber()
  valor_maximo?: number;

  @IsOptional()
  @IsEnum(TipoAprovador)
  tipo_aprovador?: TipoAprovador;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  perfis_permitidos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usuarios_aprovadores_ids?: string[];

  @IsOptional()
  @IsBoolean()
  bloquear_auto_aprovacao?: boolean;

  @IsOptional()
  @IsBoolean()
  exigir_justificativa_aprovacao?: boolean;

  @IsOptional()
  @IsBoolean()
  exigir_justificativa_negacao?: boolean;

  @IsOptional()
  @IsBoolean()
  notificar_email_aprovador?: boolean;

  @IsOptional()
  @IsBoolean()
  notificar_email_solicitante?: boolean;
}
