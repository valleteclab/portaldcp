import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsNumber, IsUUID, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PropostaItemDto {
  @IsUUID()
  @IsNotEmpty()
  item_licitacao_id: string;

  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  valor_unitario: number;

  @IsString()
  @IsOptional()
  marca?: string;

  @IsString()
  @IsOptional()
  modelo?: string;

  @IsString()
  @IsOptional()
  fabricante?: string;

  @IsString()
  @IsOptional()
  descricao_complementar?: string;

  @IsNumber()
  @IsOptional()
  prazo_entrega_dias?: number;

  @IsNumber()
  @IsOptional()
  garantia_meses?: number;
}

export class CreatePropostaDto {
  @IsUUID()
  @IsNotEmpty()
  licitacao_id: string;

  @IsUUID()
  @IsNotEmpty()
  fornecedor_id: string;

  // Declarações
  @IsBoolean()
  @IsNotEmpty()
  declaracao_termos: boolean;

  @IsBoolean()
  @IsOptional()
  declaracao_mpe?: boolean;

  @IsBoolean()
  @IsNotEmpty()
  declaracao_integridade: boolean;

  @IsBoolean()
  @IsNotEmpty()
  declaracao_inexistencia_fatos: boolean;

  @IsBoolean()
  @IsNotEmpty()
  declaracao_menor: boolean;

  @IsBoolean()
  @IsOptional()
  declaracao_reserva_cargos?: boolean;

  // Endereço de Entrega
  @IsString()
  @IsOptional()
  endereco_entrega?: string;

  @IsString()
  @IsOptional()
  cidade_entrega?: string;

  @IsString()
  @IsOptional()
  uf_entrega?: string;

  @IsString()
  @IsOptional()
  cep_entrega?: string;

  // Prazos
  @IsNumber()
  @IsOptional()
  prazo_validade_dias?: number;

  @IsNumber()
  @IsOptional()
  prazo_entrega_dias?: number;

  @IsString()
  @IsOptional()
  observacoes?: string;

  // Itens da Proposta
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropostaItemDto)
  itens: PropostaItemDto[];
}

export class DesclassificarPropostaDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}
