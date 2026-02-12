/**
 * ============================================================================
 * ENTIDADE: MEDIÇÃO (Boletim de Medição)
 * ============================================================================
 * 
 * Registra a medição de serviços executados em contratos de obras/engenharia.
 * O fiscal mede o percentual executado de cada etapa do cronograma.
 * 
 * Fluxo:
 * RASCUNHO → AGUARDANDO_APROVACAO → APROVADA → PAGA
 *                                  ↘ REJEITADA
 * 
 * Fundamentação Legal:
 * - Lei 14.133/2021, Art. 140, I, "a": Recebimento provisório pelo fiscal
 * - Lei 14.133/2021, Art. 134: Cronograma físico-financeiro
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
  OneToMany,
} from 'typeorm';
import { Contrato } from './contrato.entity';

export enum StatusMedicao {
  RASCUNHO = 'RASCUNHO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  APROVADA = 'APROVADA',                // Medição aprovada, saldo consumido
  REJEITADA = 'REJEITADA',              // Medição rejeitada, fiscal deve refazer
}

@Entity('medicoes')
export class Medicao {
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
  numero_medicao: number; // Sequencial: 1ª Medição, 2ª Medição...

  // Período da medição
  @Column({ type: 'date' })
  periodo_inicio: Date;

  @Column({ type: 'date' })
  periodo_fim: Date;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_medido: number; // Valor medido neste período

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_acumulado_anterior: number; // Soma das medições anteriores

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_acumulado_atual: number; // anterior + medido

  // Percentual físico
  @Column({ type: 'decimal', precision: 5, scale: 2 })
  percentual_fisico_medido: number; // % físico nesta medição

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  percentual_fisico_acumulado: number; // % físico acumulado total

  // Fiscal responsável
  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  @Column({ type: 'date', nullable: true })
  data_medicao: Date; // Data em que o fiscal realizou a medição

  // Aprovação
  @Column({ nullable: true })
  aprovador_id: string;

  @Column({ nullable: true })
  aprovador_nome: string;

  @Column({ type: 'date', nullable: true })
  data_aprovacao: Date;

  @Column({ type: 'text', nullable: true })
  observacao_aprovador: string;

  // Status
  @Column({
    type: 'enum',
    enum: StatusMedicao,
    default: StatusMedicao.RASCUNHO,
  })
  status: StatusMedicao;

  // Observações e documentos
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'text', nullable: true })
  fotos: string; // JSON array de URLs de fotos

  @Column({ type: 'text', nullable: true })
  documentos: string; // JSON array de URLs de documentos

  // Auditoria
  @Column({ nullable: true })
  usuario_cadastro_id: string;

  @Column({ nullable: true })
  usuario_cadastro_nome: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
