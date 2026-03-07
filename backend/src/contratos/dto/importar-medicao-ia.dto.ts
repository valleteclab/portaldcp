import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ItemExtraidoDto } from './importar-ia.dto';

export class DadosExtraidosMedicaoDto {
  @IsString()
  numero_contrato: string;

  @IsOptional()
  @IsString()
  fornecedor_cnpj?: string;

  @IsOptional()
  @IsString()
  fornecedor_razao_social?: string;

  @IsOptional()
  @IsString()
  fornecedor_id?: string;

  @IsBoolean()
  fornecedor_ja_cadastrado: boolean;

  @IsOptional()
  @IsString()
  contrato_id?: string;

  @IsBoolean()
  contrato_ja_cadastrado: boolean;

  @IsString()
  objeto: string;

  @IsNumber()
  valor_global: number;

  @IsNumber()
  valor_executado_ate_periodo: number;

  @IsOptional()
  @IsString()
  fiscal_nome?: string;

  @IsOptional()
  @IsString()
  fiscal_portaria?: string;

  @IsOptional()
  @IsString()
  data_assinatura?: string;

  @IsOptional()
  @IsString()
  data_vigencia_inicio?: string;

  @IsOptional()
  @IsString()
  data_vigencia_fim?: string;

  @IsOptional()
  @IsString()
  periodo_inicio?: string;

  @IsOptional()
  @IsString()
  periodo_fim?: string;

  @IsOptional()
  @IsNumber()
  dias_periodo?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemExtraidoDto)
  itens: ItemExtraidoDto[];

  @IsArray()
  @IsString({ each: true })
  pendencias: string[];
}

export class ConfirmarImportacaoMedicaoDto {
  @IsOptional()
  @IsString()
  contrato_id?: string;

  @IsBoolean()
  criar_contrato: boolean;

  @IsString()
  numero_contrato: string;

  @IsOptional()
  @IsString()
  fornecedor_id?: string;

  @IsOptional()
  @IsString()
  fornecedor_cnpj?: string;

  @IsOptional()
  @IsString()
  fornecedor_razao_social?: string;

  @IsString()
  objeto: string;

  @IsNumber()
  valor_global: number;

  @IsNumber()
  valor_executado_ate_periodo: number;

  @IsOptional()
  @IsString()
  fiscal_nome?: string;

  @IsOptional()
  @IsString()
  fiscal_portaria?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  modalidade_execucao?: string;

  @IsOptional()
  @IsString()
  data_assinatura?: string;

  @IsOptional()
  @IsString()
  data_vigencia_inicio?: string;

  @IsOptional()
  @IsString()
  data_vigencia_fim?: string;

  @IsOptional()
  @IsString()
  periodo_inicio?: string;

  @IsOptional()
  @IsString()
  periodo_fim?: string;

  @IsOptional()
  @IsNumber()
  dias_periodo?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemExtraidoDto)
  itens: ItemExtraidoDto[];
}
