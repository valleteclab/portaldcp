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
import { OrdemFornecimento } from './ordem-fornecimento.entity';
import { Contrato } from '../../contratos/entities/contrato.entity';
import { DossieAnexo } from './dossie-anexo.entity';

@Entity('dossies_ordem')
export class DossieOrdem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ordem_fornecimento_id: string;

  @ManyToOne(() => OrdemFornecimento)
  @JoinColumn({ name: 'ordem_fornecimento_id' })
  ordem_fornecimento: OrdemFornecimento;

  @Column()
  contrato_id: string;

  @ManyToOne(() => Contrato)
  @JoinColumn({ name: 'contrato_id' })
  contrato: Contrato;

  @Column({ type: 'varchar', nullable: true })
  fiscal_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  entregue_financeiro_em: Date | null;

  @Column({ type: 'varchar', nullable: true })
  entregue_financeiro_por: string | null;

  @OneToMany(() => DossieAnexo, (a) => a.dossie_ordem)
  anexos: DossieAnexo[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
