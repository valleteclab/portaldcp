import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { StatusManutencao } from '../entities/enums';

export class AtualizarManutencaoDto {
  @IsOptional()
  @IsString()
  setor?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsEnum(StatusManutencao)
  status?: StatusManutencao;

  @IsOptional()
  @IsDateString()
  data_saida?: string;

  @IsOptional()
  @IsDateString()
  data_retorno?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
