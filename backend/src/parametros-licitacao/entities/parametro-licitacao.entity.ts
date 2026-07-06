import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Parâmetros configuráveis de licitação/disputa por órgão (Lei 14.133/2021,
 * LC 123/2006, IN SEGES/ME 73/2022). Substitui os valores hardcoded espalhados
 * em sessao.entity, disputa-timer e constantes.
 *
 * `orgao_id` NULL = default do sistema. Resolução: parâmetro do órgão → default.
 * Uma sessão pode sobrescrever pontualmente (colunas já existentes em sessao_disputa);
 * este registro é a fonte dos defaults ao criar a sessão.
 */
@Entity('parametros_licitacao')
@Index(['orgao_id'], { unique: true })
export class ParametroLicitacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NULL = default do sistema */
  @Column({ type: 'uuid', nullable: true })
  orgao_id: string | null;

  // === TEMPOS DE DISPUTA (minutos) ===
  @Column({ type: 'int', default: 10 })
  tempo_inatividade_minutos: number;

  @Column({ type: 'int', default: 2 })
  tempo_prorrogacao_minutos: number;

  @Column({ type: 'int', default: 3 })
  intervalo_minimo_lances_minutos: number;

  @Column({ type: 'int', default: 2 })
  tempo_aleatorio_min_minutos: number;

  @Column({ type: 'int', default: 30 })
  tempo_aleatorio_max_minutos: number;

  /** Modo ABERTO_FECHADO: lance final fechado (IN 73/2022, art. 24) */
  @Column({ type: 'int', default: 5 })
  lance_final_fechado_minutos: number;

  /** Modo híbrido: duração da etapa aberta */
  @Column({ type: 'int', default: 15 })
  etapa_aberta_hibrida_minutos: number;

  /** Cancelamento direto de lance pelo fornecedor (segundos) */
  @Column({ type: 'int', default: 15 })
  cancelamento_direto_segundos: number;

  // === PRAZOS RECURSAIS ===
  @Column({ type: 'int', default: 10 })
  prazo_intencao_recurso_minutos: number;

  @Column({ type: 'int', default: 3 })
  prazo_recursal_dias_uteis: number;

  @Column({ type: 'int', default: 3 })
  prazo_contrarrazoes_dias_uteis: number;

  // === ME/EPP (LC 123/2006) ===
  /** Empate ficto no pregão: até 5% (art. 44, §1º) */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 5 })
  percentual_empate_ficto_pregao: number;

  /** Empate ficto nas demais modalidades: até 10% (art. 44, §2º) */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 10 })
  percentual_empate_ficto_demais: number;

  /** Cota reservada ME/EPP: até 25% (art. 48, III) */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 25 })
  percentual_cota_maxima_mpe: number;

  // === PROPOSTA ===
  @Column({ type: 'int', default: 60 })
  validade_proposta_dias: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
