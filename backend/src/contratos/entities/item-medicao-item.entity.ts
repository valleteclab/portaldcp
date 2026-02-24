/**
 * ============================================================================
 * ENTIDADE: ITEM DE MEDIÇÃO (por Item do Cronograma)
 * ============================================================================
 *
 * Detalha quais itens do cronograma foram medidos em cada medição.
 * Usado quando o contrato tem itens (não etapas) no cronograma.
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
import { ItemCronograma } from './item-cronograma.entity';

@Entity('itens_medicao_item')
export class ItemMedicaoItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Medicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicao_id' })
  medicao: Medicao;

  @Column()
  medicao_id: string;

  @ManyToOne(() => ItemCronograma, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_cronograma_id' })
  itemCronograma: ItemCronograma;

  @Column()
  item_cronograma_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade_medida: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_medido: number; // quantidade_medida * valor_unitario do ItemCronograma

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ default: false })
  atestado: boolean;

  @Column({ nullable: true })
  ateste_fiscal_nome: string;

  @Column({ type: 'timestamp', nullable: true })
  ateste_data: Date;

  @Column({ type: 'text', nullable: true })
  ateste_observacoes: string;

  @CreateDateColumn()
  created_at: Date;
}
