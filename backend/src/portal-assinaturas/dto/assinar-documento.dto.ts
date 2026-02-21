import { IsString, IsNotEmpty } from 'class-validator';

export class SolicitarCodigoAssinaturaDto {
  @IsString()
  @IsNotEmpty()
  token_acesso: string;

  @IsString()
  @IsNotEmpty()
  cpf_cnpj: string;
}

export class ValidarAssinaturaDto {
  @IsString()
  @IsNotEmpty()
  token_acesso: string;

  @IsString()
  @IsNotEmpty()
  cpf_cnpj: string;

  @IsString()
  @IsNotEmpty()
  codigo_otp: string;
}