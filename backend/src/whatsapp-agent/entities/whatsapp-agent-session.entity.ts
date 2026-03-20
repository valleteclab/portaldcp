import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('whatsapp_agent_sessions')
export class WhatsappAgentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 30 })
  phone: string;

  @Column({ default: 'INICIO', length: 50 })
  estado: string;

  @Column({ type: 'jsonb', nullable: true })
  dados: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  historico_ia: Array<{ role: string; content: string }>;

  @Column({ nullable: true })
  fornecedor_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  expires_at: Date;
}
