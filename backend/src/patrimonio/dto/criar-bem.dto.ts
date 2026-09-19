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
import { TipoBem, EstadoConservacao, TipoAquisicaoBem } from '../entities/enums';

export class CriarBemDto {
  /** Vazio = o sistema numera (próximo número do órgão). */
  @IsOptional()
  @IsString()
  plaqueta?: string;

  @IsOptional()
  @IsString()
  epc?: string;

  @IsString()
  descricao: string;

  @IsOptional()
  @IsUUID()
  categoria_id?: string;

  @IsEnum(TipoBem)
  tipo: TipoBem;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;

  @IsOptional()
  @IsEnum(EstadoConservacao)
  estado_conservacao?: EstadoConservacao;

  @IsOptional()
  @IsUUID()
  setor_id?: string;

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

  /** CPF do responsável (exigido no arquivo do SIGA/TCM-BA). */
  @IsOptional()
  @IsString()
  responsavel_cpf?: string | null;

  /** Tipo do bem no SIGA (1–9); vazio usa o da categoria. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  siga_tipo_bem?: number | null;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  numero_serie?: string;

  @IsOptional()
  @IsNumber()
  valor_aquisicao?: number;

  @IsOptional()
  @IsDateString()
  data_aquisicao?: string;

  @IsOptional()
  @IsString()
  nota_fiscal_numero?: string;

  @IsOptional()
  @IsString()
  fornecedor_nome?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  // ─── Dados do legado: aquisição / contabilidade ───────────────────
  @IsOptional()
  @IsEnum(TipoAquisicaoBem)
  tipo_aquisicao?: TipoAquisicaoBem;

  @IsOptional()
  @IsUUID()
  licitacao_id?: string;

  @IsOptional()
  @IsUUID()
  contrato_id?: string;

  @IsOptional()
  @IsString()
  processo_pagamento?: string;

  @IsOptional()
  @IsDateString()
  data_pagamento?: string;

  /** Nº da despesa na contabilidade. */
  @IsOptional()
  @IsString()
  referencia_contabil?: string;

  // ─── Depreciação por bem (nulos = valem os da categoria) ──────────
  @IsOptional()
  @IsString()
  conta_contabil?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  vida_util_anos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  valor_residual_pct?: number;

  // ─── Corresponsável, garantia e seguro ────────────────────────────
  @IsOptional()
  @IsString()
  corresponsavel_nome?: string;

  @IsOptional()
  @IsDateString()
  garantia_ate?: string;

  @IsOptional()
  @IsString()
  seguro_seguradora?: string;

  @IsOptional()
  @IsString()
  seguro_apolice?: string;

  @IsOptional()
  @IsDateString()
  seguro_vigencia_inicio?: string;

  @IsOptional()
  @IsDateString()
  seguro_vigencia_fim?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seguro_valor?: number;
}
