import { IsBoolean, IsString, IsOptional, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateSetorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nome?: string;

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
