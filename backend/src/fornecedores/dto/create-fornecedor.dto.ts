import { IsEnum, IsNotEmpty, IsOptional, IsString, IsEmail, IsArray, Matches, Length } from 'class-validator';
import { TipoPessoa, PorteEmpresa } from '../entities/fornecedor.entity';

// DTO para Nível I - Credenciamento (Cadastro Inicial)
export class CreateFornecedorDto {
  @IsEnum(TipoPessoa)
  @IsNotEmpty()
  tipo_pessoa: TipoPessoa;

  @IsString()
  @IsNotEmpty({ message: 'CPF/CNPJ é obrigatório' })
  cpf_cnpj: string;

  @IsString()
  @IsNotEmpty({ message: 'Razão Social é obrigatória' })
  razao_social: string;

  @IsString()
  @IsOptional()
  nome_fantasia?: string;

  @IsString()
  @IsOptional()
  inscricao_estadual?: string;

  @IsString()
  @IsOptional()
  inscricao_municipal?: string;

  @IsEnum(PorteEmpresa)
  @IsOptional()
  porte?: PorteEmpresa;

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
  @IsNotEmpty()
  telefone: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  site?: string;

  // Representante Legal
  @IsString()
  @IsNotEmpty({ message: 'Nome do representante é obrigatório' })
  representante_nome: string;

  @IsString()
  @IsNotEmpty({ message: 'CPF do representante é obrigatório' })
  representante_cpf: string;

  @IsString()
  @IsOptional()
  representante_cargo?: string;

  @IsEmail()
  @IsOptional()
  representante_email?: string;

  @IsString()
  @IsOptional()
  representante_telefone?: string;

  // CNAEs
  @IsArray()
  @IsOptional()
  cnaes?: string[];
}

// DTO para atualização parcial
export class UpdateFornecedorDto {
  @IsString()
  @IsOptional()
  razao_social?: string;

  @IsString()
  @IsOptional()
  nome_fantasia?: string;

  @IsString()
  @IsOptional()
  logradouro?: string;

  @IsString()
  @IsOptional()
  numero?: string;

  @IsString()
  @IsOptional()
  complemento?: string;

  @IsString()
  @IsOptional()
  bairro?: string;

  @IsString()
  @IsOptional()
  cidade?: string;

  @IsString()
  @IsOptional()
  uf?: string;

  @IsString()
  @IsOptional()
  cep?: string;

  @IsString()
  @IsOptional()
  telefone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  site?: string;

  @IsEnum(PorteEmpresa)
  @IsOptional()
  porte?: PorteEmpresa;

  @IsArray()
  @IsOptional()
  cnaes?: string[];
}
