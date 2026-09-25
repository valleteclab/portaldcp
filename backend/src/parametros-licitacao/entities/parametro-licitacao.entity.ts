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

  /**
   * Intervalo mínimo de TEMPO entre lances do mesmo fornecedor. Não é exigência
   * da IN 73/2022 (que só prevê intervalo de VALOR — diferença mínima, art. 21
   * §2º / art. 22 §1º): padrão 0 = desligado; o órgão pode configurar.
   */
  @Column({ type: 'int', default: 0 })
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

  /** Exclusão do próprio último lance pelo fornecedor (IN 73 art. 21 §3º: 15 s) */
  @Column({ type: 'int', default: 15 })
  cancelamento_direto_segundos: number;

  /**
   * Diferença entre o 1º e o 2º colocado, ao encerrar o item, a partir da qual
   * o pregoeiro é avisado de que pode admitir o reinício da disputa aberta
   * para as demais colocações (Lei 14.133 art. 56 §4º: "pelo menos 5%").
   */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 5 })
  percentual_reinicio_disputa: number;

  // === PRAZOS RECURSAIS ===
  @Column({ type: 'int', default: 10 })
  prazo_intencao_recurso_minutos: number;

  @Column({ type: 'int', default: 3 })
  prazo_recursal_dias_uteis: number;

  @Column({ type: 'int', default: 3 })
  prazo_contrarrazoes_dias_uteis: number;

  /**
   * Prazo de manifestação prévia dos licitantes antes de revogar/anular
   * (Lei 14.133/2021, art. 71 §3º — plano E7a). A lei não fixa o número;
   * padrão 3 dias úteis (mesma medida do art. 165).
   */
  @Column({ type: 'int', default: 3 })
  prazo_manifestacao_extincao_dias_uteis: number;

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

  /**
   * Prazo da ME/EPP convocada para o desempate ficto oferecer valor inferior
   * à melhor oferta: 5 minutos no pregão (LC 123/2006, art. 45, §3º).
   */
  @Column({ type: 'int', default: 5 })
  prazo_desempate_mpe_minutos: number;

  // === PROPOSTA ===
  @Column({ type: 'int', default: 60 })
  validade_proposta_dias: number;

  /**
   * Prazo para o licitante convocado enviar a proposta adequada ao último
   * lance, na aceitação (IN SEGES 73/2022 art. 29: mínimo de 2 horas,
   * prorrogável). O sistema nunca aplica menos que 2 h.
   */
  @Column({ type: 'int', default: 2 })
  prazo_proposta_adequada_horas: number;

  /**
   * Prazo para o licitante convocado enviar os documentos de habilitação
   * (IN SEGES 73/2022 art. 39: mínimo de 2 horas, prorrogável). O sistema
   * nunca aplica menos que 2 h. Plano E4.
   */
  @Column({ type: 'int', default: 2 })
  prazo_habilitacao_horas: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
