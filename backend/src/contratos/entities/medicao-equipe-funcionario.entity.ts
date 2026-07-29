import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ItemCronograma } from './item-cronograma.entity';
import { MedicaoEquipe } from './medicao-equipe.entity';

@Entity('medicoes_equipe_funcionarios')
export class MedicaoEquipeFuncionario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MedicaoEquipe, (equipe) => equipe.funcionarios, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'equipe_id' })
  equipe: MedicaoEquipe;

  @Column({ type: 'uuid' })
  equipe_id: string;

  @ManyToOne(() => ItemCronograma, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_cronograma_id' })
  item_cronograma: ItemCronograma;

  @Column({ type: 'uuid' })
  item_cronograma_id: string;

  @Column({ type: 'int', nullable: true })
  posto_numero: number | null;

  @Column({ type: 'varchar', length: 255 })
  nome: string;

  @Column({ type: 'varchar', length: 255 })
  cargo_funcao: string;

  @Column({ type: 'date', nullable: true })
  inicio_prestacao_servicos: Date | null;

  @Column({ type: 'varchar', length: 255, default: 'RADIO E TV CAMARA' })
  lotacao: string;

  @Column({ type: 'varchar', length: 30, default: 'ATIVO' })
  situacao: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 30 })
  carga_horaria_semanal: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  dias_trabalhados: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  salario_base: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  salario_proporcional: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  acumulo_funcao: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  salario_total: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  encargos: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  indenizacao: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  ausencias_legais: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  aso_farda: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  vale_transporte: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  vale_alimentacao: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  taxa_administracao_lucro: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  tributos: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor_total: number;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
