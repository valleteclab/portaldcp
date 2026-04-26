import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AtualizacaoLida } from './atualizacao-lida.entity';

@Entity('atualizacoes_sistema')
export class AtualizacaoSistema {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  versao: number;

  @Column()
  titulo: string;

  @Column({ type: 'text' })
  conteudo: string;

  @Column({ default: true })
  ativo: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  publico_alvo: string; // 'fornecedor', 'orgao', 'todos'

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => AtualizacaoLida, (lida) => lida.atualizacao)
  leituras: AtualizacaoLida[];
}
