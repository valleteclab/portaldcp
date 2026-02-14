/**
 * ============================================================================
 * ENTIDADE: DISCRIMINAÇÃO DE DESPESAS DA MEDIÇÃO
 * ============================================================================
 *
 * Registra a composição/discriminação das despesas de cada medição.
 * Ex: Tributação 10,83%, Materiais 3,47%, Serviços 48,62%
 *
 * O percentual e o valor são calculados sobre o valor_medido da medição
 * (NÃO sobre o valor_global do contrato).
 *
 * Se o fornecedor informa %, o front calcula R$ = (% / 100) * valor_medido.
 * Se informa R$, calcula % = (valor / valor_medido) * 100.
 *
 * O fiscal pode corrigir itens diretamente; o fornecedor é notificado.
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
  Index,
} from 'typeorm';
import { Medicao } from './medicao.entity';

@Entity('discriminacoes_despesa_medicao')
@Index(['medicao_id'])
export class DiscriminacaoDespesaMedicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============ RELACIONAMENTO ============

  @ManyToOne(() => Medicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicao_id' })
  medicao: Medicao;

  @Column()
  medicao_id: string;

  // ============ DADOS DA DISCRIMINAÇÃO ============

  @Column({ type: 'int' })
  numero_item: number; // Ordem do item (1, 2, 3...)

  @Column({ length: 255 })
  descricao: string; // Ex: "Tributação", "Materiais de Expediente", "Serviços"

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: number; // Valor em R$

  @Column({ type: 'decimal', precision: 7, scale: 4 })
  percentual: number; // Percentual (%) sobre o valor_medido

  // ============ AUDITORIA DE CORREÇÃO PELO FISCAL ============

  @Column({ nullable: true })
  corrigido_por_id: string;

  @Column({ nullable: true })
  corrigido_por_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  corrigido_em: Date;

  @Column({ type: 'text', nullable: true })
  motivo_correcao: string;

  // ============ AUDITORIA ============

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
