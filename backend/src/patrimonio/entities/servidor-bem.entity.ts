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

@Entity('servidores_bem')
export class ServidorBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bem_id: string;

  @ManyToOne(() => BemPatrimonial, (b) => b.servidores)
  @JoinColumn({ name: 'bem_id' })
  bem: BemPatrimonial;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  proprietario_nome: string;

  @Column({ nullable: true })
  proprietario_cargo: string;

  @Column({ type: 'date' })
  data_entrada: Date;

  @Column({ type: 'date', nullable: true })
  data_saida: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
