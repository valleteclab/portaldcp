/**
 * ============================================================================
 * ENTIDADE: ITEM DE OS (Ordem de Serviço com ItemCronograma)
 * ============================================================================
 *
 * Vincula uma requisição tipo ORDEM_SERVICO aos itens do cronograma (ItemCronograma).
 * Usado quando modo_os = ORDEM_GLOBAL ou ORDEM_DEMANDA.
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

  @Column()
  item_cronograma_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantidade_solicitada: number;

  @Column({ type: 'int', nullable: true, default: null })
  meses_solicitados: number | null;

  @CreateDateColumn()
  created_at: Date;
}
