import { IsBoolean, IsString, IsUUID, MaxLength, MinLength, IsOptional } from 'class-validator';

export class CreateSetorDto {
  @IsOptional()
  @IsUUID()
  orgao_id?: string;  // Preenchido pelo controller a partir da URL

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  codigo?: string;

  @IsString()
  @MinLength(1)
  nome: string;

  /** Chefe do setor (usuário do mesmo órgão). `null` remove (IsOptional aceita null). */
  @IsOptional()
  @IsUUID()
  chefe_usuario_id?: string | null;

  /** Setor superior (mesmo órgão, sem ciclo). `null` = topo da árvore. */
  @IsOptional()
  @IsUUID()
  setor_superior_id?: string | null;

  /** Secretaria / unidade gestora (a "pasta" da cadeia de aprovação). */
  @IsOptional()
  @IsBoolean()
  eh_unidade_superior?: boolean;
}
