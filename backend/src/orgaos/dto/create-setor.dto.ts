import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSetorDto {
  @IsUUID()
  orgao_id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  codigo: string;

  @IsString()
  @MinLength(1)
  nome: string;
}
