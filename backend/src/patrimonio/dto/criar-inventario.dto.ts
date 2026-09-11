import { IsArray, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class SetorInventarioDto {
  /** Setor do cadastro do órgão (opcional: pode ser um nome livre). */
  @IsOptional()
  @IsString()
  setor_id?: string;

  @IsOptional()
  @IsString()
  setor_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_telefone?: string;
}

export class CriarInventarioDto {
  @IsString()
  nome: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  ano: number;

  @IsOptional()
  @IsString()
  comissao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsArray()
  setores: SetorInventarioDto[];
}

export class AtualizarSetorInventarioDto {
  @IsOptional()
  @IsString()
  responsavel_nome?: string;

  @IsOptional()
  @IsString()
  responsavel_telefone?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
