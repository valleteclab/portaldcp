import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CriarServidorBemDto {
  @IsString()
  proprietario_nome: string;

  @IsOptional()
  @IsString()
  proprietario_cargo?: string;

  @IsDateString()
  data_entrada: string;

  @IsOptional()
  @IsDateString()
  data_saida?: string;
}
