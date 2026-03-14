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

export enum TipoCombustivelAbastecimento {
  GASOLINA = 'GASOLINA',
  ETANOL = 'ETANOL',
  DIESEL = 'DIESEL',
  FLEX = 'FLEX',
  GNV = 'GNV',
  ELETRICO = 'ELETRICO',
}

@Entity('frota_abastecimentos')
export class Abastecimento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Veiculo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'veiculo_id' })
  veiculo: Veiculo;

  @Column()
  veiculo_id: string;

  @Column({ type: 'date' })
  data: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  quantidade_litros: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  valor_litro: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor_total: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  km_hodometro: number;

  @Column({ type: 'enum', enum: TipoCombustivelAbastecimento })
  tipo_combustivel: TipoCombustivelAbastecimento;

  @Column({ nullable: true })
  posto: string;

  @Column({ nullable: true })
  motorista: string;

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
