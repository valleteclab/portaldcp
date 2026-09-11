import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CriarCategoriaDto {
  @IsString()
  nome: string;

  /** Vida útil em anos para a depreciação linear (vazio = não deprecia). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  vida_util_anos?: number | null;

  /** Valor residual em % do valor de aquisição (padrão 10). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  valor_residual_pct?: number;

  @IsOptional()
  @IsString()
  conta_contabil?: string | null;
}
