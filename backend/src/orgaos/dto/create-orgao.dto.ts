import { IsEnum, IsNotEmpty, IsOptional, IsString, Length, IsEmail, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { TipoOrgao, EsferaAdministrativa } from '../entities/orgao.entity';

// Função para formatar CNPJ
function formatarCNPJ(cnpj: string): string {
  if (!cnpj) return cnpj;
  const numeros = cnpj.replace(/\D/g, '');
  if (numeros.length !== 14) return cnpj; // Retorna original se inválido
  return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// Função para formatar CPF
function formatarCPF(cpf: string): string {
  if (!cpf) return cpf;
  const numeros = cpf.replace(/\D/g, '');
  if (numeros.length !== 11) return cpf; // Retorna original se inválido
  return numeros.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

// Função para formatar CEP
function formatarCEP(cep: string): string {
  if (!cep) return cep;
  const numeros = cep.replace(/\D/g, '');
  if (numeros.length !== 8) return cep; // Retorna original se inválido
  return numeros.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

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
  @Transform(({ value }) => formatarCNPJ(value))
  @Matches(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj: string;

  @IsEnum(TipoOrgao)
  @IsNotEmpty()
  tipo: TipoOrgao;

  @IsEnum(EsferaAdministrativa)
  @IsNotEmpty()
  esfera: EsferaAdministrativa;

  // Endereço - tornando opcional com valores padrão
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || 'A definir')
  logradouro?: string;

  @IsString()
  @IsOptional()
  numero?: string;

  @IsString()
  @IsOptional()
  complemento?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || 'Centro')
  bairro?: string;

  @IsString()
  @IsNotEmpty({ message: 'Cidade é obrigatória' })
  cidade: string;

  @IsString()
  @Length(2, 2, { message: 'UF deve ter 2 caracteres' })
  uf: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => formatarCEP(value) || '00000-000')
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido' })
  cep?: string;

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

  /** WhatsApp do responsável por receber medições (alertas de medição não liquidada) */
  @IsString()
  @IsOptional()
  whatsapp_responsavel_medicoes?: string;

  @IsString()
  @IsOptional()
  whatsapp_responsavel_frota?: string;

  // Responsável Legal - tornando opcional com valores padrão
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || 'A definir')
  responsavel_nome?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => formatarCPF(value) || '000.000.000-00')
  @Matches(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, { message: 'CPF deve ter 11 dígitos' })
  responsavel_cpf?: string;

  @IsString()
  @IsOptional()
  responsavel_cargo?: string;

  // Campos adicionais para login
  @IsString()
  @IsOptional()
  email_login?: string;

  @IsString()
  @IsOptional()
  senha?: string;

  // Campos PNCP
  @IsOptional()
  pncp_vinculado?: boolean;

  @IsString()
  @IsOptional()
  pncp_codigo_unidade?: string;

  @IsString()
  @IsOptional()
  pncp_cnpj_orgao?: string;

  @IsOptional()
  ativo?: boolean;
}
