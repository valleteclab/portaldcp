/**
 * ============================================================================
 * DTOs: LOTE DE LICITAÇÃO
 * ============================================================================
 * 
 * Fundamentação Legal - Lei 14.133/2021:
 * 
 * Art. 40, §3º - "O parcelamento será adotado quando técnica e economicamente 
 * viável, e deverá ser justificado quando não for adotado."
 * 
 * Art. 12, VII - Vinculação obrigatória ao PCA ou justificativa
 * 
 * Art. 12, §1º - "A não observância do disposto no inciso VII do caput deste 
 * artigo deverá ser justificada pelo ordenador de despesa"
 * 
 * Lei Complementar 123/2006, Art. 48:
 * - Lotes exclusivos para ME/EPP até R$ 80.000,00
 * - Cota reservada de até 25% para ME/EPP
 * 
 * ============================================================================
 */

import { IsString, IsUUID, IsNumber, IsBoolean, IsOptional, IsEnum, Min, Max, MinLength, ValidateIf } from 'class-validator';

// Decoradores de documentação (comentados pois @nestjs/swagger não está instalado)
// import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
const ApiProperty = (options?: any) => (target: any, propertyKey?: string) => {};
const ApiPropertyOptional = (options?: any) => (target: any, propertyKey?: string) => {};

/**
 * DTO para criação de um novo lote
 */
export class CreateLoteDto {
  @ApiProperty({
    description: 'Número sequencial do lote dentro da licitação',
    example: 1
  })
  @IsNumber()
  @Min(1)
  numero: number;

  @ApiProperty({
    description: `Descrição do lote - deve refletir a natureza dos itens agrupados.
    
    Lei 14.133/2021, Art. 40, §3º:
    "O parcelamento será adotado quando técnica e economicamente viável"`,
    example: 'Equipamentos de Informática'
  })
  @IsString()
  @MinLength(5, { message: 'A descrição do lote deve ter no mínimo 5 caracteres' })
  descricao: string;

  @ApiProperty({
    description: 'ID da licitação à qual o lote pertence',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  licitacao_id: string;

  @ApiPropertyOptional({
    description: `ID do Item do PCA vinculado ao lote.
    
    Lei 14.133/2021, Art. 12, VII:
    "As contratações públicas deverão submeter-se a práticas contínuas e 
    permanentes de gestão de riscos e de controle preventivo, inclusive 
    mediante adoção de recursos de tecnologia da informação, e, além de 
    estar subordinadas ao controle social, sujeitar-se-ão às seguintes 
    linhas de defesa: VII - o plano de contratações anual"`,
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsOptional()
  @IsUUID()
  item_pca_id?: string;

  @ApiPropertyOptional({
    description: `Indica se o lote não possui vinculação com PCA.
    
    Lei 14.133/2021, Art. 12, §1º:
    "A não observância do disposto no inciso VII do caput deste artigo 
    deverá ser justificada pelo ordenador de despesa"`,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  sem_pca?: boolean;

  @ApiPropertyOptional({
    description: `Justificativa OBRIGATÓRIA quando sem_pca = true.
    
    Lei 14.133/2021, Art. 12, §1º:
    "A não observância do disposto no inciso VII do caput deste artigo 
    deverá ser justificada pelo ordenador de despesa"
    
    Exemplos de justificativas válidas:
    - "Contratação emergencial não prevista no planejamento anual"
    - "Demanda surgida após aprovação do PCA do exercício"`,
    example: 'Contratação emergencial não prevista no planejamento anual'
  })
  @ValidateIf(o => o.sem_pca === true)
  @IsString()
  @MinLength(50, { message: 'A justificativa deve ter no mínimo 50 caracteres' })
  justificativa_sem_pca?: string;

  @ApiPropertyOptional({
    description: `Indica se o lote é exclusivo para ME/EPP.
    
    Lei Complementar 123/2006, Art. 48, I:
    "deverá realizar processo licitatório destinado exclusivamente à 
    participação de microempresas e empresas de pequeno porte nos itens 
    de contratação cujo valor seja de até R$ 80.000,00"`,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  exclusivo_mpe?: boolean;

  @ApiPropertyOptional({
    description: `Percentual de cota reservada para ME/EPP (0-25%).
    
    Lei Complementar 123/2006, Art. 48, III:
    "deverá estabelecer, em certames para aquisição de bens de natureza 
    divisível, cota de até 25% do objeto para a contratação de 
    microempresas e empresas de pequeno porte"`,
    example: 25
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(25)
  percentual_cota_reservada?: number;

  @ApiPropertyOptional({
    description: 'Critério de julgamento específico do lote (se diferente da licitação)',
    example: 'MENOR_PRECO'
  })
  @IsOptional()
  @IsString()
  criterio_julgamento?: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais sobre o lote'
  })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

/**
 * DTO para atualização de um lote existente
 */
export class UpdateLoteDto {
  @ApiPropertyOptional({
    description: 'Número sequencial do lote',
    example: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  numero?: number;

  @ApiPropertyOptional({
    description: 'Descrição do lote',
    example: 'Equipamentos de Informática'
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  descricao?: string;

  @ApiPropertyOptional({
    description: 'ID do Item do PCA vinculado ao lote'
  })
  @IsOptional()
  @IsUUID()
  item_pca_id?: string;

  @ApiPropertyOptional({
    description: 'Indica se o lote não possui vinculação com PCA'
  })
  @IsOptional()
  @IsBoolean()
  sem_pca?: boolean;

  @ApiPropertyOptional({
    description: 'Justificativa para lote sem PCA (obrigatória se sem_pca = true)'
  })
  @IsOptional()
  @IsString()
  justificativa_sem_pca?: string;

  @ApiPropertyOptional({
    description: 'Indica se o lote é exclusivo para ME/EPP'
  })
  @IsOptional()
  @IsBoolean()
  exclusivo_mpe?: boolean;

  @ApiPropertyOptional({
    description: 'Percentual de cota reservada para ME/EPP'
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(25)
  percentual_cota_reservada?: number;

  @ApiPropertyOptional({
    description: 'Critério de julgamento específico do lote'
  })
  @IsOptional()
  @IsString()
  criterio_julgamento?: string;

  @ApiPropertyOptional({
    description: 'Status do lote'
  })
  @IsOptional()
  @IsEnum(['RASCUNHO', 'ATIVO', 'DESERTO', 'FRACASSADO', 'CANCELADO', 'HOMOLOGADO'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Observações adicionais'
  })
  @IsOptional()
  @IsString()
  observacoes?: string;
}

/**
 * DTO para adicionar item a um lote
 */
export class AddItemToLoteDto {
  @ApiProperty({
    description: 'ID do item a ser adicionado ao lote',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  item_id: string;
}

/**
 * DTO para mover item entre lotes
 */
export class MoveItemBetweenLotesDto {
  @ApiProperty({
    description: 'ID do item a ser movido',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  item_id: string;

  @ApiProperty({
    description: 'ID do lote de destino',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  lote_destino_id: string;
}

/**
 * DTO para vincular PCA ao lote
 */
export class VincularPcaLoteDto {
  @ApiProperty({
    description: `ID do Item do PCA a ser vinculado.
    
    Lei 14.133/2021, Art. 12, VII:
    Vinculação obrigatória ao Plano de Contratações Anual`,
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  item_pca_id: string;

  @ApiPropertyOptional({
    description: 'Se true, propaga a vinculação para todos os itens do lote',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  propagar_para_itens?: boolean;
}

/**
 * DTO para resposta de lote com informações completas
 */
export class LoteResponseDto {
  id: string;
  numero: number;
  descricao: string;
  licitacao_id: string;
  
  // Vinculação PCA
  item_pca_id?: string;
  item_pca?: {
    id: string;
    descricao_objeto: string;
    categoria: string;
    valor_estimado: number;
    valor_utilizado: number;
    pca?: {
      id: string;
      ano_exercicio: number;
    };
  };
  sem_pca: boolean;
  justificativa_sem_pca?: string;
  
  // Valores
  valor_total_estimado: number;
  valor_total_homologado?: number;
  quantidade_itens: number;
  
  // Configurações
  exclusivo_mpe: boolean;
  percentual_cota_reservada?: number;
  criterio_julgamento?: string;
  status: string;
  
  // Itens (resumo)
  itens?: {
    id: string;
    numero_item: number;
    descricao_resumida: string;
    quantidade: number;
    valor_unitario_estimado: number;
    valor_total_estimado: number;
  }[];
  
  // Auditoria
  created_at: Date;
  updated_at: Date;
}

/**
 * DTO para estatísticas do lote
 */
export class LoteEstatisticasDto {
  lote_id: string;
  numero: number;
  descricao: string;
  
  // Totais
  quantidade_itens: number;
  valor_total_estimado: number;
  valor_total_homologado?: number;
  
  // Vinculação PCA
  vinculado_pca: boolean;
  item_pca_descricao?: string;
  saldo_pca_disponivel?: number;
  
  // Status dos itens
  itens_por_status: {
    status: string;
    quantidade: number;
    valor_total: number;
  }[];
}
