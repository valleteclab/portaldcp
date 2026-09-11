import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { MotivoBaixa } from '../entities/enums';

export class SolicitarTransferenciaDto {
  @IsArray()
  @IsUUID('4', { each: true })
  bem_ids: string[];

  @IsUUID()
  setor_destino_id: string;

  @IsOptional()
  @IsString()
  responsavel_destino_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_destino_telefone?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  /** Comissão/gestor aplica na hora, sem esperar aceite do destino. */
  @IsOptional()
  @IsBoolean()
  aceite_imediato?: boolean;

  @IsOptional()
  @IsUUID()
  inventario_id?: string;
}

export class BaixarBemDto {
  @IsUUID()
  bem_id: string;

  @IsEnum(MotivoBaixa)
  motivo_baixa: MotivoBaixa;

  @IsString()
  motivo: string;

  @IsOptional()
  @IsString()
  documento_url?: string;

  @IsOptional()
  @IsDateString()
  data_baixa?: string;

  @IsOptional()
  @IsUUID()
  inventario_id?: string;
}

export class EmprestarBemDto {
  @IsUUID()
  bem_id: string;

  @IsString()
  destino_texto: string;

  @IsOptional()
  @IsString()
  responsavel_destino_nome?: string;

  @IsDateString()
  data_prevista_retorno: string;

  @IsOptional()
  @IsString()
  motivo?: string;
}
