import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { Setor } from '../../orgaos/entities/setor.entity';
import { BemPatrimonial } from './bem-patrimonial.entity';
import {
  StatusInventario,
  StatusInventarioSetor,
  OrigemLeitura,
  SituacaoLeitura,
  EstadoConservacao,
} from './enums';

/**
 * Campanha de inventário (Lei 4.320/64 art. 96: inventário anual).
 * A comissão abre a campanha, escolhe os setores e cada responsável de
 * setor confere os bens pelo celular (link com token).
 */
@Entity('patrimonio_inventarios')
@Index('IDX_pat_inventarios_orgao', ['orgao_id'])
export class Inventario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @ManyToOne(() => Orgao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ type: 'varchar' })
  nome: string;

  @Column({ type: 'int' })
  ano: number;

  @Column({ type: 'enum', enum: StatusInventario, default: StatusInventario.ABERTO })
  status: StatusInventario;

  /** Membros da comissão (texto livre: nomes e portaria). */
  @Column({ type: 'text', nullable: true })
  comissao: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @Column({ type: 'varchar', nullable: true })
  aberto_por: string | null;

  @Column({ type: 'varchar', nullable: true })
  fechado_por: string | null;

  @Column({ type: 'timestamp', nullable: true })
  fechado_em: Date | null;

  @OneToMany(() => InventarioSetor, (s) => s.inventario)
  setores: InventarioSetor[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** Um setor dentro da campanha: quem confere, link de acesso e fechamento. */
@Entity('patrimonio_inventario_setores')
@Index('IDX_pat_inv_setores_token', ['token_acesso'], { unique: true })
@Index('IDX_pat_inv_setores_inventario', ['inventario_id'])
export class InventarioSetor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  inventario_id: string;

  @ManyToOne(() => Inventario, (i) => i.setores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventario_id' })
  inventario: Inventario;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'uuid', nullable: true })
  setor_id: string | null;

  @ManyToOne(() => Setor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'setor_id' })
  setor: Setor;

  /** Nome do setor no momento da campanha (não muda se o cadastro mudar). */
  @Column({ type: 'varchar' })
  setor_nome: string;

  @Column({ type: 'varchar', nullable: true })
  responsavel_nome: string | null;

  @Column({ type: 'varchar', nullable: true })
  responsavel_telefone: string | null;

  /** Token do link de conferência (64 hex), enviado por WhatsApp. */
  @Column({ type: 'varchar', length: 64 })
  token_acesso: string;

  @Column({ type: 'enum', enum: StatusInventarioSetor, default: StatusInventarioSetor.PENDENTE })
  status: StatusInventarioSetor;

  @Column({ type: 'timestamp', nullable: true })
  link_enviado_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  iniciado_em: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  fechado_em: Date | null;

  /** Quem declarou o fechamento do setor (nome digitado no app). */
  @Column({ type: 'varchar', nullable: true })
  fechado_por: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @OneToMany(() => InventarioLeitura, (l) => l.inventario_setor)
  leituras: InventarioLeitura[];

  @CreateDateColumn()
  created_at: Date;
}

/** Cada leitura feita na conferência (QR pela câmera, RFID ou digitada). */
@Entity('patrimonio_inventario_leituras')
@Index('IDX_pat_inv_leituras_setor', ['inventario_setor_id'])
@Index('IDX_pat_inv_leituras_bem', ['inventario_id', 'bem_id'])
export class InventarioLeitura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  inventario_id: string;

  @Column({ type: 'uuid' })
  inventario_setor_id: string;

  @ManyToOne(() => InventarioSetor, (s) => s.leituras, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventario_setor_id' })
  inventario_setor: InventarioSetor;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'uuid', nullable: true })
  bem_id: string | null;

  @ManyToOne(() => BemPatrimonial, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bem_id' })
  bem: BemPatrimonial;

  /** O que foi lido, como veio (URL do QR, plaqueta digitada, EPC). */
  @Column({ type: 'varchar' })
  codigo_lido: string;

  @Column({ type: 'enum', enum: OrigemLeitura, default: OrigemLeitura.QR })
  origem: OrigemLeitura;

  @Column({ type: 'enum', enum: SituacaoLeitura })
  situacao: SituacaoLeitura;

  /** Setor onde o bem estava cadastrado quando lido (para OUTRO_SETOR). */
  @Column({ type: 'varchar', nullable: true })
  setor_cadastro_nome: string | null;

  @Column({ type: 'enum', enum: EstadoConservacao, nullable: true })
  estado_conservacao: EstadoConservacao | null;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ type: 'varchar', nullable: true })
  foto_url: string | null;

  @Column({ type: 'varchar', nullable: true })
  lido_por: string | null;

  @CreateDateColumn()
  created_at: Date;
}
