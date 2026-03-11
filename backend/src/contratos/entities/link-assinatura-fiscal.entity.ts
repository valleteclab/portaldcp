import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('links_assinatura_fiscal')
export class LinkAssinaturaFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  medicao_id: string;

  @Column()
  fiscal_usuario_id: string;

  @Column({ nullable: true })
  fiscal_nome: string;

  @Column({ nullable: true })
  fiscal_telefone: string;

  @Column()
  solicitado_por_id: string;

  @Column({ nullable: true })
  solicitado_por_nome: string;

  @Column({ nullable: true })
  solicitado_por_telefone: string;

  /** pendente | assinado | recusado */
  @Column({ type: 'varchar', length: 20, default: 'pendente' })
  status: string;

  @Column({ type: 'timestamp' })
  expira_em: Date;

  @Column({ type: 'text', nullable: true })
  motivo_recusa: string | null;

  @CreateDateColumn()
  criado_em: Date;

  @UpdateDateColumn()
  atualizado_em: Date;
}
