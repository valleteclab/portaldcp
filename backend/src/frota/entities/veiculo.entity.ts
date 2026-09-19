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

  // ── SIGA (TCM-BA): cadastro de frota (tabela 68) ──

  /** Código do "Tipo de Veículo" na tabela interna do SIGA (não publicada no leiaute). */
  @Column({ type: 'int', nullable: true })
  siga_tipo_veiculo: number | null;

  /** Código da "Marca de Veículo" na tabela interna do SIGA (não publicada no leiaute). */
  @Column({ type: 'int', nullable: true })
  siga_marca_veiculo: number | null;

  /** Veículo locado (st_Alugado = "S") ou próprio ("N"). */
  @Column({ type: 'boolean', default: false })
  alugado: boolean;

  /** Nº da nota fiscal de compra (próprio) ou do contrato de locação (alugado). */
  @Column({ type: 'varchar', nullable: true })
  nota_fiscal_ou_contrato: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  valor_aquisicao: number | null;

  @Column({ type: 'varchar', nullable: true })
  numero_empenho: string | null;

  /** Data da aquisição ou do contrato de locação. */
  @Column({ type: 'date', nullable: true })
  data_aquisicao: string | null;

  @Column({ type: 'date', nullable: true })
  data_baixa: string | null;

  /** Quando o veículo foi confirmado como importado no SIGA Captura. */
  @Column({ type: 'timestamptz', nullable: true })
  siga_enviado_em: Date | null;

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
