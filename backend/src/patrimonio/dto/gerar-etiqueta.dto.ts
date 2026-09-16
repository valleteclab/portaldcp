import { IsArray, IsEnum, IsString, IsUUID, IsOptional, IsNumber, Min, Max, IsIn, IsBoolean } from 'class-validator';
import { TipoEtiqueta } from '../entities/enums';

export class GerarEtiquetaDto {
  @IsEnum(TipoEtiqueta)
  tipo: TipoEtiqueta;

  @IsArray()
  @IsUUID('4', { each: true })
  bem_ids: string[];

  @IsString()
  formato: 'individual' | 'folha_a4';

  /** Plaqueta com QR: tamanho da etiqueta em mm (padrão 50x25). */
  @IsOptional()
  @IsIn(['50x20', '50x25', '100x25'])
  tamanho?: '50x20' | '50x25' | '100x25';

  /** Plaqueta com QR: imprime o EPC do chip RFID quando o bem tiver. */
  @IsOptional()
  @IsBoolean()
  incluir_epc?: boolean;
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

  /** Imprime o EPC do chip RFID quando o bem tiver. */
  @IsOptional()
  @IsBoolean()
  incluir_epc?: boolean;
}
