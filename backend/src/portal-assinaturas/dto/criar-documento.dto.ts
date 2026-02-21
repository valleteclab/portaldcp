import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class SignatarioDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do signatário é obrigatório' })
  nome: string;

  @IsString()
  @IsNotEmpty({ message: 'CPF/CNPJ do signatário é obrigatório' })
  cpf_cnpj: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefone?: string;
}

export class CriarDocumentoDto {
  @IsString()
  @IsNotEmpty({ message: 'Título do documento é obrigatório' })
  titulo: string;

  @IsString()
  @IsOptional()
  descricao?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignatarioDto)
  signatarios: SignatarioDto[];
}