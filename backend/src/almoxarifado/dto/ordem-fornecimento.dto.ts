import { IsString, IsNumber, IsOptional, IsUUID, IsDateString, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoRecebimento } from '../entities/recebimento.entity';

export class GerarOrdemDto {
  @IsUUID()
  requisicao_id: string;

  @IsOptional()
  @IsNumber()
  prazo_entrega_dias?: number;

  @IsOptional()
  @IsDateString()
  data_entrega_prevista?: string;

  @IsOptional()
  @IsString()
  local_entrega?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class ItemRecebimentoDto {
  @IsUUID()
  item_contrato_id: string;

  @IsNumber()
  quantidade_recebida: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class CriarRecebimentoDto {
  @IsUUID()
  ordem_fornecimento_id: string;

  @IsEnum(TipoRecebimento)
  tipo: TipoRecebimento;

  @IsOptional()
  @IsString()
  numero_nota_fiscal?: string;

  @IsOptional()
  @IsString()
  serie_nota_fiscal?: string;

  @IsOptional()
  @IsDateString()
  data_nota_fiscal?: string;

  @IsOptional()
  @IsString()
  chave_nfe?: string;

  @IsOptional()
  @IsNumber()
  valor_nota_fiscal?: number;

  @IsOptional()
  @IsString()
  local_recebimento?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemRecebimentoDto)
  itens: ItemRecebimentoDto[];

  @IsOptional()
  @IsString()
  observacoes?: string;
}

export class ItemAceitoDto {
  @IsUUID()
  item_contrato_id: string;

  @IsNumber()
  quantidade_aceita: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class AceitarRecebimentoDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAceitoDto)
  itens_aceitos?: ItemAceitoDto[];

  @IsOptional()
  @IsString()
  observacoes?: string;
}

// ============================================================================
// EDIÇÃO DE ORDEM
// ============================================================================

export class ItemOrdemEditDto {
  @IsUUID()
  item_contrato_id: string;

  @IsOptional()
  @IsNumber()
  quantidade?: number;
}

export class EditarOrdemDto {
  @IsOptional()
  @IsString()
  local_entrega?: string;

  @IsOptional()
  @IsDateString()
  data_entrega_prevista?: string;

  @IsOptional()
  @IsNumber()
  prazo_entrega_dias?: number;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemOrdemEditDto)
  itens?: ItemOrdemEditDto[];
}

// ============================================================================
// CANCELAMENTO DE ORDEM
// ============================================================================

export class CancelarOrdemDto {
  @IsString()
  motivo: string;
}

// ============================================================================
// ENVIO DE ORDEM
// ============================================================================

export class EnviarOrdemDto {
  @IsOptional()
  @IsString()
  email_fornecedor?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
