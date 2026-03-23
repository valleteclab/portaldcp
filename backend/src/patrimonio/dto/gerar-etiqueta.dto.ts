import { IsArray, IsEnum, IsString, IsUUID } from 'class-validator';
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
