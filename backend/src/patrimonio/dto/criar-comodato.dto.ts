import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CriarComodatoDto {
  @IsString()
  comodante: string;

  @IsOptional()
  @IsString()
  numero_termo?: string;

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
