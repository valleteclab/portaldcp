import { IsArray, IsEnum, IsString, IsUUID, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { TipoEtiqueta } from '../entities/enums';

export class GerarEtiquetaDto {
  @IsEnum(TipoEtiqueta)
  tipo: TipoEtiqueta;

  @IsArray()
  @IsUUID('4', { each: true })
  bem_ids: string[];

  @IsString()
  formato: 'individual' | 'folha_a4';
}

/** Etiqueta para a impressora Zebra do órgão (ZPL), uma etiqueta por bem. */
export class GerarZplDto {
  @IsArray()
  @IsUUID('4', { each: true })
  bem_ids: string[];

  /** Largura da etiqueta em mm (padrão 50). */
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(110)
  largura_mm?: number;

  /** Altura da etiqueta em mm (padrão 25). */
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(110)
  altura_mm?: number;

  /** Resolução da impressora: 203 ou 300 dpi (padrão 203). */
  @IsOptional()
  @IsNumber()
  dpi?: number;
}
