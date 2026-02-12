/**
 * ============================================================================
 * ENTIDADE: ETAPA DO CRONOGRAMA FÍSICO-FINANCEIRO
 * ============================================================================
 * 
 * Representa uma etapa do cronograma de execução de contratos de obras/engenharia.
 * 
 * Fundamentação Legal:
 * - Lei 14.133/2021, Art. 134: Cronograma físico-financeiro
 * - Lei 14.133/2021, Art. 140, I: Recebimento provisório pelo fiscal
 * 
 * ============================================================================
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Contrato } from './contrato.entity';

export enum StatusEtapaCronograma {
  PENDENTE = 'PENDENTE',
  EM_EXECUCAO = 'EM_EXECUCAO',
  MEDIDA_PARCIAL = 'MEDIDA_PARCIAL',   // Parcialmente medida pelo fiscal
  CONCLUIDA = 'CONCLUIDA',             // 100% medida e recebida
}

@Entity('etapas_cronograma')
export class EtapaCronograma {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento
  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  // Identificação
  @Column({ type: 'int' })
  numero_etapa: number;

  @Column()
  descricao: string;

  @Column({ type: 'text', nullable: true })
  descricao_detalhada: string;

  // Valores planejados
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  percentual_fisico: number; // % do total da obra que esta etapa representa

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_previsto: number;

  // Datas planejadas
  @Column({ type: 'date' })
  data_inicio_prevista: Date;

  @Column({ type: 'date' })
  data_fim_prevista: Date;

  // Execução real
  @Column({ type: 'date', nullable: true })
  data_inicio_real: Date;

  @Column({ type: 'date', nullable: true })
  data_fim_real: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  percentual_executado: number; // % executado desta etapa (0-100)

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_executado: number; // Valor acumulado medido desta etapa

  // Status
  @Column({
    type: 'enum',
    enum: StatusEtapaCronograma,
    default: StatusEtapaCronograma.PENDENTE,
  })
  status: StatusEtapaCronograma;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Auditoria
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
