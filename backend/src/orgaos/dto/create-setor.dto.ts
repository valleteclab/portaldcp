import { IsString, IsUUID, MaxLength, MinLength, IsOptional } from 'class-validator';

export class CreateSetorDto {
  @IsUUID()
  orgao_id: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  codigo?: string;

  @IsString()
  @MinLength(1)
  nome: string;
}
