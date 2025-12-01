import { IsEnum, IsNotEmpty, IsOptional, IsString, Length, IsEmail, Matches } from 'class-validator';
import { TipoOrgao, EsferaAdministrativa } from '../entities/orgao.entity';

export class CreateOrgaoDto {
  @IsString()
  @IsNotEmpty({ message: 'Código do órgão é obrigatório' })
  codigo: string;

  @IsString()
  @IsNotEmpty({ message: 'Nome do órgão é obrigatório' })
  nome: string;

  @IsString()
  @IsOptional()
  nome_fantasia?: string;

  @IsString()
  @IsNotEmpty({ message: 'CNPJ é obrigatório' })
  @Matches(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, { message: 'CNPJ deve estar no formato XX.XXX.XXX/XXXX-XX' })
  cnpj: string;

  @IsEnum(TipoOrgao)
  @IsNotEmpty()
  tipo: TipoOrgao;

  @IsEnum(EsferaAdministrativa)
  @IsNotEmpty()
  esfera: EsferaAdministrativa;

  // Endereço
  @IsString()
  @IsNotEmpty()
  logradouro: string;

  @IsString()
  @IsOptional()
  numero?: string;

  @IsString()
  @IsOptional()
  complemento?: string;

  @IsString()
  @IsNotEmpty()
  bairro: string;

  @IsString()
  @IsNotEmpty()
  cidade: string;

  @IsString()
  @Length(2, 2)
  uf: string;

  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido' })
  cep: string;

  // Contato
  @IsString()
  @IsOptional()
  telefone?: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  site?: string;

  // Responsável Legal
  @IsString()
  @IsNotEmpty({ message: 'Nome do responsável é obrigatório' })
  responsavel_nome: string;

  @IsString()
  @IsNotEmpty({ message: 'CPF do responsável é obrigatório' })
  @Matches(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, { message: 'CPF deve estar no formato XXX.XXX.XXX-XX' })
  responsavel_cpf: string;

  @IsString()
  @IsOptional()
  responsavel_cargo?: string;
}
