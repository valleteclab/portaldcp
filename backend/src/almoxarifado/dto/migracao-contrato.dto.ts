import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';

export class DadosContratoMigracaoDto {
  @IsString()
  numero_contrato: string;

  @IsNumber()
  @Min(2000)
  ano: number;

  @IsString()
  @IsOptional()
  licitacao_numero?: string;

  @IsString()
  fornecedor_cnpj: string;

  @IsString()
  fornecedor_razao_social: string;

  @IsString()
  @IsOptional()
  objeto?: string;

  @IsNumber()
  @Min(0)
  valor_inicial: number;

  @IsDateString()
  @IsOptional()
  data_assinatura?: string;

  @IsDateString()
  @IsOptional()
  data_vigencia_inicio?: string;

  @IsDateString()
  @IsOptional()
  data_vigencia_fim?: string;
}
