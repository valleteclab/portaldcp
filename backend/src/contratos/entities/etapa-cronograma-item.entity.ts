import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contrato } from './contrato.entity';
import { EtapaCronograma } from './etapa-cronograma.entity';

@Entity('etapas_cronograma_itens')
export class EtapaCronogramaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column()
  contrato_id: string;

  @ManyToOne(() => EtapaCronograma, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'etapa_id' })
  etapa: EtapaCronograma;

  @Column()
  etapa_id: string;

  @Column({ type: 'int' })
  numero_item: number;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ nullable: true })
  unidade: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantidade: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  valor_unitario: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  valor_total: number;

  @Column({ nullable: true })
  marca: string;

  @Column({ nullable: true })
  modelo: string;

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
