import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Veiculo } from './veiculo.entity';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum TipoManutencao {
  PREVENTIVA = 'PREVENTIVA',
  CORRETIVA = 'CORRETIVA',
  REVISAO = 'REVISAO',
  PNEU = 'PNEU',
  OUTRO = 'OUTRO',
}

@Entity('frota_manutencoes')
export class Manutencao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Veiculo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'veiculo_id' })
  veiculo: Veiculo;

  @Column()
  veiculo_id: string;

  @Column({ type: 'date' })
  data: string;

  @Column({ type: 'enum', enum: TipoManutencao })
  tipo: TipoManutencao;

  @Column()
  descricao: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  km_hodometro: number;

  @Column({ nullable: true })
  prestador: string;

  @Column({ nullable: true })
  nota_fiscal: string;

  @Column({ nullable: true })
  observacoes: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  orgao_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
