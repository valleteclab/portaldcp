import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CriarLocacaoDto {
  @IsString()
  locador: string;

  @IsOptional()
  @IsString()
  numero_contrato?: string;

  @IsDateString()
  data_inicio: string;

  @IsOptional()
  @IsDateString()
  data_fim?: string;

  @IsOptional()
  @IsDateString()
  data_entrada?: string;

  @IsOptional()
  @IsDateString()
  data_devolucao?: string;
}
