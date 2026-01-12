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

export enum RoleUsuario {
  ADMIN = 'ADMIN',
  PREGOEIRO = 'PREGOEIRO',
  EQUIPE_APOIO = 'EQUIPE_APOIO',
}

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ unique: true })
  email: string;

  @Column()
  senha_hash: string;

  @Column({ nullable: true })
  cpf: string;

  @Column({ nullable: true })
  telefone: string;

  @Column({ nullable: true })
  cargo: string;

  @Column({
    type: 'enum',
    enum: RoleUsuario,
    default: RoleUsuario.EQUIPE_APOIO,
  })
  role: RoleUsuario;

  @Column({ nullable: true })
  orgao_id: string;

  @ManyToOne(() => Orgao, { nullable: true })
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ default: true })
  ativo: boolean;

  @Column({ nullable: true })
  ultimo_acesso: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
