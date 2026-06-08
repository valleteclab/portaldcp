import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, IsUUID, Min, IsDateString, IsBoolean, IsIn, ArrayNotEmpty } from 'class-validator';
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

export class ItemOSDto {
  @IsUUID()
  item_cronograma_id: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantidade_solicitada: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  meses_solicitados?: number;
}

export class EtapaOSDto {
  @IsUUID()
  etapa_id: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentual_solicitado?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor_solicitado?: number;
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

  /** ORDEM_GLOBAL | ORDEM_DEMANDA (quando contrato usa ItemCronograma) */
  @IsOptional()
  @IsIn(['ORDEM_GLOBAL', 'ORDEM_DEMANDA'])
  modo_os?: 'ORDEM_GLOBAL' | 'ORDEM_DEMANDA';

  /** Itens da OS (ItemCronograma) quando modo_os = ORDEM_GLOBAL ou ORDEM_DEMANDA */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemOSDto)
  itens_os?: ItemOSDto[];

  /** Etapas da OS (EtapaCronograma) quando modo_os = ORDEM_DEMANDA e contrato usa etapas */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EtapaOSDto)
  etapas_os?: EtapaOSDto[];

  /** Números dos empenhos vinculados (Portal Fator) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numeros_empenhos?: string[];
}

/**
 * Criação EM LOTE de Ordens de Serviço mensais parciais.
 * Gera uma OS (tipo ORDEM_SERVICO, modo ORDEM_DEMANDA) por contrato selecionado,
 * pegando automaticamente a parcela do mês a partir do cronograma de cada contrato.
 */
export class CriarOsLoteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  contratos_ids: string[];

  @IsString()
  setor_solicitante: string;

  @IsString()
  justificativa: string;

  /** Mês de competência (informativo, ex.: "2026-06"). Não persiste em coluna própria. */
  @IsOptional()
  @IsString()
  mes_competencia?: string;

  @IsOptional()
  @IsString()
  codigo_setor?: string;

  @IsOptional()
  @IsEnum(PrioridadeRequisicao)
  prioridade?: PrioridadeRequisicao;

  @IsOptional()
  @IsString()
  observacoes?: string;
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

  // Campos OS (para edição em rascunho)
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
  fiscal_contrato_nome?: string;

  @IsOptional()
  @IsIn(['ORDEM_GLOBAL', 'ORDEM_DEMANDA'])
  modo_os?: 'ORDEM_GLOBAL' | 'ORDEM_DEMANDA';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemOSDto)
  itens_os?: ItemOSDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EtapaOSDto)
  etapas_os?: EtapaOSDto[];

  /** Números dos empenhos vinculados (Portal Fator) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numeros_empenhos?: string[];
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

  /** Enviar notificação ao fornecedor (email, notificação, WhatsApp) no momento da aprovação. Default: true */
  @IsOptional()
  @IsBoolean()
  enviar_ao_fornecedor?: boolean;
}

export class EnviarAoFornecedorDto {
  @IsOptional()
  @IsString()
  email_fornecedor?: string;

  @IsOptional()
  @IsString()
  telefone_fornecedor?: string;

  @IsOptional()
  @IsString()
  tipo?: 'email' | 'whatsapp';
}

export class CorrigirDataAutorizacaoOSDto {
  @IsDateString()
  data_autorizacao: string;
}

export class NegarRequisicaoDto {
  @IsString()
  motivo: string;
}

export class DevolverRequisicaoDto {
  @IsString()
  motivo: string;
}
