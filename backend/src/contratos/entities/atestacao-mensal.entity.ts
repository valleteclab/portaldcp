/**
 * ============================================================================
 * ENTIDADE: ATESTAÇÃO MENSAL (Serviços Continuados)
 * ============================================================================
 * 
 * Registra a atestação mensal de execução de serviços continuados.
 * O fiscal atesta que o serviço foi prestado no mês e aplica o IMR.
 * 
 * Fluxo:
 * PENDENTE → ATESTADA → PAGA
 *          ↘ GLOSADA → PAGA (com desconto)
 * 
 * Fundamentação Legal:
 * - Lei 14.133/2021, Art. 106, §3º: Instrumento de Medição de Resultado
 * - IN SEGES/ME nº 5/2017, Art. 47: Fiscalização de serviços contínuos
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

export enum StatusAtestacao {
  PENDENTE = 'PENDENTE',                // Aguardando fiscal atestar
  ATESTADA = 'ATESTADA',                // Fiscal atestou execução integral
  ATESTADA_COM_GLOSA = 'ATESTADA_COM_GLOSA', // Fiscal atestou com desconto por falhas
  REJEITADA = 'REJEITADA',              // Fiscal rejeitou - serviço não prestado
}

@Entity('atestacoes_mensais')
export class AtestacaoMensal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Relacionamento
  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  // Período
  @Column({ type: 'varchar', length: 7 })
  mes_referencia: string; // Formato: "2026-02"

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'int' })
  mes: number;

  // Valores
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_mensal_contratado: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_atestado: number; // Valor que o fiscal atestou

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_glosa: number; // Total de glosas aplicadas

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_liquido: number; // atestado - glosa = valor a pagar

  // IMR - Instrumento de Medição de Resultado
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  nota_imr: number; // Nota de 0 a 100

  @Column({ type: 'jsonb', nullable: true })
  criterios_imr: {
    criterio: string;
    peso: number;
    nota: number;
    observacao?: string;
  }[];

  // Fiscal
  @Column({ nullable: true })
  fiscal_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  @Column({ type: 'date', nullable: true })
  data_atestacao: Date;

  // Status
  @Column({
    type: 'enum',
    enum: StatusAtestacao,
    default: StatusAtestacao.PENDENTE,
  })
  status: StatusAtestacao;

  // Observações
  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ type: 'text', nullable: true })
  justificativa_glosa: string;

  // Documentos
  @Column({ type: 'text', nullable: true })
  documentos: string; // JSON array de URLs

  // Empenho
  @Column({ nullable: true, length: 100 })
  empenho: string; // Número do empenho

  @Column({ type: 'date', nullable: true })
  data_empenho: Date;

  @Column({ nullable: true, length: 20 })
  tipo_empenho: string; // GLOBAL ou ESTIMATIVO

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
