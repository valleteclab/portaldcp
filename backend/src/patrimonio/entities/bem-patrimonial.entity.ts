import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Orgao } from '../../orgaos/entities/orgao.entity';
import { CategoriaBem } from './categoria-bem.entity';
import { ManutencaoBem } from './manutencao-bem.entity';
import { LocacaoBem } from './locacao-bem.entity';
import { ServidorBem } from './servidor-bem.entity';
import { ComodatoBem } from './comodato-bem.entity';
import { HistoricoBem } from './historico-bem.entity';
import { TipoBem, EstadoConservacao, StatusBem } from './enums';

@Entity('bens_patrimoniais')
export class BemPatrimonial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orgao_id: string;

  @ManyToOne(() => Orgao)
  @JoinColumn({ name: 'orgao_id' })
  orgao: Orgao;

  @Column({ nullable: true })
  plaqueta: string;

  @Column()
  descricao: string;

  @Column({ nullable: true })
  categoria_id: string;

  @ManyToOne(() => CategoriaBem, { nullable: true })
  @JoinColumn({ name: 'categoria_id' })
  categoria: CategoriaBem;

  @Column({ type: 'enum', enum: TipoBem })
  tipo: TipoBem;

  @Column({ type: 'int', default: 1 })
  quantidade: number;

  @Column({ type: 'enum', enum: EstadoConservacao, nullable: true })
  estado_conservacao: EstadoConservacao;

  @Column({ nullable: true })
  localizacao_codigo: string;

  @Column({ nullable: true })
  localizacao_nome: string;

  @Column({ nullable: true })
  responsavel_nome: string;

  @Column({ nullable: true })
  responsavel_cargo: string;

  @Column({ type: 'enum', enum: StatusBem, default: StatusBem.ATIVO })
  status: StatusBem;

  @Column({ type: 'text', nullable: true })
  observacoes: string;

  @OneToMany(() => ManutencaoBem, (m) => m.bem)
  manutencoes: ManutencaoBem[];

  @OneToMany(() => LocacaoBem, (l) => l.bem)
  locacoes: LocacaoBem[];

  @OneToMany(() => ServidorBem, (s) => s.bem)
  servidores: ServidorBem[];

  @OneToMany(() => ComodatoBem, (c) => c.bem)
  comodatos: ComodatoBem[];

  @OneToMany(() => HistoricoBem, (h) => h.bem)
  historicos: HistoricoBem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
