import { IsEnum, IsNotEmpty, IsNumber, IsString, IsDateString, Min, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ModalidadeLicitacao, ModoDisputa, CriterioJulgamento, TipoContratacao, RegimeExecucao } from '../entities/licitacao.entity';

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

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
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

  @IsBoolean()
  @IsOptional()
  permite_lances_intermediarios?: boolean;

  @IsBoolean()
  @IsOptional()
  tratamento_diferenciado_mpe?: boolean;

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
}
