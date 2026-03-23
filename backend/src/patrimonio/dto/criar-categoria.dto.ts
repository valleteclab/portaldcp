import { IsString } from 'class-validator';

export class CriarCategoriaDto {
  @IsString()
  nome: string;
}
