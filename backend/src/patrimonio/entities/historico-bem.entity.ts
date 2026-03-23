import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { BemPatrimonial } from './bem-patrimonial.entity';

@Entity('historicos_bem')
export class HistoricoBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bem_id: string;

  @ManyToOne(() => BemPatrimonial, (b) => b.historicos)
  @JoinColumn({ name: 'bem_id' })
  bem: BemPatrimonial;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  acao: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column()
  usuario_nome: string;

  @CreateDateColumn()
  created_at: Date;
}
