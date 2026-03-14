import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

@Entity('frota_contratos_abastecimento')
export class FrotaContrato {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  numero_contrato: string;

  @Column()
  fornecedor_nome: string;

  @Column({ nullable: true })
  fornecedor_cnpj: string;

  /** Preço fixo por litro — 4 casas decimais (ex: 7.5000) */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  preco_litro: number;

  /** Limite mensal em litros — 3 casas decimais */
  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
  limite_litros_mensal: number;

  @Column({ type: 'date' })
  data_inicio: string;

  @Column({ type: 'date' })
  data_fim: string;

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
