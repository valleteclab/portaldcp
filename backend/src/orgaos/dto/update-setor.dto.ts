import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

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
}
