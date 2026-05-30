import { IsString, IsOptional, IsUUID, IsEnum, IsNotEmpty } from 'class-validator';
import { ModalidadeLicitacao, TipoContratacao, CriterioJulgamento } from '../entities/licitacao.entity';

export class CreateFromDemandaDto {
  @IsUUID()
  @IsNotEmpty({ message: 'A demanda de origem é obrigatória' })
  demanda_id: string;

  @IsString()
  @IsOptional()
  numero_processo?: string;

  @IsString()
  @IsOptional()
  objeto?: string;

  @IsEnum(ModalidadeLicitacao)
  @IsOptional()
  modalidade?: ModalidadeLicitacao;

  @IsEnum(TipoContratacao)
  @IsOptional()
  tipo_contratacao?: TipoContratacao;

  @IsEnum(CriterioJulgamento)
  @IsOptional()
  criterio_julgamento?: CriterioJulgamento;
}
