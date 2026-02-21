import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsEmail, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SignatarioDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do signatário é obrigatório' })
  nome: string;

  @IsString()
  @IsOptional()
  cpf_cnpj?: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefone?: string;

  @IsNumber()
  @IsOptional()
  pagina_assinatura?: number;

  @IsNumber()
  @IsOptional()
  pos_x?: number;

  @IsNumber()
  @IsOptional()
  pos_y?: number;

  @IsBoolean()
  @IsOptional()
  is_orgao_user?: boolean;
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