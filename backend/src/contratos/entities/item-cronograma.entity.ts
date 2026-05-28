/**
 * ============================================================================
 * ENTIDADE: ITEM DO CRONOGRAMA (Serviços por quantidade)
 * ============================================================================
 *
 * Representa um item do cronograma para contratos de serviços com medição
 * que não usam etapas (obras), mas itens com descrição, unidade, quantidade e valor.
 *
 * Exemplo: Serviço de gravações - 100 HORAS x R$ 344,75 = R$ 34.475,00
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

@Entity('itens_cronograma')
export class ItemCronograma {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  @Column({ type: 'int' })
  numero_item: number;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'varchar', length: 20 })
  unidade_medida: string; // HORA, MENSAL, LITROS, METROS, SERVICO, UNIDADE

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 18, scale: 12 })
  valor_unitario: number;

  @Column({ type: 'int', nullable: true, default: null })
  quantidade_meses: number | null; // null = não aplicável; preenchido para serviços mensais

  /** Texto da periodicidade na cláusula (ex.: TRIMESTRAL); rastro legal / relatórios */
  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  frequencia_execucao: string | null;

  /** Nº de execuções na vigência (espelha o multiplicador quando informado no cadastro “como contrato”) */
  @Column({ type: 'int', nullable: true, default: null })
  numero_execucoes: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_mensal: number; // quantidade * valor_unitario (valor por mês)

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number; // valor_mensal * quantidade_meses (ou quantidade * valor_unitario se meses nulo)

  /** Quantidade já medida em medições aprovadas (acumulado) */
  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade_medida: number;

  /** Valor exato do ajuste de migração para itens mensais, preservando medições parciais em R$. */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, default: null })
  valor_migracao_reais: number | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** Unidades pré-cadastradas para itens do cronograma */
export const UNIDADES_CRONOGRAMA = ['HORA', 'MENSAL', 'LITROS', 'METROS', 'SERVICO', 'UNIDADE'] as const;
