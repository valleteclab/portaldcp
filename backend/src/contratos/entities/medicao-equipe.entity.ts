import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Medicao } from './medicao.entity';
import { MedicaoEquipeFuncionario } from './medicao-equipe-funcionario.entity';

@Entity('medicoes_equipe')
export class MedicaoEquipe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Medicao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicao_id' })
  medicao: Medicao;

  @Column({ type: 'uuid', unique: true })
  medicao_id: string;

  @Column({ type: 'varchar', length: 255 })
  empresa_nome: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  empresa_cnpj: string | null;

  @Column({ type: 'varchar', length: 255 })
  fechamento_fatura: string;

  @Column({ type: 'varchar', length: 30 })
  competencia: string;

  @Column({ type: 'date' })
  periodo_inicio: Date;

  @Column({ type: 'date' })
  periodo_fim: Date;

  @Column({ type: 'date', nullable: true })
  data_emissao: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  responsavel_legal: string | null;

  @Column({ type: 'decimal', precision: 7, scale: 4, default: 2.5 })
  percentual_iss: number;

  @Column({ type: 'decimal', precision: 7, scale: 4, default: 4.8 })
  percentual_ir: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  retencao_inss: number;

  @OneToMany(
    () => MedicaoEquipeFuncionario,
    (funcionario) => funcionario.equipe,
    { cascade: true },
  )
  funcionarios: MedicaoEquipeFuncionario[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
