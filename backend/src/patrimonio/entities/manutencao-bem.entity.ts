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
import { StatusManutencao } from './enums';

@Entity('manutencoes_bem')
export class ManutencaoBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bem_id: string;

  @ManyToOne(() => BemPatrimonial, (b) => b.manutencoes)
  @JoinColumn({ name: 'bem_id' })
  bem: BemPatrimonial;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column()
  setor: string;

  @Column()
  motivo: string;

  @Column({
    type: 'enum',
    enum: StatusManutencao,
    default: StatusManutencao.AGUARDANDO_DIAGNOSTICO,
  })
  status: StatusManutencao;

  @Column({ type: 'date' })
  data_entrada: Date;

  @Column({ type: 'date', nullable: true })
  data_saida: Date;

  @Column({ type: 'date', nullable: true })
  data_retorno: Date;

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @Column({ nullable: true })
  registrado_por: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
