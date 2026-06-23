/**
 * ============================================================================
 * ENTIDADE: ITEM DE OS (Ordem de Serviço com ItemCronograma)
 * ============================================================================
 *
 * Vincula uma requisição tipo ORDEM_SERVICO aos itens do cronograma (ItemCronograma).
 * Usado quando modo_os = ORDEM_GLOBAL ou ORDEM_DEMANDA.
 *
 * Itens Avulsos (pós-NF):
 * - Quando item_cronograma_id é null, representa um item avulso (peça/material específico)
 * - Campos descricao_avulso, quantidade_avulso, valor_unitario_avulso, valor_total_avulso são usados
 * - Usado para documentar peças/materiais que só são conhecidos após a nota fiscal
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
import { Requisicao } from './requisicao.entity';
import { ItemCronograma } from '../../contratos/entities/item-cronograma.entity';

@Entity('requisicao_itens_os')
export class RequisicaoItemOS {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Requisicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requisicao_id' })
  requisicao: Requisicao;

  @Column()
  requisicao_id: string;

  @ManyToOne(() => ItemCronograma, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_cronograma_id' })
  itemCronograma: ItemCronograma;

  @Column({ nullable: true })
  item_cronograma_id: string | null;

  // scale 6: permite representar frações exatas (ex.: funcionário parcial na OS
  // de mão de obra) de forma que quantidade × valor_unitário feche nos centavos.
  @Column({ type: 'decimal', precision: 15, scale: 6 })
  quantidade_solicitada: number;

  @Column({ type: 'int', nullable: true, default: null })
  meses_solicitados: number | null;

  // Campos para itens avulsos (não vinculados ao ItemCronograma)
  // Usado para peças/materiais específicos que só são conhecidos após a NF
  @Column({ type: 'text', nullable: true })
  descricao_avulso: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantidade_avulso: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 12, nullable: true })
  valor_unitario_avulso: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_total_avulso: number | null;

  @CreateDateColumn()
  created_at: Date;
}