/**
 * ============================================================================
 * ENTIDADE: BANCO DE MÉTRICAS (Contratos por Ordem de Serviço)
 * ============================================================================
 * 
 * Controla o saldo de métricas (UST, horas, pontos de função) do contrato.
 * Cada OS consumida debita do banco de métricas.
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
import { MetricaOS } from './ordem-servico-contrato.entity';

@Entity('banco_metricas')
export class BancoMetricas {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento
  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  // Métrica
  @Column({
    type: 'enum',
    enum: MetricaOS,
  })
  metrica: MetricaOS;

  @Column({ nullable: true })
  descricao: string; // Ex: "UST - Desenvolvimento", "UST - Sustentação"

  // Saldos
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  quantidade_total: number; // Total contratado

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  quantidade_consumida: number; // Total consumido por OS aceitas

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  quantidade_reservada: number; // Reservado por OS em execução

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  saldo: number; // total - consumida - reservada

  // Valor
  @Column({ type: 'decimal', precision: 15, scale: 4 })
  valor_unitario: number;

  // Auditoria
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
