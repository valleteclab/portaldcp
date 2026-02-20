import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, IsUUID, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoRequisicao, PrioridadeRequisicao } from '../entities/requisicao.entity';

export class ItemRequisicaoDto {
  @IsOptional()
  @IsUUID()
  item_contrato_id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  numero_item: number;

  @IsOptional()
  @IsString()
  codigo_catalogo?: string;

  @IsString()
  descricao: string;

  @IsOptional()
  @IsString()
  unidade_medida?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantidade_solicitada: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor_unitario?: number;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class CriarRequisicaoDto {
  @IsOptional()
  @IsUUID()
  contrato_id?: string;

  @IsEnum(TipoRequisicao)
  tipo: TipoRequisicao;

  @IsString()
  setor_solicitante: string;

  @IsOptional()
  @IsString()
  codigo_setor?: string;

  @IsOptional()
  @IsString()
  local_entrega?: string;

  @IsString()
  justificativa: string;

  @IsOptional()
  @IsEnum(PrioridadeRequisicao)
  prioridade?: PrioridadeRequisicao;

  @IsOptional()
  @IsDateString()
  data_necessidade?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemRequisicaoDto)
  itens?: ItemRequisicaoDto[];

  @IsOptional()
  @IsString()
  observacoes?: string;

  // ============================================================================
  // CAMPOS ESPECÍFICOS DE ORDEM DE SERVIÇO (tipo = ORDEM_SERVICO)
  // ============================================================================

  @IsOptional()
  @IsString()
  descricao_os?: string;

  @IsOptional()
  @IsString()
  local_execucao?: string;

  @IsOptional()
  @IsDateString()
  data_inicio_prevista?: string;

  @IsOptional()
  @IsDateString()
  data_fim_prevista?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  prazo_execucao_dias?: number;

  @IsOptional()
  @IsString()
  responsavel_tecnico?: string;

  @IsOptional()
  @IsString()
  fiscal_contrato_id?: string;

  @IsOptional()
  @IsString()
  fiscal_contrato_nome?: string;
}

export class AtualizarRequisicaoDto {
  @IsOptional()
  @IsString()
  setor_solicitante?: string;

  @IsOptional()
  @IsString()
  codigo_setor?: string;

  @IsOptional()
  @IsString()
  local_entrega?: string;

  @IsOptional()
  @IsString()
  justificativa?: string;

  @IsOptional()
  @IsEnum(PrioridadeRequisicao)
  prioridade?: PrioridadeRequisicao;

  @IsOptional()
  @IsDateString()
  data_necessidade?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class AutorizarRequisicaoDto {
  @IsOptional()
  @IsString()
  observacao?: string;

  /**
   * Permite ajustar quantidades dos itens durante a autorização
   * { item_id: quantidade_autorizada }
   */
  @IsOptional()
  ajustes_quantidade?: Record<string, number>;

  /** Override: email para notificar o fornecedor (OS) - permite corrigir antes de enviar */
  @IsOptional()
  @IsString()
  email_fornecedor?: string;

  /** Override: telefone para WhatsApp ao fornecedor (OS) - permite corrigir antes de enviar */
  @IsOptional()
  @IsString()
  telefone_fornecedor?: string;
}

export class NegarRequisicaoDto {
  @IsString()
  motivo: string;
}
