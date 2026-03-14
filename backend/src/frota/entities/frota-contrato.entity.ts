import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Contrato } from '../../contratos/entities/contrato.entity';

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

  /** Preço por litro do primeiro item (retrocompat). Quando itens existe, use itens[].preco_litro */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  preco_litro: number | null;

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

  /** Contrato de origem (quando importado do cadastro de contratos) */
  @ManyToOne(() => Contrato, { nullable: true })
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato | null;

  @Column({ nullable: true })
  contrato_id: string | null;

  /**
   * Itens importados do contrato (quando unidade = LITRO).
   * Cada item: descricao, unidade_medida, preco_litro, quantidade_contratada, valor_total
   */
  @Column({ type: 'jsonb', nullable: true, default: null })
  itens: {
    descricao: string;
    unidade_medida: string;
    preco_litro: number;
    quantidade_contratada: number;
    valor_total: number;
  }[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
