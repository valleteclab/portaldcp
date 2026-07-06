import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Limites legais com vigência (valores atualizados por decreto — ex.: art. 75, I/II
 * da Lei 14.133/2021, corrigidos anualmente). Permite atualizar sem deploy.
 *
 * `orgao_id` NULL = valor nacional (aplica a todos). A resolução usa o valor
 * vigente na data de referência (vigencia_inicio <= data <= vigencia_fim|∞).
 */
@Entity('limites_legais')
@Index(['chave', 'vigencia_inicio'])
export class LimiteLegal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** NULL = nacional */
  @Column({ type: 'uuid', nullable: true })
  orgao_id: string | null;

  /** Ex.: DISPENSA_OBRAS_ENGENHARIA, DISPENSA_COMPRAS_SERVICOS */
  @Column()
  chave: string;

  @Column({ nullable: true })
  descricao: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  valor: number;

  @Column({ type: 'date' })
  vigencia_inicio: string;

  /** NULL = vigente por prazo indeterminado */
  @Column({ type: 'date', nullable: true })
  vigencia_fim: string | null;

  /** Fonte normativa (ex.: "Decreto 12.343/2024") */
  @Column({ nullable: true })
  fonte: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
