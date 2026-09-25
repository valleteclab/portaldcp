import { IsEnum, IsNotEmpty, IsNumber, IsString, IsDateString, Min, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ModalidadeLicitacao, ModoDisputa, CriterioJulgamento, TipoContratacao, RegimeExecucao } from '../entities/licitacao.entity';
import { BaseLance } from '../../disputa/modelo-lance';

export class CreateLicitacaoDto {
  @IsString()
  @IsNotEmpty({ message: 'O número do processo é obrigatório' })
  numero_processo: string;

  @IsString()
  @IsOptional()
  numero_edital?: string;

  @IsUUID()
  @IsNotEmpty({ message: 'O órgão é obrigatório' })
  orgao_id: string;

  @IsString()
  @IsNotEmpty({ message: 'O objeto da licitação é obrigatório' })
  objeto: string;

  @IsString()
  @IsOptional()
  objeto_detalhado?: string;

  @IsString()
  @IsOptional()
  justificativa?: string;

  @IsEnum(ModalidadeLicitacao)
  @IsNotEmpty()
  modalidade: ModalidadeLicitacao;

  @IsEnum(TipoContratacao)
  @IsNotEmpty()
  tipo_contratacao: TipoContratacao;

  @IsEnum(CriterioJulgamento)
  @IsNotEmpty()
  criterio_julgamento: CriterioJulgamento;

  @IsEnum(ModoDisputa)
  @IsOptional()
  modo_disputa?: ModoDisputa;

  @IsEnum(RegimeExecucao)
  @IsOptional()
  regime_execucao?: RegimeExecucao;

  /** Art. 6º XIII/XIV — define o prazo do art. 55, II (plano E7a). */
  @IsString()
  @IsOptional()
  natureza_objeto?: 'COMUM' | 'ESPECIAL' | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  valor_total_estimado?: number;

  // Datas da Fase Externa
  @IsDateString()
  @IsOptional()
  data_publicacao_edital?: string;

  @IsDateString()
  @IsOptional()
  data_inicio_acolhimento?: string;

  @IsDateString()
  @IsOptional()
  data_fim_acolhimento?: string;

  @IsDateString()
  @IsOptional()
  data_abertura_sessao?: string;

  // Configurações
  @IsNumber()
  @IsOptional()
  intervalo_minimo_lances?: number;

  @IsNumber()
  @IsOptional()
  tempo_prorrogacao?: number;

  @IsNumber()
  @IsOptional()
  diferenca_minima_lances?: number;

  /**
   * Unidade dos lances (plano E2 §2.3): UNITARIO, TOTAL_ITEM (padrão) ou
   * TOTAL_LOTE — disputa por LOTE (grupo): lances pelo valor global do lote,
   * rateio proporcional para os itens (disputa/rateio-lote.ts).
   */
  @IsOptional()
  @IsEnum(BaseLance)
  base_lance?: BaseLance;

  @IsBoolean()
  @IsOptional()
  usa_lotes?: boolean;

  @IsBoolean()
  @IsOptional()
  permite_lances_intermediarios?: boolean;

  @IsBoolean()
  @IsOptional()
  tratamento_diferenciado_mpe?: boolean;

  @IsOptional()
  modo_beneficio_mpe?: 'GERAL' | 'POR_LOTE' | 'POR_ITEM';

  @IsOptional()
  tipo_beneficio_mpe?: 'NENHUM' | 'EXCLUSIVO' | 'COTA_RESERVADA';

  @IsBoolean()
  @IsOptional()
  exclusivo_mpe?: boolean;

  @IsBoolean()
  @IsOptional()
  cota_reservada?: boolean;

  @IsNumber()
  @IsOptional()
  percentual_cota_reservada?: number;

  // Responsáveis
  @IsString()
  @IsOptional()
  pregoeiro_id?: string;

  @IsString()
  @IsOptional()
  pregoeiro_nome?: string;
}

export class UpdateLicitacaoFaseDto {
  @IsString()
  @IsNotEmpty()
  nova_fase: string;

  @IsString()
  @IsOptional()
  observacao?: string;
}

export class PublicarEditalDto {
  @IsDateString()
  @IsNotEmpty()
  data_publicacao_edital: string;

  @IsDateString()
  @IsNotEmpty()
  data_limite_impugnacao: string;

  @IsDateString()
  @IsNotEmpty()
  data_inicio_acolhimento: string;

  @IsDateString()
  @IsNotEmpty()
  data_fim_acolhimento: string;

  @IsDateString()
  @IsNotEmpty()
  data_abertura_sessao: string;

  @IsString()
  @IsOptional()
  link_pncp?: string;

  /**
   * Justificativa (LC 123/2006 art. 49) para publicar com itens de até
   * R$ 80.000 SEM participação exclusiva de ME/EPP (art. 48 I) — registrada
   * na transição PUBLICAR.
   */
  @IsString()
  @IsOptional()
  justificativa_nao_exclusividade_mpe?: string;
}
