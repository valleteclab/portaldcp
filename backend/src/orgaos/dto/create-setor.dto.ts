import { IsString, IsUUID, MaxLength, MinLength, IsOptional } from 'class-validator';

export class CreateSetorDto {
  @IsOptional()
  @IsUUID()
  orgao_id?: string;  // Preenchido pelo controller a partir da URL

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  codigo?: string;

  @IsString()
  @MinLength(1)
  nome: string;
}
