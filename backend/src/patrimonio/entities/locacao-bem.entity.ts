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
import { BemPatrimonial } from './bem-patrimonial.entity';

@Entity('locacoes_bem')
export class LocacaoBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bem_id: string;

  @ManyToOne(() => BemPatrimonial, (b) => b.locacoes)
  @JoinColumn({ name: 'bem_id' })
  bem: BemPatrimonial;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  locador: string;

  @Column({ nullable: true })
  numero_contrato: string;

  @Column({ type: 'date' })
  data_inicio: Date;

  @Column({ type: 'date', nullable: true })
  data_fim: Date;

  @Column({ type: 'date', nullable: true })
  data_entrada: Date;

  @Column({ type: 'date', nullable: true })
  data_devolucao: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
