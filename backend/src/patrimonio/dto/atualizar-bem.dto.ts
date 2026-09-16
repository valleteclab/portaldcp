import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsUUID,
  IsNumber,
  IsDateString,
  Max,
} from 'class-validator';
import { TipoBem, EstadoConservacao, StatusBem, TipoAquisicaoBem } from '../entities/enums';

export class AtualizarBemDto {
  @IsOptional()
  @IsString()
  plaqueta?: string;

  @IsOptional()
  @IsString()
  epc?: string | null;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsUUID()
  categoria_id?: string;

  @IsOptional()
  @IsEnum(TipoBem)
  tipo?: TipoBem;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;

  @IsOptional()
  @IsEnum(EstadoConservacao)
  estado_conservacao?: EstadoConservacao;

  @IsOptional()
  setor_id?: string | null;

  @IsOptional()
  @IsString()
  localizacao_codigo?: string;

  @IsOptional()
  @IsString()
  localizacao_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_cargo?: string;

  @IsOptional()
  @IsString()
  marca?: string | null;

  @IsOptional()
  @IsString()
  modelo?: string | null;

  @IsOptional()
  @IsString()
  numero_serie?: string | null;

  @IsOptional()
  @IsNumber()
  valor_aquisicao?: number | null;

  @IsOptional()
  @IsDateString()
  data_aquisicao?: string | null;

  @IsOptional()
  @IsString()
  nota_fiscal_numero?: string | null;

  @IsOptional()
  @IsString()
  fornecedor_nome?: string | null;

  @IsOptional()
  @IsEnum(StatusBem)
  status?: StatusBem;

  @IsOptional()
  @IsString()
  observacoes?: string;

  // ─── Dados do legado: aquisição / contabilidade ───────────────────
  @IsOptional()
  @IsEnum(TipoAquisicaoBem)
  tipo_aquisicao?: TipoAquisicaoBem | null;

  @IsOptional()
  @IsUUID()
  licitacao_id?: string | null;

  @IsOptional()
  @IsUUID()
  contrato_id?: string | null;

  @IsOptional()
  @IsString()
  processo_pagamento?: string | null;

  @IsOptional()
  @IsDateString()
  data_pagamento?: string | null;

  /** Nº da despesa na contabilidade. */
  @IsOptional()
  @IsString()
  referencia_contabil?: string | null;

  // ─── Depreciação por bem (nulos = valem os da categoria) ──────────
  @IsOptional()
  @IsString()
  conta_contabil?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  vida_util_anos?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  valor_residual_pct?: number | null;

  // ─── Corresponsável, garantia e seguro ────────────────────────────
  @IsOptional()
  @IsString()
  corresponsavel_nome?: string | null;

  @IsOptional()
  @IsDateString()
  garantia_ate?: string | null;

  @IsOptional()
  @IsString()
  seguro_seguradora?: string | null;

  @IsOptional()
  @IsString()
  seguro_apolice?: string | null;

  @IsOptional()
  @IsDateString()
  seguro_vigencia_inicio?: string | null;

  @IsOptional()
  @IsDateString()
  seguro_vigencia_fim?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seguro_valor?: number | null;
}
