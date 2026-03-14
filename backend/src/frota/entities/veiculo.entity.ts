import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

export enum TipoVeiculo {
  CARRO = 'CARRO',
  CAMINHONETE = 'CAMINHONETE',
  CAMINHAO = 'CAMINHAO',
  ONIBUS = 'ONIBUS',
  MOTO = 'MOTO',
  OUTRO = 'OUTRO',
}

export enum TipoCombustivelVeiculo {
  GASOLINA = 'GASOLINA',
  ETANOL = 'ETANOL',
  DIESEL = 'DIESEL',
  FLEX = 'FLEX',
  GNV = 'GNV',
  ELETRICO = 'ELETRICO',
}

@Entity('frota_veiculos')
export class Veiculo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  placa: string;

  @Column()
  modelo: string;

  @Column()
  marca: string;

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'enum', enum: TipoVeiculo })
  tipo: TipoVeiculo;

  @Column({ type: 'enum', enum: TipoCombustivelVeiculo })
  tipo_combustivel: TipoCombustivelVeiculo;

  @Column({ nullable: true })
  cor: string;

  @Column({ nullable: true })
  chassi: string;

  @Column({ nullable: true })
  renavam: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  km_atual: number;

  @Column({ nullable: true })
  responsavel: string;

  @Column({ nullable: true })
  observacoes: string;

  @Column({ default: true })
  ativo: boolean;

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
