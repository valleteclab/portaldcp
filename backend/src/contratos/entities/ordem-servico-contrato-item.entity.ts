import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrdemServicoContrato } from './ordem-servico-contrato.entity';
import { ItemCronograma } from './item-cronograma.entity';

@Entity('ordens_servico_contrato_itens')
export class OrdemServicoContratoItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => OrdemServicoContrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ordem_servico_id' })
  ordem_servico: OrdemServicoContrato;

  @Column()
  ordem_servico_id: string;

  @ManyToOne(() => ItemCronograma, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_cronograma_id' })
  item_cronograma: ItemCronograma;

  @Column()
  item_cronograma_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantidade_referencia: number | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
