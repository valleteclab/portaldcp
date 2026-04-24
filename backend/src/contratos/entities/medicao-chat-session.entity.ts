import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StatusMedicaoChatSession {
  ATIVA = 'ATIVA',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA = 'CANCELADA',
}

@Entity('medicao_chat_sessions')
export class MedicaoChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  contrato_id: string;

  @Column()
  fornecedor_id: string;

  @Column({ type: 'varchar', nullable: true })
  medicao_id: string | null;

  @Column({
    type: 'enum',
    enum: StatusMedicaoChatSession,
    default: StatusMedicaoChatSession.ATIVA,
  })
  status: StatusMedicaoChatSession;

  @Column({ type: 'varchar', length: 40, nullable: true })
  etapa_atual: string | null;

  @Column({ type: 'json', nullable: true })
  historico_ia: Array<{
    role: 'assistant' | 'user' | 'system';
    content: string;
    created_at: string;
  }> | null;

  @Column({ type: 'json', nullable: true })
  draft: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  pendencias: string[] | null;

  @Column({ type: 'json', nullable: true })
  confirmacao_pendente: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  plano_agente: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  ultima_analise_agente: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  ultimo_snapshot_draft: Record<string, any> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
