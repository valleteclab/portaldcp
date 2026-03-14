import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { FrotaContrato } from './frota-contrato.entity';
import { Veiculo } from './veiculo.entity';

export enum StatusRequisicaoFrota {
  PENDENTE = 'PENDENTE',
  AUTORIZADO = 'AUTORIZADO',
  ABASTECIDO = 'ABASTECIDO',
  NEGADO = 'NEGADO',
  CANCELADO = 'CANCELADO',
}

@Entity('frota_requisicoes_abastecimento')
export class FrotaRequisicao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Código de autorização: REQ-YYYY-NNNN */
  @Column({ unique: true })
  codigo: string;

  @Column()
  solicitante_nome: string;

  @Column({ nullable: true })
  solicitante_cargo: string;

  /** Placa do veículo — texto livre ou sincronizado do cadastro */
  @Column()
  veiculo_placa: string;

  @Column({ nullable: true })
  veiculo_modelo: string;

  @Column({ nullable: true })
  veiculo_chassi: string;

  @Column({ nullable: true })
  veiculo_renavam: string;

  /** FK para veículo cadastrado (opcional) */
  @ManyToOne(() => Veiculo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'veiculo_id' })
  veiculo: Veiculo;

  @Column({ nullable: true })
  veiculo_id: string;

  /** FK para contrato ativo */
  @ManyToOne(() => FrotaContrato, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contrato_id' })
  contrato: FrotaContrato;

  @Column({ nullable: true })
  contrato_id: string;

  @Column()
  tipo_combustivel: string;

  /** Quantidade autorizada em litros — 3 casas decimais */
  @Column({ type: 'decimal', precision: 12, scale: 3 })
  quantidade_autorizada: number;

  @Column()
  finalidade: string;

  @Column({
    type: 'enum',
    enum: StatusRequisicaoFrota,
    default: StatusRequisicaoFrota.PENDENTE,
  })
  status: StatusRequisicaoFrota;

  @Column({ type: 'date' })
  data_requisicao: string;

  @Column({ type: 'timestamptz', nullable: true })
  data_autorizacao: Date;

  @Column({ nullable: true })
  autorizado_por: string;

  @Column({ nullable: true })
  motivo_negacao: string;

  /** Timestamp do abastecimento confirmado */
  @Column({ type: 'timestamptz', nullable: true })
  data_abastecimento: Date;

  /** Quantidade real abastecida — 3 casas decimais */
  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true })
  quantidade_abastecida: number;

  /** Valor total calculado: qtd × preco_litro — 4 casas decimais */
  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  valor_total: number;

  @Column({ nullable: true })
  atendente_nome: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  km_hodometro: number;

  @Column({ nullable: true })
  observacoes: string;

  /**
   * Token aleatório (32 bytes hex) gerado na autorização.
   * Usado no QR Code para verificação segura pelo posto.
   * Invalidado após o abastecimento.
   */
  @Column({ nullable: true, unique: true })
  token_acesso: string;

  @Column({ type: 'timestamptz', nullable: true })
  token_expiry: Date;

  /** Credencial do solicitante (vereador) — FK opcional */
  @Column({ nullable: true })
  credencial_solicitante_id: string;

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
