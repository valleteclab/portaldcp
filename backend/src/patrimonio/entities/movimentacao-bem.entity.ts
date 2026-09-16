import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BemPatrimonial } from './bem-patrimonial.entity';
import { TipoMovimentacao, StatusMovimentacao, MotivoBaixa } from './enums';

/**
 * Movimentação formal do bem: transferência entre setores (com aceite do
 * destino), baixa (com motivo e documento) e empréstimo temporário.
 * Transferências em lote compartilham lote_id e token_aceite.
 */
@Entity('patrimonio_movimentacoes')
@Index('IDX_pat_mov_orgao', ['orgao_id'])
@Index('IDX_pat_mov_bem', ['bem_id'])
@Index('IDX_pat_mov_lote', ['lote_id'])
@Index('IDX_pat_mov_token', ['token_aceite'])
export class MovimentacaoBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'uuid' })
  bem_id: string;

  @ManyToOne(() => BemPatrimonial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bem_id' })
  bem: BemPatrimonial;

  /** Agrupa as linhas de uma mesma transferência em lote. */
  @Column({ type: 'uuid' })
  lote_id: string;

  @Column({ type: 'enum', enum: TipoMovimentacao })
  tipo: TipoMovimentacao;

  @Column({ type: 'enum', enum: StatusMovimentacao, default: StatusMovimentacao.PENDENTE })
  status: StatusMovimentacao;

  @Column({ type: 'uuid', nullable: true })
  setor_origem_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  setor_origem_nome: string | null;

  @Column({ type: 'uuid', nullable: true })
  setor_destino_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  setor_destino_nome: string | null;

  @Column({ type: 'varchar', nullable: true })
  responsavel_origem_nome: string | null;

  @Column({ type: 'varchar', nullable: true })
  responsavel_destino_nome: string | null;

  @Column({ type: 'varchar', nullable: true })
  responsavel_destino_telefone: string | null;

  /** Empréstimo: para quem / onde o bem foi (texto livre). */
  @Column({ type: 'varchar', nullable: true })
  destino_texto: string | null;

  /** Token do link de aceite (transferência), 64 hex, igual para o lote. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  token_aceite: string | null;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ type: 'enum', enum: MotivoBaixa, nullable: true })
  motivo_baixa: MotivoBaixa | null;

  @Column({ type: 'varchar', nullable: true })
  documento_url: string | null;

  @Column({ type: 'date', nullable: true })
  data_prevista_retorno: Date | null;

  @Column({ type: 'date', nullable: true })
  data_retorno: Date | null;

  @Column({ type: 'varchar', nullable: true })
  solicitado_por: string | null;

  @Column({ type: 'varchar', nullable: true })
  aceito_por: string | null;

  @Column({ type: 'timestamp', nullable: true })
  aceito_em: Date | null;

  @Column({ type: 'text', nullable: true })
  recusa_motivo: string | null;

  /** Campanha de inventário que originou a movimentação (divergência). */
  @Column({ type: 'uuid', nullable: true })
  inventario_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
