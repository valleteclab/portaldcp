/**
 * ============================================================================
 * ENTIDADE: ITEM DE MEDIÇÃO
 * ============================================================================
 * 
 * Detalha quais etapas do cronograma foram medidas em cada medição.
 * Vincula a medição às etapas do cronograma com o percentual executado.
 * 
 * ============================================================================
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Medicao } from './medicao.entity';
import { EtapaCronograma } from './etapa-cronograma.entity';

@Entity('itens_medicao')
export class ItemMedicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento com Medição
  @ManyToOne(() => Medicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicao_id' })
  medicao: Medicao;

  @Column()
  medicao_id: string;

  // Relacionamento com Etapa do Cronograma
  @ManyToOne(() => EtapaCronograma, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'etapa_id' })
  etapa: EtapaCronograma;

  @Column()
  etapa_id: string;

  // Medição desta etapa
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  percentual_executado_anterior: number; // % acumulado antes desta medição

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  percentual_executado_atual: number; // % medido nesta medição

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  percentual_executado_acumulado: number; // anterior + atual

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_medido: number; // Valor correspondente ao % medido

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  // Auditoria
  @CreateDateColumn()
  created_at: Date;
}
