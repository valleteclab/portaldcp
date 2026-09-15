import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BemPatrimonial } from './bem-patrimonial.entity';

/** De onde veio a foto (cadastro, conferência de inventário, manutenção…). */
export enum OrigemFotoBem {
  CADASTRO = 'CADASTRO',
  INVENTARIO = 'INVENTARIO',
  MANUTENCAO = 'MANUTENCAO',
  BAIXA = 'BAIXA',
  MOVIMENTACAO = 'MOVIMENTACAO',
  OUTRO = 'OUTRO',
}

/**
 * Galeria de fotos do bem ao longo do tempo. A "capa" continua sendo
 * `bens_patrimoniais.foto_url` (aponta para a url de uma destas linhas).
 */
@Entity('patrimonio_fotos_bem')
@Index('IDX_pat_fotos_bem', ['bem_id'])
export class FotoBem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bem_id: string;

  @ManyToOne(() => BemPatrimonial, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bem_id' })
  bem: BemPatrimonial;

  @Column({ type: 'uuid' })
  orgao_id: string;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'varchar', length: 20, default: OrigemFotoBem.CADASTRO })
  origem: OrigemFotoBem;

  @Column({ type: 'text', nullable: true })
  legenda: string | null;

  /** Leitura de inventário que gerou a foto (quando tirada na conferência). */
  @Column({ type: 'uuid', nullable: true })
  inventario_leitura_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  tirada_por: string | null;

  @CreateDateColumn()
  created_at: Date;
}
