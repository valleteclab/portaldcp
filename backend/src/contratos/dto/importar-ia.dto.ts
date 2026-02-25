import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemExtraidoDto {
  @IsString()
  descricao: string;

  @IsString()
  unidade_medida: string;

  @IsNumber()
  quantidade: number;

  @IsNumber()
  valor_unitario: number;

  @IsOptional()
  @IsNumber()
  quantidade_meses?: number;

  @IsNumber()
  valor_total: number;
}

export class DadosExtradiosDto {
  @IsString()
  objeto: string;

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

  @IsString()
  tipo: string;

  @IsString()
  categoria: string;

  @IsString()
  modalidade_execucao: string;

  @IsNumber()
  valor_inicial: number;

  @IsNumber()
  valor_global: number;

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
  @IsNumber()
  prazo_vigencia_meses?: number;

  @IsOptional()
  @IsString()
  numero_processo?: string;

  @IsOptional()
  @IsString()
  amparo_legal?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemExtraidoDto)
  itens: ItemExtraidoDto[];

  @IsArray()
  @IsString({ each: true })
  pendencias: string[];
}

export class ConfirmarImportacaoDto {
  @IsString()
  objeto: string;

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
  tipo: string;

  @IsString()
  categoria: string;

  @IsString()
  modalidade_execucao: string;

  @IsNumber()
  valor_inicial: number;

  @IsNumber()
  valor_global: number;

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
  @IsNumber()
  prazo_vigencia_meses?: number;

  @IsOptional()
  @IsString()
  numero_processo?: string;

  @IsOptional()
  @IsString()
  amparo_legal?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemExtraidoDto)
  itens: ItemExtraidoDto[];
}
