import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CriarManutencaoDto {
  @IsString()
  setor: string;

  @IsString()
  motivo: string;

  @IsDateString()
  data_entrada: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
