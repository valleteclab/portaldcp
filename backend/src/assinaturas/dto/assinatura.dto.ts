import { IsString, IsNotEmpty, Length } from 'class-validator';

export class SolicitarOtpDto {
  @IsString()
  @IsNotEmpty()
  telefone: string;

  @IsString()
  @IsNotEmpty()
  usuario_nome: string;
}

export class ValidarOtpDto {
  @IsString()
  @IsNotEmpty()
  telefone: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  codigo: string;
}
