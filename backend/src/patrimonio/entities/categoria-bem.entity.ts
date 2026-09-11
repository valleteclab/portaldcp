import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';

@Entity('categorias_bem')
export class CategoriaBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  orgao_id: string;

  @ManyToOne(() => Orgao, { nullable: true })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  nome: string;

  @Column({ default: false })
  sistema: boolean;

  @Column({ default: true })
  ativo: boolean;

  // ─── Depreciação (NBC TSP 07 / PCASP): linear, por vida útil ──────
  /** Vida útil em anos (ex.: informática 5, mobiliário 10, veículos 15). */
  @Column({ type: 'int', nullable: true })
  vida_util_anos: number | null;

  /** Valor residual ao fim da vida útil, em % do valor de aquisição. */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  valor_residual_pct: number;

  /** Conta contábil do PCASP (ex.: 1.2.3.1.1.01.03 Móveis e utensílios). */
  @Column({ type: 'varchar', nullable: true })
  conta_contabil: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
