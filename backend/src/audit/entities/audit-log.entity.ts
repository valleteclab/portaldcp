import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Trilha de auditoria persistida (Art. 169, Lei 14.133/2021 — 3 linhas de defesa).
 * Tabela append-only: registra login, atos em licitações/propostas/lances/sessões
 * e violações de segurança. Substitui o log-somente-console anterior.
 */
@Entity('audit_logs')
@Index(['action', 'created_at'])
@Index(['resource_type', 'resource_id'])
@Index(['user_id', 'created_at'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string;

  @Column({ nullable: true })
  user_id: string;

  @Column({ nullable: true })
  user_type: string;

  @Column({ nullable: true })
  user_email: string;

  @Column({ nullable: true })
  orgao_id: string;

  @Column({ nullable: true })
  resource_type: string;

  @Column({ nullable: true })
  resource_id: string;

  @Column({ nullable: true })
  ip: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ default: true })
  success: boolean;

  @Column({ type: 'text', nullable: true })
  error_message: string;

  @CreateDateColumn()
  created_at: Date;
}
