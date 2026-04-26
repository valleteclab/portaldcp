import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { AtualizacaoSistema } from './atualizacao-sistema.entity';

@Entity('atualizacoes_lidas')
@Unique(['fornecedor_id', 'atualizacao_id'])
export class AtualizacaoLida {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fornecedor_id: string;

  @Column()
  atualizacao_id: string;

  @ManyToOne(() => AtualizacaoSistema, (atualizacao) => atualizacao.leituras, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'atualizacao_id' })
  atualizacao: AtualizacaoSistema;

  @CreateDateColumn()
  created_at: Date;
}
